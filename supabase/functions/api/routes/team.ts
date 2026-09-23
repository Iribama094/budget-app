import { iso, isUniqueViolation, isUuid, sql } from '../lib/db.ts';
import { firstNameOnly } from '../lib/shared.ts';
import { requireAuth } from '../lib/auth.ts';
import { badRequest, body, HttpError, json, methodNotAllowed, noContent, notFound, z } from '../lib/http.ts';
import { mustProveEmail } from '../lib/verify.ts';
import { ROLE_LABEL, TEAM_ROLES, type TeamRole } from '../lib/team.ts';
import { notifyUser } from '../lib/notify.ts';
import type { Ctx } from '../index.ts';

/*
 * A business owner's team (docs/team-access.md). The owner adds someone by name and role and shares a code;
 * that person joins with their own account. What each role may then do is decided in lib/team.ts.
 *
 * GET    /v1/team            my team, the businesses I'm in, and whether I have a business of my own
 * POST   /v1/team            add someone: { name, role, staffId? } -> a code to share
 * PATCH  /v1/team/:id        change their role
 * DELETE /v1/team/:id        remove them (owner), or leave (member)
 * POST   /v1/team/join       join with a code
 */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
const RoleSchema = z.enum(TEAM_ROLES as [TeamRole, ...TeamRole[]]);
const MAX_MEMBERS = 50;

/** The business's name as its people know it: the name in its settings, or "Ada's business". */
export async function businessNameOf(ownerId: string): Promise<string> {
  const [row] = await sql`
    select nullif(trim(bs.business_name), '') as business_name, p.name, p.email
    from public.profiles p left join public.business_settings bs on bs.user_id = p.id
    where p.id = ${ownerId}
  `;
  if (row?.businessName) return row.businessName;
  const first = firstNameOnly(row?.name as string | null) || 'Their';
  return `${first}’s business`;
}

const toApiMember = (m: any) => ({
  id: m.id,
  name: m.name,
  role: m.role as TeamRole,
  roleLabel: ROLE_LABEL[m.role as TeamRole],
  joined: !!m.acceptedAt,
  // Only while it's waiting, so it can be shared again.
  code: m.acceptedAt ? null : m.code,
  expired: !m.acceptedAt && new Date(m.expiresAt).getTime() < Date.now(),
  staffId: m.staffId ?? null,
  createdAt: iso(m.createdAt)
});

const shareMessage = (business: string, role: TeamRole, code: string) =>
  `You've been added to ${business} on BudgetFriendly as ${ROLE_LABEL[role]}.\n\n` +
  `1. Install BudgetFriendly and create your account (or open it if you have one).\n` +
  `2. Enter this code: ${code}\n\n` +
  `On sign up, tap "Have an invite code?". If you already use the app, it's in Settings, "Join a business". The code works for 14 days.`;

/** The invite a code belongs to, whether or not it can still be used. Used by the one code box (routes/join.ts). */
export async function findBusinessInvite(code: string) {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const [invite] = clean ? await sql`select * from public.business_members where code = ${clean}` : [];
  if (!invite || invite.acceptedAt || new Date(invite.expiresAt).getTime() < Date.now()) return null;
  return invite;
}

/** Joining a business with a code. Shared by /v1/team/join and the one code box. */
export async function joinBusinessWithCode(userId: string, code: string) {
  // A confirmed email ties the account to a real person before it sees anyone's business.
  if (await mustProveEmail(userId)) throw new HttpError(403, 'EMAIL_UNVERIFIED', 'Confirm your email address first, then enter the code.');
  const invite = await findBusinessInvite(code);
  if (!invite) badRequest('That code has been used, has run out, or doesn’t exist. Ask for a new one.', 'INVALID_CODE');
  if (invite.ownerId === userId) badRequest('That’s a code for your own business. Share it with the person you added.');
  try {
    await sql`update public.business_members set member_id = ${userId}, accepted_at = now() where id = ${invite.id} and accepted_at is null`;
  } catch (err) {
    if (isUniqueViolation(err)) badRequest('You’re already part of this business.');
    throw err;
  }
  const business = await businessNameOf(invite.ownerId);
  await notifyUser(invite.ownerId, {
    kind: 'shared',
    title: `${invite.name} joined ${business}`,
    body: `They can now work as ${ROLE_LABEL[invite.role as TeamRole]}. Everything they record shows their name.`,
    spaceId: 'business',
    data: { screen: 'Team' }
  }).catch(() => undefined);
  return { ownerId: invite.ownerId as string, businessName: business, role: invite.role as TeamRole, roleLabel: ROLE_LABEL[invite.role as TeamRole] };
}

export async function teamRoute(ctx: Ctx) {
  const auth = await requireAuth(ctx.req);
  // Teams belong to the person holding the phone, never to someone they're helping.
  if (auth.delegateRole) throw new HttpError(403, 'FORBIDDEN', 'Only the owner can manage their team.');
  const me = auth.actorId;
  const [, sub] = ctx.parts;

  if (sub === 'join') {
    if (ctx.method !== 'POST') methodNotAllowed(['POST']);
    const { code } = await body(ctx.req, z.object({ code: z.string().trim().min(6).max(12) }));
    return json(200, await joinBusinessWithCode(me, code));
  }

  if (sub) {
    if (!isUuid(sub)) notFound('Not found');
    const [m] = await sql`select * from public.business_members where id = ${sub} and (owner_id = ${me} or member_id = ${me})`;
    if (!m) notFound('Not found');
    if (ctx.method === 'DELETE') {
      await sql`delete from public.business_members where id = ${sub}`;
      return noContent();
    }
    if (ctx.method !== 'PATCH') methodNotAllowed(['PATCH', 'DELETE']);
    if (m.ownerId !== me) throw new HttpError(403, 'FORBIDDEN', 'Only the owner can change roles.');
    const input = await body(ctx.req, z.object({ role: RoleSchema.optional(), name: z.string().trim().min(1).max(80).optional() }).strict());
    const [row] = await sql`
      update public.business_members set role = ${input.role ?? m.role}, name = ${input.name ?? m.name} where id = ${sub} returning *
    `;
    return json(200, { member: toApiMember(row) });
  }

  if (ctx.method === 'POST') {
    const input = await body(ctx.req, z.object({ name: z.string().trim().min(1).max(80), role: RoleSchema, staffId: z.string().uuid().nullable().optional() }));
    if (await mustProveEmail(me)) throw new HttpError(403, 'EMAIL_UNVERIFIED', 'Confirm your own email address first, then you can add people.');
    const [{ n }] = await sql`select count(*)::int as n from public.business_members where owner_id = ${me}`;
    if (n >= MAX_MEMBERS) badRequest(`A team can have up to ${MAX_MEMBERS} people. Remove someone first.`);
    if (input.staffId) {
      const [staff] = await sql`select id from public.staff where id = ${input.staffId} and user_id = ${me}`;
      if (!staff) badRequest('That staff member was not found.');
    }
    const code = newCode();
    const [row] = await sql`
      insert into public.business_members (owner_id, name, role, code, staff_id)
      values (${me}, ${input.name}, ${input.role}, ${code}, ${input.staffId ?? null})
      returning *
    `;
    const business = await businessNameOf(me);
    return json(201, { member: toApiMember(row), code, message: shareMessage(business, input.role, code) });
  }

  if (ctx.method !== 'GET') methodNotAllowed(['GET', 'POST']);
  const [members, memberships, [own]] = await Promise.all([
    sql`select * from public.business_members where owner_id = ${me} order by accepted_at nulls last, name`,
    sql`select id, owner_id, role from public.business_members where member_id = ${me} and accepted_at is not null`,
    sql`
      select
        exists (select 1 from public.business_settings where user_id = ${me} and coalesce(trim(business_name), '') <> '')
        or exists (select 1 from public.transactions where user_id = ${me} and space_id = 'business') as active
    `
  ]);
  const businesses = await Promise.all(
    memberships.map(async (m) => ({ id: m.id, ownerId: m.ownerId, name: await businessNameOf(m.ownerId), role: m.role as TeamRole, roleLabel: ROLE_LABEL[m.role as TeamRole] }))
  );
  return json(200, {
    members: members.map(toApiMember),
    businesses,
    own: { active: !!own?.active, name: await businessNameOf(me) }
  });
}
