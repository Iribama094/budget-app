import { sql } from './db.ts';
import { adminAuth } from './auth.ts';
import { emailConfigured, sendEmail } from './email.ts';

/**
 * Proving somebody owns the email address on their account, with a six-digit code sent through Brevo.
 *
 * Until they do, the app sends that address nothing but the code and password resets. See the
 * email_verification migration for why.
 */

const CODE_TTL_MIN = 15;
const MAX_ATTEMPTS = 5;
/** A second send inside this window reuses the code already on its way, rather than piling up emails. */
const RESEND_AFTER_SEC = 60;

/**
 * Whether this account still has to prove its address before it can use the app or invite anybody.
 *
 * The check exists so we never email a stranger. While no mail provider is configured we email nobody, and
 * a code could never arrive, so asking for one would only trap every new person on the code screen. It
 * switches itself on the moment BREVO_API_KEY is set; anybody who signed up in between is asked then.
 */
export async function mustProveEmail(userId: string): Promise<boolean> {
  if (!emailConfigured()) return false;
  return !(await isEmailVerified(userId));
}

export async function isEmailVerified(userId: string): Promise<boolean> {
  const [row] = await sql<{ at: string | null }[]>`
    select raw_app_meta_data ->> 'email_verified_at' as at from auth.users where id = ${userId}
  `;
  return !!row?.at;
}

async function hash(userId: string, code: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${userId}:${code}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Six digits from the platform's secure random source. Math.random is guessable and never used for codes. */
function newCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}

export type SendResult = 'sent' | 'already-sent' | 'verified';

export async function sendVerificationCode(userId: string): Promise<SendResult> {
  if (await isEmailVerified(userId)) return 'verified';

  const [recent] = await sql<{ fresh: boolean }[]>`
    select sent_at > now() - make_interval(secs => ${RESEND_AFTER_SEC}) as fresh
    from public.email_verifications where user_id = ${userId} and expires_at > now()
  `;
  if (recent?.fresh) return 'already-sent';

  const [who] = await sql<{ email: string | null; name: string | null }[]>`select email, name from public.profiles where id = ${userId}`;
  if (!who?.email) return 'already-sent';

  const code = newCode();
  await sql`
    insert into public.email_verifications (user_id, code_hash, expires_at, attempts, sent_at)
    values (${userId}, ${await hash(userId, code)}, now() + make_interval(mins => ${CODE_TTL_MIN}), 0, now())
    on conflict (user_id) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = now()
  `;
  await sendEmail({
    to: who.email,
    subject: `${code} is your BudgetFriendly code`,
    text:
      `Your code to confirm this email address for BudgetFriendly: ${code}\n\n` +
      `It expires in ${CODE_TTL_MIN} minutes. Never share it with anyone: we will never call, text or DM you to ask for it.\n\n` +
      `If you did not just sign up, someone typed your address by mistake or on purpose. Ignore this email and nothing more will be sent.`,
    html:
      `<p>Your code to confirm this email address for BudgetFriendly:</p>` +
      `<p style="font-size:28px;font-weight:600;letter-spacing:6px">${code}</p>` +
      `<p>It expires in ${CODE_TTL_MIN} minutes. <strong>Never share it with anyone</strong>: we will never call, text or DM you to ask for it.</p>` +
      `<p style="color:#5a6e69">If you did not just sign up, someone typed your address by mistake or on purpose. Ignore this email and nothing more will be sent.</p>`
  });
  return 'sent';
}

export type CheckResult = 'verified' | 'wrong' | 'expired' | 'too-many';

export async function checkVerificationCode(userId: string, code: string): Promise<CheckResult> {
  if (await isEmailVerified(userId)) return 'verified';
  const [row] = await sql<{ codeHash: string; expired: boolean; attempts: number }[]>`
    select code_hash, expires_at <= now() as expired, attempts from public.email_verifications where user_id = ${userId}
  `;
  if (!row || row.expired) return 'expired';
  if (row.attempts >= MAX_ATTEMPTS) return 'too-many';

  if ((await hash(userId, code)) !== row.codeHash) {
    await sql`update public.email_verifications set attempts = attempts + 1 where user_id = ${userId}`;
    return row.attempts + 1 >= MAX_ATTEMPTS ? 'too-many' : 'wrong';
  }

  // app_metadata, not the profile: only the server can write it, so nobody can mark themselves verified.
  const { error } = await adminAuth().updateUserById(userId, { app_metadata: { email_verified_at: new Date().toISOString() } });
  if (error) throw error;
  await sql`delete from public.email_verifications where user_id = ${userId}`;
  return 'verified';
}
