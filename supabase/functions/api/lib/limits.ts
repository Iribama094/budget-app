import { sql } from './db.ts';
import { HttpError } from './http.ts';
import { enforceRateLimit } from './rateLimit.ts';

/**
 * What stops one person, one bug or one bot from running up the bill or taking the app down.
 *
 * Three different jobs, deliberately kept apart:
 *
 * 1. **Burst** is per function instance and held in memory. It costs nothing, so it can run on every single
 *    request, and it catches the common case: a loop gone wrong, or somebody hammering one endpoint.
 * 2. **Quota** is a counter in Postgres, so it holds across instances and restarts. It costs one small write,
 *    so it guards the things that cost money or take time, not every request.
 * 3. **Ceiling** is the same counter but for everybody at once. It is the last line before a surprise
 *    invoice: when the day's calls to a paid service are used up, the feature says so politely and stops
 *    calling out. Nobody's money data is affected, and it resets the next day.
 *
 * Every limit here can be changed with an environment variable, so a ceiling can be raised at 2am without a
 * deploy.
 */

const num = (name: string, fallback: number): number => {
  const raw = Number(Deno.env.get(name));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
};

/* ------------------------------------------------------------------ burst */

type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

/** Keeps the map from growing without bound on a long-lived instance. */
function sweep(now: number): void {
  if (windows.size < 5000) return;
  for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
}

/**
 * Allows `limit` hits per `windowSec` for this key on this instance. Returns the seconds left when over.
 * There is no database call, so this is safe to run on every request.
 */
export function overBurst(key: string, limit: number, windowSec: number): number {
  const now = Date.now();
  sweep(now);
  const found = windows.get(key);
  if (!found || found.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return 0;
  }
  found.count++;
  return found.count > limit ? Math.max(1, Math.ceil((found.resetAt - now) / 1000)) : 0;
}

export function enforceBurst(key: string, limit: number, windowSec: number): void {
  const retryAfter = overBurst(key, limit, windowSec);
  if (retryAfter) {
    throw new HttpError(429, 'RATE_LIMITED', `That is a lot at once. Try again in ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`, undefined, {
      'Retry-After': String(retryAfter)
    });
  }
}

/* ------------------------------------------------------------------ quota */

/** A counter in the database, for the things worth counting properly. Throws a 429 when it is used up. */
export async function enforceQuota(rule: { key: string; limit: number; windowSec: number; message?: string }): Promise<void> {
  try {
    await enforceRateLimit(rule);
  } catch (err) {
    if (err instanceof HttpError && err.status === 429 && rule.message) {
      throw new HttpError(429, 'QUOTA_REACHED', rule.message, undefined, err.headers);
    }
    throw err;
  }
}

/* ---------------------------------------------------------------- ceiling */

/** Everything this app pays somebody else for, with a whole-app daily ceiling. */
export const PAID = {
  assistant: { cap: () => num('CAP_ASSISTANT_DAY', 2000), what: 'Flux' },
  voice: { cap: () => num('CAP_VOICE_DAY', 1000), what: 'voice notes' },
  email: { cap: () => num('CAP_EMAIL_DAY', 280), what: 'email' },
  bankSync: { cap: () => num('CAP_BANK_SYNC_DAY', 1500), what: 'bank refreshes' }
} as const;

export type PaidService = keyof typeof PAID;

const DAY = 24 * 60 * 60;
const dayKey = (service: PaidService) => `cap:${service}:${new Date().toISOString().slice(0, 10)}`;

/**
 * Counts one call to a paid service and says whether it is still within today's ceiling.
 *
 * Never throws: a database hiccup must not stop the app, and the caller decides what to do when the answer
 * is false (refuse politely, or quietly skip, as with email).
 */
export async function withinDailyCap(service: PaidService): Promise<boolean> {
  const limit = PAID[service].cap();
  try {
    const [row] = await sql<{ count: number }[]>`
      insert into public.rate_limits (key, count, expires_at)
      values (${dayKey(service)}, 1, now() + make_interval(secs => ${DAY}))
      on conflict (key) do update set
        count = case when rate_limits.expires_at > now() then rate_limits.count + 1 else 1 end,
        expires_at = case when rate_limits.expires_at > now() then rate_limits.expires_at else excluded.expires_at end
      returning count
    `;
    if (row.count > limit) {
      console.error(`[cap] ${service} reached its daily ceiling of ${limit}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[cap] could not count', service, err);
    return true;
  }
}

/** The same check for a feature somebody is waiting on, with an answer they can understand. */
export async function requireDailyCap(service: PaidService): Promise<void> {
  if (await withinDailyCap(service)) return;
  throw new HttpError(
    503,
    'BUSY_TODAY',
    `${PAID[service].what} has had a very busy day and is resting until tomorrow. Everything else still works.`,
    undefined,
    { 'Retry-After': '3600' }
  );
}

/** What the console shows: how much of each day's ceiling has gone. */
export async function usageToday(): Promise<Array<{ service: PaidService; used: number; cap: number; what: string }>> {
  const keys = (Object.keys(PAID) as PaidService[]).map((s) => dayKey(s));
  const rows = await sql<{ key: string; count: number }[]>`
    select key, count from public.rate_limits where key = any(${keys})
  `.catch(() => [] as { key: string; count: number }[]);
  const used = new Map(rows.map((r) => [r.key, Number(r.count)]));
  return (Object.keys(PAID) as PaidService[]).map((service) => ({
    service,
    used: used.get(dayKey(service)) ?? 0,
    cap: PAID[service].cap(),
    what: PAID[service].what
  }));
}

/* ----------------------------------------------------------------- global */

/**
 * The limit that applies to every request, whoever is asking.
 *
 * Signed in, it counts the caller; signed out, the address. A caller with no token who rotates addresses is
 * still held by the per route limits on the few routes that need no sign-in.
 */
export function enforceGlobalRate(req: Request, path: string): void {
  if (path.startsWith('health') || path.startsWith('cron')) return;

  const auth = req.headers.get('authorization') ?? '';
  // The token itself is the bucket, not the account inside it: reading the account would mean verifying the
  // token first, which is work this guard exists to avoid.
  const who = auth ? `t:${auth.slice(-24)}` : `ip:${(req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'}`;

  enforceBurst(`all:${who}`, num('RATE_PER_MINUTE', auth ? 240 : 60), 60);
  // A second, wider window, so a steady drip that stays under the per minute limit still cannot run all day.
  enforceBurst(`all-hour:${who}`, num('RATE_PER_HOUR', auth ? 5000 : 600), 60 * 60);
}
