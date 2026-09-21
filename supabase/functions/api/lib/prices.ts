import { sql } from './db.ts';
import { todayIso } from './dates.ts';
import { normalizeBucket, patternOf } from './categories.ts';
import type { Space } from './http.ts';

/**
 * Rising prices, measured on the person's own life rather than a national average. Fuel, imports and the
 * exchange rate all push prices up, but what matters to someone is what their own regular needs now cost.
 *
 * Everything here compares the same things over two stretches of 90 days, so a new habit doesn't read as
 * inflation: only categories they paid for in both stretches count.
 */

const DAY_MS = 86400000;
const WINDOW_DAYS = 90;

export type PriceWatch = {
  /** Needs they paid for in both stretches: what they cost over the last 90 days against the 90 before. */
  livingCost: {
    change: number;
    recentMonthly: number;
    beforeMonthly: number;
    since: string;
    categories: Array<{ category: string; change: number; recentMonthly: number; beforeMonthly: number }>;
  } | null;
  /** Income over the same two stretches, so rising costs can be read against it. */
  incomeChange: number | null;
  /** Roughly how fast their needs are getting dearer over a year, for goals far away. Null when not rising. */
  yearlyRate: number | null;
  /** Bills that were paid at a higher price than the amount set on the bill. */
  billsUp: Array<{ recurringId: string; name: string; from: number; to: number }>;
  /** Price news from staff that touches something they buy. */
  alerts: Array<{ key: string; title: string; body: string }>;
};

const monthly = (total: number) => (total / WINDOW_DAYS) * (365 / 12);

export async function computePriceWatch(userId: string, space: Space = 'personal', today = todayIso()): Promise<PriceWatch> {
  const now = new Date(`${today}T23:59:59Z`).getTime();
  const splitAt = new Date(now - WINDOW_DAYS * DAY_MS);
  const since = new Date(now - 2 * WINDOW_DAYS * DAY_MS);
  const [txs, categories, bills, alerts] = await Promise.all([
    sql<{ type: string; amount: number; category: string; budgetCategory: string | null; description: string; recurringId: string | null; occurredAt: Date }[]>`
      select type, amount, category, budget_category, description, recurring_id, occurred_at from public.transactions
      where user_id = ${userId} and space_id = ${space} and occurred_at >= ${since} and occurred_at <= ${new Date(now)}
      limit 10000
    `,
    sql<{ name: string; bucket: string | null }[]>`select name, bucket from public.categories where user_id = ${userId} and space_id = ${space}`,
    sql<{ id: string; description: string; category: string; amount: number }[]>`
      select id, description, category, amount from public.recurring
      where user_id = ${userId} and space_id = ${space} and type = 'expense' and not paused
    `,
    sql<{ key: string; value: any }[]>`select key, value from public.content_blocks where kind = 'price_alert' and enabled`
  ]);

  const bucketByCategory = new Map(categories.map((c) => [c.name.toLowerCase(), normalizeBucket(c.bucket)]));
  const isNeed = (t: (typeof txs)[number]) => (normalizeBucket(t.budgetCategory) ?? bucketByCategory.get(String(t.category).toLowerCase())) === 'Needs';
  const recent = (t: (typeof txs)[number]) => new Date(t.occurredAt).getTime() >= splitAt.getTime();

  // Needs, category by category, in both stretches.
  const byCat = new Map<string, { now: number; before: number; nNow: number; nBefore: number }>();
  let incomeNow = 0;
  let incomeBefore = 0;
  for (const t of txs) {
    const amount = Number(t.amount);
    if (t.type === 'income') {
      if (recent(t)) incomeNow += amount;
      else incomeBefore += amount;
      continue;
    }
    if (t.type !== 'expense' || !isNeed(t)) continue;
    const c = byCat.get(t.category) ?? { now: 0, before: 0, nNow: 0, nBefore: 0 };
    if (recent(t)) {
      c.now += amount;
      c.nNow++;
    } else {
      c.before += amount;
      c.nBefore++;
    }
    byCat.set(t.category, c);
  }
  const basket = [...byCat.entries()].filter(([, c]) => c.nNow >= 2 && c.nBefore >= 2 && c.before > 0);
  const basketNow = basket.reduce((s, [, c]) => s + c.now, 0);
  const basketBefore = basket.reduce((s, [, c]) => s + c.before, 0);
  // Two or more everyday needs, over at least ₦10,000 a month, before we call it a trend.
  const livingCost =
    basket.length >= 2 && monthly(basketBefore) >= 10000
      ? {
          change: basketNow / basketBefore - 1,
          recentMonthly: Math.round(monthly(basketNow)),
          beforeMonthly: Math.round(monthly(basketBefore)),
          since: since.toISOString().slice(0, 10),
          categories: basket
            .map(([category, c]) => ({ category, change: c.now / c.before - 1, recentMonthly: Math.round(monthly(c.now)), beforeMonthly: Math.round(monthly(c.before)) }))
            .sort((a, b) => b.recentMonthly - b.beforeMonthly - (a.recentMonthly - a.beforeMonthly))
        }
      : null;

  // A bill paid (by hand or from the bank) above the amount set on it: the price went up.
  const billsUp: PriceWatch['billsUp'] = [];
  const lately = now - 60 * DAY_MS;
  for (const bill of bills) {
    const pattern = patternOf(bill.description || bill.category);
    if (!pattern) continue;
    const paid = txs
      .filter((t) => t.type === 'expense' && !t.recurringId && new Date(t.occurredAt).getTime() >= lately && patternOf(t.description) === pattern)
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())[0];
    if (paid && Number(paid.amount) > Number(bill.amount) * 1.05 && Number(paid.amount) < Number(bill.amount) * 3) {
      billsUp.push({ recurringId: bill.id, name: bill.description || bill.category, from: Number(bill.amount), to: Number(paid.amount) });
    }
  }

  // Staff price news, only for people who buy what it's about.
  const recentCats = new Set(txs.filter((t) => t.type === 'expense' && new Date(t.occurredAt).getTime() >= lately).map((t) => String(t.category).toLowerCase()));
  const relevant = alerts
    .filter((a) => !a.value?.until || String(a.value.until) >= today)
    .filter((a) => {
      const cats: string[] = Array.isArray(a.value?.categories) ? a.value.categories : [];
      return !cats.length || cats.some((c) => recentCats.has(String(c).toLowerCase()));
    })
    .map((a) => ({ key: a.key, title: String(a.value?.title ?? ''), body: String(a.value?.body ?? '') }))
    .filter((a) => a.title);

  const change = livingCost?.change ?? 0;
  return {
    livingCost,
    incomeChange: incomeBefore > 0 ? incomeNow / incomeBefore - 1 : null,
    // Ninety days of change carried to a year, capped so one odd quarter doesn't scare anyone.
    yearlyRate: change > 0.02 ? Math.min(0.6, Math.pow(1 + change, 365 / WINDOW_DAYS) - 1) : null,
    billsUp,
    alerts: relevant
  };
}
