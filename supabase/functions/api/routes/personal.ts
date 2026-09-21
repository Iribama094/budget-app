import { isUniqueViolation, isUuid, sql } from '../lib/db.ts';
import { requireAuth } from '../lib/auth.ts';
import { badRequest, body, HttpError, json, methodNotAllowed, noContent, notFound, spaceParam, z } from '../lib/http.ts';
import { addDaysIso, effectiveEndIso, ISO_DATE, parseIsoDateUtcNoon, parseQueryDate, todayIso } from '../lib/dates.ts';
import {
  clampedIso,
  computePlan,
  loadPlan,
  payPeriod,
  periodCategories,
  primarySource,
  starterCategories,
  toApiIncomeSource,
  type BillInput,
  type IncomeInput
} from '../lib/plan.ts';
import { defaultBucketFor, ensureCategories, normalizeBucket, suggestCategory, toApiCategory } from '../lib/categories.ts';
import { findOwnBudget, toApiBudget } from '../lib/budgets.ts';
import { joinBudgetWithCode } from './budgets.ts';
import { loadProfile, toApiUser } from './account.ts';
import type { Ctx } from '../index.ts';

const BucketSchema = z.enum(['Needs', 'Wants', 'Savings']);

const IncomeSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(['salary', 'business', 'side_hustle', 'allowance', 'other']).default('other'),
  amount: z.number().finite().nonnegative().max(1e12),
  frequency: z.enum(['daily', 'monthly', 'biweekly', 'weekly', 'irregular']),
  payDay: z.number().int().min(1).max(31).nullable().optional(),
  nextPayDate: z.string().regex(ISO_DATE).nullable().optional(),
  isEstimate: z.boolean().optional()
});

const BillSchema = z.object({
  name: z.string().trim().min(1).max(60),
  category: z.string().trim().min(1).max(60),
  bucket: BucketSchema.nullable().optional(),
  amount: z.number().finite().positive().max(1e12),
  frequency: z.enum(['monthly', 'termly', 'yearly', 'weekly']),
  dueDay: z.number().int().min(1).max(31).nullable().optional()
});

const PainPointsSchema = z.array(z.enum(['runs_out', 'no_idea', 'cant_save', 'debt', 'irregular'])).max(5);

/* ------------------------------------------------------------ income sources */

async function insertIncome(userId: string, i: z.infer<typeof IncomeSchema>) {
  const [row] = await sql`
    insert into public.income_sources (user_id, name, kind, amount, frequency, pay_day, next_pay_date, is_estimate)
    values (${userId}, ${i.name}, ${i.kind}, ${i.amount}, ${i.frequency},
            ${i.frequency === 'monthly' ? i.payDay ?? null : null},
            ${i.frequency === 'weekly' || i.frequency === 'biweekly' ? i.nextPayDate ?? null : null}::date,
            ${i.isEstimate ?? i.frequency === 'irregular'})
    returning *
  `;
  return row;
}

/** GET/POST /v1/income-sources */
export async function incomeSourcesIndex(ctx: Ctx) {
  if (ctx.method !== 'GET' && ctx.method !== 'POST') methodNotAllowed(['GET', 'POST']);
  const { userId } = await requireAuth(ctx.req);
  if (ctx.method === 'POST') {
    const input = await body(ctx.req, IncomeSchema);
    const [{ n }] = await sql`select count(*)::int as n from public.income_sources where user_id = ${userId}`;
    if (n >= 10) badRequest('You can add up to 10 income sources.');
    return json(201, { incomeSource: toApiIncomeSource(await insertIncome(userId, input)) });
  }
  const items = await sql`select * from public.income_sources where user_id = ${userId} order by created_at asc`;
  return json(200, { items: items.map(toApiIncomeSource) });
}

/** PATCH/DELETE /v1/income-sources/:id */
export async function incomeSourceById(ctx: Ctx) {
  if (ctx.method !== 'PATCH' && ctx.method !== 'DELETE') methodNotAllowed(['PATCH', 'DELETE']);
  const { userId } = await requireAuth(ctx.req);
  const id = ctx.parts[1];
  const [existing] = isUuid(id) ? await sql`select * from public.income_sources where id = ${id} and user_id = ${userId}` : [];
  if (!existing) notFound('Income source not found');

  if (ctx.method === 'DELETE') {
    await sql`delete from public.income_sources where id = ${id} and user_id = ${userId}`;
    return noContent();
  }
  const patch = await body(ctx.req, IncomeSchema.partial());
  const frequency = patch.frequency ?? existing.frequency;
  const [row] = await sql`
    update public.income_sources set
      name = ${patch.name ?? existing.name},
      kind = ${patch.kind ?? existing.kind},
      amount = ${patch.amount ?? existing.amount},
      frequency = ${frequency},
      pay_day = ${frequency === 'monthly' ? (patch.payDay !== undefined ? patch.payDay : existing.payDay) : null},
      next_pay_date = ${frequency === 'weekly' || frequency === 'biweekly' ? (patch.nextPayDate !== undefined ? patch.nextPayDate : existing.nextPayDate) : null}::date,
      is_estimate = ${patch.isEstimate ?? existing.isEstimate}
    where id = ${id} and user_id = ${userId}
    returning *
  `;
  return json(200, { incomeSource: toApiIncomeSource(row) });
}

/* ------------------------------------------------------------------ plan */

/** GET /v1/plan — the saved plan with today's pay period. */
export async function getPlan(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const { userId } = await requireAuth(ctx.req);
  return json(200, { plan: await loadPlan(userId) });
}

const PreviewSchema = z.object({
  income: z.array(IncomeSchema).max(10).default([]),
  bills: z.array(BillSchema).max(30).default([]),
  painPoints: PainPointsSchema.default([]),
  budgetPeriod: z.enum(['payday', 'monthly']).default('payday')
});

/** POST /v1/plan/preview — what a plan would look like, without saving anything. */
export async function planPreview(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { userId, email } = await requireAuth(ctx.req);
  const input = await body(ctx.req, PreviewSchema);
  const profile = await loadProfile(userId, email);
  const plan = computePlan({ income: input.income as IncomeInput[], bills: input.bills as BillInput[], painPoints: input.painPoints, currency: profile.currency });
  const primary = primarySource(input.income.map((i) => ({ ...i, payDay: i.payDay ?? null, nextPayDate: i.nextPayDate ?? null })));
  return json(200, { plan: { ...plan, budgetPeriod: input.budgetPeriod, period: payPeriod(primary, input.budgetPeriod) } });
}

/* ------------------------------------------------------------ onboarding */

function firstDueDate(dueDay: number | null | undefined, frequency: 'monthly' | 'termly' | 'yearly' | 'weekly', today: string): string {
  if (frequency === 'weekly') return addDaysIso(today, 7);
  const t = parseIsoDateUtcNoon(today);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  if (dueDay) {
    const thisMonth = clampedIso(y, m, dueDay);
    return thisMonth >= today ? thisMonth : clampedIso(y, m + 1, dueDay);
  }
  // Without a due day: monthly bills start next month; a yearly bill (like rent) a year from now.
  return frequency === 'yearly' ? clampedIso(y + 1, m, 1) : frequency === 'termly' ? clampedIso(y, m + 4, 1) : clampedIso(y, m + 1, 1);
}

const CompleteSchema = z.object({
  painPoints: PainPointsSchema.default([]),
  income: z.array(IncomeSchema).max(10).default([]),
  bills: z.array(BillSchema).max(30).default([]),
  budgetPeriod: z.enum(['payday', 'monthly']).default('payday'),
  createBudget: z.boolean().default(true),
  // solo: my own budget · shared: one budget with other people · both: my own plus a shared one
  mode: z.enum(['solo', 'shared', 'both']).default('solo'),
  inviteCode: z.string().trim().min(4).max(12).optional(),
  // Joined partway through the period: what they have left until payday (or month end). The first budget uses
  // this instead of a full period's income, and the full plan starts with the next period.
  leftUntilPayday: z.number().finite().nonnegative().max(1e12).optional()
});

/**
 * POST /v1/onboarding/complete — saves the answers from the first-run plan: income sources, bills (as bill
 * reminders), what the person wants help with, and creates their first Needs / Wants / Savings budget.
 */
export async function onboardingComplete(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { userId, email } = await requireAuth(ctx.req);
  const input = await body(ctx.req, CompleteSchema);
  const today = todayIso();
  const profile = await loadProfile(userId, email);

  // Join first, so a bad invite code is reported before anything is saved.
  const joined = input.inviteCode ? await joinBudgetWithCode(userId, input.inviteCode) : null;
  const modeChanged = input.mode !== (profile.budgetMode ?? 'solo');

  if (input.income.length) {
    await sql`delete from public.income_sources where user_id = ${userId}`;
    for (const i of input.income) await insertIncome(userId, i);
  }

  const existingBills = await sql`select lower(description) as name from public.recurring where user_id = ${userId} and type = 'expense'`;
  const known = new Set(existingBills.map((b) => b.name));
  for (const b of input.bills) {
    if (known.has(b.name.toLowerCase())) continue;
    const due = firstDueDate(b.dueDay, b.frequency, today);
    await sql`
      insert into public.recurring
        (user_id, space_id, type, amount, category, description, frequency, anchor_day, next_due_date, auto_create, remind_days_before, budget_category)
      values (${userId}, 'personal', 'expense', ${b.amount}, ${b.category}, ${b.name}, ${b.frequency},
              ${parseIsoDateUtcNoon(due).getUTCDate()}, ${due}::date, false, 2,
              ${normalizeBucket(b.bucket) ?? defaultBucketFor(b.category) ?? 'Needs'})
    `;
    known.add(b.name.toLowerCase());
  }

  await sql`
    update public.profiles set
      pain_points = ${input.painPoints},
      budget_period = ${input.budgetPeriod},
      budget_mode = ${input.mode},
      home_budget = ${modeChanged ? (input.mode === 'shared' ? 'shared' : 'own') : profile.homeBudget ?? 'own'},
      currency = coalesce(currency, 'NGN'),
      onboarding_completed_at = now(),
      onboarding_skipped_at = null
    where id = ${userId}
  `;

  const plan = await loadPlan(userId, today);
  if (plan.monthlyIncome > 0) await sql`update public.profiles set monthly_income = ${plan.monthlyIncome} where id = ${userId}`;

  // solo and both get their own plan. shared without a code gets the household budget instead, ready to invite people.
  let ownBudget = null;
  let sharedBudget = joined ? toApiBudget(joined, userId) : null;
  const purpose = input.mode === 'shared' ? (joined ? null : 'household') : 'personal';
  if (input.createBudget && plan.monthlyIncome > 0 && purpose) {
    const { period } = plan;
    const [clash] = await sql`
      select id from public.budgets
      where user_id = ${userId} and space_id = 'personal' and purpose = ${purpose} and start_date <= ${period.end}::date
        and coalesce(end_date, case when period = 'weekly' then start_date + 6
                                    else (date_trunc('month', start_date) + interval '1 month - 1 day')::date end) >= ${period.start}::date
      limit 1
    `;
    if (!clash) {
      // A household budget covers everyone's money, so only someone's own budget starts from what they have left.
      const starter = input.leftUntilPayday !== undefined && purpose === 'personal' && today > period.start;
      const categories = starter ? starterCategories(plan.split, Math.round(input.leftUntilPayday!)) : periodCategories(plan.split, period.days);
      const total = categories.Needs.budgeted + categories.Wants.budgeted + categories.Savings.budgeted;
      const [row] = await sql`
        insert into public.budgets (user_id, space_id, name, total_budget, period, start_date, end_date, categories, purpose, tracking_start)
        values (${userId}, 'personal', ${purpose === 'household' ? 'Household budget' : `My Budget (${period.label})`}, ${total}, 'monthly', ${period.start}::date, ${period.end}::date, ${sql.json(categories)}, ${purpose}, ${starter ? today : null}::date)
        returning id
      `;
      const created = toApiBudget((await findOwnBudget(userId, row.id))!, userId);
      if (purpose === 'household') sharedBudget = created;
      else ownBudget = created;
    }
  }

  return json(200, { user: toApiUser(await loadProfile(userId, email)), plan, budget: ownBudget ?? sharedBudget, ownBudget, sharedBudget });
}

/** POST /v1/onboarding/skip */
export async function onboardingSkip(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { userId, email } = await requireAuth(ctx.req);
  await loadProfile(userId, email);
  await sql`update public.profiles set onboarding_skipped_at = coalesce(onboarding_skipped_at, now()) where id = ${userId}`;
  return json(200, { user: toApiUser(await loadProfile(userId, email)) });
}

/* ------------------------------------------------------------ categories */

const CategoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  type: z.enum(['income', 'expense']),
  bucket: BucketSchema.nullable().optional(),
  icon: z.string().trim().min(1).max(24).optional(),
  spaceId: z.enum(['personal', 'business']).optional()
});

const CategoryPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    bucket: BucketSchema.nullable().optional(),
    icon: z.string().trim().min(1).max(24).optional(),
    hidden: z.boolean().optional(),
    /** With a bucket change: also move this period's spending in the category, so the buckets add up. */
    moveThisPeriod: z.boolean().optional()
  })
  .strict();

/** GET/POST /v1/categories */
export async function categoriesIndex(ctx: Ctx) {
  if (ctx.method !== 'GET' && ctx.method !== 'POST') methodNotAllowed(['GET', 'POST']);
  const { userId } = await requireAuth(ctx.req);

  if (ctx.method === 'POST') {
    const input = await body(ctx.req, CategoryCreateSchema);
    const space = input.spaceId ?? 'personal';
    await ensureCategories(userId, space);
    const [{ n }] = await sql`select count(*)::int as n from public.categories where user_id = ${userId} and space_id = ${space}`;
    if (n >= 150) badRequest('You’ve reached the limit of 150 categories.');
    try {
      const [row] = await sql`
        insert into public.categories (user_id, space_id, name, type, bucket, icon, sort_order)
        values (${userId}, ${space}, ${input.name}, ${input.type}, ${input.type === 'expense' ? input.bucket ?? 'Wants' : null},
                ${input.icon ?? 'tag'}, 1000 + ${n})
        returning *
      `;
      return json(201, { category: toApiCategory(row) });
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'DUPLICATE', 'You already have a category with that name.');
      throw err;
    }
  }

  const space = spaceParam(ctx.query.get('spaceId')) ?? 'personal';
  await ensureCategories(userId, space);
  const items = await sql`
    select * from public.categories where user_id = ${userId} and space_id = ${space}
    order by type desc, sort_order asc, name asc
  `;
  return json(200, { items: items.map(toApiCategory) });
}

/** PATCH/DELETE /v1/categories/:id — renaming also updates past transactions and bills that used the old name. */
export async function categoryById(ctx: Ctx) {
  if (ctx.method !== 'PATCH' && ctx.method !== 'DELETE') methodNotAllowed(['PATCH', 'DELETE']);
  const { userId } = await requireAuth(ctx.req);
  const id = ctx.parts[1];
  const [existing] = isUuid(id) ? await sql`select * from public.categories where id = ${id} and user_id = ${userId}` : [];
  if (!existing) notFound('Category not found');

  if (ctx.method === 'DELETE') {
    await sql`delete from public.categories where id = ${id} and user_id = ${userId}`;
    return noContent();
  }

  const patch = await body(ctx.req, CategoryPatchSchema);
  const name = patch.name ?? existing.name;
  let row;
  try {
    [row] = await sql`
      update public.categories set
        name = ${name},
        bucket = ${existing.type === 'expense' ? (patch.bucket !== undefined ? patch.bucket : existing.bucket) : null},
        icon = ${patch.icon ?? existing.icon},
        hidden = ${patch.hidden ?? existing.hidden}
      where id = ${id} and user_id = ${userId}
      returning *
    `;
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'DUPLICATE', 'You already have a category with that name.');
    throw err;
  }
  if (name !== existing.name) {
    await sql`
      update public.transactions set category = ${name}
      where user_id = ${userId} and space_id = ${existing.spaceId} and type = ${existing.type} and category = ${existing.name}
    `;
    await sql`
      update public.recurring set category = ${name}
      where user_id = ${userId} and space_id = ${existing.spaceId} and type = ${existing.type} and category = ${existing.name}
    `;
    await sql`update public.category_rules set category = ${name} where user_id = ${userId} and type = ${existing.type} and category = ${existing.name}`;
  }

  // Spending already counted against the old bucket moves only when asked; past periods are left as they were.
  let moved = 0;
  if (patch.moveThisPeriod && existing.type === 'expense' && row.bucket && row.bucket !== existing.bucket) {
    const since = await currentPeriodStart(userId, existing.spaceId);
    const rows = await sql`
      update public.transactions set budget_category = ${row.bucket}
      where user_id = ${userId} and space_id = ${existing.spaceId} and type = 'expense' and category = ${name}
        and occurred_at >= ${since}
        and ${existing.bucket ? sql`budget_category = ${existing.bucket}` : sql`budget_category is null`}
      returning id
    `;
    moved = rows.length;
  }
  return json(200, { category: toApiCategory(row), moved });
}

/** Start of the person's running budget in this space, or the 1st of the month when none is running. */
async function currentPeriodStart(userId: string, space: string): Promise<Date> {
  const today = todayIso();
  const rows = await sql<{ startDate: string; endDate: string | null; period: string }[]>`
    select start_date, end_date, period from public.budgets
    where user_id = ${userId} and space_id = ${space} and purpose <> 'event' and start_date <= ${today}::date
    order by start_date desc
    limit 5
  `;
  const running = rows.find((b) => effectiveEndIso(b) >= today);
  return parseQueryDate(running?.startDate ?? `${today.slice(0, 8)}01`, 'start');
}

/** GET /v1/categories/suggest?text=&type=&spaceId= */
export async function categorySuggest(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const { userId } = await requireAuth(ctx.req);
  const text = (ctx.query.get('text') ?? '').slice(0, 120);
  const type = ctx.query.get('type') === 'income' ? 'income' : 'expense';
  const space = spaceParam(ctx.query.get('spaceId')) ?? 'personal';
  if (text.trim().length < 2) return json(200, { suggestion: null });
  return json(200, { suggestion: await suggestCategory(userId, type, space, text) });
}
