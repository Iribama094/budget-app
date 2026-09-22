import { createClient } from '@supabase/supabase-js';

/**
 * The console talks to the same API the phone app does, on the /v1/admin routes. Those check the signed in
 * account against admin_users before anything else, so a normal person's token gets a flat "not found" here.
 * The project url and publishable key are meant to be public; nothing is protected by hiding them.
 */
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://uggmyokbpwfdbustnggo.supabase.co';
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || 'sb_publishable_lfNxkvbTpvx7iP5S4n0FUw_-F1foews';
const API = `${SUPABASE_URL}/functions/v1/api/v1`;

/** Shown on the Settings page, so anyone can see which project the console is pointed at. */
export const API_BASE = API;
export const PROJECT_REF = SUPABASE_URL.replace('https://', '').split('.')[0];

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

export type PreviewMatch = { id: string; email: string; name: string | null; transactions: number; hasBusiness: boolean };

export type PersonMatch = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  transactions: number;
  budgets: number;
  devices: number;
};

export type PersonDetail = {
  person: {
    id: string;
    email: string;
    name: string | null;
    currency: string | null;
    createdAt: string;
    budgetPeriod: string;
    onboardingCompletedAt: string | null;
    onboardingSkippedAt: string | null;
  };
  counts: { transactions: number; budgets: number; goals: number; devices: number; lastLogged: string | null };
  plan: { monthlyIncome: number; committed: number; status: string; shortfall: number; note: string | null } | null;
};

export type QuoteValue = { text: string; author: string; source: string; themes: string[]; local?: boolean };

export type ContentBlock = { key: string; kind: 'quote' | 'notification' | 'guide' | 'tip' | 'price_alert' | 'fx_rate'; value: unknown; enabled: boolean; updatedAt: string };
export type PriceAlertValue = { title: string; body: string; categories: string[]; until?: string };
export type FxRateValue = { currency: string; rate: number };

export type TaxVersion = {
  id: string;
  country: string;
  effectiveFrom: string;
  state: 'draft' | 'pending' | 'live' | 'retired';
  note: string | null;
  payload: TaxRule;
  createdAt: string;
  approvedAt: string | null;
  createdBy: string | null;
  createdByEmail: string | null;
  approvedByEmail: string | null;
  /** The signed in admin's own id, copied onto each row so the console can refuse self approval. */
  you?: string;
};

/** Everything the app's Wrapped screen draws, so the console can play it back exactly as a person sees it. */
export type WrappedStory = {
  hasData: boolean;
  space: 'personal' | 'business';
  currency: string;
  period: { kind: 'h1' | 'year' | 'quarter'; year: number; quarter: number | null; start: string; end: string; label: string; complete: boolean };
  persona: { key: string; title: string; line: string };
  totals: { income: number; spending: number; net: number; savingsRate: number | null; ownerPay: number };
  change: { spending: number | null; income: number | null };
  months: Array<{ month: string; income: number; spending: number }>;
  biggestMonth: { month: string; amount: number } | null;
  calmestMonth: { month: string; amount: number } | null;
  bestSavingMonth: { month: string; amount: number } | null;
  topCategories: Array<{ category: string; amount: number; share: number }>;
  topMerchant: { name: string; visits: number; amount: number } | null;
  busiestDay: string | null;
  habits: { transactions: number; daysLogged: number; trackedDays: number; totalDays: number; noSpendDays: number };
  goals: { saved: number; goalsFunded: number };
  budgets: { ended: number; onBudget: number };
  business: {
    revenue: number;
    costs: number;
    profit: number;
    margin: number | null;
    bestMonth: { month: string; profit: number } | null;
    topCustomer: { name: string; amount: number } | null;
    invoicesIssued: number;
    invoicesPaid: number;
    payroll: number;
    ownerPay: number;
  } | null;
};

export type TaxBand = { from: number; to: number | null; rate: number };

/** The whole rule, which is what a new version is copied from. */
export type TaxRule = {
  country: string;
  version: string;
  effectiveDate: string;
  currency?: string;
  notes?: string;
  lastReviewed?: string;
  sources?: string[];
  brackets: TaxBand[];
  allowances?: Record<string, number | { type: string; rate?: number; fixed?: number; minRate?: number }>;
  deductions?: Record<string, { cap?: number; rate?: number }>;
  minimumTaxRate?: number;
  noTaxIfGrossMonthlyAtOrBelow?: number;
  company?: { smallCompanyTurnover: number; rate: number; note: string };
};

export type TaxCountry = {
  code: string;
  country: string;
  version: string | null;
  /** Whether the rules in force came from an approved version or from the app itself. */
  source: 'approved' | 'code';
  effectiveDate: string | null;
  notes: string | null;
  brackets: TaxBand[];
  deductions: Record<string, { cap?: number; rate?: number }>;
  allowances: Record<string, unknown>;
  noTaxIfGrossMonthlyAtOrBelow: number | null;
  minimumTaxRate: number | null;
  company: { smallCompanyTurnover: number; rate: number; note: string } | null;
  rule: TaxRule;
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
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
    throw new ApiError(res.status, body?.error?.message ?? `Request failed (${res.status})`, body?.error?.code);
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
  removeStaff: (id: string) => call<{ removed: boolean }>(`/admin/staff/${id}`, { method: 'DELETE' }),

  people: (q: string) => call<{ items: PersonMatch[] }>(`/admin/people?q=${encodeURIComponent(q)}`),
  person: (id: string) => call<PersonDetail>(`/admin/people/${id}`),
  personAction: (id: string, action: 'send-password-reset' | 'sign-out-devices') =>
    call<{ message: string }>(`/admin/people/${id}/action`, { method: 'POST', body: JSON.stringify({ action }) }),

  content: () => call<{ items: ContentBlock[]; inCode: number }>('/admin/content'),
  addContent: (block: { key: string; kind: string; value: unknown }) =>
    call<{ block: ContentBlock }>('/admin/content', { method: 'POST', body: JSON.stringify(block) }),
  setContent: (key: string, patch: { value?: unknown; enabled?: boolean }) =>
    call<{ block: ContentBlock }>(`/admin/content/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  seedQuotes: () => call<{ added: number; total: number }>('/admin/content/seed-quotes', { method: 'POST' }),

  taxRules: () => call<{ editable: boolean; you: string; inCode: TaxCountry[]; versions: TaxVersion[]; today: string }>('/admin/tax-rules'),
  /** No payload means copy whatever is in force, which the server does so nothing is lost on the way. */
  addTaxVersion: (input: { country: string; effectiveFrom: string; note?: string }) =>
    call<{ version: TaxVersion }>('/admin/tax-rules', { method: 'POST', body: JSON.stringify(input) }),
  saveTaxVersion: (id: string, patch: { payload?: TaxRule; note?: string; effectiveFrom?: string }) =>
    call<{ version: TaxVersion }>(`/admin/tax-rules/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  taxVersionAction: (id: string, action: 'submit' | 'approve' | 'retire') =>
    call<{ state: string; message: string }>(`/admin/tax-rules/${id}/${action}`, { method: 'POST' }),

  /**
   * The story one account would see. `who` is a name or email, or an account id once someone has been picked.
   * More than one match comes back as `matches` to choose from, with no figures read yet.
   */
  wrappedPreview: (
    who: { q?: string; id?: string },
    period: { kind: 'h1' | 'year' | 'quarter'; quarter?: number | null; year: number; space: 'personal' | 'business' }
  ) =>
    call<{ wrapped?: WrappedStory; of?: string; name?: string | null; hasBusiness?: boolean; matches?: PreviewMatch[] }>(
      `/admin/wrapped/preview?${who.id ? `id=${encodeURIComponent(who.id)}` : `q=${encodeURIComponent(who.q ?? '')}`}` +
        `&kind=${period.kind}${period.kind === 'quarter' ? `&quarter=${period.quarter ?? 1}` : ''}&year=${period.year}&space=${period.space}`
    )
};
