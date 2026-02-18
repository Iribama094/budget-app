import { z } from 'zod';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendJson, sendNoContent } from '../../_lib/http.js';
import { parseWith } from '../../_lib/validate.js';
import { requireUserId } from '../../_lib/user.js';

function parseIsoDateUtcNoon(iso: string) {
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

const PatchSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    totalBudget: z.number().finite().nonnegative().optional(),
    period: z.enum(['monthly', 'weekly']).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    categories: CategoriesSchema.optional()
  })
  .strict();

export default async function handler(req: any, res: any) {
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
  const { budgets } = collections(db);

  const filter: any = { _id: id, userId };
  // Optional strict demarcation when spaceId is provided.
  if (spaceId === 'business') {
    filter.spaceId = 'business';
  } else if (spaceId === 'personal') {
    filter.$or = [{ spaceId: 'personal' }, { spaceId: { $exists: false } }, { spaceId: null }];
  }

  if (req.method === 'GET') {
    const b = await budgets.findOne(filter);
    if (!b) return sendError(res, 404, 'NOT_FOUND', 'Budget not found');
    return sendJson(res, 200, {
      budget: {
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
      }
    });
  }

  if (req.method === 'DELETE') {
    const result = await budgets.deleteOne(filter);
    if (!result.deletedCount) return sendError(res, 404, 'NOT_FOUND', 'Budget not found');
    return sendNoContent(res);
  }

  try {
    const body = await readJson<unknown>(req);
    const patch = parseWith(PatchSchema, body);

    const current = await budgets.findOne(filter);
    if (!current) return sendError(res, 404, 'NOT_FOUND', 'Budget not found');

    const nextStart = String(patch.startDate ?? current.startDate);
    const nextPeriod = (patch.period ?? current.period) as 'monthly' | 'weekly';
    const nextEndExplicit = (patch.endDate ?? current.endDate ?? null) as string | null;
    const nextEnd = effectiveEndIso(nextStart, nextEndExplicit, nextPeriod);

    if (nextStart > nextEnd) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid budget date range');
    }

    const currentSpaceId = (current.spaceId ?? 'personal') as 'personal' | 'business';
    const spaceFilter: any = { userId };
    if (currentSpaceId === 'business') {
      spaceFilter.spaceId = 'business';
    } else {
      spaceFilter.$or = [{ spaceId: 'personal' }, { spaceId: { $exists: false } }, { spaceId: null }];
    }

    const existing = await budgets.find(spaceFilter).toArray();
    for (const b of existing) {
      if (String(b._id) === id) continue;
      const existingStart = String(b.startDate);
      const existingEnd = effectiveEndIso(existingStart, (b.endDate ?? null) as any, b.period as any);
      if (rangesOverlap(nextStart, nextEnd, existingStart, existingEnd)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Budget dates overlap an existing budget');
      }
    }

    const now = new Date();
    const result = await budgets.updateOne(filter, { $set: { ...patch, updatedAt: now } });
    if (!result.matchedCount) return sendError(res, 404, 'NOT_FOUND', 'Budget not found');

    const b = await budgets.findOne(filter);
    return sendJson(res, 200, {
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
