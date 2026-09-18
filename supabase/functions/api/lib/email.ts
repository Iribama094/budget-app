const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

/** Brevo wants the sender name and address as separate fields, so split "Name <a@b.com>". */
function parseSender(value: string): { name?: string; email: string } {
  const match = value.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (!match) return { email: value.trim() };
  const name = match[1].replace(/^"|"$/g, '').trim();
  return name ? { name, email: match[2].trim() } : { email: match[2].trim() };
}

/**
 * Sends a transactional email through Brevo when BREVO_API_KEY is set.
 * Without a key the message is only logged, so flows can still be exercised.
 * The key is the v3 API key (starts with "xkeysib-"), not the SMTP relay password,
 * and EMAIL_FROM must be a sender Brevo has verified or the send is rejected.
 * Returns true when the provider accepted the message.
 */
export async function sendEmail(message: { to: string; subject: string; text: string; html?: string }): Promise<boolean> {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') || 'BudgetFriendly <no-reply@budgetfriendly.app>';
  if (!apiKey) {
    console.warn('[email] BREVO_API_KEY is not set; email not sent:', message.subject);
    return false;
  }
  try {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: parseSender(from),
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        ...(message.html ? { htmlContent: message.html } : {})
      })
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
