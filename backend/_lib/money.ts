import type { Db } from 'mongodb';
import { collections } from './collections.js';

const SYMBOLS: Record<string, string> = { NGN: '₦', USD: '$', EUR: '€', GBP: '£', GHS: 'GH₵', KES: 'KSh', ZAR: 'R', CAD: '$', INR: '₹' };

/** "₦18,450" for notification copy. Currency may be an ISO code or a symbol. */
export function formatMoney(amount: number, currency?: string | null): string {
  const c = String(currency ?? '').trim();
  const symbol = SYMBOLS[c.toUpperCase()] ?? (c || '₦');
  const n = Math.round(Math.abs(amount));
  return `${amount < 0 ? '−' : ''}${symbol}${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export async function currencyFor(db: Db, userId: string): Promise<string | null> {
  const { users } = collections(db);
  const u = await users.findOne({ _id: userId }, { projection: { currency: 1 } });
  return u?.currency ?? null;
}
