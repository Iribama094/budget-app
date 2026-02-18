import crypto from 'crypto';
import { z } from 'zod';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendJson, type ApiRequest, type ApiResponse } from '../../_lib/http.js';
import { parseWith } from '../../_lib/validate.js';
import { requireUserId } from '../../_lib/user.js';

const CreateSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.number().finite().positive(),
  category: z.string().min(1).max(60),
  // Mobile UI treats description as optional.
  description: z.string().max(120).optional().default(''),
  occurredAt: z.string().datetime(),
  budgetId: z.string().min(1).max(120).optional(),
  budgetCategory: z.string().min(1).max(60).optional(),
  miniBudgetId: z.string().min(1).max(120).optional(),
  miniBudget: z.string().min(1).max(120).optional(),
  spaceId: z.enum(['personal', 'business']).optional()
});

function encodeCursor(doc: { occurredAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ t: doc.occurredAt.toISOString(), id: doc.id })).toString('base64url');
}

function decodeCursor(raw: string): { t: Date; id: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!decoded?.t || !decoded?.id) return null;
    return { t: new Date(decoded.t), id: String(decoded.id) };
  } catch {
    return null;
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);

  const userId = await requireUserId(req, res);
  if (!userId) return;

  const db = await getDb();
  const { transactions, budgets } = collections(db);

  if (req.method === 'POST') {
    try {
      const body = await readJson<unknown>(req);
      const input = parseWith(CreateSchema, body);

      const now = new Date();
      const id = crypto.randomUUID();
      const occurredAt = new Date(input.occurredAt);

      const miniBudgetId = input.miniBudgetId ?? input.miniBudget ?? null;
      const spaceId = input.spaceId ?? 'personal';

      await transactions.insertOne({
        _id: id,
        userId,
        spaceId,
        type: input.type,
        amount: input.amount,
        category: input.category,
        description: input.description,
        budgetId: input.budgetId ?? null,
        budgetCategory: input.budgetCategory ?? null,
        miniBudgetId,
        occurredAt,
        createdAt: now,
        updatedAt: now
      });

      // If the user chooses to apply income to a budget, treat it as increasing
      // the budget total AND the selected budget category allocation so totals
      // and percentages stay consistent across the app.
      if (input.type === 'income' && input.budgetId) {
        const budgetFilter: any = { _id: String(input.budgetId), userId };
        if (spaceId === 'business') {
          budgetFilter.spaceId = 'business';
        } else if (spaceId === 'personal') {
          budgetFilter.$or = [{ spaceId: 'personal' }, { spaceId: { $exists: false } }, { spaceId: null }];
        }

        const inc: Record<string, number> = { totalBudget: input.amount };
        if (input.budgetCategory) {
          inc[`categories.${input.budgetCategory}.budgeted`] = input.amount;
        }

        await budgets.updateOne(budgetFilter, { $inc: inc, $set: { updatedAt: now } });
      }

      return sendJson(res, 201, {
        transaction: {
          id,
          spaceId,
          type: input.type,
          amount: input.amount,
          category: input.category,
          description: input.description,
          budgetId: input.budgetId ?? null,
          budgetCategory: input.budgetCategory ?? null,
          miniBudgetId,
          occurredAt: occurredAt.toISOString(),
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        }
      });
    } catch (err: any) {
      if (err?.name === 'ZodError') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', err.issues);
      }
      return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error');
    }
  }

  const { start, end, limit, cursor, type, category, spaceId, budgetId } = req.query ?? {};
  const parsedLimit = Math.max(1, Math.min(200, Number(limit ?? 50) || 50));

  const filter: any = { userId };
  const and: any[] = [];
  if (type) filter.type = type;
  if (category) filter.category = category;
  if (budgetId) filter.budgetId = String(budgetId);

  // Space-aware filtering (treat legacy docs without spaceId as personal).
  if (spaceId === 'business') {
    filter.spaceId = 'business';
  } else if (spaceId === 'personal') {
    and.push({ $or: [{ spaceId: 'personal' }, { spaceId: { $exists: false } }, { spaceId: null }] });
  }

  const parseQueryDate = (raw: string, mode: 'start' | 'end'): Date => {
    // If the client passes date-only, interpret it as a UTC day boundary.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-').map((x) => Number(x));
      return mode === 'start'
        ? new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0))
        : new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    }
    return new Date(raw);
  };

  if (start || end) {
    filter.occurredAt = {};
    if (start) filter.occurredAt.$gte = parseQueryDate(String(start), 'start');
    if (end) filter.occurredAt.$lte = parseQueryDate(String(end), 'end');
  }

  const decoded = cursor ? decodeCursor(String(cursor)) : null;
  if (decoded) {
    and.push({
      $or: [
        { occurredAt: { ...(filter.occurredAt ?? {}), $lt: decoded.t } },
        { occurredAt: decoded.t, _id: { $lt: decoded.id } }
      ]
    });
  }

  if (and.length > 0) filter.$and = and;

  const items = await transactions
    .find(filter)
    .sort({ occurredAt: -1, _id: -1 })
    .limit(parsedLimit + 1)
    .toArray();

  const hasMore = items.length > parsedLimit;
  const page = hasMore ? items.slice(0, parsedLimit) : items;

  const nextCursor = hasMore
    ? encodeCursor({ occurredAt: page[page.length - 1].occurredAt, id: page[page.length - 1]._id })
    : null;

  return sendJson(res, 200, {
    items: page.map((t) => ({
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
    })),
    nextCursor
  });
}
