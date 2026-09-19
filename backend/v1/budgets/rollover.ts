import crypto from 'crypto';
import { z } from 'zod';
import type { Db } from 'mongodb';
import { getDb } from '../../_lib/mongo.js';
import { collections, type BudgetDoc } from '../../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendJson } from '../../_lib/http.js';
import { requireUserId } from '../../_lib/user.js';
import { andAll, budgetBounds, budgetMemberIds, effectiveEndIso, spaceClause, todayIso } from '../../_lib/budgets.js';
import { currencyFor, formatMoney } from '../../_lib/money.js';
import { notifyUser } from '../../_lib/notify.js';

const ApplySchema = z.discriminatedUnion('destination', [
  z.object({ destination: z.literal('goal'), goalId: z.string().min(1).max(120) }),
  z.object({ destination: z.literal('next-budget') })
]);

async function unspentByBucket(db: Db, b: BudgetDoc) {
  const { transactions } = collections(db);
  const { start, end } = budgetBounds(b);
  const rows = await transactions
    .aggregate<{ _id: string | null; total: number }>([
      { $match: { userId: { $in: budgetMemberIds(b) }, budgetId: b._id, type: 'expense', occurredAt: { $gte: start, $lte: end } } },
      { $group: { _id: '$budgetCategory', total: { $sum: '$amount' } } }
    ])
    .toArray();
  const spentBy = new Map(rows.map((r) => [r._id ?? '', r.total]));
  const totalSpent = rows.reduce((s, r) => s + r.total, 0);

  const categories = Object.entries(b.categories ?? {});
  const buckets = categories.map(([bucket, c]) => {
    const budgeted = Number(c?.budgeted) || 0;
    const spent = spentBy.get(bucket) ?? 0;
    return { bucket, budgeted, spent, unspent: Math.max(0, budgeted - spent) };
  });
  // Unassigned spending (no bucket) still eats into what's left overall.
  const bucketUnspent = buckets.reduce((s, x) => s + x.unspent, 0);
  const overall = Math.max(0, b.totalBudget - totalSpent);
  const unspent = Math.round(categories.length ? Math.min(bucketUnspent, overall) : overall);
  return { buckets, totalSpent, unspent };
}

/**
 * GET  /v1/budgets/:id/rollover   what's left in an ended budget and where it can go
 * POST /v1/budgets/:id/rollover   move it into a goal or next budget's Savings bucket (once)
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);
  const userId = await requireUserId(req, res);
  if (!userId) return;

  const id = String(req.query?.id ?? '');
  const db = await getDb();
  const { budgets, goals, goalContributions } = collections(db);

  const b = await budgets.findOne({ _id: id, userId });
  if (!b) return sendError(res, 404, 'NOT_FOUND', 'Budget not found');

  const endIso = effectiveEndIso(b);
  const ended = todayIso() > endIso;
  const { buckets, totalSpent, unspent } = await unspentByBucket(db, b);
  const space = spaceClause(b.spaceId ?? 'personal');

  const nextBudget = await budgets.find(andAll({ userId, startDate: { $gt: endIso } }, space)).sort({ startDate: 1 }).limit(1).next();

  if (req.method === 'GET') {
    const goalList = await goals.find(andAll({ userId }, space)).sort({ targetDate: 1 }).toArray();
    return sendJson(res, 200, {
      eligible: ended && !b.rollover && unspent > 0,
      ended,
      rollover: b.rollover ? { ...b.rollover, at: b.rollover.at.toISOString() } : null,
      totalSpent,
      unspent,
      buckets,
      goals: goalList
        .filter((g) => g.currentAmount < g.targetAmount)
        .map((g) => ({ id: g._id, name: g.name, emoji: g.emoji ?? null, remaining: Math.max(0, g.targetAmount - g.currentAmount) })),
      nextBudget: nextBudget ? { id: nextBudget._id, name: nextBudget.name, startDate: nextBudget.startDate } : null
    });
  }

  try {
    const input = ApplySchema.parse(await readJson<unknown>(req));
    if (!ended) return sendError(res, 400, 'NOT_ENDED', 'You can move leftover money once this budget has ended.');
    if (unspent <= 0) return sendError(res, 400, 'NOTHING_LEFT', 'Nothing was left unspent in this budget.');
    if (input.destination === 'next-budget' && !nextBudget) {
      return sendError(res, 400, 'NO_NEXT_BUDGET', 'Create next month’s budget first, then move the money into it.');
    }

    let goalName = '';
    if (input.destination === 'goal') {
      const goal = await goals.findOne({ _id: input.goalId, userId });
      if (!goal) return sendError(res, 404, 'NOT_FOUND', 'Goal not found');
      goalName = goal.name;
    }

    const now = new Date();
    // Claim first so a double tap can't roll the same money over twice.
    const claim = await budgets.updateOne(
      { _id: b._id, userId, $or: [{ rollover: null }, { rollover: { $exists: false } }] },
      {
        $set: {
          rollover: {
            destination: input.destination,
            amount: unspent,
            goalId: input.destination === 'goal' ? input.goalId : null,
            budgetId: input.destination === 'next-budget' ? nextBudget!._id : null,
            at: now
          },
          updatedAt: now
        }
      }
    );
    if (!claim.modifiedCount) return sendError(res, 409, 'ALREADY_ROLLED_OVER', 'Leftover money from this budget has already been moved.');

    if (input.destination === 'goal') {
      await goals.updateOne({ _id: input.goalId, userId }, { $inc: { currentAmount: unspent }, $set: { updatedAt: now } });
      await goalContributions.insertOne({
        _id: crypto.randomUUID(),
        userId,
        goalId: input.goalId,
        amount: unspent,
        source: 'rollover',
        transactionId: null,
        budgetId: b._id,
        createdAt: now
      });
    } else {
      await budgets.updateOne({ _id: nextBudget!._id, userId }, { $inc: { totalBudget: unspent, 'categories.Savings.budgeted': unspent }, $set: { updatedAt: now } });
    }

    const currency = await currencyFor(db, userId);
    const label = b.name.replace(/^My Budget \((.*)\)$/, '$1');
    await notifyUser(db, userId, {
      kind: 'rollover',
      title: `${formatMoney(unspent, currency)} moved from ${label}`,
      body: input.destination === 'goal' ? `Added to ${goalName}.` : `Added to Savings in ${nextBudget!.name.replace(/^My Budget \((.*)\)$/, '$1')}.`,
      data: input.destination === 'goal' ? { screen: 'GoalDetail', goalId: input.goalId } : { screen: 'BudgetDetail', budgetId: nextBudget!._id }
    }).catch(() => undefined);

    return sendJson(res, 200, { moved: unspent, destination: input.destination });
  } catch (err: any) {
    if (err?.name === 'ZodError') return sendError(res, 400, 'VALIDATION_ERROR', 'Choose a goal or next budget', err.issues);
    console.error('[budgets/rollover] failed', err);
    return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error');
  }
}
