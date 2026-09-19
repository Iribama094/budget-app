import { iso, isUuid, sql } from '../lib/db.ts';
import { requireAuth } from '../lib/auth.ts';
import { badRequest, body, json, methodNotAllowed, notFound, z } from '../lib/http.ts';
import { ISO_DATE, todayIso } from '../lib/dates.ts';
import { recordTransaction } from '../lib/business.ts';
import type { Ctx } from '../index.ts';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Money set aside for a goal is recorded twice on purpose: the goal's progress, and a Savings entry in the
 * budget, so the budget shows the money as used and the goal shows it as saved. Nothing is moved by the app.
 */
async function addToGoal(userId: string, goal: any, amount: number, occurredOn: string, clientId: string, recordInBudget: boolean) {
  const remaining = Math.max(0, Number(goal.targetAmount) - Number(goal.currentAmount));
  const move = round2(Math.min(amount, remaining > 0 ? remaining : amount));
  const [updated] = await sql`update public.goals set current_amount = current_amount + ${move} where id = ${goal.id} and user_id = ${userId} returning *`;
  const txId = recordInBudget
    ? await recordTransaction({
        userId,
        space: goal.spaceId ?? 'personal',
        type: 'expense',
        amount: move,
        category: 'Savings',
        bucket: 'Savings',
        description: `Moved to ${goal.name}`,
        occurredOn,
        clientId
      })
    : null;
  return { goal: updated, amount: move, transactionId: txId };
}

const toApiGoalLite = (g: any) => ({ id: g.id, name: g.name, emoji: g.emoji ?? null, targetAmount: Number(g.targetAmount), currentAmount: Number(g.currentAmount) });

/** GET /v1/goal-contributions?status=pending|confirmed */
export async function goalContributionsIndex(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const { userId } = await requireAuth(ctx.req);
  const status = ctx.query.get('status') === 'confirmed' ? 'confirmed' : 'pending';
  const rows = await sql`
    select c.id, c.amount, c.source, c.status, c.created_at, c.goal_id, g.name, g.emoji, g.target_amount, g.current_amount
    from public.goal_contributions c join public.goals g on g.id = c.goal_id
    where c.user_id = ${userId} and c.status = ${status}
      -- An auto-save whose income was deleted no longer needs an answer.
      and not (c.status = 'pending' and c.source = 'autosave' and c.transaction_id is null)
    order by c.created_at desc limit 50
  `;
  return json(200, {
    items: rows.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      source: r.source,
      status: r.status,
      createdAt: iso(r.createdAt),
      goal: { id: r.goalId, name: r.name, emoji: r.emoji ?? null, targetAmount: Number(r.targetAmount), currentAmount: Number(r.currentAmount) }
    }))
  });
}

const ConfirmSchema = z.object({ amount: z.number().positive().max(1e12).optional() });

/** POST /v1/goal-contributions/:id/confirm (I moved it) or /skip (not this time) */
export async function goalContributionAction(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { userId } = await requireAuth(ctx.req);
  const [, id, action] = ctx.parts;
  const [c] = isUuid(id) ? await sql`select * from public.goal_contributions where id = ${id} and user_id = ${userId}` : [];
  if (!c) notFound('Not found');
  if (c.status !== 'pending') badRequest('This one has already been answered.');

  if (action === 'skip') {
    await sql`update public.goal_contributions set status = 'skipped' where id = ${id}`;
    return json(200, { ok: true });
  }
  if (action !== 'confirm') notFound('Route not found');
  const input = await body(ctx.req, ConfirmSchema);
  const [goal] = await sql`select * from public.goals where id = ${c.goalId} and user_id = ${userId}`;
  if (!goal) notFound('Goal not found');
  const result = await addToGoal(userId, goal, input.amount ?? Number(c.amount), todayIso(), `goal-contribution:${id}`, true);
  await sql`
    update public.goal_contributions set status = 'confirmed', confirmed_at = now(), amount = ${result.amount}, savings_transaction_id = ${result.transactionId}
    where id = ${id}
  `;
  return json(200, { goal: toApiGoalLite(result.goal), amount: result.amount, transactionId: result.transactionId });
}

const AddMoneySchema = z.object({
  amount: z.number().positive().max(1e12),
  occurredOn: z.string().regex(ISO_DATE).optional(),
  recordInBudget: z.boolean().default(true),
  clientId: z.string().min(8).max(100).optional()
});

/** POST /v1/goals/:id/contributions — "I put money toward this goal", recorded as a Savings entry too. */
export async function goalAddMoney(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { userId } = await requireAuth(ctx.req);
  const id = ctx.parts[1];
  const [goal] = isUuid(id) ? await sql`select * from public.goals where id = ${id} and user_id = ${userId}` : [];
  if (!goal) notFound('Goal not found');
  const input = await body(ctx.req, AddMoneySchema);
  const [c] = await sql`
    insert into public.goal_contributions (user_id, goal_id, amount, source, status, confirmed_at)
    values (${userId}, ${id}, ${input.amount}, 'manual', 'confirmed', now()) returning id
  `;
  const result = await addToGoal(userId, goal, input.amount, input.occurredOn ?? todayIso(), input.clientId ?? `goal-manual:${c.id}`, input.recordInBudget);
  await sql`update public.goal_contributions set amount = ${result.amount}, savings_transaction_id = ${result.transactionId} where id = ${c.id}`;
  return json(201, { goal: toApiGoalLite(result.goal), amount: result.amount, transactionId: result.transactionId });
}
