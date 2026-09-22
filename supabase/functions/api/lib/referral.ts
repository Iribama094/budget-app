import { sql } from './db.ts';
import { emailConfigured } from './email.ts';
import { notifyUser } from './notify.ts';

/** Where invite links point. The waitlist page reads ?ref= and sends it back as `ref`. */
export const SITE = Deno.env.get('WAITLIST_SITE_URL') || 'https://budgetfriendly.ng';

export const inviteLink = (code: string) => `${SITE}/?ref=${code}`;

// Letters and digits that can't be misread for each other (no 0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A name people can read out, e.g. ADAK7M2. Codes from the waitlist and the app share one pool. */
export function newReferralCode(name: string): string {
  const stem = (name.trim().split(/\s+/)[0] ?? '').normalize('NFKD').replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase() || 'FRIEND';
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return stem + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Upper case, letters and digits only, so "ada-k7m2 " still works. Null when nothing like a code is left. */
export function cleanCode(raw: string | null | undefined): string | null {
  const code = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z0-9]{4,16}$/.test(code) ? code : null;
}

/** Whether a code is anybody's yet, in the app or on the waitlist. */
export async function codeTaken(code: string): Promise<boolean> {
  const [row] = await sql`
    select exists (select 1 from public.profiles where referral_code = ${code})
        or exists (select 1 from public.waitlist_signups where referral_code = ${code}) as taken
  `;
  return !!row?.taken;
}

/**
 * A friend counts once they have confirmed their email (while email is switched on) and recorded something.
 * `p` is the friend's profile row alias in the query this is spliced into.
 */
export const countsClause = () => sql`
  exists (select 1 from public.transactions t where t.user_id = p.id)
  and (${!emailConfigured()} or exists (
    select 1 from auth.users u where u.id = p.id and u.raw_app_meta_data ->> 'email_verified_at' is not null
  ))
`;

/**
 * Daily: tells people when friends they invited start to count. One message per person however many friends
 * counted, and each friend is only ever announced once (referral_counted_at).
 */
export async function announceReferrals(): Promise<{ friends: number; sent: number }> {
  const rows = await sql<{ inviterId: string; names: string[] }[]>`
    with fresh as (
      update public.profiles p set referral_counted_at = now()
      from public.profiles inviter
      where inviter.referral_code = p.referred_code
        and p.referral_counted_at is null
        and ${countsClause()}
      returning inviter.id as inviter_id, coalesce(nullif(split_part(p.name, ' ', 1), ''), 'A friend') as name
    )
    select inviter_id, array_agg(name) as names from fresh group by inviter_id
  `;
  let friends = 0;
  let sent = 0;
  for (const { inviterId, names } of rows) {
    friends += names.length;
    const title = names.length === 1 ? `${names[0]} is using BudgetFriendly` : `${names.length} friends are using BudgetFriendly`;
    try {
      const delivered = await notifyUser(inviterId, {
        kind: 'referral',
        title,
        body: 'Thanks for sharing. They joined with your code and have started tracking their money.',
        data: { screen: 'InviteFriends' },
        spaceId: 'personal'
      });
      if (delivered) sent++;
    } catch (err) {
      console.error('[referrals] notify failed', err);
    }
  }
  return { friends, sent };
}
