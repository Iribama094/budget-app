// Where the waitlist form posts. This is the live BudgetFriendly API (the "api" Edge Function, POST /v1/waitlist).
window.BF_WAITLIST_API = "https://uggmyokbpwfdbustnggo.supabase.co/functions/v1/api/v1/waitlist";

// Cloudflare Turnstile ("not a robot"). Empty means no box is shown, which is how this starts out.
// Put the site key here and TURNSTILE_SECRET on the server to switch it on; the two go together.
window.BF_TURNSTILE_SITE_KEY = "";
