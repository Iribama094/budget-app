import { iso, isUuid, sql } from '../lib/db.ts';
import { firstNameOnly } from '../lib/shared.ts';
import { requireAuth } from '../lib/auth.ts';
import { badRequest, body, HttpError, json, methodNotAllowed, noContent, notFound, z } from '../lib/http.ts';
import { ISO_DATE, todayIso } from '../lib/dates.ts';
import { nextOccurrence } from '../lib/recurring.ts';
import { sendEmail } from '../lib/email.ts';
import { mustProveEmail } from '../lib/verify.ts';
import { afterTransactionCreated } from '../lib/effects.ts';
import type { Ctx } from '../index.ts';

/* ------------------------------------------------------------------ delegates */

/*
 * Someone who helps with your money: an accountant, a PA, an adult child looking after a parent. They sign in
 * with their own account and see yours, never your password or settings. "view" looks; "record" can also add
 * transactions. The limits are enforced for every request in requireAuth, not screen by screen.
 */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = (length = 8) => Array.from(crypto.getRandomValues(new Uint8Array(length)), (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');

const InviteSchema = z.object({ email: z.string().trim().email().max(200), role: z.enum(['view', 'record']) });
const AcceptSchema = z.object({ code: z.string().trim().min(6).max(12) });

/**
 * GET  /v1/delegates           people helping me, and people I help
 * POST /v1/delegates           invite someone by email
 * POST /v1/delegates/accept    accept an invite with its code
 * DELETE /v1/delegates/:id     remove a helper, or stop helping someone
 */
/** The helper invite a code belongs to, if it can still be used. Used by the one code box (routes/join.ts). */
export async function findHelperInvite(code: string) {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const [invite] = clean ? await sql`select * from public.delegates where code = ${clean}` : [];
  return !invite || invite.acceptedAt ? null : invite;
}

/** Accepting a helper invite. Shared by /v1/delegates/accept and the one code box. */
export async function acceptHelperCode(userId: string, email: string | null, code: string) {
  const invite = await findHelperInvite(code);
  if (!invite) badRequest('That code was already used or doesn’t exist. Ask for a new one.', 'INVALID_CODE');
  if (invite.ownerId === userId) badRequest('That’s your own invite.');
  // The code alone isn't enough: it only works for the email it was sent to.
  if (!email || email.toLowerCase() !== String(invite.email).toLowerCase()) {
    throw new HttpError(403, 'FORBIDDEN', `This invite is for ${invite.email}. Sign in with that email to accept it.`);
  }
  await sql`update public.delegates set delegate_id = ${userId}, accepted_at = now() where id = ${invite.id}`;
  const [owner] = await sql`select name, email from public.profiles where id = ${invite.ownerId}`;
  return { ownerId: invite.ownerId as string, ownerName: firstNameOnly(owner?.name as string | null) || 'them', role: invite.role as 'view' | 'record' };
}

export async function delegatesRoute(ctx: Ctx) {
  const auth = await requireAuth(ctx.req);
  if (auth.delegateRole) throw new HttpError(403, 'FORBIDDEN', 'Only the owner can change who helps with their money.');
  const userId = auth.userId;
  const [, sub] = ctx.parts;

  if (sub === 'accept') {
    if (ctx.method !== 'POST') methodNotAllowed(['POST']);
    const { code } = await body(ctx.req, AcceptSchema);
    return json(200, await acceptHelperCode(userId, auth.email, code));
  }

  if (sub) {
    if (ctx.method !== 'DELETE') methodNotAllowed(['DELETE']);
    if (!isUuid(sub)) notFound('Not found');
    const gone = await sql`delete from public.delegates where id = ${sub} and (owner_id = ${userId} or delegate_id = ${userId}) returning id`;
    if (!gone.length) notFound('Not found');
    return noContent();
  }

  if (ctx.method === 'POST') {
    const input = await body(ctx.req, InviteSchema);
    if (auth.email && input.email.toLowerCase() === auth.email.toLowerCase()) badRequest('Invite someone else.');
    if (await mustProveEmail(auth.actorId)) {
      throw new HttpError(403, 'EMAIL_UNVERIFIED', 'Confirm your own email address first, then you can invite people.');
    }
    const [{ n }] = await sql`select count(*)::int as n from public.delegates where owner_id = ${userId}`;
    if (n >= 5) badRequest('You can have up to five helpers. Remove one first.');
    const code = newCode();
    const [row] = await sql`
      insert into public.delegates (owner_id, email, role, code) values (${userId}, ${input.email.toLowerCase()}, ${input.role}, ${code})
      returning *
    `;
    const [me] = await sql`select name, email from public.profiles where id = ${userId}`;
    const who = me?.name || me?.email || 'Someone';
    const sent = await sendEmail({
      to: input.email,
      subject: `${who} asked you to help with their money`,
      text: `${who} invited you to ${input.role === 'view' ? 'see' : 'see and record'} their money in BudgetFriendly.\n\nOpen the app, go to Profile, then "People you help", and enter this code: ${code}\n\nYou'll use your own account. You won't see their password or be able to change their settings.`
    });
    return json(201, { delegate: toApiDelegate(row), code, emailed: sent });
  }

  if (ctx.method !== 'GET') methodNotAllowed(['GET', 'POST', 'DELETE']);
  const [helpers, helping] = await Promise.all([
    sql`
      select d.*, p.name as delegate_name from public.delegates d left join public.profiles p on p.id = d.delegate_id
      where d.owner_id = ${userId} order by d.created_at desc
    `,
    sql`
      select d.*, p.name as owner_name, p.email as owner_email from public.delegates d join public.profiles p on p.id = d.owner_id
      where d.delegate_id = ${userId} and d.accepted_at is not null order by p.name
    `
  ]);
  return json(200, {
    helpers: helpers.map((d) => ({ ...toApiDelegate(d), name: d.delegateName ?? null, code: d.acceptedAt ? null : d.code })),
    helping: helping.map((d) => ({ id: d.id, ownerId: d.ownerId, name: d.ownerName || d.ownerEmail, role: d.role }))
  });
}

const toApiDelegate = (d: any) => ({ id: d.id, email: d.email, role: d.role, accepted: !!d.acceptedAt, createdAt: iso(d.createdAt) });

/* ------------------------------------------------------------------ properties */

/*
 * For landlords: each property, who's in it, what the rent is and when it's due. Recording a payment adds it
 * as business income and moves the due date on. Kept deliberately small: no leases, no documents.
 */

const PropertySchema = z.object({
  name: z.string().trim().min(1).max(80),
  tenantName: z.string().trim().max(80).nullable().optional(),
  tenantPhone: z.string().trim().max(40).nullable().optional(),
  rentAmount: z.number().finite().nonnegative().max(1e12),
  frequency: z.enum(['monthly', 'quarterly', 'yearly']).default('yearly'),
  nextDue: z.string().regex(ISO_DATE).nullable().optional(),
  note: z.string().max(200).nullable().optional()
});

/** Quarterly rent moves three months; the recurring schedule knows months and years already. */
function nextRentDue(due: string, frequency: 'monthly' | 'quarterly' | 'yearly'): string {
  if (frequency !== 'quarterly') return nextOccurrence(due, frequency);
  return nextOccurrence(nextOccurrence(nextOccurrence(due, 'monthly'), 'monthly'), 'monthly');
}

function toApiProperty(p: any, today = todayIso()) {
  const due: string | null = p.nextDue ?? null;
  const days = due ? Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000) : null;
  return {
    id: p.id,
    name: p.name,
    tenantName: p.tenantName ?? null,
    tenantPhone: p.tenantPhone ?? null,
    rentAmount: Number(p.rentAmount),
    frequency: p.frequency,
    nextDue: due,
    status: days == null ? 'no_date' : days < 0 ? 'overdue' : days <= 30 ? 'due_soon' : 'paid_up',
    daysToDue: days,
    note: p.note ?? null
  };
}

/** GET/POST /v1/properties, PATCH/DELETE /v1/properties/:id, POST /v1/properties/:id/paid */
export async function propertiesRoute(ctx: Ctx) {
  const { userId } = await requireAuth(ctx.req);
  const [, id, sub] = ctx.parts;

  if (!id) {
    if (ctx.method === 'POST') {
      const input = await body(ctx.req, PropertySchema);
      const [p] = await sql`
        insert into public.properties (user_id, name, tenant_name, tenant_phone, rent_amount, frequency, next_due, note)
        values (${userId}, ${input.name}, ${input.tenantName ?? null}, ${input.tenantPhone ?? null}, ${input.rentAmount}, ${input.frequency},
                ${input.nextDue ?? null}::date, ${input.note ?? null})
        returning *
      `;
      return json(201, { property: toApiProperty(p) });
    }
    if (ctx.method !== 'GET') methodNotAllowed(['GET', 'POST']);
    const items = await sql`select * from public.properties where user_id = ${userId} order by next_due nulls last, name`;
    const [{ total }] = await sql`
      select coalesce(sum(amount), 0) as total from public.transactions
      where user_id = ${userId} and property_id is not null and occurred_at >= date_trunc('year', now())
    `;
    return json(200, { items: items.map((p) => toApiProperty(p)), rentThisYear: Number(total) });
  }

  if (!isUuid(id)) notFound('Not found');
  const [prop] = await sql`select * from public.properties where id = ${id} and user_id = ${userId}`;
  if (!prop) notFound('Not found');

  if (sub === 'paid') {
    if (ctx.method !== 'POST') methodNotAllowed(['POST']);
    const input = await body(ctx.req, z.object({ amount: z.number().finite().positive().optional(), paidOn: z.string().regex(ISO_DATE).optional() }));
    const amount = input.amount ?? Number(prop.rentAmount);
    if (!(amount > 0)) badRequest('Add the rent amount first');
    const paidOn = input.paidOn ?? todayIso();
    const [tx] = await sql`
      insert into public.transactions (user_id, space_id, type, amount, category, description, property_id, occurred_at)
      values (${userId}, 'business', 'income', ${amount}, 'Rent received', ${`Rent: ${prop.name}${prop.tenantName ? ` (${prop.tenantName})` : ''}`}, ${id},
              ${new Date(`${paidOn}T12:00:00.000Z`)})
      returning id, user_id, space_id, type, amount, budget_id, budget_category
    `;
    await afterTransactionCreated(tx as any);
    const next = prop.nextDue ? nextRentDue(prop.nextDue, prop.frequency) : null;
    const [p] = await sql`update public.properties set next_due = ${next}::date, reminded_for = null where id = ${id} returning *`;
    return json(200, { property: toApiProperty(p), transactionId: tx.id });
  }

  if (ctx.method === 'DELETE') {
    await sql`delete from public.properties where id = ${id}`;
    return noContent();
  }
  if (ctx.method !== 'PATCH') methodNotAllowed(['PATCH', 'DELETE']);
  const p = await body(ctx.req, PropertySchema.partial().strict());
  const has = (k: string) => Object.prototype.hasOwnProperty.call(p, k);
  const [row] = await sql`
    update public.properties set
      name = ${p.name ?? prop.name},
      tenant_name = ${has('tenantName') ? p.tenantName ?? null : prop.tenantName},
      tenant_phone = ${has('tenantPhone') ? p.tenantPhone ?? null : prop.tenantPhone},
      rent_amount = ${p.rentAmount ?? prop.rentAmount},
      frequency = ${p.frequency ?? prop.frequency},
      next_due = ${has('nextDue') ? p.nextDue ?? null : prop.nextDue}::date,
      note = ${has('note') ? p.note ?? null : prop.note},
      reminded_for = ${has('nextDue') ? null : prop.remindedFor}::date
    where id = ${id} returning *
  `;
  return json(200, { property: toApiProperty(row) });
}
