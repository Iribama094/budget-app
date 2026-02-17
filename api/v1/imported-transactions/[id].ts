import crypto from 'crypto';
import { z } from 'zod';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendJson, type ApiRequest, type ApiResponse } from '../../_lib/http.js';
import { requireUserId } from '../../_lib/user.js';

const ReconcileSchema = z.object({
  type: z.enum(['income', 'expense']).optional(),
  category: z.string().min(1).max(60).optional(),
  description: z.string().max(120).optional(),
  budgetId: z.union([z.string().min(1).max(120), z.null()]).optional(),
  budgetCategory: z.union([z.string().min(1).max(60), z.null()]).optional(),
  miniBudgetId: z.union([z.string().min(1).max(120), z.null()]).optional()
});

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function effectiveEndDate(start: Date, period: 'weekly' | 'monthly', explicitEnd?: string | null): Date {
  const explicit = explicitEnd ? parseIsoDate(explicitEnd) : null;
  if (explicit) return explicit;
  const d = new Date(start);
  if (period === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 6);
    return d;
  }
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const userId = await requireUserId(req, res);
  if (!userId) return;

  const { id, action } = req.query as { id?: string; action?: string };
  if (!id || !action) return sendError(res, 400, 'VALIDATION_ERROR', 'Missing id/action in route');

  const spaceIdRaw = (req.query as any)?.spaceId;
  const spaceId = spaceIdRaw === 'personal' || spaceIdRaw === 'business' ? spaceIdRaw : undefined;

  const db = await getDb();
  const { importedTransactions, transactions, budgets } = collections(db);

  const tx = await importedTransactions.findOne({ _id: String(id), userId });
  if (!tx) return sendError(res, 404, 'NOT_FOUND', 'Imported transaction not found');

  const txSpaceId = (tx.spaceId ?? 'personal') as 'personal' | 'business';

  // Optional strict demarcation when spaceId is provided.
  if (spaceId && txSpaceId !== spaceId) {
    return sendError(res, 404, 'NOT_FOUND', 'Imported transaction not found');
  }

  if (action === 'ignore') {
    const now = new Date();
    await importedTransactions.updateOne(
      { _id: tx._id, userId },
      { $set: { status: 'ignored', updatedAt: now } }
    );

    const out = await importedTransactions.findOne({ _id: tx._id, userId });
    return sendJson(res, 200, {
      transaction: {
        id: out!._id,
        spaceId: out!.spaceId ?? 'personal',
        bankAccountId: out!.bankAccountId,
        bankName: out!.bankName,
        bankAccountName: out!.bankAccountName,
        amount: out!.amount,
        currency: out!.currency,
        direction: out!.direction,
        description: out!.description,
        merchant: out!.merchant,
        occurredAt: out!.occurredAt.toISOString(),
        status: out!.status,
        reconciledAt: out!.reconciledAt ? out!.reconciledAt.toISOString() : undefined
      }
    });
  }

  if (action === 'reconcile') {
    try {
      const body = await readJson<unknown>(req);
      const input = ReconcileSchema.parse(body ?? {});

      const now = new Date();

      const type = input.type ?? (tx.direction === 'debit' ? 'expense' : 'income');
      const category = input.category ?? (type === 'income' ? 'Other income' : 'Uncategorized');

      const txDateStr = tx.occurredAt.toISOString().slice(0, 10); // YYYY-MM-DD
      const txDate = parseIsoDate(txDateStr);

      let budgetId: string | null = Object.prototype.hasOwnProperty.call(input, 'budgetId') ? ((input as any).budgetId ?? null) : null;
      let budgetCategory: string | null = Object.prototype.hasOwnProperty.call(input, 'budgetCategory') ? ((input as any).budgetCategory ?? null) : null;
      let miniBudgetId: string | null = Object.prototype.hasOwnProperty.call(input, 'miniBudgetId') ? ((input as any).miniBudgetId ?? null) : null;

      // Defensive normalization: ensure ids are stored as strings so downstream filters
      // (which cast query params to String) match reliably.
      if (budgetId != null) budgetId = String(budgetId).trim() || null;
      if (miniBudgetId != null) miniBudgetId = String(miniBudgetId).trim() || null;
      if (budgetCategory != null) budgetCategory = String(budgetCategory).trim() || null;

      // If the client didn't specify a budget, try to attach it to the most recent budget
      // that covers the transaction date.
      if (!budgetId && txDate) {
        const candidates = await budgets
          .find({
            userId,
            startDate: { $lte: txDateStr },
            ...(txSpaceId === 'business'
              ? { spaceId: 'business' }
              : { $or: [{ spaceId: 'personal' }, { spaceId: { $exists: false } }, { spaceId: null }] })
          })
          .sort({ startDate: -1, _id: -1 })
          .limit(20)
          .toArray();

        for (const b of candidates) {
          const start = parseIsoDate(String(b.startDate));
          if (!start) continue;
          const end = effectiveEndDate(start, b.period ?? 'monthly', b.endDate ?? null);
          if (txDate >= start && txDate <= end) {
            budgetId = String(b._id);
            break;
          }
        }
      }

      // If the transaction is not attached to a budget, clear budget-specific fields.
      if (!budgetId) {
        budgetCategory = null;
        miniBudgetId = null;
      }

      const newId = crypto.randomUUID();

      await transactions.insertOne({
        _id: newId,
        userId,
        spaceId: txSpaceId,
        type,
        amount: tx.amount,
        category,
        description: input.description ?? (tx.description || tx.merchant || 'Imported transaction'),
        budgetId,
        budgetCategory,
        miniBudgetId,
        occurredAt: tx.occurredAt,
        createdAt: now,
        updatedAt: now
      });

      // If this reconcile produced an income transaction applied to a budget,
      // reflect it in the budget's totalBudget AND the selected category allocation.
      if (type === 'income' && budgetId) {
        const budgetFilter: any = { _id: String(budgetId), userId };
        if (txSpaceId === 'business') {
          budgetFilter.spaceId = 'business';
        } else {
          budgetFilter.$or = [{ spaceId: 'personal' }, { spaceId: { $exists: false } }, { spaceId: null }];
        }

        const inc: Record<string, number> = { totalBudget: tx.amount };
        if (budgetCategory) {
          inc[`categories.${budgetCategory}.budgeted`] = tx.amount;
        }

        await budgets.updateOne(budgetFilter, { $inc: inc, $set: { updatedAt: now } });
      }

      const reconciledAt = now;
      await importedTransactions.updateOne(
        { _id: tx._id, userId },
        { $set: { status: 'reconciled', reconciledAt, updatedAt: now } }
      );

      const out = await importedTransactions.findOne({ _id: tx._id, userId });

      return sendJson(res, 200, {
        transaction: {
          id: out!._id,
          spaceId: out!.spaceId ?? 'personal',
          bankAccountId: out!.bankAccountId,
          bankName: out!.bankName,
          bankAccountName: out!.bankAccountName,
          amount: out!.amount,
          currency: out!.currency,
          direction: out!.direction,
          description: out!.description,
          merchant: out!.merchant,
          occurredAt: out!.occurredAt.toISOString(),
          status: out!.status,
          reconciledAt: out!.reconciledAt ? out!.reconciledAt.toISOString() : undefined
        }
      });
    } catch (err: any) {
      if (err?.name === 'ZodError') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', err.issues);
      }
      return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error');
    }
  }

  return sendError(res, 400, 'VALIDATION_ERROR', 'Unsupported action');
}
