/**
 * Cloud backend (Supabase). The project URL and publishable key are designed to ship inside apps;
 * data access is enforced by the API, so nothing secret lives here. Override with EXPO_PUBLIC_ vars if needed.
 */
export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://uggmyokbpwfdbustnggo.supabase.co').replace(/\/$/, '');
export const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_lfNxkvbTpvx7iP5S4n0FUw_-F1foews';

/** Every /v1 route is served by the `api` Edge Function. */
export const API_BASE = `${SUPABASE_URL}/functions/v1/api`;

export const PUBLIC_SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || 'https://budgetfriendly-waitlist.vercel.app').replace(/\/$/, '');
export const TERMS_URL = `${PUBLIC_SITE_URL}/terms.html`;
export const PRIVACY_URL = `${PUBLIC_SITE_URL}/privacy.html`;
export const REFUND_URL = `${PUBLIC_SITE_URL}/refund.html`;
