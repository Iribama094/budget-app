import { sql } from './db.ts';
import { requireAuth } from './auth.ts';
import { HttpError } from './http.ts';
import { todayIso } from './dates.ts';

/**
 * The staff side. Signing in is not enough: the account must also be listed in admin_users with a role, so a
 * normal person's token can never reach these routes even though it is a valid token.
 */
export type AdminRole = 'owner' | 'engineer' | 'support' | 'finance';

export type Admin = { id: string; email: string; name: string | null; role: AdminRole };

/** What each role may do. Read is implied by being staff at all; these are the ones that change something. */
const CAN: Record<string, AdminRole[]> = {
  flags: ['owner', 'engineer'],
  wrapped: ['owner', 'engineer'],
  content: ['owner', 'engineer'],
  people: ['owner', 'support'],
  staff: ['owner'],
  taxRules: ['owner', 'finance']
};

/**
 * The staff member behind this request, or 401. The message never says whether the email exists, so the
 * console cannot be used to find out who works here.
 */
export async function requireAdmin(req: Request, area?: keyof typeof CAN): Promise<Admin> {
  const { userId, aal } = await requireAuth(req);
  // Matched on the account, never on the email. Sign-up does not prove somebody owns an address, so matching
  // on email would hand staff access to whoever registered a staff member's address first.
  const [row] = await sql<{ id: string; email: string; name: string | null; role: AdminRole }[]>`
    select a.id, a.email, a.name, a.role
    from public.admin_users a
    where a.user_id = ${userId} and a.disabled_at is null
  `;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Not found');

  // A password alone does not open the console. It can sign people out, reset their passwords and change
  // what the app tells everybody they owe, so it needs a second factor as well.
  if (aal !== 'aal2') {
    throw new HttpError(403, 'MFA_REQUIRED', 'Confirm it is you with your authenticator app first.');
  }

  await sql`update public.admin_users set last_seen_at = now() where id = ${row.id}`;

  if (area && !CAN[area].includes(row.role)) {
    throw new HttpError(403, 'FORBIDDEN', `Your role (${row.role}) cannot change this.`);
  }
  return row;
}

/** Whether this account runs the app. Used to offer staff a preview of things nobody else can see yet. */
export async function isStaff(userId: string): Promise<boolean> {
  const [row] = await sql`
    select 1 as ok from public.admin_users a
    where a.user_id = ${userId} and a.disabled_at is null limit 1
  `;
  return !!row;
}

/** Writes what happened. Called after the change lands, so a failed change leaves no line. */
export async function audit(admin: Admin, action: string, target?: string | null, detail?: unknown): Promise<void> {
  try {
    await sql`
      insert into public.admin_audit (admin_id, admin_email, action, target, detail)
      values (${admin.id}, ${admin.email}, ${action}, ${target ?? null}, ${detail ? sql.json(detail as any) : null})
    `;
  } catch (err) {
    // A missing audit line must never swallow the change itself, but it is worth shouting about.
    console.error('[admin audit] failed', action, err);
  }
}

export type FlagRow = { key: string; label: string; description: string | null; enabled: boolean; rolloutPercent: number };

export async function listFlags(): Promise<FlagRow[]> {
  return await sql<FlagRow[]>`
    select key, label, description, enabled, rollout_percent from public.feature_flags order by key
  `;
}

/**
 * Whether this person is in a partial rollout. A stable hash of their id, so the same people keep the feature
 * instead of it flickering on and off between launches.
 */
export function inRollout(userId: string, key: string, percent: number): boolean {
  if (percent >= 100) return true;
  if (percent <= 0) return false;
  let h = 0;
  const seed = `${key}:${userId}`;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 100 < percent;
}

export type WrappedSpace = 'personal' | 'business';

export type WrappedPeriodRow = {
  id: string;
  space: WrappedSpace;
  kind: 'h1' | 'year' | 'quarter';
  quarter: number | null;
  year: number;
  state: 'building' | 'ready' | 'published' | 'hidden';
  opensOn: string;
  closesOn: string;
  certifiedAt: string | null;
  certifiedBy: string | null;
  note: string | null;
  publishedAt: string | null;
  builtAt: string | null;
  peopleIncluded: number;
};

export async function listWrappedPeriods(): Promise<WrappedPeriodRow[]> {
  return await sql<WrappedPeriodRow[]>`
    select id, space, kind, quarter, year, state, opens_on, closes_on, certified_at, certified_by, note, published_at, built_at, people_included
    from public.wrapped_periods order by year desc, space, kind desc, quarter desc
  `;
}

export type OpenWrapped = { space: WrappedSpace; kind: 'h1' | 'year' | 'quarter'; quarter: number | null; year: number; closesOn: string };

/**
 * The periods on show right now, at most one per space. Published, and today inside its window: that is the
 * whole rule. Off season this is empty and the app shows no Wrapped anywhere.
 *
 * Personal looks back twice a year; a business looks back every quarter, because that is the rhythm VAT, PAYE
 * and stock already run on.
 */
export async function openWrappedPeriods(today = todayIso()): Promise<OpenWrapped[]> {
  return await sql<OpenWrapped[]>`
    select distinct on (space) space, kind, quarter, year, closes_on
    from public.wrapped_periods
    where state = 'published' and opens_on <= ${today}::date and closes_on >= ${today}::date
    order by space, year desc, quarter desc nulls last
  `;
}

/** The personal period, for the nightly job that tells people their story is ready. */
export async function openWrappedPeriod(today = todayIso()): Promise<OpenWrapped | null> {
  const open = await openWrappedPeriods(today);
  return open.find((p) => p.space === 'personal') ?? null;
}
