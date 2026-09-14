import { iso, isUuid, sql, type Fragment } from './db.ts';
import type { Space } from './http.ts';

export type BudgetRow = {
  id: string;
  userId: string;
  spaceId: Space;
  name: string;
  totalBudget: number;
  period: 'monthly' | 'weekly';
  startDate: string;
  endDate: string | null;
  categories: Record<string, { budgeted: number; [k: string]: unknown }>;
  rollover: { destination: string; amount: number; goalId: string | null; budgetId: string | null; at: string } | null;
  createdAt: Date;
  updatedAt: Date;
  members: { userId: string; role: string; name: string | null; email: string; joinedAt: string }[];
};

/** Budget columns plus household members (excluding the owner). */
const budgetSelect = () => sql`
  select b.*,
    coalesce((
      select jsonb_agg(jsonb_build_object('userId', m.user_id, 'role', m.role, 'name', p.name, 'email', p.email, 'joinedAt', m.joined_at) order by m.joined_at)
      from public.budget_members m join public.profiles p on p.id = m.user_id
      where m.budget_id = b.id
    ), '[]'::jsonb) as members
  from public.budgets b
`;

export function selectBudgets(where: Fragment, order = sql`order by b.start_date desc, b.id desc`) {
  return sql<BudgetRow[]>`${budgetSelect()} where ${where} ${order}`;
}

/** A budget the user owns or has joined as a household member. */
export async function findVisibleBudget(userId: string, budgetId: string): Promise<BudgetRow | null> {
  if (!isUuid(budgetId)) return null;
  const [b] = await selectBudgets(sql`b.id = ${budgetId} and (b.user_id = ${userId} or exists (
    select 1 from public.budget_members m where m.budget_id = b.id and m.user_id = ${userId}))`);
  return b ?? null;
}

export async function findOwnBudget(userId: string, budgetId: string, space?: Space): Promise<BudgetRow | null> {
  if (!isUuid(budgetId)) return null;
  const [b] = await selectBudgets(sql`b.id = ${budgetId} and b.user_id = ${userId} ${space ? sql`and b.space_id = ${space}` : sql``}`);
  return b ?? null;
}

export function budgetMemberIds(b: Pick<BudgetRow, 'userId' | 'members'>): string[] {
  return Array.from(new Set([b.userId, ...(b.members ?? []).map((m) => m.userId)]));
}

export const budgetLabel = (name: string) => name.replace(/^My Budget \((.*)\)$/, '$1');

export function toApiBudget(b: BudgetRow, viewerId: string) {
  const members = b.members ?? [];
  return {
    id: b.id,
    spaceId: b.spaceId ?? 'personal',
    name: b.name,
    totalBudget: Number(b.totalBudget),
    period: b.period,
    startDate: b.startDate,
    endDate: b.endDate ?? null,
    categories: b.categories ?? {},
    ownerId: b.userId,
    role: b.userId === viewerId ? 'owner' : 'member',
    isShared: members.length > 0,
    members: members.map((m) => ({ userId: m.userId, role: m.role, name: m.name ?? null, email: m.email, joinedAt: iso(m.joinedAt) })),
    rollover: b.rollover
      ? { destination: b.rollover.destination, amount: Number(b.rollover.amount), goalId: b.rollover.goalId ?? null, budgetId: b.rollover.budgetId ?? null, at: iso(b.rollover.at) }
      : null,
    createdAt: iso(b.createdAt),
    updatedAt: iso(b.updatedAt)
  };
}

/**
 * Adds `delta` to a budget's total (never below zero) and, when a bucket is given, to that bucket's
 * `budgeted` amount, creating the bucket if needed. `where` restricts which budget may be changed.
 */
export async function bumpBudget(budgetId: string, delta: number, bucket: string | null | undefined, where: Fragment) {
  if (!isUuid(budgetId) || !delta) return;
  if (bucket) {
    await sql`
      update public.budgets b set
        total_budget = greatest(0, b.total_budget + ${delta}),
        categories = jsonb_set(
          b.categories,
          array[${bucket}::text],
          coalesce(b.categories -> ${bucket}::text, '{}'::jsonb)
            || jsonb_build_object('budgeted', coalesce((b.categories -> ${bucket}::text ->> 'budgeted')::numeric, 0) + ${delta})
        )
      where b.id = ${budgetId} and ${where}
    `;
  } else {
    await sql`update public.budgets b set total_budget = greatest(0, b.total_budget + ${delta}) where b.id = ${budgetId} and ${where}`;
  }
}

/** Moves a bucket's `budgeted` amount without touching the total. */
export async function bumpBucket(budgetId: string, bucket: string, delta: number, where: Fragment) {
  if (!isUuid(budgetId) || !delta) return;
  await sql`
    update public.budgets b set categories = jsonb_set(
      b.categories,
      array[${bucket}::text],
      coalesce(b.categories -> ${bucket}::text, '{}'::jsonb)
        || jsonb_build_object('budgeted', coalesce((b.categories -> ${bucket}::text ->> 'budgeted')::numeric, 0) + ${delta})
    )
    where b.id = ${budgetId} and ${where}
  `;
}

/** The most recent own budget in a space that covers a date. */
export async function budgetCovering(userId: string, space: Space, dateIso: string): Promise<string | null> {
  const [b] = await sql`
    select id from public.budgets
    where user_id = ${userId} and space_id = ${space} and start_date <= ${dateIso}::date
      and coalesce(end_date, case when period = 'weekly' then start_date + 6
                                  else (date_trunc('month', start_date) + interval '1 month - 1 day')::date end) >= ${dateIso}::date
    order by start_date desc, id desc
    limit 1
  `;
  return b?.id ?? null;
}
