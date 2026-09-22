import { HttpError } from './http.ts';

/**
 * The "are you a person" check on the few things anybody can reach without signing in.
 *
 * Cloudflare Turnstile, because it is free at any volume we will see and usually shows nothing at all to a
 * real person. It is optional: with no secret set the check stands aside, so the app works before the owner
 * has signed up for it, and switches on the moment TURNSTILE_SECRET exists. That matches how email works.
 *
 * It never blocks on Cloudflare being slow or down: a verification we cannot complete is allowed through,
 * because the rate limits behind it are what actually hold the line. This is a filter for cheap bulk abuse,
 * not the last defence.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function captchaConfigured(): boolean {
  return !!Deno.env.get('TURNSTILE_SECRET');
}

export async function requireHuman(token: string | null | undefined, ip: string | null): Promise<void> {
  const secret = Deno.env.get('TURNSTILE_SECRET');
  if (!secret) return;

  if (!token) {
    throw new HttpError(400, 'CAPTCHA_REQUIRED', 'Tick the box that says you are not a robot, then try again.');
  }

  try {
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const res = await fetch(VERIFY_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(6000) });
    const out = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (!out.success) {
      console.warn('[captcha] refused', out['error-codes']);
      throw new HttpError(400, 'CAPTCHA_FAILED', 'That check did not pass. Refresh the page and try once more.');
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // Cloudflare unreachable or slow: let it through, the rate limits still apply.
    console.error('[captcha] could not verify, allowing', err);
  }
}
