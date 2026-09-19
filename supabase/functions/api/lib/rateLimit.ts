import { sql } from './db.ts';
import { HttpError } from './http.ts';

function humanize(sec: number): string {
  if (sec < 90) return `${sec} seconds`;
  const min = Math.ceil(sec / 60);
  return `${min} minute${min === 1 ? '' : 's'}`;
}

/** Fixed-window counter in Postgres, so limits hold across function instances. Throws a 429 when exceeded. */
export async function enforceRateLimit(rule: { key: string; limit: number; windowSec: number }): Promise<void> {
  const [row] = await sql`
    insert into public.rate_limits (key, count, expires_at)
    values (${rule.key}, 1, now() + make_interval(secs => ${rule.windowSec}))
    on conflict (key) do update set
      count = case when rate_limits.expires_at > now() then rate_limits.count + 1 else 1 end,
      expires_at = case when rate_limits.expires_at > now() then rate_limits.expires_at else excluded.expires_at end
    returning count, expires_at
  `;
  if (row.count > rule.limit) {
    const retryAfter = Math.max(1, Math.ceil((new Date(row.expiresAt).getTime() - Date.now()) / 1000));
    throw new HttpError(429, 'RATE_LIMITED', `Too many attempts. Try again in ${humanize(retryAfter)}.`, undefined, { 'Retry-After': String(retryAfter) });
  }
}
