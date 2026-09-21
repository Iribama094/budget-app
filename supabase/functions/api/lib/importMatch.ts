import { sql } from './db.ts';
import { bumpBudget } from './budgets.ts';

/**
 * Money that moved but was never spent or earned. Bank imports see every debit and credit, so moving ₦50,000
 * from GTBank to OPay would otherwise count as ₦50,000 spent and ₦50,000 earned, and a failed transfer that
 * bounces back would count as income. These spot both and cancel them out.
 */

const DAY_MS = 86400000;
const REFUND_WORDS = /\b(revers\w*|rvsl|refund\w*|returned|chargeback|rev)\b/i;
const TRANSFER_WORDS = /\b(trf|trfr|transfer|tfr|nip|fip|to self|own account)\b/i;

export type MatchHint =
  | { kind: 'transfer'; pairId: string | null; reason: 'pair' | 'own_name' }
  | { kind: 'refund'; pairId: string | null; transactionId: string | null };

type Row = { id: string; bankAccountId: string; amount: number | string; direction: 'debit' | 'credit'; description: string; merchant: string; occurredAt: Date | string; status: string; transactionId: string | null; spaceId: string };

const same = (a: number | string, b: number | string) => Math.abs(Number(a) - Number(b)) < 0.01;
const ms = (d: Date | string) => new Date(d).getTime();
const textOf = (r: Pick<Row, 'description' | 'merchant'>) => `${r.description ?? ''} ${r.merchant ?? ''}`;

/** First and last name, each at least three letters, both in the text. "TRF TO ADA OBI" matches Ada Obi. */
export function mentionsOwnName(text: string, name: string | null | undefined): boolean {
  const parts = String(name ?? '').toLowerCase().split(/\s+/).filter((p) => p.length >= 3);
  if (parts.length < 2) return false;
  const t = text.toLowerCase();
  return t.includes(parts[0]) && t.includes(parts[parts.length - 1]);
}

/** Hints for pending rows: which ones are transfers between the person's own accounts, and which are refunds. */
export async function matchImports(userId: string, rows: Row[]): Promise<Map<string, MatchHint>> {
  const out = new Map<string, MatchHint>();
  if (!rows.length) return out;
  const times = rows.map((r) => ms(r.occurredAt));
  const [[profile], nearby, manual] = await Promise.all([
    sql`select name from public.profiles where id = ${userId}`,
    sql<Row[]>`
      select id, bank_account_id, amount, direction, description, merchant, occurred_at, status, transaction_id, space_id
      from public.imported_transactions
      where user_id = ${userId} and status in ('pending', 'reconciled')
        and occurred_at >= ${new Date(Math.min(...times) - 14 * DAY_MS)} and occurred_at <= ${new Date(Math.max(...times) + 2 * DAY_MS)}
    `,
    // Expenses logged by hand, which a refund may belong to when the original debit was never imported.
    sql<{ id: string; amount: number; occurredAt: Date; spaceId: string }[]>`
      select id, amount, occurred_at, space_id from public.transactions
      where user_id = ${userId} and type = 'expense'
        and occurred_at >= ${new Date(Math.min(...times) - 14 * DAY_MS)} and occurred_at <= ${new Date(Math.max(...times))}
    `
  ]);
  const claimed = new Set<string>();

  for (const r of rows) {
    if (out.has(r.id)) continue;
    const text = textOf(r);
    const when = ms(r.occurredAt);

    // A refund or reversal: a credit that says so, matched to the debit it gives back.
    if (r.direction === 'credit' && REFUND_WORDS.test(text)) {
      const debit = nearby
        .filter((x) => x.direction === 'debit' && x.id !== r.id && !claimed.has(x.id) && Number(x.amount) >= Number(r.amount) - 0.01)
        .filter((x) => ms(x.occurredAt) <= when && when - ms(x.occurredAt) <= 14 * DAY_MS)
        .sort((a, b) => Number(!same(a.amount, r.amount)) - Number(!same(b.amount, r.amount)) || ms(b.occurredAt) - ms(a.occurredAt))[0];
      if (debit) {
        claimed.add(debit.id);
        out.set(r.id, { kind: 'refund', pairId: debit.id, transactionId: debit.transactionId });
        continue;
      }
      const logged = manual
        .filter((t) => t.spaceId === r.spaceId && Number(t.amount) >= Number(r.amount) - 0.01 && ms(t.occurredAt) <= when && when - ms(t.occurredAt) <= 14 * DAY_MS)
        .sort((a, b) => Number(!same(a.amount, r.amount)) - Number(!same(b.amount, r.amount)) || ms(b.occurredAt) - ms(a.occurredAt))[0];
      out.set(r.id, { kind: 'refund', pairId: null, transactionId: logged?.id ?? null });
      continue;
    }

    // Both halves of a move between two of the person's accounts: same amount, opposite ways, two days apart at most.
    // Round amounts move between strangers all the time (₦5,000 paid out here, ₦5,000 from a friend there), so a
    // pair also needs the person's own name on one side, or transfer wording on both and an amount that isn't round.
    const looksLikeOwnMove = (x: Row) =>
      mentionsOwnName(textOf(x), profile?.name) ||
      mentionsOwnName(text, profile?.name) ||
      (TRANSFER_WORDS.test(textOf(x)) && TRANSFER_WORDS.test(text) && Math.round(Number(r.amount)) % 1000 !== 0);
    const pair = nearby.find(
      (x) =>
        x.id !== r.id &&
        !claimed.has(x.id) &&
        x.bankAccountId !== r.bankAccountId &&
        x.direction !== r.direction &&
        same(x.amount, r.amount) &&
        Math.abs(ms(x.occurredAt) - when) <= 2 * DAY_MS &&
        looksLikeOwnMove(x)
    );
    if (pair) {
      claimed.add(pair.id);
      claimed.add(r.id);
      out.set(r.id, { kind: 'transfer', pairId: pair.id, reason: 'pair' });
      if (rows.some((x) => x.id === pair.id)) out.set(pair.id, { kind: 'transfer', pairId: r.id, reason: 'pair' });
      continue;
    }

    // Sent to or received from an account in their own name, e.g. a wallet that isn't linked.
    if (TRANSFER_WORDS.test(text) && mentionsOwnName(text, profile?.name)) out.set(r.id, { kind: 'transfer', pairId: null, reason: 'own_name' });
  }
  return out;
}

/** Removes a recorded transaction and undoes the budget growth income gave it. */
export async function removeTransaction(userId: string, transactionId: string) {
  const [t] = await sql`delete from public.transactions where id = ${transactionId} and user_id = ${userId} returning *`;
  if (t && t.type === 'income' && t.budgetId) {
    await bumpBudget(t.budgetId, -Number(t.amount), t.budgetCategory, sql`b.user_id = ${userId} and b.space_id = ${t.spaceId ?? 'personal'}`);
  }
}

/**
 * Money given back on an expense: the expense now shows what it really cost. A full refund removes it.
 * Returns what's left of the expense (0 when removed).
 */
export async function refundTransaction(userId: string, transactionId: string, refund: number): Promise<number> {
  const [t] = await sql`select id, type, amount from public.transactions where id = ${transactionId} and user_id = ${userId}`;
  if (!t || t.type !== 'expense') return 0;
  const left = Math.round((Number(t.amount) - refund) * 100) / 100;
  if (left <= 0) {
    await removeTransaction(userId, transactionId);
    return 0;
  }
  await sql`update public.transactions set amount = ${left}, refunded_amount = refunded_amount + ${refund} where id = ${transactionId} and user_id = ${userId}`;
  return left;
}

/** Marks a row (and its other half) as a transfer. Anything already recorded from either half is removed. */
export async function applyTransfer(userId: string, row: Row, pairId: string | null) {
  const ids = [row.id, ...(pairId ? [pairId] : [])];
  const rows = await sql<Row[]>`select id, transaction_id from public.imported_transactions where user_id = ${userId} and id in ${sql(ids)}`;
  for (const r of rows) if (r.transactionId) await removeTransaction(userId, r.transactionId);
  await sql`update public.imported_transactions set status = 'transfer', paired_id = ${pairId}, transaction_id = null, reconciled_at = now() where id = ${row.id} and user_id = ${userId}`;
  if (pairId) await sql`update public.imported_transactions set status = 'transfer', paired_id = ${row.id}, transaction_id = null, reconciled_at = now() where id = ${pairId} and user_id = ${userId}`;
}

/**
 * Marks a credit as a refund. The debit it gives back is settled too: a pending one of the same amount simply
 * cancels out; a pending one of more is confirmed later at what's left (see refundedFrom); one already recorded,
 * or logged by hand, is reduced now.
 */
export async function applyRefund(userId: string, row: Row, hint: { pairId: string | null; transactionId: string | null }) {
  const refund = Number(row.amount);
  let pair: Row | undefined;
  if (hint.pairId) [pair] = await sql<Row[]>`select * from public.imported_transactions where id = ${hint.pairId} and user_id = ${userId}`;

  let target: string | null = null;
  if (pair && pair.status === 'pending') {
    if (same(pair.amount, refund)) await sql`update public.imported_transactions set status = 'refund', paired_id = ${row.id}, reconciled_at = now() where id = ${pair.id}`;
  } else {
    target = pair?.transactionId ?? hint.transactionId;
    if (target && !(await refundTransaction(userId, target, refund))) target = null;
  }
  // transaction_id here is the expense the refund reduced, so undo can put it back.
  await sql`
    update public.imported_transactions set status = 'refund', paired_id = ${pair?.id ?? null}, transaction_id = ${target}, reconciled_at = now()
    where id = ${row.id} and user_id = ${userId}
  `;
}

/** What refunds already took off a pending debit, so confirming it records only what it really cost. */
export async function refundedFrom(userId: string, debitId: string): Promise<number> {
  const [r] = await sql`
    select coalesce(sum(amount), 0) as total from public.imported_transactions
    where user_id = ${userId} and paired_id = ${debitId} and status = 'refund' and direction = 'credit'
  `;
  return Number(r?.total ?? 0);
}

/** Puts a transfer or refund back to be confirmed, with its other half, and restores an expense a refund reduced. */
export async function undoMatch(userId: string, row: Row & { pairedId?: string | null }) {
  if (row.status === 'refund' && row.direction === 'credit' && row.transactionId) {
    await sql`
      update public.transactions set amount = amount + ${Number(row.amount)}, refunded_amount = greatest(0, refunded_amount - ${Number(row.amount)})
      where id = ${row.transactionId} and user_id = ${userId}
    `;
  }
  const ids = [row.id, ...(row.pairedId ? [row.pairedId] : [])];
  await sql`
    update public.imported_transactions set status = 'pending', paired_id = null, transaction_id = null, reconciled_at = null
    where user_id = ${userId} and id in ${sql(ids)} and status in ('transfer', 'refund')
  `;
}
