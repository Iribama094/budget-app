import { iso, isUniqueViolation, isUuid, sql } from '../lib/db.ts';
import { requireAuth } from '../lib/auth.ts';
import { badRequest, body, HttpError, json, methodNotAllowed, noContent, notFound, spaceParam, z } from '../lib/http.ts';
import { budgetBounds, effectiveEndIso, ISO_DATE, todayIso } from '../lib/dates.ts';
import { budgetLabel, budgetMemberIds, findOwnBudget, findVisibleBudget, selectBudgets, toApiBudget, type BudgetRow } from '../lib/budgets.ts';
import { currencyFor, formatMoney, notifyUser } from '../lib/notify.ts';
import { enforceRateLimit } from '../lib/rateLimit.ts';
import { voice } from '../lib/voice.ts';
import type { Ctx } from '../index.ts';

const CategoriesSchema = z.record(z.string().min(1).max(60), z.object({ budgeted: z.number().finite().nonnegative() }).passthrough());

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  totalBudget: z.number().finite().nonnegative(),
  period: z.enum(['monthly', 'weekly']),
  startDate: z.string().regex(ISO_DATE),
  endDate: z.string().regex(ISO_DATE).optional(),
  categories: CategoriesSchema,
  spaceId: z.enum(['personal', 'business']).optional()
});

const PatchSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    totalBudget: z.number().finite().nonnegative().optional(),
    period: z.enum(['monthly', 'weekly']).optional(),
    startDate: z.string().regex(ISO_DATE).optional(),
    endDate: z.string().regex(ISO_DATE).optional(),
    categories: CategoriesSchema.optional()
  })
  .strict();

/** Only one budget can cover a given day per space. */
async function assertNoOverlap(userId: string, space: string, start: string, end: string, exceptId?: string) {
  const [clash] = await sql`
    select id from public.budgets
    where user_id = ${userId} and space_id = ${space} ${exceptId ? sql`and id <> ${exceptId}` : sql``}
      and start_date <= ${end}::date
      and coalesce(end_date, case when period = 'weekly' then start_date + 6
                                  else (date_trunc('month', start_date) + interval '1 month - 1 day')::date end) >= ${start}::date
    limit 1
  `;
  if (clash) badRequest('Budget dates overlap an existing budget');
}

/** GET/POST /v1/budgets */
export async function budgetsIndex(ctx: Ctx) {
  if (ctx.method !== 'GET' && ctx.method !== 'POST') methodNotAllowed(['GET', 'POST']);
  const { userId } = await requireAuth(ctx.req);

  if (ctx.method === 'POST') {
    const input = await body(ctx.req, CreateSchema);
    const space = input.spaceId ?? 'personal';
    const end = effectiveEndIso({ startDate: input.startDate, endDate: input.endDate ?? null, period: input.period });
    if (input.startDate > end) badRequest('Invalid budget date range');
    await assertNoOverlap(userId, space, input.startDate, end);

    const [row] = await sql`
      insert into public.budgets (user_id, space_id, name, total_budget, period, start_date, end_date, categories)
      values (${userId}, ${space}, ${input.name}, ${input.totalBudget}, ${input.period}, ${input.startDate}::date,
              ${input.endDate ?? null}::date, ${sql.json(input.categories as any)})
      returning id
    `;
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

/** GET/PATCH/DELETE /v1/budgets/:id — members can read a shared budget; only the owner can change or delete it. */
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

  const next = {
    startDate: patch.startDate ?? current.startDate,
    period: patch.period ?? current.period,
    endDate: patch.endDate ?? current.endDate ?? null
  };
  const nextEnd = effectiveEndIso(next);
  if (next.startDate > nextEnd) badRequest('Invalid budget date range');
  await assertNoOverlap(userId, current.spaceId, next.startDate, nextEnd, id);

  await sql`
    update public.budgets set
      name = ${patch.name ?? current.name},
      total_budget = ${patch.totalBudget ?? current.totalBudget},
      period = ${next.period},
      start_date = ${next.startDate}::date,
      end_date = ${next.endDate}::date,
      categories = ${sql.json((patch.categories ?? current.categories) as any)}
    where id = ${id} and user_id = ${userId}
  `;
  const b = await findOwnBudget(userId, id);
  return json(200, { budget: toApiBudget(b!, userId) });
}

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
  const [nextBudget] = await sql`
    select id, name, start_date from public.budgets
    where user_id = ${userId} and space_id = ${b.spaceId} and start_date > ${endIso}::date
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
  await notifyUser(userId, {
    kind: 'rollover',
    ...voice.rollover(formatMoney(unspent, currency), budgetLabel(b.name), input.destination === 'goal' ? goalName : `Savings in ${budgetLabel(nextBudget!.name)}`),
    data: input.destination === 'goal' ? { screen: 'GoalDetail', goalId: input.goalId } : { screen: 'BudgetDetail', budgetId: nextBudget!.id }
  }).catch(() => undefined);

  return json(200, { moved: unspent, destination: input.destination });
}

// No 0/O or 1/I so codes are easy to read out loud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_TTL_DAYS = 7;
const MAX_MEMBERS = 6;

function newInviteCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}

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
      await notifyUser(memberId, { kind: 'shared', title: `You were removed from ${label}`, body: 'You no longer have access to this shared budget.' }).catch(() => undefined);
    }
    return json(200, { ok: true });
  }

  if (action === 'invites' && ctx.method === 'POST') {
    if (!isOwner) throw new HttpError(403, 'FORBIDDEN', 'Only the owner can invite people.');
    if (budget.spaceId === 'business') badRequest('Business budgets can’t be shared yet.');
    if (budget.members.length >= MAX_MEMBERS) badRequest(`A budget can have up to ${MAX_MEMBERS} members.`);

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

const AcceptSchema = z.object({ code: z.string().trim().min(4).max(12) });

/** POST /v1/budget-invites/accept — join a household budget with a code. */
export async function acceptInvite(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { userId } = await requireAuth(ctx.req);
  const { code: raw } = await body(ctx.req, AcceptSchema, 'Enter the code you were sent');
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  await enforceRateLimit({ key: `invite-accept:${userId}`, limit: 10, windowSec: 15 * 60 });

  const [invite] = await sql`select * from public.budget_invites where code = ${code}`;
  if (!invite || new Date(invite.expiresAt) <= new Date() || invite.acceptedBy) {
    badRequest('That code has expired or was already used. Ask for a new one.', 'INVALID_CODE');
  }
  const [budget] = await sql`select id, user_id, name from public.budgets where id = ${invite.budgetId}`;
  if (!budget) badRequest('That budget no longer exists.', 'INVALID_CODE');
  if (budget.userId === userId) badRequest('This is your own budget.');

  await sql`insert into public.budget_members (budget_id, user_id) values (${budget.id}, ${userId}) on conflict do nothing`;
  await sql`update public.budget_invites set accepted_by = ${userId}, accepted_at = now() where code = ${code}`;
  await sql`update public.budgets set updated_at = now() where id = ${budget.id}`;

  const [me] = await sql`select name, email from public.profiles where id = ${userId}`;
  await notifyUser(budget.userId, {
    kind: 'shared',
    ...voice.memberJoined(me?.name || me?.email || 'Someone', budgetLabel(budget.name)),
    data: { screen: 'BudgetDetail', budgetId: budget.id }
  }).catch(() => undefined);

  const updated = await findVisibleBudget(userId, budget.id);
  return json(200, { budget: toApiBudget(updated!, userId) });
}
