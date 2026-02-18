import { z } from 'zod';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendJson, sendNoContent, type ApiRequest, type ApiResponse } from '../../_lib/http.js';
import { parseWith } from '../../_lib/validate.js';
import { requireUserId } from '../../_lib/user.js';

const PatchSchema = z
  .object({
    type: z.enum(['income', 'expense']).optional(),
    amount: z.number().finite().positive().optional(),
    category: z.string().min(1).max(60).optional(),
    description: z.string().max(120).optional(),
    occurredAt: z.string().datetime().optional(),
    budgetId: z.union([z.string().min(1).max(120), z.null()]).optional(),
    budgetCategory: z.union([z.string().min(1).max(60), z.null()]).optional(),
    miniBudgetId: z.union([z.string().min(1).max(120), z.null()]).optional(),
    miniBudget: z.union([z.string().min(1).max(120), z.null()]).optional()
  })
  .strict();

function budgetFilterFor(spaceId: 'personal' | 'business', userId: string, budgetId: string) {
  const filter: any = { _id: String(budgetId), userId };
  if (spaceId === 'business') {
    filter.spaceId = 'business';
  } else {
    filter.$or = [{ spaceId: 'personal' }, { spaceId: { $exists: false } }, { spaceId: null }];
  }
  return filter;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PATCH' && req.method !== 'DELETE') {
    return methodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
  }

  const userId = await requireUserId(req, res);
  if (!userId) return;

  const id = String(req.query?.id ?? '');
  if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Missing id');

  const spaceIdRaw = req.query?.spaceId;
  const spaceId = spaceIdRaw === 'personal' || spaceIdRaw === 'business' ? spaceIdRaw : undefined;

  const db = await getDb();
  const { transactions, budgets } = collections(db);

  const filter: any = { _id: id, userId };
  // Optional strict demarcation when spaceId is provided.
  if (spaceId === 'business') {
    filter.spaceId = 'business';
  } else if (spaceId === 'personal') {
    filter.$or = [{ spaceId: 'personal' }, { spaceId: { $exists: false } }, { spaceId: null }];
  }

  if (req.method === 'GET') {
    const t = await transactions.findOne(filter);
    if (!t) return sendError(res, 404, 'NOT_FOUND', 'Transaction not found');
    return sendJson(res, 200, {
      transaction: {
        id: t._id,
        spaceId: t.spaceId ?? 'personal',
        type: t.type,
        amount: t.amount,
        category: t.category,
        description: t.description,
        budgetId: t.budgetId ?? null,
        budgetCategory: t.budgetCategory ?? null,
        miniBudgetId: t.miniBudgetId ?? null,
        occurredAt: t.occurredAt.toISOString(),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString()
      }
    });
  }

  if (req.method === 'DELETE') {
    const existing = await transactions.findOne(filter);
    if (!existing) return sendError(res, 404, 'NOT_FOUND', 'Transaction not found');

    const result = await transactions.deleteOne(filter);
    if (!result.deletedCount) return sendError(res, 404, 'NOT_FOUND', 'Transaction not found');

    // If income was applied to a budget by incrementing totalBudget on create, reverse it on delete.
    // Also reverse the category allocation bump when budgetCategory was provided.
    if (existing.type === 'income' && existing.budgetId) {
      const txSpace = (existing.spaceId ?? 'personal') as 'personal' | 'business';
      const budgetFilter: any = { _id: String(existing.budgetId), userId };
      if (txSpace === 'business') {
        budgetFilter.spaceId = 'business';
      } else {
        budgetFilter.$or = [{ spaceId: 'personal' }, { spaceId: { $exists: false } }, { spaceId: null }];
      }

      // Clamp totalBudget; apply category decrement best-effort.
      await budgets.updateOne(budgetFilter, [{ $set: { totalBudget: { $max: [0, { $subtract: ['$totalBudget', existing.amount] }] } } }]);
      if (existing.budgetCategory) {
        await budgets.updateOne(
          budgetFilter,
          { $inc: { [`categories.${existing.budgetCategory}.budgeted`]: -existing.amount }, $set: { updatedAt: new Date() } }
        );
      }
    }
    return sendNoContent(res);
  }

  try {
    const existing = await transactions.findOne(filter);
    if (!existing) return sendError(res, 404, 'NOT_FOUND', 'Transaction not found');

    const body = await readJson<unknown>(req);
    const patch = parseWith(PatchSchema, body);
    const now = new Date();

    const update: any = { ...patch, updatedAt: now };
    if (patch.occurredAt) update.occurredAt = new Date(patch.occurredAt);

    const hasBudgetId = Object.prototype.hasOwnProperty.call(patch, 'budgetId');
    const hasMiniBudgetId = Object.prototype.hasOwnProperty.call(patch, 'miniBudgetId');
    const hasMiniBudget = Object.prototype.hasOwnProperty.call(patch, 'miniBudget');

    const nextBudgetId = hasBudgetId ? (patch as any).budgetId ?? null : (existing.budgetId ?? null);
    const nextMiniBudgetId = hasMiniBudgetId
      ? (patch as any).miniBudgetId ?? null
      : hasMiniBudget
        ? (patch as any).miniBudget ?? null
        : (existing.miniBudgetId ?? null);

    if (hasBudgetId) update.budgetId = nextBudgetId;
    if (Object.prototype.hasOwnProperty.call(patch, 'budgetCategory')) {
      update.budgetCategory = (patch as any).budgetCategory ?? null;
    }
    if (hasMiniBudgetId || hasMiniBudget) update.miniBudgetId = nextMiniBudgetId;

    const nextType = (patch.type ?? existing.type) as 'income' | 'expense';
    const nextAmount = (patch.amount ?? existing.amount) as number;

    const prevType = existing.type as 'income' | 'expense';
    const prevAmount = existing.amount as number;
    const prevBudgetId = (existing.budgetId ?? null) as string | null;
    const prevBudgetCategory = (existing.budgetCategory ?? null) as string | null;
    const txSpace = (existing.spaceId ?? 'personal') as 'personal' | 'business';

    // If this transaction is tied to a budget, keep the budget's totalBudget in sync
    // with any income amount/type changes.
    const wasIncome = prevType === 'income';
    const willBeIncome = nextType === 'income';

    const nextBudgetCategory = Object.prototype.hasOwnProperty.call(patch, 'budgetCategory')
      ? ((patch as any).budgetCategory ?? null)
      : (existing.budgetCategory ?? null);

    if (wasIncome && prevBudgetId) {
      const prevBudgetFilter = budgetFilterFor(txSpace, userId, prevBudgetId);

      if (willBeIncome && nextBudgetId === prevBudgetId) {
        const delta = nextAmount - prevAmount;
        if (delta !== 0) {
          await budgets.updateOne(
            prevBudgetFilter,
            delta > 0
              ? { $inc: { totalBudget: delta }, $set: { updatedAt: now } }
              : [{ $set: { totalBudget: { $max: [0, { $add: ['$totalBudget', delta] }] }, updatedAt: now } }]
          );

          if (prevBudgetCategory) {
            await budgets.updateOne(prevBudgetFilter, { $inc: { [`categories.${prevBudgetCategory}.budgeted`]: delta }, $set: { updatedAt: now } });
          }
        }

        // If the income stayed on the same budget but the budget category changed,
        // move the allocated amount between category buckets.
        if (prevBudgetCategory !== nextBudgetCategory && prevAmount > 0) {
          if (prevBudgetCategory) {
            await budgets.updateOne(prevBudgetFilter, { $inc: { [`categories.${prevBudgetCategory}.budgeted`]: -prevAmount }, $set: { updatedAt: now } });
          }
          if (nextBudgetCategory) {
            await budgets.updateOne(prevBudgetFilter, { $inc: { [`categories.${nextBudgetCategory}.budgeted`]: prevAmount }, $set: { updatedAt: now } });
          }
        }
      } else {
        await budgets.updateOne(
          prevBudgetFilter,
          [{ $set: { totalBudget: { $max: [0, { $subtract: ['$totalBudget', prevAmount] }] }, updatedAt: now } }]
        );

        if (prevBudgetCategory) {
          await budgets.updateOne(prevBudgetFilter, { $inc: { [`categories.${prevBudgetCategory}.budgeted`]: -prevAmount }, $set: { updatedAt: now } });
        }
      }
    }

    if (willBeIncome && nextBudgetId) {
      if (!(wasIncome && prevBudgetId === nextBudgetId)) {
        const nextBudgetFilter = budgetFilterFor(txSpace, userId, nextBudgetId);
        const inc: any = { totalBudget: nextAmount };
        if (nextBudgetCategory) inc[`categories.${nextBudgetCategory}.budgeted`] = nextAmount;
        await budgets.updateOne(nextBudgetFilter, { $inc: inc, $set: { updatedAt: now } });
      }
    }

    const result = await transactions.updateOne(filter, { $set: update });
    if (!result.matchedCount) return sendError(res, 404, 'NOT_FOUND', 'Transaction not found');

    const t = await transactions.findOne(filter);
    if (!t) return sendError(res, 404, 'NOT_FOUND', 'Transaction not found');
    return sendJson(res, 200, {
      transaction: {
        id: t._id,
        spaceId: t.spaceId ?? 'personal',
        type: t.type,
        amount: t.amount,
        category: t.category,
        description: t.description,
        budgetId: t.budgetId ?? null,
        budgetCategory: t.budgetCategory ?? null,
        miniBudgetId: t.miniBudgetId ?? null,
        occurredAt: t.occurredAt.toISOString(),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString()
      }
    });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', err.issues);
    }
    return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error');
  }
}
