import type { Db } from 'mongodb';
import { collections } from './collections.js';
import { budgetBounds, budgetMemberIds, effectiveEndIso, parseIsoDateUtcNoon, todayIso } from './budgets.js';
import { currencyFor, formatMoney } from './money.js';
import { notifyUser } from './notify.js';

const DAY = 24 * 60 * 60;

/**
 * After an expense lands in a budget, warn every member when a bucket is spending
 * well ahead of the calendar ("running hot") or has gone over, and when the whole budget is over.
 * Each alert is de-duplicated so people aren't nagged on every purchase.
 */
export async function checkBudgetPace(db: Db, budgetId: string, bucket?: string | null): Promise<void> {
  const { budgets, transactions } = collections(db);
  const b = await budgets.findOne({ _id: budgetId });
  if (!b) return;

  const today = todayIso();
  const endIso = effectiveEndIso(b);
  if (today < b.startDate || today > endIso) return; // only the running budget matters

  const memberIds = budgetMemberIds(b);
  const { start, end } = budgetBounds(b);
  const rows = await transactions
    .aggregate<{ _id: string | null; total: number }>([
      { $match: { userId: { $in: memberIds }, budgetId, type: 'expense', occurredAt: { $gte: start, $lte: end } } },
      { $group: { _id: '$budgetCategory', total: { $sum: '$amount' } } }
    ])
    .toArray();

  const byBucket = new Map(rows.map((r) => [r._id ?? '', r.total]));
  const totalSpent = rows.reduce((s, r) => s + r.total, 0);

  const msDay = DAY * 1000;
  const totalDays = Math.round((parseIsoDateUtcNoon(endIso).getTime() - parseIsoDateUtcNoon(b.startDate).getTime()) / msDay) + 1;
  const elapsed = Math.round((parseIsoDateUtcNoon(today).getTime() - parseIsoDateUtcNoon(b.startDate).getTime()) / msDay) + 1;
  const daysLeft = Math.max(1, totalDays - elapsed + 1);
  const timeRatio = Math.min(1, elapsed / totalDays);
  const label = b.name.replace(/^My Budget \((.*)\)$/, '$1');
  const data = { budgetId, screen: 'BudgetDetail' };

  for (const userId of memberIds) {
    const currency = await currencyFor(db, userId);
    const money = (n: number) => formatMoney(n, currency);

    if (b.totalBudget > 0 && totalSpent > b.totalBudget) {
      await notifyUser(db, userId, {
        kind: 'over',
        title: `${label} is over budget`,
        body: `${money(totalSpent)} spent of ${money(b.totalBudget)}. Adjusting a bucket now keeps next month on track.`,
        data,
        dedupeKey: `over:${budgetId}`,
        dedupeTtlSec: 40 * DAY
      });
      continue;
    }

    const budgeted = bucket ? Number(b.categories?.[bucket]?.budgeted ?? 0) : 0;
    if (!bucket || budgeted <= 0) continue;
    const spent = byBucket.get(bucket) ?? 0;
    const ratio = spent / budgeted;

    if (ratio > 1) {
      await notifyUser(db, userId, {
        kind: 'over',
        title: `${bucket} is over budget`,
        body: `${money(spent)} spent of ${money(budgeted)} in ${label}.`,
        data,
        dedupeKey: `bucket-over:${budgetId}:${bucket}`,
        dedupeTtlSec: 40 * DAY
      });
    } else if (ratio >= 0.5 && ratio > timeRatio + 0.15) {
      const perDay = Math.max(0, budgeted - spent) / daysLeft;
      await notifyUser(db, userId, {
        kind: 'pace',
        title: `${bucket} is running hot`,
        body: `${Math.round(ratio * 100)}% used with ${Math.round(timeRatio * 100)}% of ${label} gone. Around ${money(perDay)} a day keeps it on track.`,
        data,
        dedupeKey: `hot:${budgetId}:${bucket}`,
        dedupeTtlSec: 7 * DAY
      });
    }
  }
}
