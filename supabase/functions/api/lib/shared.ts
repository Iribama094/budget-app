import { sql } from './db.ts';
import { addDaysIso, budgetBounds, todayIso } from './dates.ts';
import { budgetLabel, budgetMemberIds, selectBudgets } from './budgets.ts';
import { currencyFor, formatMoney, notifyUser } from './notify.ts';
import { voice } from './voice.ts';

const firstName = (name: string | null | undefined, email: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || (email ?? '').split('@')[0] || 'Someone';

/**
 * Daily: tells each person in a shared budget what the others spent in it yesterday, with what's left.
 * One summary per budget per person, instead of a ping for every transaction.
 */
export async function sendSharedDigests(today = todayIso()): Promise<{ budgets: number; sent: number }> {
  const offset = Number(Deno.env.get('APP_TZ_OFFSET_MINUTES') ?? 60);
  const end = new Date(Date.parse(`${today}T00:00:00Z`) - (Number.isFinite(offset) ? offset : 60) * 60000);
  const start = new Date(end.getTime() - 86400000);
  const yesterday = addDaysIso(today, -1);

  const rows = await sql<{ budgetId: string; userId: string; total: number }[]>`
    select t.budget_id, t.user_id, sum(t.amount) as total
    from public.transactions t
    where t.type = 'expense' and t.budget_id is not null and t.occurred_at >= ${start} and t.occurred_at < ${end}
      and exists (select 1 from public.budget_members m where m.budget_id = t.budget_id)
    group by t.budget_id, t.user_id
    limit 5000
  `;
  const byBudget = new Map<string, Array<{ userId: string; total: number }>>();
  for (const r of rows) {
    const list = byBudget.get(r.budgetId) ?? [];
    list.push({ userId: r.userId, total: Number(r.total) });
    byBudget.set(r.budgetId, list);
  }
  if (!byBudget.size) return { budgets: 0, sent: 0 };

  const budgets = await selectBudgets(sql`b.id in ${sql([...byBudget.keys()])}`);
  let sent = 0;
  for (const b of budgets) {
    const ids = budgetMemberIds(b);
    const spenders = (byBudget.get(b.id) ?? []).filter((s) => ids.includes(s.userId));
    const [owner] = await sql`select name, email from public.profiles where id = ${b.userId}`;
    const names = new Map<string, string>([[b.userId, firstName(owner?.name, owner?.email)]]);
    for (const m of b.members) names.set(m.userId, firstName(m.name, m.email));

    const bounds = budgetBounds(b);
    const [{ spent }] = await sql`
      select coalesce(sum(amount), 0) as spent from public.transactions
      where budget_id = ${b.id} and type = 'expense' and user_id in ${sql(ids)} and occurred_at >= ${bounds.start} and occurred_at <= ${bounds.end}
    `;
    const left = Number(b.totalBudget) - Number(spent);

    for (const memberId of ids) {
      const others = spenders.filter((s) => s.userId !== memberId);
      if (!others.length) continue;
      const currency = await currencyFor(memberId);
      const who = others.map((o) => `${names.get(o.userId) ?? 'Someone'} spent ${formatMoney(o.total, currency)}`).join(', ');
      const tail = Number(b.totalBudget) > 0 ? (left >= 0 ? `${formatMoney(left, currency)} left in the budget.` : `The budget is over by ${formatMoney(-left, currency)}.`) : null;
      const delivered = await notifyUser(memberId, {
        kind: 'household',
        ...voice.sharedDigest(budgetLabel(b.name), who, tail),
        spaceId: 'personal',
        data: { screen: 'BudgetDetail', budgetId: b.id },
        dedupeKey: `shared-digest:${b.id}:${yesterday}`,
        dedupeTtlSec: 36 * 3600
      });
      if (delivered) sent++;
    }
  }
  return { budgets: budgets.length, sent };
}

/** Daily: the day before a plan or shared budget ends, nudge its owner to start the next one, unless it already exists. */
export async function sendPeriodEndingReminders(today = todayIso()): Promise<number> {
  const tomorrow = addDaysIso(today, 1);
  const due = await sql`
    select b.id from public.budgets b
    where b.purpose <> 'event'
      and coalesce(b.end_date, case when b.period = 'weekly' then b.start_date + 6
                                    else (date_trunc('month', b.start_date) + interval '1 month - 1 day')::date end) = ${tomorrow}::date
      and not exists (
        select 1 from public.budgets n
        where n.user_id = b.user_id and n.space_id = b.space_id and n.purpose = b.purpose and n.start_date > b.start_date
      )
    limit 2000
  `;
  if (!due.length) return 0;
  const budgets = await selectBudgets(sql`b.id in ${sql(due.map((d) => String(d.id)))}`);
  let sent = 0;
  for (const b of budgets) {
    const delivered = await notifyUser(b.userId, {
      kind: 'rollover',
      ...voice.periodEnding(budgetLabel(b.name), b.members.length > 0),
      spaceId: b.spaceId === 'business' ? 'business' : 'personal',
      data: { screen: 'BudgetDetail', budgetId: b.id },
      dedupeKey: `period-ending:${b.id}`,
      dedupeTtlSec: 5 * 86400
    });
    if (delivered) sent++;
  }
  return sent;
}
