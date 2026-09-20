import { createClient } from '@supabase/supabase-js';

/**
 * The console talks to the same API the phone app does, on the /v1/admin routes. Those check the signed in
 * account against admin_users before anything else, so a normal person's token gets a flat "not found" here.
 * The project url and publishable key are meant to be public; nothing is protected by hiding them.
 */
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://uggmyokbpwfdbustnggo.supabase.co';
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || 'sb_publishable_lfNxkvbTpvx7iP5S4n0FUw_-F1foews';
const API = `${SUPABASE_URL}/functions/v1/api/v1`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

export type AdminRole = 'owner' | 'engineer' | 'support' | 'finance';
export type Admin = { id: string; email: string; name: string | null; role: AdminRole };

export type Flag = { key: string; label: string; description: string | null; enabled: boolean; rolloutPercent: number };

export type WrappedPeriod = {
  id: string;
  space: 'personal' | 'business';
  kind: 'h1' | 'year' | 'quarter';
  quarter: number | null;
  year: number;
  state: 'building' | 'ready' | 'published' | 'hidden';
  opensOn: string;
  closesOn: string;
  certifiedAt: string | null;
  note: string | null;
  publishedAt: string | null;
  builtAt: string | null;
  peopleIncluded: number;
};

export type AuditRow = {
  id: number;
  adminEmail: string;
  adminName: string | null;
  adminRole: AdminRole | null;
  action: string;
  target: string | null;
  detail: unknown;
  createdAt: string;
};

export type Overview = {
  people: { total: number; today: number };
  transactions: { today: number; week: number };
  wrappedWaiting: number;
  notifications: Array<{ kind: string; last: string; n: number }>;
};

export type StaffRow = Admin & { createdAt: string; lastSeenAt: string | null; disabledAt: string | null };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, 'Your session has ended. Sign in again.');

  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  me: () => call<{ admin: Admin }>('/admin/me'),
  overview: () => call<Overview>('/admin/overview'),
  flags: () => call<{ items: Flag[] }>('/admin/flags'),
  setFlag: (key: string, patch: { enabled?: boolean; rolloutPercent?: number }) =>
    call<{ flag: Flag }>(`/admin/flags/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  wrapped: () => call<{ items: WrappedPeriod[]; today: string }>('/admin/wrapped'),
  setWrapped: (id: string, patch: { state?: WrappedPeriod['state']; opensOn?: string; closesOn?: string; note?: string }) =>
    call<{ period: WrappedPeriod }>(`/admin/wrapped/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  audit: () => call<{ items: AuditRow[] }>('/admin/audit'),
  staff: () => call<{ items: StaffRow[] }>('/admin/staff'),
  addStaff: (input: { email: string; name?: string; role: AdminRole }) =>
    call<{ staff: Admin }>('/admin/staff', { method: 'POST', body: JSON.stringify(input) }),
  removeStaff: (id: string) => call<{ removed: boolean }>(`/admin/staff/${id}`, { method: 'DELETE' })
};
