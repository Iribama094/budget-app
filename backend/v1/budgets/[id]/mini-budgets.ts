import crypto from 'crypto';
import { z } from 'zod';
import { getDb } from '../../../_lib/mongo.js';
import { collections } from '../../../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendJson } from '../../../_lib/http.js';
import { parseWith } from '../../../_lib/validate.js';
import { requireUserId } from '../../../_lib/user.js';

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  amount: z.number().finite().nonnegative(),
  category: z.string().min(1).max(60).optional()
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);

  const userId = await requireUserId(req, res);
  if (!userId) return;

  const budgetId = String(req.query?.id ?? '');
  if (!budgetId) return sendError(res, 400, 'VALIDATION_ERROR', 'Missing budget id');

  const spaceIdRaw = req.query?.spaceId;
  const spaceId = spaceIdRaw === 'personal' || spaceIdRaw === 'business' ? spaceIdRaw : undefined;

  const db = await getDb();
  const { miniBudgets, budgets } = collections(db);

  const parent = await budgets.findOne({ _id: budgetId, userId });
  if (!parent) return sendError(res, 404, 'NOT_FOUND', 'Budget not found');

  // Optional strict demarcation when spaceId is provided.
  if (spaceId) {
    const parentSpace = (parent.spaceId ?? 'personal') as 'personal' | 'business';
    if (parentSpace !== spaceId) return sendError(res, 404, 'NOT_FOUND', 'Budget not found');
  }

  if (req.method === 'POST') {
    try {
      const body = await readJson<unknown>(req);
      const input = parseWith(CreateSchema, body);

      const now = new Date();
      const id = crypto.randomUUID();

      await miniBudgets.insertOne({
        _id: id,
        userId,
        budgetId,
        name: input.name,
        amount: input.amount,
        category: input.category ?? null,
        createdAt: now,
        updatedAt: now
      });

      const m = await miniBudgets.findOne({ _id: id, userId });
      return sendJson(res, 201, {
        miniBudget: {
          id: m!._id,
          budgetId: m!.budgetId,
          name: m!.name,
          amount: m!.amount,
          category: m!.category ?? null,
          createdAt: m!.createdAt.toISOString(),
          updatedAt: m!.updatedAt.toISOString()
        }
      });
    } catch (err: any) {
      if (err?.name === 'ZodError') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', err.issues);
      }
      return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error');
    }
  }

  const items = await miniBudgets
    .find({ userId, budgetId })
    .sort({ createdAt: -1, _id: -1 })
    .toArray();

  return sendJson(res, 200, {
    items: items.map((m) => ({
      id: m._id,
      budgetId: m.budgetId,
      name: m.name,
      amount: m.amount,
      category: m.category ?? null,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString()
    }))
  });
}
