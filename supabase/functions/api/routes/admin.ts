import { sql } from '../lib/db.ts';
import { badRequest, body, json, methodNotAllowed, notFound, z } from '../lib/http.ts';
import { audit, listFlags, listWrappedPeriods, requireAdmin } from '../lib/admin.ts';
import { todayIso } from '../lib/dates.ts';
import { computeWrapped } from '../lib/wrapped.ts';
import type { Ctx } from '../index.ts';

/** GET /v1/admin/me — who am I, and what may I change. The console calls this first. */
export async function adminMe(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const admin = await requireAdmin(ctx.req);
  return json(200, { admin });
}

/** GET /v1/admin/overview — the numbers the console's first screen shows. */
export async function adminOverview(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  await requireAdmin(ctx.req);
  const today = todayIso();

  const [[people], [logged], [wrapped], jobs] = await Promise.all([
    sql<{ total: number; today: number }[]>`
      select count(*)::int as total, count(*) filter (where created_at >= ${today}::date)::int as today from public.profiles
    `,
    sql<{ today: number; week: number }[]>`
      select
        count(*) filter (where occurred_at >= ${today}::date)::int as today,
        count(*) filter (where occurred_at >= now() - interval '7 days')::int as week
      from public.transactions
    `,
    sql<{ waiting: number }[]>`select count(*)::int as waiting from public.wrapped_periods where state = 'ready'`,
    // The daily job writes one alert_log row per send, so its recent activity is the simplest health signal.
    sql<{ kind: string; last: string; n: number }[]>`
      select kind, max(created_at) as last, count(*)::int as n from public.notifications
      where created_at > now() - interval '48 hours' group by kind order by kind
    `
  ]);

  return json(200, {
    people: { total: people?.total ?? 0, today: people?.today ?? 0 },
    transactions: { today: logged?.today ?? 0, week: logged?.week ?? 0 },
    wrappedWaiting: wrapped?.waiting ?? 0,
    notifications: jobs
  });
}

/* ------------------------------------------------------------------- flags */

const FlagPatch = z.object({
  enabled: z.boolean().optional(),
  rolloutPercent: z.number().int().min(0).max(100).optional(),
  description: z.string().max(400).optional()
});

/** GET /v1/admin/flags, PATCH /v1/admin/flags/:key */
export async function adminFlags(ctx: Ctx) {
  const key = ctx.parts[2];

  if (ctx.method === 'GET' && !key) {
    await requireAdmin(ctx.req);
    return json(200, { items: await listFlags() });
  }

  if (ctx.method === 'PATCH' && key) {
    const admin = await requireAdmin(ctx.req, 'flags');
    const input = await body(ctx.req, FlagPatch);
    if (input.enabled === undefined && input.rolloutPercent === undefined && input.description === undefined) {
      badRequest('Nothing to change');
    }
    const [before] = await sql`select key, enabled, rollout_percent from public.feature_flags where key = ${key}`;
    if (!before) notFound('No such feature');

    const [row] = await sql`
      update public.feature_flags set
        enabled = coalesce(${input.enabled ?? null}, enabled),
        rollout_percent = coalesce(${input.rolloutPercent ?? null}, rollout_percent),
        description = coalesce(${input.description ?? null}, description),
        updated_by = ${admin.id}
      where key = ${key}
      returning key, label, description, enabled, rollout_percent
    `;
    await audit(admin, 'flag.update', key, { before, after: { enabled: row.enabled, rolloutPercent: row.rolloutPercent } });
    return json(200, { flag: row });
  }

  methodNotAllowed(['GET', 'PATCH']);
}

/* ----------------------------------------------------------------- wrapped */

const WrappedPatch = z.object({
  state: z.enum(['building', 'ready', 'published', 'hidden']).optional(),
  opensOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  closesOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Required to publish: what you checked before signing it off. */
  note: z.string().max(400).optional()
});

/**
 * GET /v1/admin/wrapped, PATCH /v1/admin/wrapped/:id
 *
 * Publishing is the certification: it records who did it and when, and that name shows in the audit log. It is
 * refused unless the period has finished building, so nobody can sign off numbers that do not exist yet.
 */
export async function adminWrapped(ctx: Ctx) {
  const id = ctx.parts[2];

  if (ctx.method === 'GET' && !id) {
    await requireAdmin(ctx.req);
    return json(200, { items: await listWrappedPeriods(), today: todayIso() });
  }

  if (ctx.method === 'PATCH' && id) {
    const admin = await requireAdmin(ctx.req, 'wrapped');
    const input = await body(ctx.req, WrappedPatch);
    const [before] = await sql`select * from public.wrapped_periods where id::text = ${id}`;
    if (!before) notFound('No such period');

    if (input.state === 'published') {
      if (before.state === 'building') badRequest('This period is still being built. Wait for it to finish, then certify it.');
      if (!input.note?.trim()) badRequest('Say what you checked before publishing. It goes in the audit log.');
    }

    const publishing = input.state === 'published' && before.state !== 'published';
    const [row] = await sql`
      update public.wrapped_periods set
        state = coalesce(${input.state ?? null}, state),
        opens_on = coalesce(${input.opensOn ?? null}::date, opens_on),
        closes_on = coalesce(${input.closesOn ?? null}::date, closes_on),
        note = coalesce(${input.note ?? null}, note),
        certified_by = ${publishing ? admin.id : (before.certifiedBy ?? null)},
        certified_at = ${publishing ? new Date().toISOString() : (before.certifiedAt ?? null)},
        published_at = ${publishing ? new Date().toISOString() : (before.publishedAt ?? null)}
      where id::text = ${id}
      returning id, kind, year, state, opens_on, closes_on, certified_at, note, published_at
    `;

    await audit(admin, publishing ? 'wrapped.certify' : 'wrapped.update', `${before.kind} ${before.year}`, {
      before: { state: before.state, opensOn: before.opensOn, closesOn: before.closesOn },
      after: { state: row.state, opensOn: row.opensOn, closesOn: row.closesOn },
      note: input.note ?? null
    });
    return json(200, { period: row });
  }

  methodNotAllowed(['GET', 'PATCH']);
}

/**
 * GET /v1/admin/wrapped/preview?email=&kind=&year=&space= — the story that account would see.
 *
 * Certifying means saying the numbers are right, which cannot be done without looking at some. This is the one
 * place staff see a person's figures, it is only the Wrapped summary rather than their transactions, and every
 * look is written to the audit log with the account that was opened.
 */
export async function adminWrappedPreview(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const admin = await requireAdmin(ctx.req, 'wrapped');

  const email = (ctx.query.get('email') ?? '').trim().toLowerCase();
  if (!email) badRequest('Whose story do you want to see? Give their email.');
  const [person] = await sql`select id, email from public.profiles where lower(email) = ${email}`;
  if (!person) notFound('Nobody with that email');

  const kind = ctx.query.get('kind') === 'h1' ? 'h1' : 'year';
  const year = Number(ctx.query.get('year') ?? todayIso().slice(0, 4));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) badRequest('Choose a valid year.');
  const space = ctx.query.get('space') === 'business' ? 'business' : 'personal';

  const wrapped = await computeWrapped(person.id as string, space, kind, year);
  await audit(admin, 'wrapped.preview', person.email as string, { kind, year, space });
  return json(200, { wrapped, of: person.email });
}

/* ------------------------------------------------------------------- audit */

/** GET /v1/admin/audit — the last 200 changes, newest first. Nobody can edit or remove a line. */
export async function adminAudit(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  await requireAdmin(ctx.req);
  const items = await sql`
    select l.id, l.admin_email, l.action, l.target, l.detail, l.created_at, a.name as admin_name, a.role as admin_role
    from public.admin_audit l left join public.admin_users a on a.id = l.admin_id
    order by l.created_at desc limit 200
  `;
  return json(200, { items });
}

/* ------------------------------------------------------------------- staff */

const StaffInput = z.object({
  email: z.string().email().max(200),
  name: z.string().max(120).optional(),
  role: z.enum(['owner', 'engineer', 'support', 'finance'])
});

/** GET/POST /v1/admin/staff, DELETE /v1/admin/staff/:id — owners only. */
export async function adminStaff(ctx: Ctx) {
  const id = ctx.parts[2];

  if (ctx.method === 'GET' && !id) {
    await requireAdmin(ctx.req, 'staff');
    const items = await sql`
      select id, email, name, role, created_at, last_seen_at, disabled_at from public.admin_users order by created_at
    `;
    return json(200, { items });
  }

  if (ctx.method === 'POST' && !id) {
    const admin = await requireAdmin(ctx.req, 'staff');
    const input = await body(ctx.req, StaffInput);
    const [row] = await sql`
      insert into public.admin_users (email, name, role, created_by)
      values (${input.email.toLowerCase()}, ${input.name ?? null}, ${input.role}, ${admin.id})
      on conflict (email) do update set role = excluded.role, name = coalesce(excluded.name, admin_users.name), disabled_at = null
      returning id, email, name, role
    `;
    await audit(admin, 'staff.add', row.email, { role: row.role });
    return json(201, { staff: row });
  }

  if (ctx.method === 'DELETE' && id) {
    const admin = await requireAdmin(ctx.req, 'staff');
    // Nobody removes themselves: an owner locking themselves out is a support problem with no way back.
    if (id === admin.id) badRequest('You cannot remove your own access.');
    const [row] = await sql`update public.admin_users set disabled_at = now() where id::text = ${id} returning email`;
    if (!row) notFound('No such person');
    await audit(admin, 'staff.remove', row.email);
    return json(200, { removed: true });
  }

  methodNotAllowed(['GET', 'POST', 'DELETE']);
}
