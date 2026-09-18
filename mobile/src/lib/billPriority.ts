/**
 * Which bills to protect and which to trim when money is short. The order follows how people actually
 * cope: keep the roof, the food, the children's school and the loan current; trim flexible costs; pause
 * extras first. Tithe and offering are treated as the person's own commitment, never suggested as a cut.
 */
export type BillTier = 'must' | 'reduce' | 'pause';

export const TIER_LABEL: Record<BillTier, string> = { must: 'Must pay', reduce: 'Can reduce', pause: 'Can pause' };

const TIER_ORDER: Record<BillTier, number> = { must: 0, reduce: 1, pause: 2 };

const PAUSE = /subscription|netflix|dstv|gotv|showmax|spotify|apple music|youtube|prime video|entertainment|gym|betting|streaming|premium/i;
const MUST = /rent|housing|electric|power|nepa|water|utilit|school|fees|tuition|loan|debt|repayment|food|grocer|transport|fuel|health|medical|hospital|insurance|tithe|offering/i;

type BillLike = { name: string; category: string; bucket?: string | null; monthlyAmount: number };

export function billTier(b: Pick<BillLike, 'name' | 'category' | 'bucket'>): BillTier {
  const text = `${b.name} ${b.category}`;
  if (PAUSE.test(text)) return 'pause';
  if (MUST.test(text)) return 'must';
  if (b.bucket === 'Wants') return 'pause';
  // Data, family support, contributions and anything unrecognised can usually be trimmed, not dropped.
  return 'reduce';
}

/** Payment order: must-pay first, then what can be trimmed, then what can be paused; biggest first within each. */
export function sortBills<T extends BillLike>(bills: T[]): T[] {
  return [...bills].sort((a, b) => TIER_ORDER[billTier(a)] - TIER_ORDER[billTier(b)] || b.monthlyAmount - a.monthlyAmount);
}

function describe(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

export type GapRoutes = {
  pause: { names: string; total: number };
  reduce: { names: string; total: number };
  /** Pausing everything pausable (and trimming the rest) would close the whole gap. */
  pauseCovers: boolean;
  /** What's still short after pausing, which is the part extra income would need to cover. */
  afterPause: number;
};

/** Where a monthly shortfall could come from, using the person's own bills. */
export function gapRoutes(bills: BillLike[], shortfall: number): GapRoutes {
  const group = (tier: BillTier) => {
    const list = bills.filter((b) => billTier(b) === tier).sort((a, b) => b.monthlyAmount - a.monthlyAmount);
    return { names: describe(list.map((b) => b.name)), total: Math.round(list.reduce((s, b) => s + b.monthlyAmount, 0)) };
  };
  const pause = group('pause');
  const reduce = group('reduce');
  return { pause, reduce, pauseCovers: pause.total >= shortfall, afterPause: Math.max(0, Math.round(shortfall - pause.total)) };
}
