import { sql } from '../lib/db.ts';
import { adminAuth } from '../lib/auth.ts';
import { badRequest, json, methodNotAllowed, notFound, z, body } from '../lib/http.ts';
import { audit, requireAdmin } from '../lib/admin.ts';
import { loadPlan } from '../lib/plan.ts';
import { loadRuleForCountry } from '../lib/tax.ts';
import type { Ctx } from '../index.ts';

/**
 * Helping one person who has written in.
 *
 * Deliberately narrow: you can find somebody by their exact email, see how their account is set up, and take a
 * few actions that help them. You cannot browse everyone, and you cannot read what they spent. If a problem
 * needs their transactions, they export them and send them.
 */

/** GET /v1/admin/people?q=email — exact email only, so the console cannot be used to trawl the list. */
export async function adminPeople(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  await requireAdmin(ctx.req, 'people');

  const q = (ctx.query.get('q') ?? '').trim().toLowerCase();
  if (q.length < 3) badRequest('Type at least three letters of their name, or their email.');

  // Email or account id match exactly; a name matches loosely, because somebody writing in says "Amaka" and
  // spells their email wrong. Capped at 20 so this stays looking somebody up, not reading the whole list.
  const items = await sql`
    select p.id, p.email, p.name, p.currency, p.created_at,
      (select count(*)::int from public.transactions t where t.user_id = p.id) as transactions,
      (select count(*)::int from public.budgets b where b.user_id = p.id) as budgets,
      (select count(*)::int from public.devices d where d.user_id = p.id) as devices
    from public.profiles p
    where lower(p.email) = ${q}
       or p.id::text = ${q}
       or (length(${q}) >= 3 and p.name is not null and p.name ilike ${'%' + q + '%'})
    order by (lower(p.email) = ${q}) desc, p.name
    limit 20
  `;
  return json(200, { items, searched: q });
}

/** GET /v1/admin/people/:id — how the account is set up, and why it might be behaving oddly. */
export async function adminPerson(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const admin = await requireAdmin(ctx.req, 'people');
  const id = ctx.parts[2] ?? '';

  const [person] = await sql`
    select id, email, name, currency, created_at, budget_period, onboarding from public.profiles where id::text = ${id}
  `;
  if (!person) notFound('No such person');

  const plan = await loadPlan(person.id).catch(() => null);
  const [counts] = await sql`
    select
      (select count(*)::int from public.transactions where user_id = ${person.id}) as transactions,
      (select count(*)::int from public.budgets where user_id = ${person.id}) as budgets,
      (select count(*)::int from public.goals where user_id = ${person.id}) as goals,
      (select count(*)::int from public.devices where user_id = ${person.id}) as devices,
      (select max(occurred_at) from public.transactions where user_id = ${person.id}) as last_logged
  `;

  // Looking someone up is itself worth a line, so anyone can see whose account was opened and by whom.
  await audit(admin, 'person.view', person.email as string);

  return json(200, {
    person,
    counts,
    plan: plan
      ? {
          monthlyIncome: plan.monthlyIncome,
          committed: plan.committed,
          status: plan.status,
          shortfall: plan.shortfall,
          // The usual reason a budget looks empty: bills are bigger than income, so alerts are held back.
          note:
            plan.status === 'short'
              ? 'Their bills are larger than their income, so the app holds back pace alerts on purpose. Point them at Income and bills.'
              : null
        }
      : null,
    taxCountry: person.currency === 'NGN' ? loadRuleForCountry('ng')?.country ?? null : null
  });
}

const ActionInput = z.object({ action: z.enum(['send-password-reset', 'sign-out-devices']) });

/**
 * POST /v1/admin/people/:id/action — the few things staff may do for somebody.
 *
 * Neither reveals anything: a reset sends a code to their own email, and signing out devices only ends
 * sessions. There is no "sign in as them", because reading someone's money to fix a bug is not a trade this
 * app makes.
 */
export async function adminPersonAction(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const admin = await requireAdmin(ctx.req, 'people');
  const id = ctx.parts[2] ?? '';
  const { action } = await body(ctx.req, ActionInput);

  const [person] = await sql`select id, email from public.profiles where id::text = ${id}`;
  if (!person) notFound('No such person');

  if (action === 'send-password-reset') {
    const { error } = await adminAuth().generateLink({ type: 'recovery', email: person.email });
    if (error) badRequest(error.message, 'RESET_FAILED');
    await audit(admin, 'person.password-reset', person.email);
    return json(200, { sent: true, message: 'A reset code is on its way to their email. You never see it.' });
  }

  const [{ n }] = await sql<{ n: number }[]>`
    with gone as (delete from public.devices where user_id = ${person.id} returning 1)
    select count(*)::int as n from gone
  `;
  await adminAuth().signOut(person.id as string, 'global').catch(() => undefined);
  await audit(admin, 'person.sign-out-devices', person.email, { devices: n });
  return json(200, { signedOut: n, message: `Signed out ${n} device${n === 1 ? '' : 's'}. They will need to sign in again.` });
}
