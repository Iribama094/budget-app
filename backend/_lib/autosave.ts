import crypto from 'crypto';
import type { Db } from 'mongodb';
import { collections } from './collections.js';
import { andAll, spaceClause } from './budgets.js';
import { currencyFor, formatMoney } from './money.js';
import { notifyUser } from './notify.js';

export type AutoSaveResult = { goalId: string; name: string; amount: number };

export const MAX_AUTOSAVE_PERCENT = 50;

/**
 * Moves a share of an income transaction into goals that have an auto-save rule.
 * This records progress toward the goal; it does not move money between bank accounts.
 */
export async function applyAutoSave(
  db: Db,
  userId: string,
  spaceId: string | null | undefined,
  incomeAmount: number,
  transactionId: string
): Promise<AutoSaveResult[]> {
  const { goals, goalContributions } = collections(db);
  const candidates = await goals.find(andAll({ userId, autoSavePercent: { $gt: 0 } }, spaceClause(spaceId ?? 'personal'))).toArray();

  const now = new Date();
  const out: AutoSaveResult[] = [];
  for (const g of candidates) {
    const remaining = Math.max(0, g.targetAmount - g.currentAmount);
    if (remaining <= 0) continue;
    const pct = Math.min(MAX_AUTOSAVE_PERCENT, Math.max(0, Number(g.autoSavePercent) || 0));
    const move = Math.min(remaining, Math.round(incomeAmount * pct) / 100);
    if (move <= 0) continue;

    await goals.updateOne({ _id: g._id, userId }, { $inc: { currentAmount: move }, $set: { updatedAt: now } });
    await goalContributions.insertOne({
      _id: crypto.randomUUID(),
      userId,
      goalId: g._id,
      amount: move,
      source: 'autosave',
      transactionId,
      budgetId: null,
      createdAt: now
    });
    out.push({ goalId: g._id, name: g.name, amount: move });
  }

  if (out.length) {
    const currency = await currencyFor(db, userId);
    const total = out.reduce((s, r) => s + r.amount, 0);
    await notifyUser(db, userId, {
      kind: 'autosave',
      title: out.length === 1 ? `${formatMoney(total, currency)} added to ${out[0].name}` : `${formatMoney(total, currency)} added to your goals`,
      body: `Set aside automatically from your ${formatMoney(incomeAmount, currency)} income.`,
      data: { screen: out.length === 1 ? 'GoalDetail' : 'Goals', goalId: out[0].goalId }
    });
  }
  return out;
}
