import { sql } from './db.ts';
import { HttpError, type Space } from './http.ts';
import { parseIsoDateUtcNoon, todayIso } from './dates.ts';
import { patternOf } from './categories.ts';
import { OWNER_PAY_CATEGORY, tzOffsetMinutes } from './business.ts';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const round = (n: number) => Math.round(n);

export type WrappedKind = 'h1' | 'year';

const PERSONAS = {
  stacker: { key: 'stacker', title: 'The Stacker', line: 'You dey save like squirrel 🐿️ More came in than went out, and you kept it.' },
  planner: { key: 'planner', title: 'The Planner', line: 'Budget no fit shock you. You stayed on plan most of the time.' },
  tracker: { key: 'tracker', title: 'The Tracker', line: 'Every naira get receipt with you 🧾 You logged your money like a pro.' },
  enjoyer: { key: 'enjoyer', title: 'The Enjoyer', line: 'You work hard and you enjoy life 😎 Just keep an eye on the wants.' },
  hustler: { key: 'hustler', title: 'The Hustler', line: 'Money dey move and you dey move with am 💪 Next stop: a bit more savings.' },
  builder: { key: 'builder', title: 'The Builder', line: 'The business dey grow and the margins dey look fine 🏗️' },
  grinder: { key: 'grinder', title: 'The Grinder', line: 'Sales went up and you kept pushing. Respect 💼' },
  survivor: { key: 'survivor', title: 'The Survivor', line: 'Tough period, but you still dey stand. Next half go better 🙏' }
} as const;

/**
 * A recap of a half-year (January to June) or a whole year, like the "wrapped" summaries of popular apps.
 * Before the period ends it's a "so far" recap. Everything comes from what the person recorded.
 */
export async function computeWrapped(userId: string, space: Space, kind: WrappedKind, year: number, today = todayIso()) {
  const start = `${year}-01-01`;
  const fullEnd = kind === 'h1' ? `${year}-06-30` : `${year}-12-31`;
  if (start > today) throw new HttpError(400, 'NOT_STARTED', 'That period hasn’t started yet.');
  const end = fullEnd > today ? today : fullEnd;
  const complete = fullEnd < today;
  const offset = tzOffsetMinutes() * 60000;
  const startTs = new Date(Date.parse(`${start}T00:00:00Z`) - offset);
  const endTs = new Date(Date.parse(`${end}T23:59:59.999Z`) - offset);
  const prevStartTs = new Date(Date.parse(`${year - 1}-01-01T00:00:00Z`) - offset);
  const prevEndTs = new Date(Date.parse(`${year - 1}-${end.slice(5)}T23:59:59.999Z`) - offset);

  const [txs, [prev], [goalsRow], budgets, [{ currency }]] = await Promise.all([
    sql`
      select type, amount, category, description, budget_id, occurred_at from public.transactions
      where user_id = ${userId} and space_id = ${space} and occurred_at >= ${startTs} and occurred_at <= ${endTs}
      order by occurred_at asc limit 20000
    `,
    sql`
      select coalesce(sum(amount) filter (where type = 'income'), 0) as income,
             coalesce(sum(amount) filter (where type = 'expense' and category <> ${OWNER_PAY_CATEGORY}), 0) as spending
      from public.transactions
      where user_id = ${userId} and space_id = ${space} and occurred_at >= ${prevStartTs} and occurred_at <= ${prevEndTs}
    `,
    sql`
      select coalesce(sum(c.amount), 0) as saved, count(distinct c.goal_id)::int as goals
      from public.goal_contributions c join public.goals g on g.id = c.goal_id
      where c.user_id = ${userId} and g.space_id = ${space} and c.status = 'confirmed' and c.created_at >= ${startTs} and c.created_at <= ${endTs}
    `,
    sql`
      select id, total_budget, start_date, end_date, period from public.budgets
      where user_id = ${userId} and space_id = ${space} and start_date >= ${start}::date and start_date <= ${end}::date
    `,
    sql`select coalesce(currency, 'NGN') as currency from public.profiles where id = ${userId}`
  ]);

  const local = (d: Date) => new Date(new Date(d).getTime() + offset);
  let income = 0;
  let spending = 0;
  let ownerPay = 0;
  const monthCount = kind === 'h1' ? 6 : 12;
  const months = Array.from({ length: monthCount }, (_, i) => ({ month: MONTHS[i], income: 0, spending: 0 }));
  const byCategory = new Map<string, number>();
  const byDay = Array(7).fill(0);
  const merchants = new Map<string, { label: string; count: number; total: number }>();
  const loggedDays = new Set<string>();
  const spendDays = new Set<string>();
  const budgetSpend = new Map<string, number>();

  for (const t of txs) {
    const d = local(t.occurredAt);
    const dayKey = d.toISOString().slice(0, 10);
    const amount = Number(t.amount);
    loggedDays.add(dayKey);
    const mIdx = d.getUTCMonth();
    if (t.type === 'income') {
      income += amount;
      if (months[mIdx]) months[mIdx].income += amount;
      continue;
    }
    if (t.category === OWNER_PAY_CATEGORY) {
      ownerPay += amount;
      continue;
    }
    spending += amount;
    spendDays.add(dayKey);
    if (months[mIdx]) months[mIdx].spending += amount;
    byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + amount);
    byDay[d.getUTCDay()] += amount;
    if (t.budgetId) budgetSpend.set(t.budgetId, (budgetSpend.get(t.budgetId) ?? 0) + amount);
    const p = patternOf(t.description);
    if (p) {
      const m = merchants.get(p) ?? { label: String(t.description).trim().slice(0, 40), count: 0, total: 0 };
      m.count++;
      m.total += amount;
      merchants.set(p, m);
    }
  }

  const lastMonth = parseIsoDateUtcNoon(end).getUTCMonth();
  const activeMonths = months.slice(0, lastMonth + 1);
  const withSpending = activeMonths.filter((mm) => mm.spending > 0);
  const biggestMonth = withSpending.length ? withSpending.reduce((a, b) => (b.spending > a.spending ? b : a)) : null;
  const calmestMonth = withSpending.length > 1 ? withSpending.reduce((a, b) => (b.spending < a.spending ? b : a)) : null;
  const bestSavingMonth = activeMonths.filter((mm) => mm.income > 0).reduce<{ month: string; income: number; spending: number } | null>((a, b) => (!a || b.income - b.spending > a.income - a.spending ? b : a), null);
  const totalDays = Math.round((parseIsoDateUtcNoon(end).getTime() - parseIsoDateUtcNoon(start).getTime()) / 86400000) + 1;
  const firstDay = txs.length ? local(txs[0].occurredAt).toISOString().slice(0, 10) : end;
  const trackedDays = Math.round((parseIsoDateUtcNoon(end).getTime() - parseIsoDateUtcNoon(firstDay).getTime()) / 86400000) + 1;
  const topMerchant = [...merchants.values()].sort((a, b) => b.count - a.count || b.total - a.total)[0] ?? null;
  const topCategories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, amount]) => ({ category, amount: round(amount), share: spending > 0 ? Math.round((amount / spending) * 100) : 0 }));
  const busiestDay = spending > 0 ? DAYS[byDay.indexOf(Math.max(...byDay))] : null;
  const endedBudgets = budgets.filter((b) => (b.endDate ?? b.startDate) <= end);
  const onBudget = endedBudgets.filter((b) => (budgetSpend.get(b.id) ?? 0) <= Number(b.totalBudget)).length;
  const net = income - spending;
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : null;
  const prevSpending = Number(prev.spending);
  const prevIncome = Number(prev.income);
  const spendingChange = prevSpending > 0 ? Math.round((spending / prevSpending - 1) * 100) : null;
  const incomeChange = prevIncome > 0 ? Math.round((income / prevIncome - 1) * 100) : null;
  const logRate = trackedDays > 0 ? loggedDays.size / trackedDays : 0;

  let persona: (typeof PERSONAS)[keyof typeof PERSONAS];
  if (space === 'business') {
    const margin = income > 0 ? net / income : -1;
    persona = net < 0 ? PERSONAS.survivor : margin >= 0.2 ? PERSONAS.builder : PERSONAS.grinder;
  } else {
    const wantsHeavy = topCategories.length > 0 && ['Eating out', 'Shopping', 'Entertainment', 'Subscriptions', 'Travel', 'Personal care'].includes(topCategories[0].category) && topCategories[0].share >= 25;
    persona =
      savingsRate != null && savingsRate >= 20
        ? PERSONAS.stacker
        : endedBudgets.length >= 2 && onBudget / endedBudgets.length >= 0.7
          ? PERSONAS.planner
          : logRate >= 0.6
            ? PERSONAS.tracker
            : wantsHeavy
              ? PERSONAS.enjoyer
              : PERSONAS.hustler;
  }

  const base = {
    period: { kind, year, start, end, complete, label: kind === 'h1' ? `First half of ${year}` : `${year}` },
    space,
    currency,
    hasData: txs.length > 0,
    persona,
    totals: { income: round(income), spending: round(spending), net: round(net), savingsRate, ownerPay: round(ownerPay) },
    change: { spending: spendingChange, income: incomeChange },
    months: activeMonths.map((mm) => ({ month: mm.month.slice(0, 3), income: round(mm.income), spending: round(mm.spending) })),
    biggestMonth: biggestMonth ? { month: biggestMonth.month, amount: round(biggestMonth.spending) } : null,
    calmestMonth: calmestMonth ? { month: calmestMonth.month, amount: round(calmestMonth.spending) } : null,
    bestSavingMonth: bestSavingMonth && bestSavingMonth.income - bestSavingMonth.spending > 0 ? { month: bestSavingMonth.month, amount: round(bestSavingMonth.income - bestSavingMonth.spending) } : null,
    topCategories,
    topMerchant: topMerchant ? { name: topMerchant.label, visits: topMerchant.count, amount: round(topMerchant.total) } : null,
    busiestDay,
    habits: {
      transactions: txs.length,
      daysLogged: loggedDays.size,
      trackedDays,
      totalDays,
      noSpendDays: Math.max(0, trackedDays - spendDays.size)
    },
    goals: { saved: round(Number(goalsRow.saved)), goalsFunded: goalsRow.goals },
    budgets: { ended: endedBudgets.length, onBudget }
  };

  if (space !== 'business') return { ...base, business: null };

  const [customers, [invoiceCounts], [payroll]] = await Promise.all([
    sql`
      select i.customer_name as name, sum(p.amount) as total from public.invoice_payments p join public.invoices i on i.id = p.invoice_id
      where p.user_id = ${userId} and p.paid_on >= ${start}::date and p.paid_on <= ${end}::date
      group by 1 order by 2 desc limit 1
    `,
    sql`
      select count(*)::int as issued, count(*) filter (where status = 'paid')::int as paid
      from public.invoices where user_id = ${userId} and issue_date >= ${start}::date and issue_date <= ${end}::date and status <> 'void'
    `,
    sql`select coalesce(sum(total_gross), 0) as gross from public.payroll_runs where user_id = ${userId} and paid_on >= ${start}::date and paid_on <= ${end}::date`
  ]);
  const bestProfit = activeMonths.filter((mm) => mm.income > 0).reduce<{ month: string; income: number; spending: number } | null>((a, b) => (!a || b.income - b.spending > a.income - a.spending ? b : a), null);
  return {
    ...base,
    business: {
      revenue: round(income),
      costs: round(spending),
      profit: round(net),
      margin: income > 0 ? Math.round((net / income) * 100) : null,
      bestMonth: bestProfit ? { month: bestProfit.month, profit: round(bestProfit.income - bestProfit.spending) } : null,
      topCustomer: customers[0] ? { name: customers[0].name, amount: round(Number(customers[0].total)) } : null,
      invoicesIssued: invoiceCounts.issued,
      invoicesPaid: invoiceCounts.paid,
      payroll: round(Number(payroll.gross)),
      ownerPay: round(ownerPay)
    }
  };
}
