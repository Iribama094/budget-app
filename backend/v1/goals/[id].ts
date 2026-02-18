import { z } from 'zod';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendJson, sendNoContent } from '../../_lib/http.js';
import { parseWith } from '../../_lib/validate.js';
import { requireUserId } from '../../_lib/user.js';

const PatchSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    targetAmount: z.number().finite().positive().optional(),
    currentAmount: z.number().finite().nonnegative().optional(),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    emoji: z.string().max(8).optional(),
    color: z.string().max(80).optional(),
    category: z.string().max(40).optional()
  })
  .strict();

export default async function handler(req: any, res: any) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE' && req.method !== 'GET') {
    return methodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
  }

  const userId = await requireUserId(req, res);
  if (!userId) return;

  const id = String(req.query?.id ?? '');
  if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Missing id');

  const spaceIdRaw = req.query?.spaceId;
  const spaceId = spaceIdRaw === 'personal' || spaceIdRaw === 'business' ? spaceIdRaw : undefined;

  const db = await getDb();
  const { goals } = collections(db);

  const filter: any = { _id: id, userId };
  // Optional strict demarcation when spaceId is provided.
  if (spaceId === 'business') {
    filter.spaceId = 'business';
  } else if (spaceId === 'personal') {
    filter.$or = [{ spaceId: 'personal' }, { spaceId: { $exists: false } }, { spaceId: null }];
  }

  if (req.method === 'GET') {
    const g = await goals.findOne(filter);
    if (!g) return sendError(res, 404, 'NOT_FOUND', 'Goal not found');
    return sendJson(res, 200, {
      goal: {
        id: g._id,
        spaceId: g.spaceId ?? 'personal',
        name: g.name,
        targetAmount: g.targetAmount,
        currentAmount: g.currentAmount,
        targetDate: g.targetDate,
        emoji: g.emoji ?? null,
        color: g.color ?? null,
        category: g.category ?? null,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString()
      }
    });
  }

  if (req.method === 'DELETE') {
    const result = await goals.deleteOne(filter);
    if (!result.deletedCount) return sendError(res, 404, 'NOT_FOUND', 'Goal not found');
    return sendNoContent(res);
  }

  try {
    const body = await readJson<unknown>(req);
    const patch = parseWith(PatchSchema, body);

    const now = new Date();
    const result = await goals.updateOne(filter, { $set: { ...patch, updatedAt: now } });
    if (!result.matchedCount) return sendError(res, 404, 'NOT_FOUND', 'Goal not found');

    const g = await goals.findOne(filter);
    return sendJson(res, 200, {
      goal: {
        id: g!._id,
        spaceId: g!.spaceId ?? 'personal',
        name: g!.name,
        targetAmount: g!.targetAmount,
        currentAmount: g!.currentAmount,
        targetDate: g!.targetDate,
        emoji: g!.emoji ?? null,
        color: g!.color ?? null,
        category: g!.category ?? null,
        createdAt: g!.createdAt.toISOString(),
        updatedAt: g!.updatedAt.toISOString()
      }
    });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', err.issues);
    }
    return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error');
  }
}
