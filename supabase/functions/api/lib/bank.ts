import { sql } from './db.ts';
import { notifyUser } from './notify.ts';
import { voice } from './voice.ts';

/**
 * Minimal Mono (https://mono.co) v2 client for Nigerian bank account data.
 * Mono reports amounts in kobo (minor units); everything returned here is in naira.
 */

const BASE = (Deno.env.get('MONO_API_BASE') || 'https://api.withmono.com').replace(/\/$/, '');
const DAY_MS = 24 * 60 * 60 * 1000;

export class MonoError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
  /** The customer has to re-link (credentials changed, consent revoked, account gone). */
  get needsReauth() {
    return this.status === 401 || this.status === 403 || this.status === 404;
  }
}

export const monoConfigured = () => !!Deno.env.get('MONO_SECRET_KEY');

async function monoFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'mono-sec-key': Deno.env.get('MONO_SECRET_KEY') ?? '', 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers ?? {}) }
  });
  const out = await res.json().catch(() => null);
  if (!res.ok) throw new MonoError(out?.message || `Mono request failed (${res.status})`, res.status);
  return out;
}

const koboToNaira = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) / 100 : 0);

/** Exchanges the one-time code from Mono Connect for a permanent account id. */
export async function exchangeCode(code: string): Promise<string> {
  const out = await monoFetch('/v2/accounts/auth', { method: 'POST', body: JSON.stringify({ code }) });
  const id = out?.data?.id ?? out?.id;
  if (!id) throw new MonoError('Mono did not return an account id', 502);
  return String(id);
}

export async function getAccount(accountId: string) {
  const out = await monoFetch(`/v2/accounts/${encodeURIComponent(accountId)}`);
  const a = out?.data?.account ?? out?.data ?? out ?? {};
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

function ddmmyyyy(d: Date) {
  return `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
}

async function getTransactions(accountId: string, range: { start: Date; end: Date }, maxPages = 10) {
  const out: { id: string; narration: string; amount: number; direction: 'debit' | 'credit'; date: Date }[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const qs = new URLSearchParams({ paginate: 'true', start: ddmmyyyy(range.start), end: ddmmyyyy(range.end), page: String(page) });
    const res = await monoFetch(`/v2/accounts/${encodeURIComponent(accountId)}/transactions?${qs.toString()}`);
    const rows: any[] = Array.isArray(res?.data) ? res.data : [];
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
    if (!res?.meta?.paging?.next || rows.length === 0) break;
  }
  return out;
}

export async function unlinkAccount(accountId: string): Promise<void> {
  await monoFetch(`/v2/accounts/${encodeURIComponent(accountId)}/unlink`, { method: 'POST' });
}

/** "POS/WEB PURCHASE SHOPRITE LEKKI LAGOS NG" → "Shoprite Lekki Lagos". */
export function merchantFromNarration(narration: string): string {
  const cleaned = narration
    .replace(/\b(POS|WEB|NIP|TRF|TRANSFER|PURCHASE|PAYMENT|FRM|TO|FROM|VIA|REF|NG|NGA|LA|LAGOS NG)\b/gi, ' ')
    .replace(/[\/|*#:_-]+/g, ' ')
    .replace(/\d{6,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter((w) => w.length > 1).slice(0, 3);
  if (!words.length) return narration.slice(0, 40) || 'Bank transaction';
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export type BankLinkRow = {
  id: string;
  userId: string;
  spaceId: string;
  provider: string;
  bankName: string;
  externalAccountId: string | null;
  status: string;
  lastSyncedAt: Date | null;
  createdAt: Date;
};

/** Pulls new transactions for a live (Mono) connection into the pending review queue. Re-running is safe. */
export async function syncBankLink(link: BankLinkRow): Promise<{ imported: number }> {
  if (link.provider !== 'mono' || !link.externalAccountId) return { imported: 0 };

  let account;
  try {
    account = await getAccount(link.externalAccountId);
  } catch (err) {
    if (err instanceof MonoError && err.needsReauth && link.status !== 'reauth_required') {
      await sql`update public.bank_links set status = 'reauth_required' where id = ${link.id}`;
      await notifyUser(link.userId, {
        kind: 'bank',
        ...voice.bankReauth(link.bankName),
        data: { screen: 'BankConnections' }
      });
    }
    throw err;
  }

  let [acct] = await sql`select id, name from public.bank_accounts where user_id = ${link.userId} and bank_link_id = ${link.id} limit 1`;
  if (acct) {
    await sql`update public.bank_accounts set balance = ${account.balance}, name = ${account.name} where id = ${acct.id}`;
    acct = { ...acct, name: account.name };
  } else {
    [acct] = await sql`
      insert into public.bank_accounts (user_id, space_id, bank_link_id, name, mask, type, currency, balance)
      values (${link.userId}, ${link.spaceId ?? 'personal'}, ${link.id}, ${account.name}, ${account.accountNumber.slice(-4) || '••••'},
              ${account.type}, ${account.currency}, ${account.balance})
      returning id, name
    `;
  }

  // Overlap the last sync by 3 days to catch late-posting transactions; first sync looks back 90 days.
  const now = new Date();
  const start = link.lastSyncedAt ? new Date(new Date(link.lastSyncedAt).getTime() - 3 * DAY_MS) : new Date(now.getTime() - 90 * DAY_MS);
  const rows = await getTransactions(link.externalAccountId, { start, end: now });

  let imported = 0;
  for (const t of rows) {
    const inserted = await sql`
      insert into public.imported_transactions
        (user_id, space_id, bank_account_id, bank_name, bank_account_name, amount, currency, direction, description, merchant, occurred_at, external_id)
      values (${link.userId}, ${link.spaceId ?? 'personal'}, ${acct.id}, ${link.bankName}, ${acct.name}, ${t.amount}, ${account.currency},
              ${t.direction}, ${t.narration}, ${merchantFromNarration(t.narration)}, ${t.date}, ${`mono:${t.id}`})
      on conflict (user_id, external_id) do nothing
      returning id
    `;
    imported += inserted.length;
  }

  await sql`update public.bank_links set last_synced_at = now(), status = 'active' where id = ${link.id}`;

  if (imported > 0) {
    await notifyUser(link.userId, {
      kind: 'bank',
      ...voice.bankImported(imported, link.bankName),
      data: { screen: 'PendingTransactions' }
    });
  }
  return { imported };
}
