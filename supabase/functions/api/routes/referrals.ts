import { isUniqueViolation, sql } from '../lib/db.ts';
import { requireAuth } from '../lib/auth.ts';
import { badRequest, body, HttpError, json, methodNotAllowed, z } from '../lib/http.ts';
import { enforceRateLimit } from '../lib/rateLimit.ts';
import { cleanCode, codeTaken, countsClause, inviteLink, newReferralCode } from '../lib/referral.ts';
import type { Ctx } from '../index.ts';

/**
 * Invite friends (see the referrals migration).
 *
 * GET  /v1/referrals         your code, a message to share, and how many friends joined and count
 * POST /v1/referrals/claim   { code } the friend who invited you, typed at sign-up or later
 */

/** How long after signing up somebody can still say who invited them. */
const CLAIM_DAYS = 30;

type Me = { id: string; email: string | null; name: string | null; referralCode: string | null; referredCode: string | null; createdAt: string };

const loadMe = async (id: string) =>
  (await sql<Me[]>`select id, email, name, referral_code, referred_code, created_at from public.profiles where id = ${id}`)[0];

/**
 * Gives somebody their code the first time they ask. Somebody from the waitlist keeps their waitlist code, and
 * whoever invited them onto the waitlist becomes who invited them here.
 */
async function ensureCode(me: Me): Promise<Me> {
  if (me.referralCode) return me;
  const [waitlist] = me.email
    ? await sql<{ referralCode: string; invitedWith: string | null; firstName: string }[]>`
        select referral_code, invited_with, first_name from public.waitlist_signups where email = ${me.email.toLowerCase()}
      `
    : [];

  for (let attempt = 0; attempt < 6; attempt++) {
    const fromWaitlist = attempt === 0 && !!waitlist;
    const code = fromWaitlist ? waitlist.referralCode : newReferralCode(me.name || waitlist?.firstName || me.email?.split('@')[0] || '');
    if (!fromWaitlist && (await codeTaken(code))) continue;
    const invitedBy = waitlist?.invitedWith && waitlist.invitedWith !== code ? waitlist.invitedWith : null;
    try {
      const [row] = await sql<Me[]>`
        update public.profiles set
          referral_code = ${code},
          referred_code = coalesce(referred_code, ${invitedBy}),
          referred_at = case when referred_code is null and ${invitedBy}::text is not null then now() else referred_at end
        where id = ${me.id} and referral_code is null
        returning id, email, name, referral_code, referred_code, created_at
      `;
      // Another request gave them one first.
      return row ?? (await loadMe(me.id));
    } catch (err) {
      // The code was taken in between; try another.
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new Error('Could not create a unique invite code');
}

/** The first name of whoever owns a code, in the app or on the waitlist. */
async function ownerOf(code: string): Promise<{ id: string | null; email: string | null; name: string; referredCode: string | null } | null> {
  const [person] = await sql<{ id: string; email: string; name: string | null; referredCode: string | null }[]>`
    select id, email, name, referred_code from public.profiles where referral_code = ${code}
  `;
  if (person) return { id: person.id, email: person.email, name: firstName(person.name), referredCode: person.referredCode };
  const [waiting] = await sql<{ email: string; firstName: string }[]>`select email, first_name from public.waitlist_signups where referral_code = ${code}`;
  return waiting ? { id: null, email: waiting.email, name: firstName(waiting.firstName), referredCode: null } : null;
}

const firstName = (name: string | null | undefined) => String(name ?? '').trim().split(/\s+/)[0] || 'A friend';

const shareMessage = (code: string) =>
  `I use BudgetFriendly to see what’s safe to spend each day, so my money lasts until payday. ` +
  `Join with my code ${code}: ${inviteLink(code)}`;

const ClaimSchema = z.object({ code: z.string().trim().min(4).max(24) });

export async function referralsRoute(ctx: Ctx) {
  const auth = await requireAuth(ctx.req);
  // A helper or team member acting for somebody else has no friends of their own to invite here.
  if (auth.delegateRole || auth.teamRole) throw new HttpError(403, 'FORBIDDEN', 'Only the account holder can do this.');
  const loaded = await loadMe(auth.userId);
  if (!loaded) throw new HttpError(404, 'NOT_FOUND', 'Account not found');
  const me = await ensureCode(loaded);
  const code = me.referralCode!;
  const canEnterCode = !me.referredCode && Date.now() - new Date(me.createdAt).getTime() < CLAIM_DAYS * 86400_000;

  if (ctx.parts[1] === 'claim' && ctx.parts.length === 2) {
    if (ctx.method !== 'POST') methodNotAllowed(['POST']);
    await enforceRateLimit({ key: `referral-claim:${me.id}`, limit: 10, windowSec: 60 * 60 });
    const input = await body(ctx.req, ClaimSchema, 'Enter the code your friend sent you');
    // The same code they used on the waitlist, which was already carried over: nothing to change.
    if (me.referredCode && me.referredCode === cleanCode(input.code)) {
      return json(200, { invitedBy: (await ownerOf(me.referredCode))?.name ?? 'A friend' });
    }
    if (me.referredCode) throw new HttpError(409, 'ALREADY_CLAIMED', 'You’ve already said who invited you.');
    if (!canEnterCode) throw new HttpError(409, 'TOO_LATE', `Invite codes can be added in your first ${CLAIM_DAYS} days.`);

    const theirs = cleanCode(input.code);
    if (theirs === code) badRequest('That’s your own code. Share it with friends instead.', 'OWN_CODE');
    const owner = theirs ? await ownerOf(theirs) : null;
    if (!owner) throw new HttpError(404, 'INVALID_CODE', 'We don’t know that code. Check it with your friend.');
    if (owner.email && me.email && owner.email.toLowerCase() === me.email.toLowerCase()) badRequest('That’s your own code. Share it with friends instead.', 'OWN_CODE');
    // Two people can't each be the other's inviter.
    if (owner.referredCode === code) badRequest('You invited them, so they can’t have invited you.', 'CIRCULAR');

    const [row] = await sql`
      update public.profiles set referred_code = ${theirs}, referred_at = now()
      where id = ${me.id} and referred_code is null
      returning id
    `;
    if (!row) throw new HttpError(409, 'ALREADY_CLAIMED', 'You’ve already said who invited you.');
    return json(200, { invitedBy: owner.name });
  }

  if (ctx.parts.length !== 1) throw new HttpError(404, 'NOT_FOUND', 'Route not found');
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);

  const [[friends], [waiting], invitedBy] = await Promise.all([
    sql<{ joined: number; counted: number }[]>`
      select count(*)::int as joined, count(*) filter (where ${countsClause()})::int as counted
      from public.profiles p where p.referred_code = ${code}
    `,
    // Friends who used the code on the waitlist and aren't in the app yet.
    sql<{ n: number }[]>`
      select count(*)::int as n from public.waitlist_signups w
      where w.invited_with = ${code} and not exists (select 1 from public.profiles p where lower(p.email) = w.email)
    `,
    me.referredCode ? ownerOf(me.referredCode) : Promise.resolve(null)
  ]);

  return json(200, {
    code,
    link: inviteLink(code),
    message: shareMessage(code),
    joined: friends?.joined ?? 0,
    counted: friends?.counted ?? 0,
    waitlist: waiting?.n ?? 0,
    invitedBy: invitedBy?.name ?? null,
    canEnterCode
  });
}
