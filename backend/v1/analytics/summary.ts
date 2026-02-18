import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, sendError, sendJson } from '../../_lib/http.js';
import { requireUserId } from '../../_lib/user.js';

function isoDateUtc(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const userId = await requireUserId(req, res);
  if (!userId) return;

  const startRaw = String(req.query?.start ?? '');
  const endRaw = String(req.query?.end ?? '');
  if (!startRaw || !endRaw) return sendError(res, 400, 'VALIDATION_ERROR', 'Missing start/end query params');

  const spaceIdRaw = req.query?.spaceId;
  const spaceId = spaceIdRaw === 'personal' || spaceIdRaw === 'business' ? spaceIdRaw : undefined;

  const parseQueryDate = (raw: string, mode: 'start' | 'end'): Date => {
    // If the client passes date-only, interpret it as a UTC day boundary.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-').map((x) => Number(x));
      return mode === 'start'
        ? new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0))
        : new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    }
    const dt = new Date(raw);
    return dt;
  };

  const start = parseQueryDate(startRaw, 'start');
  const end = parseQueryDate(endRaw, 'end');

  const db = await getDb();
  const { transactions, miniBudgets } = collections(db);

  const match: any = { userId, occurredAt: { $gte: start, $lte: end } };
  // Space-aware filtering (treat legacy docs without spaceId as personal).
  if (spaceId === 'business') {
    match.spaceId = 'business';
  } else if (spaceId === 'personal') {
    match.$or = [{ spaceId: 'personal' }, { spaceId: { $exists: false } }, { spaceId: null }];
  }

  const range = await transactions.find(match).toArray();

  let income = 0;
  let expenses = 0;
  const spendingByCategory: Record<string, number> = {};
  const spendingByBucket: Record<string, number> = {};
  const spendingByMiniBudgetId: Record<string, number> = {};

  // Daily expenses by category for the selected range (UTC day buckets).
  const dailyCategory: Record<string, Record<string, number>> = {};
  const dailyExpenses: Record<string, number> = {};

  try {
    const dayCursor = startOfUtcDay(start);
    const endDay = startOfUtcDay(end);
    while (dayCursor.getTime() <= endDay.getTime()) {
      const key = isoDateUtc(dayCursor);
      dailyCategory[key] = {};
      dailyExpenses[key] = 0;
      dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
    }
  } catch {
    // If day seeding fails, we'll still populate for days that have data.
  }

  for (const t of range) {
    if (t.type === 'income') income += t.amount;
    else {
      expenses += t.amount;
      spendingByCategory[t.category] = (spendingByCategory[t.category] ?? 0) + t.amount;

      const dayKey = isoDateUtc(t.occurredAt);
      dailyExpenses[dayKey] = (dailyExpenses[dayKey] ?? 0) + t.amount;
      const perDay = (dailyCategory[dayKey] ??= {});
      perDay[t.category] = (perDay[t.category] ?? 0) + t.amount;

      const bucket = t.budgetCategory ? String(t.budgetCategory) : 'Unassigned';
      spendingByBucket[bucket] = (spendingByBucket[bucket] ?? 0) + t.amount;

      if (t.miniBudgetId) {
        const id = String(t.miniBudgetId);
        spendingByMiniBudgetId[id] = (spendingByMiniBudgetId[id] ?? 0) + t.amount;
      }
    }
  }

  // Map miniBudgetId -> name for display
  const spendingByMiniBudget: Record<string, number> = {};
  const miniIds = Object.keys(spendingByMiniBudgetId);
  if (miniIds.length > 0) {
    try {
      const minis = await miniBudgets
        .find({ _id: { $in: miniIds }, userId })
        .toArray();

      const nameById = new Map<string, string>();
      minis.forEach((m: any) => nameById.set(String(m._id), String(m.name ?? 'Mini budget')));

      for (const [id, amount] of Object.entries(spendingByMiniBudgetId)) {
        const label = nameById.get(id) ?? id;
        spendingByMiniBudget[label] = (spendingByMiniBudget[label] ?? 0) + amount;
      }
    } catch {
      // Fallback to IDs if lookup fails
      for (const [id, amount] of Object.entries(spendingByMiniBudgetId)) {
        spendingByMiniBudget[id] = (spendingByMiniBudget[id] ?? 0) + amount;
      }
    }
  }

  const lifetimeAgg = await transactions
    .aggregate([
      {
        $match:
          spaceId === 'business'
            ? { userId, spaceId: 'business' }
            : spaceId === 'personal'
              ? { userId, $or: [{ spaceId: 'personal' }, { spaceId: { $exists: false } }, { spaceId: null }] }
              : { userId }
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' }
        }
      }
    ])
    .toArray();

  const totalIncome = lifetimeAgg.find((x) => x._id === 'income')?.total ?? 0;
  const totalExpenses = lifetimeAgg.find((x) => x._id === 'expense')?.total ?? 0;
  const totalBalance = totalIncome - totalExpenses;

  // Net remaining for the selected range (income - expenses).
  const remainingBudget = income - expenses;

  const dailySpendingByCategory = Object.keys(dailyExpenses)
    .sort()
    .map((date) => ({
      date,
      expenses: dailyExpenses[date] ?? 0,
      spendingByCategory: dailyCategory[date] ?? {}
    }));

  return sendJson(res, 200, {
    totalBalance,
    income,
    expenses,
    remainingBudget,
    spendingByCategory,
    dailySpendingByCategory,
    spendingByBucket,
    spendingByMiniBudget
  });
}
