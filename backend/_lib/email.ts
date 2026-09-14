type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Sends a transactional email through Resend when RESEND_API_KEY is set.
 * Without a key (local dev), the message is logged instead so flows can still be tested.
 * Returns true when the provider accepted the message.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'BudgetFriendly <no-reply@budgetfriendly.app>';

  if (!apiKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[email] RESEND_API_KEY not set; would send to ${message.to}: ${message.subject}\n${message.text}`);
    } else {
      console.error('[email] RESEND_API_KEY is not configured; email not sent');
    }
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
