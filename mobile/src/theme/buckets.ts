/** Every budget splits into three plain buckets. */
export const BUCKETS = ['Needs', 'Wants', 'Savings'] as const;
export type Bucket = (typeof BUCKETS)[number];

export const BUCKET_INFO: Record<Bucket, { business: string; desc: string; businessDesc: string }> = {
  Needs: { business: 'Must-pay costs', desc: 'Rent, food, transport, bills, tithe', businessDesc: 'Payroll, rent, stock, taxes' },
  Wants: { business: 'Flexible costs', desc: 'Eating out, shopping, fun', businessDesc: 'Marketing, tools, travel' },
  Savings: { business: 'Reserves', desc: 'Emergency fund, goals, investments', businessDesc: 'Cash buffer and growth' }
};

/** Maps any bucket label, including older ones (Essential, Free Spending, …), onto Needs / Wants / Savings. */
export function normalizeBucket(value?: string | null): Bucket | null {
  const k = String(value ?? '').trim().toLowerCase();
  if (!k) return null;
  if (k.startsWith('need') || k.startsWith('essential') || k.includes('operating') || k.startsWith('debt') || k.includes('loan') || k.includes('must')) return 'Needs';
  if (k.startsWith('want') || k.startsWith('free') || k.includes('discretionary') || k.startsWith('misc') || k.includes('flexible')) return 'Wants';
  if (k.startsWith('saving') || k.includes('reserve') || k.startsWith('invest') || k.includes('growth')) return 'Savings';
  return null;
}

/** "Needs", or "Must-pay costs" in the Business space. Unknown labels are shown as they are. */
export function bucketDisplayName(key: string, isBusiness = false): string {
  const b = normalizeBucket(key);
  if (!b) return key;
  return isBusiness ? BUCKET_INFO[b].business : b;
}

export function bucketDescription(key: string, isBusiness = false): string {
  const b = normalizeBucket(key);
  if (!b) return '';
  return isBusiness ? BUCKET_INFO[b].businessDesc : BUCKET_INFO[b].desc;
}
