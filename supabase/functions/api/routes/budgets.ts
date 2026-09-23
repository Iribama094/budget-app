import { iso, isUniqueViolation, isUuid, sql } from '../lib/db.ts';
import { requireAuth } from '../lib/auth.ts';
import { badRequest, body, HttpError, json, methodNotAllowed, noContent, notFound, spaceParam, z } from '../lib/http.ts';
import { addDaysIso, budgetBounds, effectiveEndIso, formatIsoDateUtc, ISO_DATE, parseIsoDateUtcNoon, todayIso } from '../lib/dates.ts';
import {
  budgetLabel,
  budgetMemberIds,
  carryMembers,
  findOwnBudget,
  findVisibleBudget,
  selectBudgets,
  toApiBudget,
  type BudgetPurpose,
  type BudgetRow
} from '../lib/budgets.ts';
import { currencyFor, formatMoney, notifyUser } from '../lib/notify.ts';
import { loadPlan, periodCategories } from '../lib/plan.ts';
import { enforceRateLimit } from '../lib/rateLimit.ts';
import { voice } from '../lib/voice.ts';
import { withQuote } from '../lib/quotes.ts';
import type { Ctx } from '../index.ts';

const CategoriesSchema = z.record(z.string().min(1).max(60), z.object({ budgeted: z.number().finite().nonnegative() }).passthrough());
const PurposeSchema = z.enum(['personal', 'household', 'event']);

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  totalBudget: z.number().finite().nonnegative(),
  period: z.enum(['monthly', 'weekly']),
  startDate: z.string().regex(ISO_DATE),
  endDate: z.string().regex(ISO_DATE).optional(),
  categories: CategoriesSchema,
  spaceId: z.enum(['personal', 'business']).optional(),
  purpose: PurposeSchema.optional()
});

const PatchSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    totalBudget: z.number().finite().nonnegative().optional(),
    period: z.enum(['monthly', 'weekly']).optional(),
    startDate: z.string().regex(ISO_DATE).optional(),
    endDate: z.string().regex(ISO_DATE).optional(),
    categories: CategoriesSchema.optional(),
    purpose: PurposeSchema.optional()
  })
  .strict();

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Business budgets are always the business's own plan; sharing and one-off budgets live in Personal. */
const purposeFor = (space: string, requested: BudgetPurpose | undefined | null): BudgetPurpose => (space === 'business' ? 'personal' : requested ?? 'personal');

/** One own plan and one household budget can cover a day per space. Events (weddings, trips) can overlap anything. */
async function assertNoOverlap(userId: string, space: string, purpose: BudgetPurpose, start: string, end: string, exceptId?: string) {
  if (purpose === 'event') return;
  const [clash] = await sql`
    select id from public.budgets
    where user_id = ${userId} and space_id = ${space} and purpose = ${purpose} ${exceptId ? sql`and id <> ${exceptId}` : sql``}
      and start_date <= ${end}::date
      and coalesce(end_date, case when period = 'weekly' then start_date + 6
                                  else (date_trunc('month', start_date) + interval '1 month - 1 day')::date end) >= ${start}::date
    limit 1
  `;
  if (clash) badRequest(purpose === 'household' ? 'A shared budget already covers those dates' : 'Budget dates overlap an existing budget');
}

/** Tells people who were carried into a new household budget that it's ready. */
async function announceNextPeriod(memberIds: string[], b: { id: string; name: string }) {
  for (const id of memberIds) {
    const note = await withQuote(id, voice.nextPeriodReady(budgetLabel(b.name)), ['planning'], b.id);
    await notifyUser(id, { kind: 'shared', ...note, spaceId: 'personal', data: { screen: 'BudgetDetail', budgetId: b.id } }).catch(() => undefined);
  }
}

/** GET/POST /v1/budgets */
export async function budgetsIndex(ctx: Ctx) {
  if (ctx.method !== 'GET' && ctx.method !== 'POST') methodNotAllowed(['GET', 'POST']);
  const { userId } = await requireAuth(ctx.req);

  if (ctx.method === 'POST') {
    const input = await body(ctx.req, CreateSchema);
    const space = input.spaceId ?? 'personal';
    const purpose = purposeFor(space, input.purpose);
    const end = effectiveEndIso({ startDate: input.startDate, endDate: input.endDate ?? null, period: input.period });
    if (input.startDate > end) badRequest('Invalid budget date range');
    await assertNoOverlap(userId, space, purpose, input.startDate, end);

    const [row] = await sql`
      insert into public.budgets (user_id, space_id, name, total_budget, period, start_date, end_date, categories, purpose)
      values (${userId}, ${space}, ${input.name}, ${input.totalBudget}, ${input.period}, ${input.startDate}::date,
              ${input.endDate ?? null}::date, ${sql.json(input.categories as any)}, ${purpose})
      returning id
    `;
    // A new household budget keeps the people from the last one.
    if (purpose === 'household') await announceNextPeriod(await carryMembers(userId, row.id), { id: row.id, name: input.name });
    const b = await findOwnBudget(userId, row.id);
    return json(201, { budget: toApiBudget(b!, userId) });
  }

  const space = spaceParam(ctx.query.get('spaceId'));
  const start = ctx.query.get('start');
  const end = ctx.query.get('end');
  const own = sql`(b.user_id = ${userId} ${space ? sql`and b.space_id = ${space}` : sql``})`;
  // Household budgets shared with this user live in their personal space.
  const shared = space === 'business' ? sql`false` : sql`exists (select 1 from public.budget_members m where m.budget_id = b.id and m.user_id = ${userId})`;
  const range = sql`${start && ISO_DATE.test(start) ? sql`and b.start_date >= ${start}::date` : sql``} ${end && ISO_DATE.test(end) ? sql`and b.start_date <= ${end}::date` : sql``}`;
  const items = await selectBudgets(sql`(${own} or ${shared}) ${range}`);
  return json(200, { items: items.map((b) => toApiBudget(b, userId)) });
}

/** GET/PATCH/DELETE /v1/budgets/:id: members can read a shared budget; only the owner can change or delete it. */
export async function budgetById(ctx: Ctx) {
  if (!['GET', 'PATCH', 'DELETE'].includes(ctx.method)) methodNotAllowed(['GET', 'PATCH', 'DELETE']);
  const { userId } = await requireAuth(ctx.req);
  const id = ctx.parts[1];
  const space = spaceParam(ctx.query.get('spaceId'));

  if (ctx.method === 'GET') {
    const b = (await findOwnBudget(userId, id, space)) ?? (await findVisibleBudget(userId, id));
    if (!b) notFound('Budget not found');
    return json(200, { budget: toApiBudget(b, userId) });
  }

  if (!isUuid(id)) notFound('Budget not found');

  if (ctx.method === 'DELETE') {
    const removed = await sql`delete from public.budgets where id = ${id} and user_id = ${userId} ${space ? sql`and space_id = ${space}` : sql``} returning id`;
    if (!removed.length) notFound('Budget not found');
    return noContent();
  }

  const patch = await body(ctx.req, PatchSchema);
  const current = await findOwnBudget(userId, id, space);
  if (!current) notFound('Budget not found');

  let purpose = purposeFor(current.spaceId, patch.purpose ?? current.purpose);
  // People are still in it, so it stays shared.
  if (purpose === 'personal' && current.members.length) purpose = 'household';

  const next = {
    startDate: patch.startDate ?? current.startDate,
    period: patch.period ?? current.period,
    endDate: patch.endDate ?? current.endDate ?? null
  };
  const nextEnd = effectiveEndIso(next);
  if (next.startDate > nextEnd) badRequest('Invalid budget date range');
  await assertNoOverlap(userId, current.spaceId, purpose, next.startDate, nextEnd, id);

  await sql`
    update public.budgets set
      name = ${patch.name ?? current.name},
      total_budget = ${patch.totalBudget ?? current.totalBudget},
      period = ${next.period},
      start_date = ${next.startDate}::date,
      end_date = ${next.endDate}::date,
      categories = ${sql.json((patch.categories ?? current.categories) as any)},
      purpose = ${purpose}
    where id = ${id} and user_id = ${userId}
  `;
  const b = await findOwnBudget(userId, id);
  return json(200, { budget: toApiBudget(b!, userId) });
}

/* ------------------------------------------------------------ next period */

function addMonthsIso(isoDate: string, months: number): string {
  const d = parseIsoDateUtcNoon(isoDate);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 12));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return formatIsoDateUtc(target);
}

/** The period straight after a budget: whole months stay whole months (payday to payday too); anything else keeps its length. */
export function nextPeriodDates(b: { startDate: string; endDate?: string | null; period: string }): { start: string; end: string } {
  const end = effectiveEndIso(b);
  const nextStart = addDaysIso(end, 1);
  const s = parseIsoDateUtcNoon(b.startDate);
  const n = parseIsoDateUtcNoon(nextStart);
  const months = (n.getUTCFullYear() - s.getUTCFullYear()) * 12 + (n.getUTCMonth() - s.getUTCMonth());
  if (months >= 1 && n.getUTCDate() === s.getUTCDate()) return { start: nextStart, end: addDaysIso(addMonthsIso(nextStart, months), -1) };
  const days = Math.round((parseIsoDateUtcNoon(end).getTime() - s.getTime()) / 86400000) + 1;
  return { start: nextStart, end: addDaysIso(nextStart, days - 1) };
}

function periodLabel(start: string, end: string): string {
  const s = parseIsoDateUtcNoon(start);
  const e = parseIsoDateUtcNoon(end);
  const wholeMonth = s.getUTCDate() === 1 && addDaysIso(end, 1).endsWith('-01') && s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  if (wholeMonth) return `${MONTHS[s.getUTCMonth()]} ${s.getUTCFullYear()}`;
  return `${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]} – ${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]}`;
}

/**
 * POST /v1/budgets/:id/next: start the next period with the same plan, and for a shared budget the same people.
 * Owner only. If the next one already exists it is returned instead of creating another.
 */
export async function nextPeriod(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { userId } = await requireAuth(ctx.req);
  const b = await findVisibleBudget(userId, ctx.parts[1]);
  if (!b) notFound('Budget not found');
  if (b.userId !== userId) throw new HttpError(403, 'FORBIDDEN', 'Only the person who created this budget can start the next one.');
  const purpose = b.purpose ?? 'personal';
  if (purpose === 'event') badRequest('One-off budgets don’t repeat. Create a new one instead.');

  const dates = nextPeriodDates(b);
  const [existing] = await sql`
    select id from public.budgets
    where user_id = ${userId} and space_id = ${b.spaceId} and purpose = ${purpose} and start_date > ${b.startDate}::date
    order by start_date asc limit 1
  `;
  if (existing) {
    const found = await findOwnBudget(userId, existing.id);
    return json(200, { budget: toApiBudget(found!, userId), existed: true });
  }
  await assertNoOverlap(userId, b.spaceId, purpose, dates.start, dates.end);

  let categories: Record<string, { budgeted: number }> = Object.fromEntries(
    Object.entries(b.categories ?? {}).map(([k, c]) => [k, { budgeted: Number(c?.budgeted) || 0 }])
  );
  let total = Number(b.totalBudget);
  // A starter budget only held what was left when they joined, so the first full period comes from their plan.
  if (b.trackingStart) {
    const plan = await loadPlan(userId);
    if (plan.monthlyIncome > 0) {
      categories = periodCategories(plan.split, diffIsoDays(dates.start, dates.end) + 1);
      total = Object.values(categories).reduce((s, c) => s + c.budgeted, 0);
    }
  }
  // Keep up with prices: needs that cost more than planned last time get what they really cost, and wants give way.
  // The total stays the same, so the plan never pretends there's more money than there is.
  let keptUp: { from: number; to: number } | null = null;
  if (!b.trackingStart && categories.Needs && categories.Wants) {
    const { buckets } = await unspentByBucket(b);
    const needs = buckets.find((x) => x.bucket === 'Needs');
    const room = categories.Wants.budgeted;
    if (needs && needs.spent > needs.budgeted && room > 0) {
      const raise = Math.min(room, Math.ceil((needs.spent - needs.budgeted) / 500) * 500);
      keptUp = { from: categories.Needs.budgeted, to: categories.Needs.budgeted + raise };
      categories = { ...categories, Needs: { budgeted: keptUp.to }, Wants: { budgeted: room - raise } };
    }
  }
  const name = /^My Budget \(.*\)$/.test(b.name) ? `My Budget (${periodLabel(dates.start, dates.end)})` : b.name;
  const [row] = await sql`
    insert into public.budgets (user_id, space_id, name, total_budget, period, start_date, end_date, categories, purpose)
    values (${userId}, ${b.spaceId}, ${name}, ${total}, ${b.period}, ${dates.start}::date, ${dates.end}::date, ${sql.json(categories)}, ${purpose})
    returning id
  `;
  if (purpose === 'household') await announceNextPeriod(await carryMembers(userId, row.id, b.id), { id: row.id, name });
  const created = await findOwnBudget(userId, row.id);
  return json(201, { budget: toApiBudget(created!, userId), existed: false, keptUp });
}

/* ------------------------------------------------------------ mini budgets */

const MiniSchema = z.object({ name: z.string().min(1).max(80), amount: z.number().finite().nonnegative(), category: z.string().min(1).max(60).optional() });

const toApiMini = (m: any) => ({
  id: m.id,
  budgetId: m.budgetId,
  name: m.name,
  amount: Number(m.amount),
  category: m.category ?? null,
  createdAt: iso(m.createdAt),
  updatedAt: iso(m.updatedAt)
});

/** GET/POST /v1/budgets/:id/mini-budgets */
export async function miniBudgets(ctx: Ctx) {
  if (ctx.method !== 'GET' && ctx.method !== 'POST') methodNotAllowed(['GET', 'POST']);
  const { userId } = await requireAuth(ctx.req);
  const budgetId = ctx.parts[1];
  const parent = await findOwnBudget(userId, budgetId, spaceParam(ctx.query.get('spaceId')));
  if (!parent) notFound('Budget not found');

  if (ctx.method === 'POST') {
    const input = await body(ctx.req, MiniSchema);
    const [m] = await sql`
      insert into public.mini_budgets (user_id, budget_id, name, amount, category)
      values (${userId}, ${budgetId}, ${input.name}, ${input.amount}, ${input.category ?? null})
      returning *
    `;
    return json(201, { miniBudget: toApiMini(m) });
  }

  const items = await sql`select * from public.mini_budgets where user_id = ${userId} and budget_id = ${budgetId} order by created_at desc, id desc`;
  return json(200, { items: items.map(toApiMini) });
}

/* ------------------------------------------------------------ rollover */

async function unspentByBucket(b: BudgetRow) {
  const { start, end } = budgetBounds(b);
  const rows = await sql<{ bucket: string | null; total: number }[]>`
    select budget_category as bucket, sum(amount) as total from public.transactions
    where user_id in ${sql(budgetMemberIds(b))} and budget_id = ${b.id} and type = 'expense'
      and occurred_at >= ${start} and occurred_at <= ${end}
    group by budget_category
  `;
  const spentBy = new Map(rows.map((r) => [r.bucket ?? '', Number(r.total)]));
  const totalSpent = rows.reduce((s, r) => s + Number(r.total), 0);
  const categories = Object.entries(b.categories ?? {});
  const buckets = categories.map(([bucket, c]) => {
    const budgeted = Number(c?.budgeted) || 0;
    const spent = spentBy.get(bucket) ?? 0;
    return { bucket, budgeted, spent, unspent: Math.max(0, budgeted - spent) };
  });
  // Unassigned spending (no bucket) still eats into what's left overall.
  const bucketUnspent = buckets.reduce((s, x) => s + x.unspent, 0);
  const overall = Math.max(0, Number(b.totalBudget) - totalSpent);
  const unspent = Math.round(categories.length ? Math.min(bucketUnspent, overall) : overall);
  return { buckets, totalSpent, unspent };
}

const diffIsoDays = (from: string, to: string) => Math.round((parseIsoDateUtcNoon(to).getTime() - parseIsoDateUtcNoon(from).getTime()) / 86400000);

/**
 * GET /v1/budgets/:id/pace: what's safe to spend each day for the rest of this budget. Money still meant for
 * Savings, and bills due before the budget ends, are held back so the daily figure is money that's truly free.
 */
export async function budgetPace(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const { userId } = await requireAuth(ctx.req);
  const b = await findVisibleBudget(userId, ctx.parts[1]);
  if (!b) notFound('Budget not found');
  return json(200, await paceFor(b));
}

/** The pace figures for one budget. Shared by the pace endpoint and the weekly summary so both say the same. */
export async function paceFor(b: NonNullable<Awaited<ReturnType<typeof findVisibleBudget>>>) {
  const today = todayIso();
  const end = effectiveEndIso(b);
  const { buckets, totalSpent } = await unspentByBucket(b);
  const left = Number(b.totalBudget) - totalSpent;
  const savingsLeft = Math.round(buckets.find((x) => x.bucket === 'Savings')?.unspent ?? 0);
  // Bills are one person's own commitments, so they're held back from their own budget but not a household's.
  const bills =
    (b.purpose ?? 'personal') === 'personal' && today <= end
      ? await sql<{ name: string; amount: number; dueDate: string }[]>`
          select coalesce(nullif(description, ''), category) as name, amount, next_due_date as due_date
          from public.recurring
          where user_id = ${b.userId} and space_id = ${b.spaceId} and type = 'expense' and not paused
            and next_due_date >= ${today}::date and next_due_date <= ${end}::date
            and coalesce(budget_category, '') <> 'Savings'
          order by next_due_date asc
        `
      : [];
  const billsTotal = Math.round(bills.reduce((s, x) => s + Number(x.amount), 0));
  const daysLeft = today > end ? 0 : diffIsoDays(today, end) + 1;
  const safeToSpend = Math.max(0, Math.round(left - savingsLeft - billsTotal));

  return {
    left: Math.round(left),
    spent: Math.round(totalSpent),
    savingsLeft,
    billsTotal,
    bills: bills.map((x) => ({ name: x.name, amount: Number(x.amount), dueDate: x.dueDate })),
    daysLeft,
    safeToSpend,
    safePerDay: daysLeft > 0 ? Math.floor(safeToSpend / daysLeft) : 0,
    trackingStart: b.trackingStart ?? null
  };
}

const RolloverSchema = z.discriminatedUnion('destination', [
  z.object({ destination: z.literal('goal'), goalId: z.string().min(1).max(120) }),
  z.object({ destination: z.literal('next-budget') })
]);

/**
 * GET  /v1/budgets/:id/rollover   what's left in an ended budget and where it can go
 * POST /v1/budgets/:id/rollover   move it into a goal or next budget's Savings bucket (once)
 */
export async function rollover(ctx: Ctx) {
  if (ctx.method !== 'GET' && ctx.method !== 'POST') methodNotAllowed(['GET', 'POST']);
  const { userId } = await requireAuth(ctx.req);
  const b = await findOwnBudget(userId, ctx.parts[1]);
  if (!b) notFound('Budget not found');

  const endIso = effectiveEndIso(b);
  const ended = todayIso() > endIso;
  const { buckets, totalSpent, unspent } = await unspentByBucket(b);
  // Leftovers go to the next budget of the same kind: plan to plan, household to household.
  const [nextBudget] = await sql`
    select id, name, start_date from public.budgets
    where user_id = ${userId} and space_id = ${b.spaceId} and purpose = ${b.purpose ?? 'personal'} and start_date > ${endIso}::date
    order by start_date asc limit 1
  `;

  if (ctx.method === 'GET') {
    const goals = await sql`select * from public.goals where user_id = ${userId} and space_id = ${b.spaceId} order by target_date asc`;
    return json(200, {
      eligible: ended && !b.rollover && unspent > 0,
      ended,
      rollover: b.rollover ? { ...b.rollover, amount: Number(b.rollover.amount), at: iso(b.rollover.at) } : null,
      totalSpent,
      unspent,
      buckets,
      goals: goals
        .filter((g) => Number(g.currentAmount) < Number(g.targetAmount))
        .map((g) => ({ id: g.id, name: g.name, emoji: g.emoji ?? null, remaining: Math.max(0, Number(g.targetAmount) - Number(g.currentAmount)) })),
      nextBudget: nextBudget ? { id: nextBudget.id, name: nextBudget.name, startDate: nextBudget.startDate } : null
    });
  }

  const input = await body(ctx.req, RolloverSchema, 'Choose a goal or next budget');
  if (!ended) badRequest('You can move leftover money once this budget has ended.', 'NOT_ENDED');
  if (unspent <= 0) badRequest('Nothing was left unspent in this budget.', 'NOTHING_LEFT');
  if (input.destination === 'next-budget' && !nextBudget) badRequest('Create next month’s budget first, then move the money into it.', 'NO_NEXT_BUDGET');

  let goalName = '';
  if (input.destination === 'goal') {
    const [goal] = isUuid(input.goalId) ? await sql`select name from public.goals where id = ${input.goalId} and user_id = ${userId}` : [];
    if (!goal) notFound('Goal not found');
    goalName = goal.name;
  }

  const record = {
    destination: input.destination,
    amount: unspent,
    goalId: input.destination === 'goal' ? input.goalId : null,
    budgetId: input.destination === 'next-budget' ? nextBudget!.id : null,
    at: new Date().toISOString()
  };
  // Claim first so a double tap can't roll the same money over twice.
  const claim = await sql`update public.budgets set rollover = ${sql.json(record)} where id = ${b.id} and user_id = ${userId} and rollover is null returning id`;
  if (!claim.length) throw new HttpError(409, 'ALREADY_ROLLED_OVER', 'Leftover money from this budget has already been moved.');

  if (input.destination === 'goal') {
    await sql`update public.goals set current_amount = current_amount + ${unspent} where id = ${input.goalId} and user_id = ${userId}`;
    await sql`insert into public.goal_contributions (user_id, goal_id, amount, source, budget_id) values (${userId}, ${input.goalId}, ${unspent}, 'rollover', ${b.id})`;
  } else {
    await sql`
      update public.budgets set
        total_budget = total_budget + ${unspent},
        categories = jsonb_set(categories, '{Savings}', coalesce(categories -> 'Savings', '{}'::jsonb)
          || jsonb_build_object('budgeted', coalesce((categories -> 'Savings' ->> 'budgeted')::numeric, 0) + ${unspent}))
      where id = ${nextBudget!.id} and user_id = ${userId}
    `;
  }

  const currency = await currencyFor(userId);
  const saved = voice.rollover(formatMoney(unspent, currency), budgetLabel(b.name), input.destination === 'goal' ? goalName : `Savings in ${budgetLabel(nextBudget!.name)}`);
  await notifyUser(userId, {
    kind: 'rollover',
    ...(await withQuote(userId, saved, ['saving', 'patience'], b.id)),
    data: input.destination === 'goal' ? { screen: 'GoalDetail', goalId: input.goalId } : { screen: 'BudgetDetail', budgetId: nextBudget!.id }
  }).catch(() => undefined);

  return json(200, { moved: unspent, destination: input.destination });
}

/* ------------------------------------------------------------ sharing */

// No 0/O or 1/I so codes are easy to read out loud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_TTL_DAYS = 7;
const MAX_MEMBERS = 6;

function newInviteCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}

const shortName = (p: { name?: string | null; email?: string | null } | undefined) =>
  (p?.name ?? '').trim().split(/\s+/)[0] || (p?.email ?? '').split('@')[0] || 'Someone';

/**
 * GET    /v1/budgets/:id/members             owner + members
 * DELETE /v1/budgets/:id/members/:userId     owner removes someone, or a member leaves
 * POST   /v1/budgets/:id/invites             owner creates a join code
 */
export async function sharing(ctx: Ctx) {
  const { userId } = await requireAuth(ctx.req);
  const action = ctx.parts[2];
  const memberId = ctx.parts[3] ?? null;
  const budget = await findVisibleBudget(userId, ctx.parts[1]);
  if (!budget) notFound('Budget not found');
  const isOwner = budget.userId === userId;
  const label = budgetLabel(budget.name);

  if (action === 'members' && ctx.method === 'GET') {
    const [owner] = await sql`select name, email from public.profiles where id = ${budget.userId}`;
    return json(200, {
      role: isOwner ? 'owner' : 'member',
      purpose: budget.purpose ?? 'personal',
      items: [
        { userId: budget.userId, role: 'owner', name: owner?.name ?? null, email: owner?.email ?? '', joinedAt: iso(budget.createdAt) },
        ...budget.members.map((m) => ({ userId: m.userId, role: 'member', name: m.name ?? null, email: m.email, joinedAt: iso(m.joinedAt) }))
      ]
    });
  }

  if (action === 'members' && ctx.method === 'DELETE' && memberId) {
    if (memberId === budget.userId) badRequest('The owner can’t leave their own budget. Delete it instead.');
    if (!isOwner && memberId !== userId) throw new HttpError(403, 'FORBIDDEN', 'Only the owner can remove other members.');
    const removed = isUuid(memberId) ? await sql`delete from public.budget_members where budget_id = ${budget.id} and user_id = ${memberId} returning user_id` : [];
    if (!removed.length) notFound('Member not found');
    await sql`update public.budgets set updated_at = now() where id = ${budget.id}`;
    if (memberId !== userId) {
      await notifyUser(memberId, { kind: 'shared', title: `You were removed from ${label}`, body: 'You no longer have access to this shared budget.', spaceId: 'personal' }).catch(() => undefined);
    } else {
      // Someone left: tell the owner and everyone still in it.
      const leaver = budget.members.find((m) => m.userId === memberId);
      const stillIn = budgetMemberIds({ userId: budget.userId, members: budget.members.filter((m) => m.userId !== memberId) });
      for (const id of stillIn) {
        await notifyUser(id, { kind: 'shared', ...voice.memberLeft(shortName(leaver), label), spaceId: 'personal', data: { screen: 'BudgetDetail', budgetId: budget.id } }).catch(() => undefined);
      }
    }
    return json(200, { ok: true });
  }

  if (action === 'invites' && ctx.method === 'POST') {
    if (!isOwner) throw new HttpError(403, 'FORBIDDEN', 'Only the owner can invite people.');
    if (budget.spaceId === 'business') badRequest('Business budgets can’t be shared yet.');
    if (budget.members.length >= MAX_MEMBERS) badRequest(`A budget can have up to ${MAX_MEMBERS} members.`);

    // Sharing your own plan turns it into a household budget, which then carries its people into each new period.
    if ((budget.purpose ?? 'personal') === 'personal') {
      await assertNoOverlap(userId, budget.spaceId, 'household', budget.startDate, effectiveEndIso(budget), budget.id);
      await sql`update public.budgets set purpose = 'household' where id = ${budget.id}`;
    }

    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newInviteCode();
      try {
        await sql`insert into public.budget_invites (code, budget_id, invited_by, expires_at) values (${code}, ${budget.id}, ${userId}, ${expiresAt})`;
        return json(201, { code, expiresAt: expiresAt.toISOString() });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw new HttpError(500, 'SERVER_ERROR', 'Could not create an invite code. Try again.');
  }

  methodNotAllowed(['GET', 'POST', 'DELETE']);
}

/** Joins a shared budget with an invite code and tells everyone already in it. Used by the join screen and by setup. */
export async function joinBudgetWithCode(userId: string, rawCode: string): Promise<BudgetRow> {
  const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  await enforceRateLimit({ key: `invite-accept:${userId}`, limit: 10, windowSec: 15 * 60 });

  const [invite] = code ? await sql`select * from public.budget_invites where code = ${code}` : [];
  if (!invite || new Date(invite.expiresAt) <= new Date() || invite.acceptedBy) {
    badRequest('That code has expired or was already used. Ask for a new one.', 'INVALID_CODE');
  }
  const before = await selectBudgets(sql`b.id = ${invite.budgetId}`).then((rows) => rows[0] ?? null);
  if (!before) badRequest('That budget no longer exists.', 'INVALID_CODE');
  if (before.userId === userId) badRequest('This is your own budget.');

  await sql`insert into public.budget_members (budget_id, user_id) values (${before.id}, ${userId}) on conflict do nothing`;
  await sql`update public.budget_invites set accepted_by = ${userId}, accepted_at = now() where code = ${code}`;
  await sql`update public.budgets set updated_at = now(), purpose = case when purpose = 'personal' then 'household' else purpose end where id = ${before.id}`;

  const [me] = await sql`select name, email from public.profiles where id = ${userId}`;
  for (const id of budgetMemberIds(before)) {
    if (id === userId) continue;
    await notifyUser(id, {
      kind: 'shared',
      ...voice.memberJoined(me?.name || me?.email || 'Someone', budgetLabel(before.name)),
      spaceId: 'personal',
      data: { screen: 'BudgetDetail', budgetId: before.id }
    }).catch(() => undefined);
  }

  return (await findVisibleBudget(userId, before.id))!;
}

const AcceptSchema = z.object({ code: z.string().trim().min(4).max(12) });

/** POST /v1/budget-invites/accept: join a household budget with a code. */
export async function acceptInvite(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { userId } = await requireAuth(ctx.req);
  const { code } = await body(ctx.req, AcceptSchema, 'Enter the code you were sent');
  const budget = await joinBudgetWithCode(userId, code);
  return json(200, { budget: toApiBudget(budget, userId) });
}
