import { apiFetch } from './client';

/*
 * Your money, rising prices, helpers and properties (docs/money-for-everyone.md).
 */

type SpaceId = 'personal' | 'business';
const withSpace = (path: string, spaceId?: SpaceId) => (spaceId ? `${path}${path.includes('?') ? '&' : '?'}spaceId=${spaceId}` : path);

/* ------------------------------------------------------------ your money */

export type HoldingKind = 'cash' | 'bank' | 'wallet' | 'property' | 'land' | 'vehicle' | 'investment' | 'pension' | 'crypto' | 'other';

export type ApiHolding = {
  id: string;
  name: string;
  kind: HoldingKind;
  /** 'have': money you can spend. 'own': things that are worth something. */
  group: 'have' | 'own';
  currency: string;
  balance: number;
  note: string | null;
  updatedAt: string;
};

export type ApiDebt = {
  id: string;
  direction: 'owe' | 'owed';
  person: string;
  amount: number;
  balance: number;
  monthlyRate: number | null;
  dueDate: string | null;
  note: string | null;
  closedAt: string | null;
  createdAt: string;
};

export type ApiMoney = {
  home: string;
  rates: Record<string, number>;
  /** Currencies we couldn't count because there's no rate for them yet. */
  missingRates: string[];
  totals: { have: number; own: number; owedToYou: number; owe: number; net: number };
  holdings: ApiHolding[];
  bankAccounts: Array<{ id: string; name: string; mask: string; currency: string; balance: number; bankName: string; logoUrl: string | null }>;
  debts: ApiDebt[];
  /** Debts you owe, dearest first: the order to clear them in. */
  payoffOrder: string[];
  history: Array<{ month: string; net: number }>;
};

export const getMoney = (spaceId?: SpaceId): Promise<ApiMoney> => apiFetch(withSpace('/v1/money', spaceId), { method: 'GET' });

export async function createHolding(input: { name: string; kind: HoldingKind; currency?: string; balance: number; note?: string | null; spaceId?: SpaceId }): Promise<ApiHolding> {
  return (await apiFetch('/v1/holdings', { method: 'POST', body: JSON.stringify(input) })).holding;
}
export async function updateHolding(id: string, patch: Partial<{ name: string; kind: HoldingKind; currency: string; balance: number; note: string | null }>): Promise<ApiHolding> {
  return (await apiFetch(`/v1/holdings/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })).holding;
}
export const deleteHolding = (id: string) => apiFetch(`/v1/holdings/${encodeURIComponent(id)}`, { method: 'DELETE' });

export async function createDebt(input: {
  direction: 'owe' | 'owed';
  person: string;
  amount: number;
  balance?: number;
  monthlyRate?: number | null;
  dueDate?: string | null;
  note?: string | null;
  spaceId?: SpaceId;
}): Promise<ApiDebt> {
  return (await apiFetch('/v1/debts', { method: 'POST', body: JSON.stringify(input) })).debt;
}
export async function updateDebt(id: string, patch: Partial<{ person: string; amount: number; balance: number; monthlyRate: number | null; dueDate: string | null; note: string | null }>): Promise<ApiDebt> {
  return (await apiFetch(`/v1/debts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })).debt;
}
export const deleteDebt = (id: string) => apiFetch(`/v1/debts/${encodeURIComponent(id)}`, { method: 'DELETE' });
export async function payDebt(id: string, input: { amount: number; paidOn?: string; record?: boolean }): Promise<ApiDebt> {
  return (await apiFetch(`/v1/debts/${encodeURIComponent(id)}/payments`, { method: 'POST', body: JSON.stringify(input) })).debt;
}

export type ApiRates = { home: string; rates: Record<string, number>; own: Record<string, number> };
export const getRates = (): Promise<ApiRates> => apiFetch('/v1/fx-rates', { method: 'GET' });
export const setRates = (rates: Record<string, number | null>): Promise<ApiRates> => apiFetch('/v1/fx-rates', { method: 'PUT', body: JSON.stringify({ rates }) });

/* ------------------------------------------------------------ rising prices */

export type ApiPrices = {
  livingCost: {
    change: number;
    recentMonthly: number;
    beforeMonthly: number;
    since: string;
    categories: Array<{ category: string; change: number; recentMonthly: number; beforeMonthly: number }>;
  } | null;
  incomeChange: number | null;
  yearlyRate: number | null;
  billsUp: Array<{ recurringId: string; name: string; from: number; to: number }>;
  alerts: Array<{ key: string; title: string; body: string }>;
};
export const getPrices = (spaceId?: SpaceId): Promise<ApiPrices> => apiFetch(withSpace('/v1/prices', spaceId), { method: 'GET' });

/* ------------------------------------------------------------ helpers (delegates) */

export type ApiDelegates = {
  helpers: Array<{ id: string; email: string; role: 'view' | 'record'; accepted: boolean; name: string | null; code: string | null }>;
  helping: Array<{ id: string; ownerId: string; name: string; role: 'view' | 'record' }>;
};
export const getDelegates = (): Promise<ApiDelegates> => apiFetch('/v1/delegates', { method: 'GET' });
export const inviteDelegate = (email: string, role: 'view' | 'record'): Promise<{ code: string; emailed: boolean }> =>
  apiFetch('/v1/delegates', { method: 'POST', body: JSON.stringify({ email, role }) });
export const acceptDelegate = (code: string): Promise<{ ownerId: string; ownerName: string; role: 'view' | 'record' }> =>
  apiFetch('/v1/delegates/accept', { method: 'POST', body: JSON.stringify({ code }) });
export const removeDelegate = (id: string) => apiFetch(`/v1/delegates/${encodeURIComponent(id)}`, { method: 'DELETE' });

/* ------------------------------------------------------------ properties */

export type ApiProperty = {
  id: string;
  name: string;
  tenantName: string | null;
  tenantPhone: string | null;
  rentAmount: number;
  frequency: 'monthly' | 'quarterly' | 'yearly';
  nextDue: string | null;
  status: 'overdue' | 'due_soon' | 'paid_up' | 'no_date';
  daysToDue: number | null;
  note: string | null;
};
export const listProperties = (): Promise<{ items: ApiProperty[]; rentThisYear: number }> => apiFetch('/v1/properties', { method: 'GET' });
export async function saveProperty(id: string | null, input: Partial<Omit<ApiProperty, 'id' | 'status' | 'daysToDue'>>): Promise<ApiProperty> {
  const res = await apiFetch(id ? `/v1/properties/${encodeURIComponent(id)}` : '/v1/properties', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(input) });
  return res.property;
}
export const deleteProperty = (id: string) => apiFetch(`/v1/properties/${encodeURIComponent(id)}`, { method: 'DELETE' });
export async function recordRent(id: string, input: { amount?: number; paidOn?: string } = {}): Promise<ApiProperty> {
  return (await apiFetch(`/v1/properties/${encodeURIComponent(id)}/paid`, { method: 'POST', body: JSON.stringify(input) })).property;
}

/* ------------------------------------------------------------ pots */

/** Takes money back out of a pot: steady pay from an income buffer arrives as income. */
export const takeFromGoal = (goalId: string, amount: number) =>
  apiFetch(`/v1/goals/${encodeURIComponent(goalId)}/contributions`, { method: 'POST', body: JSON.stringify({ amount, direction: 'out' }) });
