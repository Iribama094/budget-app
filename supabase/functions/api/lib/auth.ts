import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';
import { sql } from './db.ts';
import { HttpError } from './http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

/** Reads a key that may be a raw string or a JSON map of named keys (the new API key env vars). */
function envKey(...names: string[]): string {
  for (const name of names) {
    const raw = Deno.env.get(name);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string') return parsed;
      if (parsed && typeof parsed === 'object') {
        const first = (parsed as Record<string, string>).default ?? Object.values(parsed)[0];
        if (typeof first === 'string' && first) return first;
      }
    } catch {
      return raw;
    }
  }
  throw new Error(`None of ${names.join(', ')} is set`);
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

let publicClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

function publicAuth() {
  publicClient ??= createClient(SUPABASE_URL, envKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), clientOptions);
  return publicClient.auth;
}

/** Server-only admin client (secret key). Never returned to callers. */
export function adminAuth() {
  adminClient ??= createClient(SUPABASE_URL, envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), clientOptions);
  return adminClient.auth.admin;
}

export type AuthContext = { userId: string; sessionId: string | null; email: string | null; token: string };

/**
 * Updates the caller's password through Auth as the user themself, so the device making the change
 * stays signed in (an admin update would end every session, including this one).
 */
export async function updateOwnPassword(token: string, password: string): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: envKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  if (res.ok) return { ok: true };
  const out = await res.json().catch(() => null);
  return { ok: false, code: String(out?.error_code ?? ''), message: String(out?.msg ?? out?.message ?? 'Could not change your password') };
}

const DEVICE_TOUCH_MINUTES = 5;

/**
 * Verifies the caller's Supabase access token, then checks its session still exists so a device
 * signed out from "Signed-in devices" loses access immediately, not when its token expires.
 */
export async function requireAuth(req: Request): Promise<AuthContext> {
  const header = req.headers.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'UNAUTHORIZED', 'Missing Authorization header');

  let claims: Record<string, unknown> | undefined;
  try {
    const { data, error } = await publicAuth().getClaims(token);
    claims = error ? undefined : (data?.claims as Record<string, unknown> | undefined);
  } catch {
    // Malformed tokens throw instead of returning an error.
    claims = undefined;
  }
  if (!claims?.sub || claims.role !== 'authenticated') {
    throw new HttpError(401, 'UNAUTHORIZED', 'Invalid or expired token');
  }

  const userId = String(claims.sub);
  const sessionId = typeof claims.session_id === 'string' ? claims.session_id : null;

  if (sessionId) {
    const deviceName = (req.headers.get('x-device-name') ?? '').slice(0, 100) || null;
    const platform = (req.headers.get('x-device-platform') ?? '').slice(0, 20) || null;
    const rows = await sql`
      select s.id from auth.sessions s
      where s.id = ${sessionId} and s.user_id = ${userId} and (s.not_after is null or s.not_after > now())
    `;
    if (!rows.length) throw new HttpError(401, 'UNAUTHORIZED', 'This device was signed out');

    if (deviceName) {
      await sql`
        insert into public.device_sessions (session_id, user_id, device_name, platform)
        values (${sessionId}, ${userId}, ${deviceName}, ${platform})
        on conflict (session_id) do update
          set device_name = excluded.device_name, platform = excluded.platform, last_seen_at = now()
          where device_sessions.last_seen_at < now() - make_interval(mins => ${DEVICE_TOUCH_MINUTES})
             or device_sessions.device_name is distinct from excluded.device_name
      `.catch(() => undefined);
    }
  }

  return { userId, sessionId, email: typeof claims.email === 'string' ? claims.email : null, token };
}
