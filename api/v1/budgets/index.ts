import crypto from 'crypto';
import { z } from 'zod';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendJson } from '../../_lib/http.js';
import { parseWith } from '../../_lib/validate.js';
import { requireUserId } from '../../_lib/user.js';

function parseIsoDateUtcNoon(iso: string) {
  // iso is YYYY-MM-DD
  const [y, m, d] = iso.split('-').map((n) => Number(n));
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function formatIsoDateUtc(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysIso(iso: string, days: number) {
  const d = parseIsoDateUtcNoon(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return formatIsoDateUtc(d);
}

function monthEndIso(startIso: string) {
  const d = parseIsoDateUtcNoon(startIso);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12, 0, 0));
  return formatIsoDateUtc(end);
}

function effectiveEndIso(startIso: string, endIso: string | null | undefined, period: 'monthly' | 'weekly') {
  if (endIso) return endIso;
  if (period === 'weekly') return addDaysIso(startIso, 6);
  return monthEndIso(startIso);
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

const CategoriesSchema = z.record(
  z.string().min(1).max(60),
  z.object({ budgeted: z.number().finite().nonnegative() }).passthrough()
);

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  totalBudget: z.number().finite().nonnegative(),
  period: z.enum(['monthly', 'weekly']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  categories: CategoriesSchema,
  spaceId: z.enum(['personal', 'business']).optional()
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);

  const userId = await requireUserId(req, res);
  if (!userId) return;

  const db = await getDb();
  const { budgets } = collections(db);

  if (req.method === 'POST') {
    try {
      const body = await readJson<unknown>(req);
      const input = parseWith(CreateSchema, body);

      const now = new Date();
      const id = crypto.randomUUID();
      const spaceId = input.spaceId ?? 'personal';

      const newStart = input.startDate;
      const newEnd = effectiveEndIso(input.startDate, input.endDate ?? null, input.period);
      if (newStart > newEnd) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid budget date range');
      }

      // Enforce: only one budget can cover a given day per space.
      const spaceFilter: any = { userId };
      if (spaceId === 'business') {
        spaceFilter.spaceId = 'business';
      } else {
        spaceFilter.$or = [{ spaceId: 'personal' }, { spaceId: { $exists: false } }, { spaceId: null }];
      }

      const existing = await budgets.find(spaceFilter).toArray();
      for (const b of existing) {
        const existingStart = String(b.startDate);
        const existingEnd = effectiveEndIso(existingStart, (b.endDate ?? null) as any, b.period as any);
        if (rangesOverlap(newStart, newEnd, existingStart, existingEnd)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Budget dates overlap an existing budget');
        }
      }

      await budgets.insertOne({
        _id: id,
        userId,
        spaceId,
        name: input.name,
        totalBudget: input.totalBudget,
        period: input.period,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        categories: input.categories,
        createdAt: now,
        updatedAt: now
      });

      const b = await budgets.findOne({ _id: id, userId });
      return sendJson(res, 201, {
        budget: {
          id: b!._id,
          spaceId: b!.spaceId ?? 'personal',
          name: b!.name,
          totalBudget: b!.totalBudget,
          period: b!.period,
          startDate: b!.startDate,
          endDate: b!.endDate ?? null,
          categories: b!.categories,
          createdAt: b!.createdAt.toISOString(),
          updatedAt: b!.updatedAt.toISOString()
        }
      });
    } catch (err: any) {
      if (err?.name === 'ZodError') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', err.issues);
      }
      return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error');
    }
  }

  const { start, end, spaceId } = req.query ?? {};
  const filter: any = { userId };

  // Space-aware filtering (treat legacy docs without spaceId as personal).
  if (spaceId === 'business') {
    filter.spaceId = 'business';
  } else if (spaceId === 'personal') {
    filter.$or = [{ spaceId: 'personal' }, { spaceId: { $exists: false } }, { spaceId: null }];
  }

  if (start || end) {
    // startDate is YYYY-MM-DD; treat as lexicographically comparable
    filter.startDate = {};
    if (start) filter.startDate.$gte = String(start);
    if (end) filter.startDate.$lte = String(end);
  }

  const items = await budgets.find(filter).sort({ startDate: -1, _id: -1 }).toArray();

  return sendJson(res, 200, {
    items: items.map((b) => ({
      id: b._id,
      spaceId: b.spaceId ?? 'personal',
      name: b.name,
      totalBudget: b.totalBudget,
      period: b.period,
      startDate: b.startDate,
      endDate: b.endDate ?? null,
      categories: b.categories,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString()
    }))
  });
}
