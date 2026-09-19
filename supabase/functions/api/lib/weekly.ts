import { sql } from './db.ts';
import { currencyFor, formatMoney } from './notify.ts';
import { budgetCovering, findVisibleBudget } from './budgets.ts';
import { paceFor } from '../routes/budgets.ts';
import { pick, type Note } from './voice.ts';
import { withQuote } from './quotes.ts';

/**
 * The Sunday summary for the Personal space: what went out this week, where most of it went, how that compares
 * with last week, and what a day looks like from here. It adds to the small alerts during the week; it doesn't
 * replace them. A good week can end with a short quote (see quotes.ts).
 */
export async function weeklySummary(userId: string, today: string): Promise<Note | null> {
  const [row] = await sql`
    select
      coalesce(sum(amount) filter (where occurred_at >= now() - interval '7 days'), 0) as this_week,
      coalesce(sum(amount) filter (where occurred_at < now() - interval '7 days'), 0) as last_week
    from public.transactions
    where user_id = ${userId} and space_id = 'personal' and type = 'expense' and occurred_at >= now() - interval '14 days'
  `;
  const thisWeek = Number(row?.thisWeek ?? 0);
  const lastWeek = Number(row?.lastWeek ?? 0);
  if (thisWeek <= 0) {
    return { title: 'A quiet week?', body: 'Nothing was logged this week. If you did spend, a quick catch-up keeps your numbers right.' };
  }

  const currency = await currencyFor(userId);
  const money = (n: number) => formatMoney(n, currency);

  const [top] = await sql<{ category: string; total: number }[]>`
    select category, sum(amount) as total from public.transactions
    where user_id = ${userId} and space_id = 'personal' and type = 'expense' and occurred_at >= now() - interval '7 days'
    group by category order by total desc limit 1
  `;
  const parts = [`You spent ${money(thisWeek)} this week${top ? `, most of it on ${top.category} (${money(Number(top.total))})` : ''}.`];

  const change = lastWeek > 0 ? (thisWeek - lastWeek) / lastWeek : 0;
  const spentLess = lastWeek > 0 && change <= -0.05;
  if (lastWeek > 0) {
    parts.push(Math.abs(change) < 0.05 ? 'About the same as last week.' : `That’s ${Math.round(Math.abs(change) * 100)}% ${spentLess ? 'less' : 'more'} than last week.`);
  }

  let onTrack = false;
  const budgetId = await budgetCovering(userId, 'personal', today);
  const budget = budgetId ? await findVisibleBudget(userId, budgetId) : null;
  if (budget) {
    const pace = await paceFor(budget);
    if (pace.daysLeft > 0 && pace.safePerDay > 0) {
      onTrack = true;
      parts.push(`About ${money(pace.safePerDay)} a day keeps you on track from here.`);
    } else if (pace.daysLeft > 0) {
      parts.push('What’s left this period is already spoken for, so stick to needs until payday.');
    }
  }

  const note: Note = {
    title: spentLess ? pick(['A lighter week 👏', 'You spent less this week'], today) : pick(['Your week in money', 'Here’s how your week went'], today),
    body: parts.join(' ')
  };
  // Quotes only go with good news: spending came down, or there's still room in the budget.
  const good = spentLess || (onTrack && change < 0.25);
  return good ? withQuote(userId, note, spentLess ? ['saving', 'patience'] : ['spending', 'planning'], today) : note;
}
