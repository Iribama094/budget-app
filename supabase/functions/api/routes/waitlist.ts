import { sql, isUniqueViolation } from '../lib/db.ts';
import { body, json, methodNotAllowed, z } from '../lib/http.ts';
import { enforceRateLimit } from '../lib/rateLimit.ts';
import { sendEmail } from '../lib/email.ts';
import { cleanCode, codeTaken, inviteLink, newReferralCode } from '../lib/referral.ts';
import type { Ctx } from '../index.ts';

/** Each friend who joins with your link moves you up this many places. */
const REFERRAL_BOOST = 10;

const PAINS = ['runs_out', 'no_idea', 'cant_save', 'debt', 'irregular'] as const;

const JoinSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(24).optional().nullable(),
  use: z.enum(['personal', 'business', 'both']).default('personal'),
  pains: z.array(z.enum(PAINS)).max(PAINS.length).default([]),
  updates: z.boolean().default(true),
  ref: z.string().trim().max(32).optional().nullable(),
  source: z.string().trim().max(60).optional().nullable(),
  // Honeypot: a field people never see. Bots fill it in.
  company: z.string().max(200).optional().nullable()
});

/** 0803 000 0000, +234 803 000 0000 and 8030000000 all become 8030000000. Anything else is dropped. */
function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const national = digits.startsWith('234') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits;
  return /^[0-9]{7,15}$/.test(national) ? national : null;
}

type Row = { id: string; seq: number; firstName: string; referralCode: string; referralCount: number };

/** 1 is the front of the line. Earlier joiners go first; each referral jumps REFERRAL_BOOST places. */
async function placeInLine(row: Row): Promise<number> {
  const rank = row.seq - REFERRAL_BOOST * row.referralCount;
  const [{ ahead }] = await sql`
    select count(*)::int as ahead from public.waitlist_signups w
    where (w.seq - ${REFERRAL_BOOST} * w.referral_count, w.seq) < (${rank}, ${row.seq})
  `;
  return ahead + 1;
}

function answer(row: Row, position: number, alreadyJoined: boolean) {
  return json(alreadyJoined ? 200 : 201, {
    firstName: row.firstName,
    position,
    referralCode: row.referralCode,
    referralLink: inviteLink(row.referralCode),
    referrals: row.referralCount,
    alreadyJoined
  });
}

/**
 * POST /v1/waitlist: joins the pre-launch waitlist. Public (no sign-in), rate limited per IP and per email.
 *
 * Joining twice with the same email is not an error: it answers with the existing place and invite link, so
 * someone who lost the page can get it back. Nothing already saved is overwritten.
 */
export async function waitlistJoin(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const input = await body(ctx.req, JoinSchema, 'Check your name and email and try again');

  const ip = (ctx.req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  await enforceRateLimit({ key: `waitlist:ip:${ip}`, limit: 20, windowSec: 60 * 60 });

  const email = input.email.toLowerCase();
  await enforceRateLimit({ key: `waitlist:email:${email}`, limit: 10, windowSec: 60 * 60 });

  // A bot filled the hidden field: look successful, save nothing.
  if (input.company) return json(201, { firstName: input.firstName, position: null, referralCode: null, referralLink: null, referrals: 0, alreadyJoined: false });

  const [existing] = await sql<Row[]>`
    select id, seq, first_name, referral_code, referral_count from public.waitlist_signups where email = ${email}
  `;
  if (existing) return answer(existing, await placeInLine(existing), true);

  // The code can be somebody else's on the waitlist, which moves them up, or somebody's already in the app.
  const refCode = cleanCode(input.ref);
  const [referrer] = refCode ? await sql<{ id: string }[]>`select id from public.waitlist_signups where referral_code = ${refCode}` : [];
  const invitedWith = referrer || (refCode && (await codeTaken(refCode))) ? refCode : null;

  let row: Row | undefined;
  for (let attempt = 0; attempt < 5 && !row; attempt++) {
    const code = newReferralCode(input.firstName);
    if (await codeTaken(code)) continue;
    try {
      row = await sql.begin(async (tx) => {
        const [created] = await tx<Row[]>`
          insert into public.waitlist_signups
            (email, first_name, phone, use_for, pain_points, wants_updates, referral_code, referred_by, invited_with, source)
          values (
            ${email}, ${input.firstName}, ${normalizePhone(input.phone)}, ${input.use}, ${input.pains}, ${input.updates},
            ${code}, ${referrer?.id ?? null}, ${invitedWith}, ${input.source || null}
          )
          returning id, seq, first_name, referral_code, referral_count
        `;
        if (referrer) await tx`update public.waitlist_signups set referral_count = referral_count + 1 where id = ${referrer.id}`;
        return created;
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // The same email raced in from another tab: hand back that signup.
      const [raced] = await sql<Row[]>`select id, seq, first_name, referral_code, referral_count from public.waitlist_signups where email = ${email}`;
      if (raced) return answer(raced, await placeInLine(raced), true);
      // Otherwise the invite code collided; try another one.
    }
  }
  if (!row) throw new Error('Could not create a unique invite code');

  const position = await placeInLine(row);
  const link = inviteLink(row.referralCode);
  // A confirmation with their invite link. Signing up still works if email isn't configured.
  await sendEmail({
    to: email,
    subject: `You're on the BudgetFriendly waitlist, ${row.firstName}`,
    text:
      `You're number ${position} on the BudgetFriendly waitlist.\n\n` +
      `We'll message you the moment it's your turn. Want to move up? Every friend who joins with your link moves you up ${REFERRAL_BOOST} places:\n${link}\n\n` +
      `BudgetFriendly: money that lasts until payday.`,
    html:
      `<p>You're number <strong>${position}</strong> on the BudgetFriendly waitlist.</p>` +
      `<p>We'll message you the moment it's your turn. Want to move up? Every friend who joins with your link moves you up ${REFERRAL_BOOST} places:</p>` +
      `<p><a href="${link}">${link}</a></p><p>BudgetFriendly: money that lasts until payday.</p>`
  });

  return answer(row, position, false);
}
