import { iso, isUuid, sql } from '../lib/db.ts';
import { requireAuth } from '../lib/auth.ts';
import { badRequest, body, HttpError, json, methodNotAllowed, noContent, notFound, spaceParam, z } from '../lib/http.ts';
import { ISO_DATE, parseIsoDateUtcNoon, todayIso } from '../lib/dates.ts';
import { materializeDue, runRecurringForUser, toApiRecurring, type RecurringRow } from '../lib/recurring.ts';
import { computeTax, loadRuleForCountry } from '../lib/tax.ts';
import type { Ctx } from '../index.ts';

/* ------------------------------------------------------------------ goals */

const GoalCreateSchema = z.object({
  name: z.string().min(1).max(80),
  targetAmount: z.number().finite().positive(),
  currentAmount: z.number().finite().nonnegative().optional(),
  targetDate: z.string().regex(ISO_DATE),
  emoji: z.string().max(8).optional(),
  color: z.string().max(80).optional(),
  category: z.string().max(40).optional(),
  autoSavePercent: z.number().min(0).max(50).nullable().optional(),
  spaceId: z.enum(['personal', 'business']).optional()
});

const GoalPatchSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    targetAmount: z.number().finite().positive().optional(),
    currentAmount: z.number().finite().nonnegative().optional(),
    targetDate: z.string().regex(ISO_DATE).optional(),
    emoji: z.string().max(8).optional(),
    color: z.string().max(80).optional(),
    category: z.string().max(40).optional(),
    autoSavePercent: z.number().min(0).max(50).nullable().optional()
  })
  .strict();

const toApiGoal = (g: any) => ({
  id: g.id,
  spaceId: g.spaceId ?? 'personal',
  name: g.name,
  targetAmount: Number(g.targetAmount),
  currentAmount: Number(g.currentAmount),
  targetDate: g.targetDate,
  emoji: g.emoji ?? null,
  color: g.color ?? null,
  category: g.category ?? null,
  autoSavePercent: g.autoSavePercent == null ? null : Number(g.autoSavePercent),
  createdAt: iso(g.createdAt),
  updatedAt: iso(g.updatedAt)
});

/** GET/POST /v1/goals */
export async function goalsIndex(ctx: Ctx) {
  if (ctx.method !== 'GET' && ctx.method !== 'POST') methodNotAllowed(['GET', 'POST']);
  const { userId } = await requireAuth(ctx.req);

  if (ctx.method === 'POST') {
    const input = await body(ctx.req, GoalCreateSchema);
    const [g] = await sql`
      insert into public.goals (user_id, space_id, name, target_amount, current_amount, target_date, emoji, color, category, auto_save_percent)
      values (${userId}, ${input.spaceId ?? 'personal'}, ${input.name}, ${input.targetAmount}, ${input.currentAmount ?? 0},
              ${input.targetDate}::date, ${input.emoji ?? null}, ${input.color ?? null}, ${input.category ?? null}, ${input.autoSavePercent ?? null})
      returning *
    `;
    return json(201, { goal: toApiGoal(g) });
  }

  const space = spaceParam(ctx.query.get('spaceId'));
  const items = await sql`
    select * from public.goals where user_id = ${userId} ${space ? sql`and space_id = ${space}` : sql``}
    order by created_at desc, id desc
  `;
  return json(200, { items: items.map(toApiGoal) });
}

/** GET/PATCH/DELETE /v1/goals/:id */
export async function goalById(ctx: Ctx) {
  if (!['GET', 'PATCH', 'DELETE'].includes(ctx.method)) methodNotAllowed(['GET', 'PATCH', 'DELETE']);
  const { userId } = await requireAuth(ctx.req);
  const id = ctx.parts[1];
  if (!isUuid(id)) notFound('Goal not found');
  const space = spaceParam(ctx.query.get('spaceId'));
  const where = sql`id = ${id} and user_id = ${userId} ${space ? sql`and space_id = ${space}` : sql``}`;

  if (ctx.method === 'DELETE') {
    const removed = await sql`delete from public.goals where ${where} returning id`;
    if (!removed.length) notFound('Goal not found');
    return noContent();
  }

  const [current] = await sql`select * from public.goals where ${where}`;
  if (!current) notFound('Goal not found');
  if (ctx.method === 'GET') return json(200, { goal: toApiGoal(current) });

  const patch = await body(ctx.req, GoalPatchSchema);
  const pick = <K extends keyof typeof patch>(k: K, fallback: unknown) => (patch[k] !== undefined ? patch[k] : fallback);
  const [g] = await sql`
    update public.goals set
      name = ${pick('name', current.name) as string},
      target_amount = ${pick('targetAmount', current.targetAmount) as number},
      current_amount = ${pick('currentAmount', current.currentAmount) as number},
      target_date = ${pick('targetDate', current.targetDate) as string}::date,
      emoji = ${pick('emoji', current.emoji) as string | null},
      color = ${pick('color', current.color) as string | null},
      category = ${pick('category', current.category) as string | null},
      auto_save_percent = ${pick('autoSavePercent', current.autoSavePercent) as number | null}
    where ${where}
    returning *
  `;
  return json(200, { goal: toApiGoal(g) });
}

/* ------------------------------------------------------------------ recurring */

const RecurringFields = {
  type: z.enum(['income', 'expense']),
  amount: z.number().finite().positive(),
  category: z.string().min(1).max(60),
  description: z.string().max(120),
  frequency: z.enum(['weekly', 'monthly', 'yearly']),
  endDate: z.string().regex(ISO_DATE).nullable(),
  autoCreate: z.boolean(),
  remindDaysBefore: z.number().int().min(0).max(14),
  budgetCategory: z.string().max(60).nullable(),
  paused: z.boolean()
};

const RecurringCreateSchema = z.object({
  ...RecurringFields,
  description: RecurringFields.description.optional().default(''),
  endDate: RecurringFields.endDate.optional(),
  autoCreate: RecurringFields.autoCreate.optional().default(true),
  remindDaysBefore: RecurringFields.remindDaysBefore.optional().default(1),
  budgetCategory: RecurringFields.budgetCategory.optional(),
  paused: RecurringFields.paused.optional().default(false),
  /** First due date. */
  startDate: z.string().regex(ISO_DATE),
  spaceId: z.enum(['personal', 'business']).optional()
});

const RecurringPatchSchema = z
  .object({
    type: RecurringFields.type.optional(),
    amount: RecurringFields.amount.optional(),
    category: RecurringFields.category.optional(),
    description: RecurringFields.description.optional(),
    frequency: RecurringFields.frequency.optional(),
    endDate: RecurringFields.endDate.optional(),
    autoCreate: RecurringFields.autoCreate.optional(),
    remindDaysBefore: RecurringFields.remindDaysBefore.optional(),
    budgetCategory: RecurringFields.budgetCategory.optional(),
    paused: RecurringFields.paused.optional(),
    nextDueDate: z.string().regex(ISO_DATE).optional()
  })
  .strict();

/** GET/POST /v1/recurring */
export async function recurringIndex(ctx: Ctx) {
  if (ctx.method !== 'GET' && ctx.method !== 'POST') methodNotAllowed(['GET', 'POST']);
  const { userId } = await requireAuth(ctx.req);

  if (ctx.method === 'GET') {
    const space = spaceParam(ctx.query.get('spaceId'));
    const items = await sql<RecurringRow[]>`
      select * from public.recurring where user_id = ${userId} ${space ? sql`and space_id = ${space}` : sql``}
      order by paused asc, next_due_date asc
    `;
    return json(200, { items: items.map(toApiRecurring) });
  }

  const input = await body(ctx.req, RecurringCreateSchema);
  if (input.endDate && input.endDate < input.startDate) badRequest('The end date must be after the first due date');
  const [rec] = await sql<RecurringRow[]>`
    insert into public.recurring
      (user_id, space_id, type, amount, category, description, frequency, anchor_day, next_due_date, end_date,
       auto_create, remind_days_before, budget_category, paused)
    values (${userId}, ${input.spaceId ?? 'personal'}, ${input.type}, ${input.amount}, ${input.category}, ${input.description},
            ${input.frequency}, ${parseIsoDateUtcNoon(input.startDate).getUTCDate()}, ${input.startDate}::date, ${input.endDate ?? null}::date,
            ${input.autoCreate}, ${input.remindDaysBefore}, ${input.budgetCategory ?? null}, ${input.paused})
    returning *
  `;
  // A schedule that starts today (or in the past) records its due occurrences immediately.
  const created = await materializeDue(rec, todayIso());
  const [saved] = await sql<RecurringRow[]>`select * from public.recurring where id = ${rec.id}`;
  return json(201, { recurring: toApiRecurring(saved ?? rec), created });
}

/** PATCH/DELETE /v1/recurring/:id, POST /v1/recurring/run */
export async function recurringById(ctx: Ctx) {
  const { userId } = await requireAuth(ctx.req);
  const id = ctx.parts[1];

  if (id === 'run') {
    if (ctx.method !== 'POST') methodNotAllowed(['POST']);
    return json(200, { created: await runRecurringForUser(userId, todayIso()) });
  }

  if (!isUuid(id)) notFound('Recurring item not found');
  const [existing] = await sql<RecurringRow[]>`select * from public.recurring where id = ${id} and user_id = ${userId}`;
  if (!existing) notFound('Recurring item not found');

  if (ctx.method === 'DELETE') {
    await sql`delete from public.recurring where id = ${id} and user_id = ${userId}`;
    return noContent();
  }
  if (ctx.method !== 'PATCH') methodNotAllowed(['PATCH', 'DELETE']);

  const p = await body(ctx.req, RecurringPatchSchema);
  const v = <T>(value: T | undefined, fallback: T) => (value !== undefined ? value : fallback);
  const nextDue = p.nextDueDate ?? existing.nextDueDate;
  await sql`
    update public.recurring set
      type = ${v(p.type, existing.type)},
      amount = ${v(p.amount, existing.amount)},
      category = ${v(p.category, existing.category)},
      description = ${v(p.description, existing.description)},
      frequency = ${v(p.frequency, existing.frequency)},
      end_date = ${v(p.endDate, existing.endDate)}::date,
      auto_create = ${v(p.autoCreate, existing.autoCreate)},
      remind_days_before = ${v(p.remindDaysBefore, existing.remindDaysBefore)},
      budget_category = ${v(p.budgetCategory, existing.budgetCategory)},
      paused = ${v(p.paused, existing.paused)},
      next_due_date = ${nextDue}::date,
      anchor_day = ${p.nextDueDate ? parseIsoDateUtcNoon(p.nextDueDate).getUTCDate() : existing.anchorDay},
      last_reminded_for = ${p.nextDueDate ? null : existing.lastRemindedFor}::date
    where id = ${id} and user_id = ${userId}
  `;
  const [updated] = await sql<RecurringRow[]>`select * from public.recurring where id = ${id}`;
  const created = await materializeDue(updated, todayIso());
  const [latest] = await sql<RecurringRow[]>`select * from public.recurring where id = ${id}`;
  return json(200, { recurring: toApiRecurring(latest ?? updated), created });
}

/* ------------------------------------------------------------------ tax */

/** POST /v1/tax/calc */
export async function taxCalc(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const input = (await ctx.req.json().catch(() => ({}))) as any;
  const country = String(input.country ?? '');
  const grossAnnual = Number(input.grossAnnual ?? input.gross ?? 0);
  if (!country) badRequest('Missing country');
  if (!grossAnnual || Number.isNaN(grossAnnual)) badRequest('Missing grossAnnual');

  const rule = loadRuleForCountry(country);
  if (!rule) notFound('Tax rules not found for country');
  const computed = computeTax(rule, { grossAnnual, deductions: input.deductions ?? {}, allowances: input.allowances ?? {} });
  return json(200, {
    result: {
      grossAnnual: computed.grossAnnual,
      taxableIncome: computed.taxableIncome,
      totalTax: computed.totalTaxAnnual,
      netAnnual: computed.netAnnual,
      netMonthly: computed.netMonthly,
      ruleVersion: computed.ruleVersion,
      minimumTaxApplied: computed.minimumTaxApplied,
      minimumTaxAnnual: computed.minimumTaxAnnual,
      bands: (computed.taxByBracket || []).map((b) => ({ from: b.from, to: b.to, rate: b.rate, taxable: b.taxable, amount: Math.round((b.tax ?? 0) * 100) / 100 }))
    }
  });
}

/** GET /v1/tax/rules?country= */
export function taxRules(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const country = (ctx.query.get('country') ?? '').toLowerCase();
  if (!country) badRequest('Missing country');
  const rule = loadRuleForCountry(country);
  if (!rule) throw new HttpError(404, 'NOT_FOUND', 'Tax rules not found');
  return json(200, { meta: { country: rule.country, version: rule.version, effectiveDate: rule.effectiveDate, notes: rule.notes }, rule });
}
