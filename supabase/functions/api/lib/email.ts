/**
 * Sends a transactional email through Resend when RESEND_API_KEY is set.
 * Without a key the message is only logged, so flows can still be exercised.
 * Returns true when the provider accepted the message.
 */
export async function sendEmail(message: { to: string; subject: string; text: string; html?: string }): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') || 'BudgetFriendly <onboarding@resend.dev>';
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY is not set; email not sent:', message.subject);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: message.to, subject: message.subject, text: message.text, html: message.html })
    });
    if (!res.ok) {
      console.error('[email] provider rejected message', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] send failed', err);
    return false;
  }
}
