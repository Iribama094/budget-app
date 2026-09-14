import { z } from 'zod';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendJson, sendNoContent } from '../../_lib/http.js';
import { requireUserId } from '../../_lib/user.js';
import { parseIsoDateUtcNoon, todayIso } from '../../_lib/budgets.js';
import { materializeDue, runRecurringForUser } from '../../_lib/recurring.js';
import { RecurringFields, toApiRecurring } from './index.js';

const PatchSchema = z
  .object({
    ...Object.fromEntries(Object.entries(RecurringFields).map(([k, v]) => [k, v.optional()])),
    nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  })
  .strict();

/**
 * PATCH/DELETE /v1/recurring/:id
 * POST /v1/recurring/run — record everything due for the signed-in user (called on app open).
 */
export default async function handler(req: any, res: any) {
  const userId = await requireUserId(req, res);
  if (!userId) return;

  const id = String(req.query?.id ?? '');
  const db = await getDb();

  if (id === 'run') {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
    const created = await runRecurringForUser(db, userId, todayIso());
    return sendJson(res, 200, { created });
  }

  const { recurring } = collections(db);
  const existing = await recurring.findOne({ _id: id, userId });
  if (!existing) return sendError(res, 404, 'NOT_FOUND', 'Recurring item not found');

  if (req.method === 'DELETE') {
    await recurring.deleteOne({ _id: id, userId });
    return sendNoContent(res);
  }
  if (req.method !== 'PATCH') return methodNotAllowed(res, ['PATCH', 'DELETE']);

  try {
    const patch = PatchSchema.parse(await readJson<unknown>(req)) as Record<string, unknown>;
    const set: Record<string, unknown> = { ...patch, updatedAt: new Date() };
    if (typeof patch.nextDueDate === 'string') {
      set.anchorDay = parseIsoDateUtcNoon(patch.nextDueDate).getUTCDate();
      set.lastRemindedFor = null;
    }
    await recurring.updateOne({ _id: id, userId }, { $set: set });
    const updated = (await recurring.findOne({ _id: id, userId }))!;
    const created = await materializeDue(db, updated, todayIso());
    return sendJson(res, 200, { recurring: toApiRecurring((await recurring.findOne({ _id: id, userId })) ?? updated), created });
  } catch (err: any) {
    if (err?.name === 'ZodError') return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', err.issues);
    console.error('[recurring] update failed', err);
    return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error');
  }
}
