import { sql } from './db.ts';
import { budgetBounds, effectiveEndIso, parseIsoDateUtcNoon, todayIso } from './dates.ts';
import { budgetLabel, budgetMemberIds, findVisibleBudget } from './budgets.ts';
import { currencyFor, formatMoney, notifyUser } from './notify.ts';
import { voice } from './voice.ts';
import { loadPlan } from './plan.ts';

const DAY = 24 * 60 * 60;
export const MAX_AUTOSAVE_PERCENT = 50;

export type AutoSaveResult = { goalId: string; name: string; amount: number };

export type CreatedTx = {
  id: string;
  userId: string;
  spaceId: string;
  type: 'income' | 'expense';
  amount: number;
  budgetId: string | null;
  budgetCategory: string | null;
  occurredAt?: Date | string | null;
};

/**
 * After an expense lands in a budget, warn every member when a bucket is spending well ahead of the
 * calendar ("running hot") or has gone over, and when the whole budget is over. Alerts are de-duplicated.
 */
export async function checkBudgetPace(budgetId: string, bucket?: string | null): Promise<void> {
  const [row] = await sql`select user_id from public.budgets where id = ${budgetId}`;
  if (!row) return;
  const b = await findVisibleBudget(row.userId, budgetId);
  if (!b) return;

  const today = todayIso();
  const endIso = effectiveEndIso(b);
  if (today < b.startDate || today > endIso) return;

  const memberIds = budgetMemberIds(b);
  const { start, end } = budgetBounds(b);
  const rows = await sql<{ bucket: string | null; total: number }[]>`
    select budget_category as bucket, sum(amount) as total from public.transactions
    where user_id in ${sql(memberIds)} and budget_id = ${budgetId} and type = 'expense'
      and occurred_at >= ${start} and occurred_at <= ${end}
    group by budget_category
  `;
  const byBucket = new Map(rows.map((r) => [r.bucket ?? '', Number(r.total)]));
  const totalSpent = rows.reduce((s, r) => s + Number(r.total), 0);

  const msDay = DAY * 1000;
  const totalDays = Math.round((parseIsoDateUtcNoon(endIso).getTime() - parseIsoDateUtcNoon(b.startDate).getTime()) / msDay) + 1;
  const elapsed = Math.round((parseIsoDateUtcNoon(today).getTime() - parseIsoDateUtcNoon(b.startDate).getTime()) / msDay) + 1;
  const daysLeft = Math.max(1, totalDays - elapsed + 1);
  const timeRatio = Math.min(1, elapsed / totalDays);
  const label = budgetLabel(b.name);
  const data = { budgetId, screen: 'BudgetDetail' };
  const total = Number(b.totalBudget);

  for (const userId of memberIds) {
    const currency = await currencyFor(userId);
    const money = (n: number) => formatMoney(n, currency);
    // When someone's regular bills are bigger than their income, the budget was never coverable: skip the
    // pace nags and say it kindly once, instead of telling them off for something they can't avoid.
    const short = b.spaceId === 'personal' && (await loadPlan(userId).catch(() => null))?.status === 'short';

    if (total > 0 && totalSpent > total) {
      await notifyUser(userId, {
        kind: 'over',
        ...(short ? voice.overWhileShort(label) : voice.budgetOver(label, money(totalSpent), money(total))),
        data,
        dedupeKey: `over:${budgetId}`,
        dedupeTtlSec: 40 * DAY
      });
      continue;
    }

    const budgeted = bucket ? Number(b.categories?.[bucket]?.budgeted ?? 0) : 0;
    if (short || !bucket || budgeted <= 0) continue;
    const spent = byBucket.get(bucket) ?? 0;
    const ratio = spent / budgeted;

    if (ratio > 1) {
      await notifyUser(userId, {
        kind: 'over',
        ...voice.bucketOver(bucket, label, money(spent), money(budgeted)),
        data,
        dedupeKey: `bucket-over:${budgetId}:${bucket}`,
        dedupeTtlSec: 40 * DAY
      });
    } else if (ratio >= 0.5 && ratio > timeRatio + 0.15) {
      const perDay = Math.max(0, budgeted - spent) / daysLeft;
      await notifyUser(userId, {
        kind: 'pace',
        ...voice.runningHot(bucket, label, Math.round(ratio * 100), Math.round(timeRatio * 100), money(perDay)),
        data,
        dedupeKey: `hot:${budgetId}:${bucket}`,
        dedupeTtlSec: 7 * DAY
      });
    }
  }
}

/**
 * A gentle check-in when today's spending is far above the person's usual day (at least three times their
 * 30-day average, and a meaningful amount). Sent at most once a day.
 */
export async function checkDailySpend(tx: CreatedTx): Promise<void> {
  if (tx.type !== 'expense' || !tx.occurredAt) return;
  const today = todayIso();
  const offset = Number(Deno.env.get('APP_TZ_OFFSET_MINUTES') ?? 60);
  const dayStart = new Date(Date.parse(`${today}T00:00:00Z`) - (Number.isFinite(offset) ? offset : 60) * 60000);
  if (new Date(tx.occurredAt).getTime() < dayStart.getTime()) return;

  const space = tx.spaceId ?? 'personal';
  const since = new Date(dayStart.getTime() - 30 * DAY * 1000);
  const [row] = await sql`
    select
      coalesce(sum(amount) filter (where occurred_at >= ${dayStart}), 0) as today,
      coalesce(sum(amount) filter (where occurred_at < ${dayStart}), 0) as before,
      min(occurred_at) as first
    from public.transactions
    where user_id = ${tx.userId} and space_id = ${space} and type = 'expense' and occurred_at >= ${since}
  `;
  const spentToday = Number(row?.today ?? 0);
  if (!row?.first || spentToday < 5000) return;
  const historyDays = Math.min(30, Math.floor((dayStart.getTime() - new Date(row.first).getTime()) / (DAY * 1000)));
  if (historyDays < 7) return;
  const usual = Number(row.before) / historyDays;
  if (usual <= 0 || spentToday < usual * 3) return;

  const currency = await currencyFor(tx.userId);
  await notifyUser(tx.userId, {
    kind: 'pace',
    ...voice.dailySpend(formatMoney(spentToday, currency), Math.round(spentToday / usual)),
    spaceId: space === 'business' ? 'business' : 'personal',
    data: { screen: 'Transactions' },
    dedupeKey: `daily-spend:${space}:${today}`,
    dedupeTtlSec: 36 * 3600
  });
}

/**
 * Moves a share of an income transaction into goals that have an auto-save rule.
 * This records progress toward the goal; it does not move money between bank accounts.
 */
export async function applyAutoSave(userId: string, spaceId: string, incomeAmount: number, transactionId: string): Promise<AutoSaveResult[]> {
  const goals = await sql`
    select id, name, target_amount, current_amount, auto_save_percent from public.goals
    where user_id = ${userId} and space_id = ${spaceId} and auto_save_percent > 0
  `;
  const out: AutoSaveResult[] = [];
  for (const g of goals) {
    const remaining = Math.max(0, Number(g.targetAmount) - Number(g.currentAmount));
    if (remaining <= 0) continue;
    const pct = Math.min(MAX_AUTOSAVE_PERCENT, Math.max(0, Number(g.autoSavePercent) || 0));
    const move = Math.min(remaining, Math.round(incomeAmount * pct) / 100);
    if (move <= 0) continue;

    // Pending until the person confirms they actually moved the money; only then does the goal grow and a
    // Savings entry land in the budget.
    await sql`
      insert into public.goal_contributions (user_id, goal_id, amount, source, transaction_id, status)
      values (${userId}, ${g.id}, ${move}, 'autosave', ${transactionId}, 'pending')
    `;
    out.push({ goalId: g.id, name: g.name, amount: move });
  }

  if (out.length) {
    const currency = await currencyFor(userId);
    const total = out.reduce((s, r) => s + r.amount, 0);
    await notifyUser(userId, {
      kind: 'autosave',
      ...voice.autosaveReminder(formatMoney(total, currency), out.length === 1 ? out[0].name : 'your goals', formatMoney(incomeAmount, currency)),
      data: { screen: 'Goals' }
    });
  }
  return out;
}

/**
 * Side effects shared by every way a transaction is created (manual, offline sync, recurring,
 * bank import). Failures are logged and never undo the transaction.
 */
export async function afterTransactionCreated(tx: CreatedTx): Promise<{ autoSaved: AutoSaveResult[] }> {
  let autoSaved: AutoSaveResult[] = [];
  try {
    if (tx.type === 'expense' && tx.budgetId) await checkBudgetPace(tx.budgetId, tx.budgetCategory);
    if (tx.type === 'expense') await checkDailySpend(tx);
    if (tx.type === 'income') autoSaved = await applyAutoSave(tx.userId, tx.spaceId ?? 'personal', Number(tx.amount), tx.id);
  } catch (err) {
    console.error('[transaction effects] failed', err);
  }
  return { autoSaved };
}
