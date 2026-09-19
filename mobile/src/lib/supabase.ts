import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock
  }
});

// Keep refreshing the session only while the app is on screen.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Turns Supabase Auth errors into copy people can act on. */
export function friendlyAuthError(err: unknown, fallback: string): Error {
  const e = err as { code?: string; status?: number; message?: string; name?: string } | null;
  const code = e?.code ?? '';
  if (code === 'invalid_credentials') return new Error('Invalid email or password');
  if (code === 'user_already_exists' || code === 'email_exists') return new Error('Email already in use');
  if (code === 'otp_expired') return new Error('That code isn’t right or has expired. Request a new one.');
  if (code === 'weak_password') return new Error('Choose a stronger password with at least 8 characters.');
  if (code === 'same_password') return new Error('Choose a password you haven’t used for this account.');
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return new Error('Too many attempts. Try again in a few minutes.');
  if (code === 'email_address_not_authorized') return new Error('We can’t send email to that address yet. Ask the app owner to finish setting up email.');
  if (e?.name === 'AuthRetryableFetchError' || e?.status === 0) return new Error('Check your connection and try again.');
  return new Error(e?.message || fallback);
}

/** The Auth session id inside an access token, used to sign out a replaced session. */
export function sessionIdOf(accessToken?: string | null): string | null {
  try {
    const part = accessToken?.split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const claims = JSON.parse(atob(base64));
    return typeof claims.session_id === 'string' ? claims.session_id : null;
  } catch {
    return null;
  }
}
