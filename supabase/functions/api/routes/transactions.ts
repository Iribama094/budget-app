import { encodeBase64Url, decodeBase64Url } from 'jsr:@std/encoding@1.0.10/base64url';
import { iso, isUniqueViolation, isUuid, sql } from '../lib/db.ts';
import { requireAuth } from '../lib/auth.ts';
import { recorderNames } from '../lib/teamRecords.ts';
import { teamTransactionType } from '../lib/team.ts';
import { badRequest, body, HttpError, json, methodNotAllowed, noContent, notFound, spaceParam, z } from '../lib/http.ts';
import { parseQueryDate } from '../lib/dates.ts';
import { budgetMemberIds, bumpBucket, bumpBudget, findVisibleBudget } from '../lib/budgets.ts';
import { afterTransactionCreated } from '../lib/effects.ts';
import { learnCategory } from '../lib/categories.ts';
import { refundTransaction } from '../lib/importMatch.ts';
import type { Ctx } from '../index.ts';

const CreateSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.number().finite().positive(),
  category: z.string().min(1).max(60),
  description: z.string().max(120).optional().default(''),
  occurredAt: z.string().datetime({ offset: true }),
  budgetId: z.string().min(1).max(120).optional(),
  budgetCategory: z.string().min(1).max(60).optional(),
  spaceId: z.enum(['personal', 'business']).optional(),
  /** VAT inside a business cost, claimed back against VAT charged on sales. */
  vatAmount: z.number().finite().nonnegative().max(1e12).optional(),
  /** Client-generated id; retrying the same request (e.g. from the offline queue) returns the original. */
  clientId: z.string().min(8).max(100).optional(),
  /** Money that arrived in another currency: what came in and the rate it was changed at. amount is the result. */
  fx: z.object({ currency: z.string().regex(/^[A-Za-z]{3}$/), amount: z.number().finite().positive(), rate: z.number().finite().positive() }).optional()
});

const PatchSchema = z
  .object({
    type: z.enum(['income', 'expense']).optional(),
    amount: z.number().finite().positive().optional(),
    category: z.string().min(1).max(60).optional(),
    description: z.string().max(120).optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    budgetId: z.union([z.string().min(1).max(120), z.null()]).optional(),
    budgetCategory: z.union([z.string().min(1).max(60), z.null()]).optional(),
    /** Money given back on this expense. Taken off what it cost; the whole amount removes it. */
    refund: z.number().finite().positive().optional()
  })
  .strict();

export function toApiTransaction(t: any, opts: { full?: boolean; names?: Map<string, string> } = { full: true }) {
  return {
    id: t.id,
    ...(opts.full ? { userId: t.userId } : {}),
    spaceId: t.spaceId ?? 'personal',
    type: t.type,
    amount: Number(t.amount),
    category: t.category,
    description: t.description,
    budgetId: t.budgetId ?? null,
    budgetCategory: t.budgetCategory ?? null,
    refundedAmount: Number(t.refundedAmount ?? 0),
    fxCurrency: t.fxCurrency ?? null,
    fxAmount: t.fxAmount == null ? null : Number(t.fxAmount),
    fxRate: t.fxRate == null ? null : Number(t.fxRate),
    // Someone on the business's team recorded it; null means the owner did.
    createdBy: t.createdBy ?? null,
    recordedBy: t.createdBy ? opts.names?.get(t.createdBy) ?? null : null,
    ...(opts.full ? { recurringId: t.recurringId ?? null, clientId: t.clientId ?? null } : {}),
    occurredAt: iso(t.occurredAt),
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt)
  };
}

const encodeCursor = (t: { occurredAt: Date; id: string }) =>
  encodeBase64Url(new TextEncoder().encode(JSON.stringify({ t: new Date(t.occurredAt).toISOString(), id: t.id })));

function decodeCursor(raw: string): { t: Date; id: string } | null {
  try {
    const d = JSON.parse(new TextDecoder().decode(decodeBase64Url(raw)));
    if (!d?.t || !isUuid(d?.id)) return null;
    const t = new Date(d.t);
    return Number.isNaN(t.getTime()) ? null : { t, id: d.id };
  } catch {
    return null;
  }
}

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** GET/POST /v1/transactions */
export async function transactionsIndex(ctx: Ctx) {
  if (ctx.method !== 'GET' && ctx.method !== 'POST') methodNotAllowed(['GET', 'POST']);
  const { userId, actorId, teamRole } = await requireAuth(ctx.req);
  // Sales record only money in and Purchases only money out; they see the same way (lib/team.ts).
  const onlyType = teamTransactionType(teamRole);

  if (ctx.method === 'POST') {
    const input = await body(ctx.req, CreateSchema);
    const space = input.spaceId ?? 'personal';
    if (onlyType && input.type !== onlyType) {
      throw new HttpError(403, 'FORBIDDEN', onlyType === 'income' ? 'Your role records sales only.' : 'Your role records costs only.');
    }

    if (input.clientId) {
      const [existing] = await sql`select * from public.transactions where user_id = ${userId} and client_id = ${input.clientId}`;
      if (existing) return json(200, { transaction: toApiTransaction(existing), duplicate: true, autoSaved: [] });
    }
    if (input.budgetId && !(await findVisibleBudget(userId, input.budgetId))) badRequest('That budget is not available');

    let tx;
    try {
      [tx] = await sql`
        insert into public.transactions
          (user_id, space_id, type, amount, category, description, budget_id, budget_category, client_id, occurred_at, vat_amount,
           fx_currency, fx_amount, fx_rate, created_by)
        values (${userId}, ${space}, ${input.type}, ${input.amount}, ${input.category}, ${input.description},
                ${input.budgetId ?? null}, ${input.budgetCategory ?? null},
                ${input.clientId ?? null}, ${new Date(input.occurredAt)}, ${space === 'business' && input.type === 'expense' ? input.vatAmount ?? 0 : 0},
                ${input.fx?.currency.toUpperCase() ?? null}, ${input.fx?.amount ?? null}, ${input.fx?.rate ?? null},
                ${actorId !== userId ? actorId : null})
        returning *
      `;
    } catch (err) {
      if (isUniqueViolation(err) && input.clientId) {
        const [existing] = await sql`select * from public.transactions where user_id = ${userId} and client_id = ${input.clientId}`;
        if (existing) return json(200, { transaction: toApiTransaction(existing), duplicate: true, autoSaved: [] });
      }
      throw err;
    }

    // Income applied to a budget grows its total and the chosen bucket. Owners and members can both add it.
    if (input.type === 'income' && input.budgetId) {
      await bumpBudget(input.budgetId, input.amount, input.budgetCategory, sql`(b.user_id = ${userId} or exists (
        select 1 from public.budget_members m where m.budget_id = b.id and m.user_id = ${userId}))`);
    }

    const effects = await afterTransactionCreated(tx as any);
    // Remember this payee → category choice so the next one is suggested.
    await learnCategory(userId, input.type, input.description, input.category, input.budgetCategory).catch(() => undefined);
    return json(201, { transaction: toApiTransaction(tx), autoSaved: effects.autoSaved });
  }

  const q = ctx.query;
  const limit = Math.max(1, Math.min(200, Number(q.get('limit') ?? 50) || 50));
  const asked = q.get('type');
  if (onlyType && asked && asked !== onlyType) return json(200, { items: [], nextCursor: null });
  const type = onlyType ?? asked;
  const category = q.get('category');
  const budgetId = q.get('budgetId');
  const space = spaceParam(q.get('spaceId'));
  const start = q.get('start');
  const end = q.get('end');

  let owners = [userId];
  if (budgetId) {
    if (!isUuid(budgetId)) return json(200, { items: [], nextCursor: null });
    // A shared budget shows every member's spending.
    const shared = await findVisibleBudget(userId, budgetId);
    if (shared && shared.members.length) owners = budgetMemberIds(shared);
  }

  const startDate = start ? parseQueryDate(start, 'start') : null;
  const endDate = end ? parseQueryDate(end, 'end') : null;
  const cursor = q.get('cursor') ? decodeCursor(q.get('cursor')!) : null;

  const rows = await sql`
    select * from public.transactions
    where user_id in ${sql(owners)}
      ${type ? sql`and type = ${type}` : sql``}
      ${category ? sql`and category = ${category}` : sql``}
      ${budgetId ? sql`and budget_id = ${budgetId}` : sql``}
      ${space ? sql`and space_id = ${space}` : sql``}
      ${startDate && !Number.isNaN(startDate.getTime()) ? sql`and occurred_at >= ${startDate}` : sql``}
      ${endDate && !Number.isNaN(endDate.getTime()) ? sql`and occurred_at <= ${endDate}` : sql``}
      ${cursor ? sql`and (occurred_at, id) < (${cursor.t}, ${cursor.id}::uuid)` : sql``}
    order by occurred_at desc, id desc
    limit ${limit + 1}
  `;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const names = await recorderNames(userId, page.map((t) => t.createdBy));
  return json(200, {
    items: page.map((t) => toApiTransaction(t, { full: true, names })),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1] as any) : null
  });
}

/** GET/PATCH/DELETE /v1/transactions/:id */
export async function transactionById(ctx: Ctx) {
  if (!['GET', 'PATCH', 'DELETE'].includes(ctx.method)) methodNotAllowed(['GET', 'PATCH', 'DELETE']);
  const { userId, actorId, teamRole } = await requireAuth(ctx.req);
  const id = ctx.parts[1];
  if (!isUuid(id)) notFound('Transaction not found');
  const space = spaceParam(ctx.query.get('spaceId'));

  const [existing] = await sql`select * from public.transactions where id = ${id} and user_id = ${userId} ${space ? sql`and space_id = ${space}` : sql``}`;
  if (!existing) notFound('Transaction not found');
  // Sales can't open a cost, nor Purchases a sale.
  const onlyType = teamTransactionType(teamRole);
  if (onlyType && existing.type !== onlyType) notFound('Transaction not found');
  const txSpace = existing.spaceId ?? 'personal';
  const ownBudget = sql`b.user_id = ${userId} and b.space_id = ${txSpace}`;

  if (ctx.method === 'GET') {
    const names = await recorderNames(userId, [existing.createdBy]);
    return json(200, { transaction: toApiTransaction(existing, { full: false, names }) });
  }
  // Sales and Purchases correct only what they recorded themselves. Managers can correct anything.
  if (teamRole && teamRole !== 'manager' && existing.createdBy !== actorId) {
    throw new HttpError(403, 'FORBIDDEN', 'You can only change what you recorded. Ask the owner to change this one.');
  }

  if (ctx.method === 'DELETE') {
    await sql`delete from public.transactions where id = ${id} and user_id = ${userId}`;
    // Reverse the budget growth that income applied on create.
    if (existing.type === 'income' && existing.budgetId) {
      await bumpBudget(existing.budgetId, -Number(existing.amount), existing.budgetCategory, ownBudget);
    }
    return noContent();
  }

  const patch = await body(ctx.req, PatchSchema);

  if (patch.refund !== undefined) {
    if (existing.type !== 'expense') badRequest('Only spending can be refunded');
    const left = await refundTransaction(userId, id, patch.refund);
    if (!left) return json(200, { transaction: null, removed: true });
    const [t] = await sql`select * from public.transactions where id = ${id}`;
    return json(200, { transaction: toApiTransaction(t, { full: false }), removed: false });
  }

  const prevType = existing.type as 'income' | 'expense';
  const prevAmount = Number(existing.amount);
  const prevBudgetId = (existing.budgetId ?? null) as string | null;
  const prevBucket = (existing.budgetCategory ?? null) as string | null;

  const nextType = patch.type ?? prevType;
  const nextAmount = patch.amount ?? prevAmount;
  const nextBudgetId = has(patch, 'budgetId') ? patch.budgetId ?? null : prevBudgetId;
  const nextBucket = has(patch, 'budgetCategory') ? patch.budgetCategory ?? null : prevBucket;
  if (nextBudgetId && !isUuid(nextBudgetId)) badRequest('That budget is not available');

  // Keep the budget's total and buckets in step with income changes.
  const wasIncome = prevType === 'income';
  const willBeIncome = nextType === 'income';

  if (wasIncome && prevBudgetId) {
    if (willBeIncome && nextBudgetId === prevBudgetId) {
      const delta = nextAmount - prevAmount;
      if (delta !== 0) await bumpBudget(prevBudgetId, delta, prevBucket, ownBudget);
      // Same budget, different bucket: move the allocation between buckets.
      if (prevBucket !== nextBucket && prevAmount > 0) {
        if (prevBucket) await bumpBucket(prevBudgetId, prevBucket, -prevAmount, ownBudget);
        if (nextBucket) await bumpBucket(prevBudgetId, nextBucket, prevAmount, ownBudget);
      }
    } else {
      await bumpBudget(prevBudgetId, -prevAmount, prevBucket, ownBudget);
    }
  }
  if (willBeIncome && nextBudgetId && !(wasIncome && prevBudgetId === nextBudgetId)) {
    await bumpBudget(nextBudgetId, nextAmount, nextBucket, ownBudget);
  }

  const [t] = await sql`
    update public.transactions set
      type = ${nextType},
      amount = ${nextAmount},
      category = ${patch.category ?? existing.category},
      description = ${patch.description ?? existing.description},
      occurred_at = ${patch.occurredAt ? new Date(patch.occurredAt) : existing.occurredAt},
      budget_id = ${nextBudgetId},
      budget_category = ${nextBucket},
    where id = ${id} and user_id = ${userId}
    returning *
  `;
  if (!t) notFound('Transaction not found');
  // A corrected category teaches the suggestion for this payee.
  if (patch.category || patch.description !== undefined) {
    await learnCategory(userId, t.type, t.description, t.category, t.budgetCategory).catch(() => undefined);
  }
  return json(200, { transaction: toApiTransaction(t, { full: false }) });
}

/** GET /v1/analytics/summary?start&end&spaceId */
export async function analyticsSummary(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const { userId } = await requireAuth(ctx.req);
  const startRaw = ctx.query.get('start') ?? '';
  const endRaw = ctx.query.get('end') ?? '';
  if (!startRaw || !endRaw) badRequest('Missing start/end query params');
  const space = spaceParam(ctx.query.get('spaceId'));
  const start = parseQueryDate(startRaw, 'start');
  const end = parseQueryDate(endRaw, 'end');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) badRequest('Invalid start/end query params');
  const spaceFilter = space ? sql`and space_id = ${space}` : sql``;

  const [range, lifetime] = await Promise.all([
    sql`
      select type, amount, category, budget_category, occurred_at from public.transactions
      where user_id = ${userId} and occurred_at >= ${start} and occurred_at <= ${end} ${spaceFilter}
    `,
    sql`select type, sum(amount) as total from public.transactions where user_id = ${userId} ${spaceFilter} group by type`
  ]);

  const dayKey = (d: Date) => new Date(d).toISOString().slice(0, 10);
  let income = 0;
  let expenses = 0;
  const spendingByCategory: Record<string, number> = {};
  const spendingByBucket: Record<string, number> = {};
  const dailyCategory: Record<string, Record<string, number>> = {};
  const dailyExpenses: Record<string, number> = {};

  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  for (let i = 0; cursor.getTime() <= endDay && i < 400; i++) {
    const key = dayKey(cursor);
    dailyCategory[key] = {};
    dailyExpenses[key] = 0;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  for (const t of range) {
    const amount = Number(t.amount);
    if (t.type === 'income') {
      income += amount;
      continue;
    }
    expenses += amount;
    spendingByCategory[t.category] = (spendingByCategory[t.category] ?? 0) + amount;
    const key = dayKey(t.occurredAt);
    dailyExpenses[key] = (dailyExpenses[key] ?? 0) + amount;
    const perDay = (dailyCategory[key] ??= {});
    perDay[t.category] = (perDay[t.category] ?? 0) + amount;
    const bucket = t.budgetCategory ? String(t.budgetCategory) : 'Unassigned';
    spendingByBucket[bucket] = (spendingByBucket[bucket] ?? 0) + amount;
  }

  const totalIncome = Number(lifetime.find((x) => x.type === 'income')?.total ?? 0);
  const totalExpenses = Number(lifetime.find((x) => x.type === 'expense')?.total ?? 0);

  return json(200, {
    totalBalance: totalIncome - totalExpenses,
    income,
    expenses,
    remainingBudget: income - expenses,
    spendingByCategory,
    dailySpendingByCategory: Object.keys(dailyExpenses)
      .sort()
      .map((date) => ({ date, expenses: dailyExpenses[date] ?? 0, spendingByCategory: dailyCategory[date] ?? {} })),
    spendingByBucket
  });
}
