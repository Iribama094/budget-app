import crypto from 'crypto';
import { z } from 'zod';
import { getDb } from '../../_lib/mongo.js';
import { collections, type RecurringDoc } from '../../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendJson } from '../../_lib/http.js';
import { requireUserId } from '../../_lib/user.js';
import { andAll, parseIsoDateUtcNoon, spaceClause, todayIso } from '../../_lib/budgets.js';
import { materializeDue } from '../../_lib/recurring.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const RecurringFields = {
  type: z.enum(['income', 'expense']),
  amount: z.number().finite().positive(),
  category: z.string().min(1).max(60),
  description: z.string().max(120),
  frequency: z.enum(['weekly', 'monthly', 'yearly']),
  endDate: isoDate.nullable(),
  autoCreate: z.boolean(),
  remindDaysBefore: z.number().int().min(0).max(14),
  budgetCategory: z.string().max(60).nullable(),
  paused: z.boolean()
};

const CreateSchema = z.object({
  ...RecurringFields,
  description: RecurringFields.description.optional().default(''),
  endDate: RecurringFields.endDate.optional(),
  autoCreate: RecurringFields.autoCreate.optional().default(true),
  remindDaysBefore: RecurringFields.remindDaysBefore.optional().default(1),
  budgetCategory: RecurringFields.budgetCategory.optional(),
  paused: RecurringFields.paused.optional().default(false),
  /** First due date. */
  startDate: isoDate,
  spaceId: z.enum(['personal', 'business']).optional()
});

export function toApiRecurring(r: RecurringDoc) {
  return {
    id: r._id,
    spaceId: r.spaceId ?? 'personal',
    type: r.type,
    amount: r.amount,
    category: r.category,
    description: r.description,
    frequency: r.frequency,
    nextDueDate: r.nextDueDate,
    endDate: r.endDate ?? null,
    autoCreate: r.autoCreate,
    remindDaysBefore: r.remindDaysBefore,
    budgetCategory: r.budgetCategory ?? null,
    paused: r.paused,
    lastCreatedFor: r.lastCreatedFor ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString()
  };
}

/** GET/POST /v1/recurring */
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);
  const userId = await requireUserId(req, res);
  if (!userId) return;

  const db = await getDb();
  const { recurring } = collections(db);

  if (req.method === 'GET') {
    const items = await recurring.find(andAll({ userId }, spaceClause(req.query?.spaceId))).sort({ paused: 1, nextDueDate: 1 }).toArray();
    return sendJson(res, 200, { items: items.map(toApiRecurring) });
  }

  try {
    const input = CreateSchema.parse(await readJson<unknown>(req));
    if (input.endDate && input.endDate < input.startDate) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'The end date must be after the first due date');
    }
    const now = new Date();
    const doc: RecurringDoc = {
      _id: crypto.randomUUID(),
      userId,
      spaceId: input.spaceId ?? 'personal',
      type: input.type,
      amount: input.amount,
      category: input.category,
      description: input.description,
      frequency: input.frequency,
      anchorDay: parseIsoDateUtcNoon(input.startDate).getUTCDate(),
      nextDueDate: input.startDate,
      endDate: input.endDate ?? null,
      autoCreate: input.autoCreate,
      remindDaysBefore: input.remindDaysBefore,
      budgetCategory: input.budgetCategory ?? null,
      paused: input.paused,
      lastCreatedFor: null,
      lastRemindedFor: null,
      createdAt: now,
      updatedAt: now
    };
    await recurring.insertOne(doc);

    // A schedule that starts today (or in the past) records its due occurrences immediately.
    const created = await materializeDue(db, doc, todayIso());
    const saved = await recurring.findOne({ _id: doc._id });
    return sendJson(res, 201, { recurring: toApiRecurring(saved ?? doc), created });
  } catch (err: any) {
    if (err?.name === 'ZodError') return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', err.issues);
    console.error('[recurring] create failed', err);
    return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error');
  }
}
