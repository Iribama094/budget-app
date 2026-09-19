import { requireEnv } from './env.js';

/**
 * Minimal Mono (https://mono.co) v2 client for Nigerian bank account data.
 * Mono reports amounts in kobo (minor units); everything returned here is in naira.
 */

const BASE = (process.env.MONO_API_BASE || 'https://api.withmono.com').replace(/\/$/, '');

export class MonoError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
  /** The customer has to re-link (credentials changed, consent revoked, account gone). */
  get needsReauth() {
    return this.status === 401 || this.status === 403 || this.status === 404;
  }
}

export function monoConfigured(): boolean {
  return !!process.env.MONO_SECRET_KEY;
}

async function monoFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'mono-sec-key': requireEnv('MONO_SECRET_KEY'),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers ?? {})
    }
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new MonoError(json?.message || `Mono request failed (${res.status})`, res.status);
  return json;
}

const koboToNaira = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) / 100 : 0);

/** Exchanges the one-time code from Mono Connect for a permanent account id. */
export async function exchangeCode(code: string): Promise<string> {
  const json = await monoFetch('/v2/accounts/auth', { method: 'POST', body: JSON.stringify({ code }) });
  const id = json?.data?.id ?? json?.id;
  if (!id) throw new MonoError('Mono did not return an account id', 502);
  return String(id);
}

export type MonoAccount = {
  id: string;
  name: string;
  accountNumber: string;
  currency: string;
  balance: number;
  type: string;
  institutionName: string;
};

export async function getAccount(accountId: string): Promise<MonoAccount> {
  const json = await monoFetch(`/v2/accounts/${encodeURIComponent(accountId)}`);
  const a = json?.data?.account ?? json?.data ?? json ?? {};
  return {
    id: accountId,
    name: String(a.name ?? 'Bank account'),
    accountNumber: String(a.account_number ?? a.accountNumber ?? ''),
    currency: String(a.currency ?? 'NGN'),
    balance: koboToNaira(a.balance),
    type: String(a.type ?? 'account'),
    institutionName: String(a.institution?.name ?? a.bank_name ?? 'Bank')
  };
}

export type MonoTransaction = {
  id: string;
  narration: string;
  amount: number;
  direction: 'debit' | 'credit';
  date: Date;
};

function ddmmyyyy(d: Date) {
  return `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
}

export async function getTransactions(accountId: string, range: { start: Date; end: Date }, maxPages = 10): Promise<MonoTransaction[]> {
  const out: MonoTransaction[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const qs = new URLSearchParams({ paginate: 'true', start: ddmmyyyy(range.start), end: ddmmyyyy(range.end), page: String(page) });
    const json = await monoFetch(`/v2/accounts/${encodeURIComponent(accountId)}/transactions?${qs.toString()}`);
    const rows: any[] = Array.isArray(json?.data) ? json.data : [];
    for (const t of rows) {
      const date = new Date(t.date ?? t.created_at ?? Date.now());
      if (!t.id || Number.isNaN(date.getTime())) continue;
      out.push({
        id: String(t.id),
        narration: String(t.narration ?? t.description ?? ''),
        amount: Math.abs(koboToNaira(t.amount)),
        direction: String(t.type).toLowerCase() === 'credit' ? 'credit' : 'debit',
        date
      });
    }
    if (!json?.meta?.paging?.next || rows.length === 0) break;
  }
  return out;
}

export async function unlinkAccount(accountId: string): Promise<void> {
  await monoFetch(`/v2/accounts/${encodeURIComponent(accountId)}/unlink`, { method: 'POST' });
}
