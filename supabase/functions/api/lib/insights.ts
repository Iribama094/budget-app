import { sql } from './db.ts';
import { effectiveEndIso, parseIsoDateUtcNoon, todayIso } from './dates.ts';
import { formatMoney } from './notify.ts';
import { loadPlan } from './plan.ts';
import { normalizeBucket, patternOf, type Bucket } from './categories.ts';
import type { Space } from './http.ts';
import { boss, pick } from './voice.ts';
import { computeBusinessWarnings } from './business.ts';

export type Insight = {
  key: string;
  kind: 'runway' | 'under_pace' | 'spike' | 'small_spends' | 'regular_bill' | 'kept' | 'overspent' | 'plan_drift' | 'logging_gap' | 'irregular_income';
  tone: 'positive' | 'neutral' | 'warning';
  title: string;
  body: string;
  action: { label: string; screen: string; params?: Record<string, unknown> } | null;
};

const DAY_MS = 86400000;
const TONE_ORDER = { warning: 0, neutral: 1, positive: 2 } as const;

const diffDays = (from: string, to: string) => Math.round((parseIsoDateUtcNoon(to).getTime() - parseIsoDateUtcNoon(from).getTime()) / DAY_MS);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Looks at the last four months of someone's own transactions, their plan and their budget, and turns
 * patterns into a few specific, kindly worded suggestions. Everything is computed from their data; nothing is guessed.
 */
export async function computeInsights(userId: string, space: Space = 'personal', today = todayIso(), options: { includeDismissed?: boolean } = {}): Promise<Insight[]> {
  const since = new Date(Date.now() - 120 * DAY_MS);
  const [[profile], txs, categories, recurring, [{ goals }], dismissed] = await Promise.all([
    sql`select currency from public.profiles where id = ${userId}`,
    sql`
      select type, amount, category, budget_category, description, recurring_id, occurred_at from public.transactions
      where user_id = ${userId} and space_id = ${space} and occurred_at >= ${since}
      order by occurred_at desc limit 4000
    `,
    sql`select name, bucket from public.categories where user_id = ${userId} and space_id = ${space}`,
    sql`select description, category from public.recurring where user_id = ${userId}`,
    sql`select count(*)::int as goals from public.goals where user_id = ${userId} and space_id = ${space}`,
    options.includeDismissed ? Promise.resolve([]) : sql`select key from public.insight_dismissals where user_id = ${userId} and dismissed_at > now() - interval '14 days'`
  ]);
  if (!txs.length && space !== 'business') return [];

  const money = (n: number) => formatMoney(n, profile?.currency);
  const month = today.slice(0, 7);
  const nowMs = Date.now();
  const ageDays = (d: Date) => (nowMs - new Date(d).getTime()) / DAY_MS;
  const bucketByCategory = new Map(categories.map((c) => [String(c.name).toLowerCase(), normalizeBucket(c.bucket)]));
  const bucketOf = (t: any): Bucket | null => normalizeBucket(t.budgetCategory) ?? bucketByCategory.get(String(t.category).toLowerCase()) ?? null;
  const expenses = txs.filter((t) => t.type === 'expense');
  const plan = space === 'personal' ? await loadPlan(userId, today) : null;
  const monthlyIncome = plan?.monthlyIncome ?? 0;
  const out: Insight[] = [];

  // 1. Will the money last until payday (or the end of the budget)?
  const [budget] = await sql`
    select total_budget, start_date, end_date, period from public.budgets
    where user_id = ${userId} and space_id = ${space} and start_date <= ${today}::date
      and coalesce(end_date, case when period = 'weekly' then start_date + 6
                                  else (date_trunc('month', start_date) + interval '1 month - 1 day')::date end) >= ${today}::date
    order by start_date desc limit 1
  `;
  const window = budget
    ? { start: budget.startDate as string, end: effectiveEndIso(budget as any), available: Number(budget.totalBudget), until: 'the end of this budget' }
    : plan && monthlyIncome > 0
      ? { start: plan.period.start, end: plan.period.end, available: ((monthlyIncome - plan.split.Savings) * plan.period.days) / (365 / 12), until: 'payday' }
      : null;
  if (window && window.available > 0) {
    const startMs = parseIsoDateUtcNoon(window.start).getTime() - 12 * 3600000;
    const spent = expenses.filter((t) => new Date(t.occurredAt).getTime() >= startMs).reduce((s, t) => s + Number(t.amount), 0);
    const totalDays = diffDays(window.start, window.end) + 1;
    const elapsed = Math.min(totalDays, diffDays(window.start, today) + 1);
    const remaining = totalDays - elapsed;
    const left = window.available - spent;
    if (elapsed >= 3 && spent > 0 && remaining > 0) {
      const rate = spent / elapsed;
      const lasts = left > 0 ? Math.floor(left / rate) : 0;
      if (lasts < remaining - 1) {
        const short = remaining - lasts;
        out.push({
          key: `runway:${window.start}`,
          kind: 'runway',
          tone: 'warning',
          title:
            left > 0
              ? pick([`${boss(window.start)}, at this pace money go finish ${plural(short, 'day')} before ${window.until}`, `Easy o 👀 money fit finish ${plural(short, 'day')} before ${window.until}`], window.start)
              : `${boss(window.start)} no be so o, we don pass plan for this period`,
          body:
            left > 0
              ? `You’ve spent ${money(spent)} in ${plural(elapsed, 'day')}. Keeping to about ${money(left / (remaining + 1))} a day gets you there.`
              : `That’s ${money(-left)} over so far. Pause wants until ${window.until} and log everything so nothing surprises you.`,
          action: { label: 'See your budget', screen: 'Budget' }
        });
      } else {
        // Well under pace: suggest moving the extra into savings now, keeping a 25% buffer on the current spending rate.
        const spentShare = spent / window.available;
        const timeShare = elapsed / totalDays;
        const extra = Math.floor((left - rate * remaining * 1.25) / 1000) * 1000;
        if (timeShare >= 0.35 && spentShare < timeShare * 0.6 && extra >= Math.max(5000, window.available * 0.05)) {
          out.push({
            key: `under:${window.start}`,
            kind: 'under_pace',
            tone: 'positive',
            title: pick([`${boss(window.start)}, you dey spend like pro 😎`, 'My Oga, you’re really trying o 💪'], window.start),
            body: `Only ${Math.round(spentShare * 100)}% used with ${Math.round(timeShare * 100)}% of the period gone. You could move ${money(extra)} to savings now and still be comfortable until ${window.until}.`,
            action: goals > 0 ? { label: 'Add to a goal', screen: 'Goals' } : { label: 'Start a goal', screen: 'CreateGoal' }
          });
        } else if (elapsed >= 5 && remaining >= 3) {
          out.push({
            key: `runway-ok:${window.start}`,
            kind: 'runway',
            tone: 'positive',
            title: pick(['My Oga, you’re really trying o 💪', `${boss(window.start)}, you dey on track for ${window.until} 🙌`], window.start),
            body: `About ${money(left / (remaining + 1))} a day keeps you steady for the next ${plural(remaining, 'day')}.`,
            action: null
          });
        }
      }
    }
  }

  // 2. A category costing much more than usual.
  const oldest = txs.length ? ageDays(txs[txs.length - 1].occurredAt) : 0;
  if (oldest >= 45) {
    const windows = Math.max(1, Math.min(3, Math.floor((oldest - 30) / 30)));
    const current = new Map<string, number>();
    const previous = new Map<string, number>();
    for (const t of expenses) {
      const d = ageDays(t.occurredAt);
      const target = d < 30 ? current : d < 30 + 30 * windows ? previous : null;
      if (target) target.set(t.category, (target.get(t.category) ?? 0) + Number(t.amount));
    }
    const floor = Math.max(2000, monthlyIncome * 0.03);
    const spikes = [...current.entries()]
      .map(([category, now]) => ({ category, now, usual: (previous.get(category) ?? 0) / windows }))
      .filter((x) => x.usual > 0 && x.now > x.usual * 1.4 && x.now - x.usual >= floor)
      .sort((a, b) => b.now - b.usual - (a.now - a.usual));
    if (spikes[0]) {
      const s = spikes[0];
      out.push({
        key: `spike:${s.category}:${month}`,
        kind: 'spike',
        tone: 'warning',
        title: `Did you know? ${s.category} don go up ${Math.round((s.now / s.usual - 1) * 100)}% 👀`,
        body: `${money(s.now)} in the last 30 days, compared with about ${money(s.usual)} usually.`,
        action: { label: 'See where it went', screen: 'Analytics' }
      });
    }
  }

  // 3. Lots of small "wants" purchases.
  const smallLimit = Math.max(3000, monthlyIncome * 0.01);
  const small = expenses.filter((t) => ageDays(t.occurredAt) < 14 && bucketOf(t) === 'Wants' && Number(t.amount) <= smallLimit);
  if (small.length >= 8) {
    out.push({
      key: `small:${today.slice(0, 8)}${Math.floor(Number(today.slice(8)) / 7)}`,
      kind: 'small_spends',
      tone: 'neutral',
      title: `${boss(today)}, small small spending dey add up`,
      body: `${small.length} small purchases came to ${money(small.reduce((s, t) => s + Number(t.amount), 0))} in the last two weeks. A weekly limit for wants can help.`,
      action: { label: 'Review spending', screen: 'Transactions' }
    });
  }

  // 4. A payment that repeats every month but isn't set up as a bill.
  const known = new Set(recurring.map((r) => patternOf(r.description || r.category)).filter(Boolean));
  const groups = new Map<string, { amounts: number[]; months: Set<string>; label: string }>();
  for (const t of expenses) {
    if (t.recurringId) continue;
    const p = patternOf(t.description);
    if (!p || known.has(p)) continue;
    const g = groups.get(p) ?? { amounts: [], months: new Set<string>(), label: String(t.description).trim() };
    g.amounts.push(Number(t.amount));
    g.months.add(new Date(t.occurredAt).toISOString().slice(0, 7));
    groups.set(p, g);
  }
  const regular = [...groups.entries()]
    .map(([pattern, g]) => ({ pattern, ...g, typical: median(g.amounts) }))
    .filter((g) => g.months.size >= 2 && g.amounts.length <= g.months.size + 1 && g.amounts.every((a) => Math.abs(a - g.typical) <= g.typical * 0.15))
    .sort((a, b) => b.typical - a.typical);
  if (regular[0]) {
    const r = regular[0];
    out.push({
      key: `bill:${r.pattern}`,
      kind: 'regular_bill',
      tone: 'neutral',
      title: `Did you know ${r.label.slice(0, 40)} comes every month?`,
      body: `${money(r.typical)} about once a month. Add it as a bill and we’ll remind you before it’s due.`,
      action: { label: 'Add as a bill', screen: 'Recurring' }
    });
  }

  // 5. What was kept, or overspent, over the last 30 days.
  const last30 = txs.filter((t) => ageDays(t.occurredAt) < 30);
  const in30 = last30.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const out30 = last30.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  if (in30 > 0) {
    const rate = (in30 - out30) / in30;
    if (rate >= 0.1) {
      out.push({
        key: `kept:${month}`,
        kind: 'kept',
        tone: 'positive',
        title: `Correct! You kept ${Math.round(rate * 100)}% of your money 🎉`,
        body: `${money(in30 - out30)} is left from the last 30 days. Moving it into a goal stops it getting spent.${
          plan && monthlyIncome > 0 && rate >= 0.2 && plan.percents.Savings < Math.round(rate * 100) - 5
            ? ` You could raise Savings in your plan from ${plan.percents.Savings}% to about ${Math.round(rate * 100) - 5}%.`
            : ''
        }`,
        action: goals > 0 ? { label: 'Open goals', screen: 'Goals' } : { label: 'Create a goal', screen: 'CreateGoal' }
      });
    } else if (rate < 0) {
      const byCategory = new Map<string, number>();
      for (const t of last30) if (t.type === 'expense') byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + Number(t.amount));
      const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
      out.push({
        key: `overspent:${month}`,
        kind: 'overspent',
        tone: 'warning',
        title: `${boss(month)} no be so o, more money went out than came in`,
        body: `${money(out30 - in30)} more than you received in the last 30 days.${top ? ` ${top[0]} was the biggest cost.` : ''}`,
        action: { label: 'See the breakdown', screen: 'Analytics' }
      });
    }
  }

  // 6. Real spending on needs drifting away from the plan.
  if (plan && monthlyIncome > 0) {
    const recent = expenses.filter((t) => ageDays(t.occurredAt) < 30);
    if (recent.length >= 15) {
      const needs = recent.filter((t) => bucketOf(t) === 'Needs').reduce((s, t) => s + Number(t.amount), 0);
      const share = Math.round((needs / monthlyIncome) * 100);
      if (share > plan.percents.Needs + 10) {
        out.push({
          key: `drift:${month}`,
          kind: 'plan_drift',
          tone: 'neutral',
          title: 'Needs dey chop pass your plan',
          body: `About ${share}% of your income went to needs, but your plan sets aside ${plan.percents.Needs}%. Updating it keeps your daily number realistic.`,
          action: { label: 'Update your plan', screen: 'IncomeBills' }
        });
      }
    }
  }

  // 7. Nothing logged for a while.
  const quietDays = txs.length ? Math.floor(ageDays(txs[0].occurredAt)) : 0;
  if (quietDays >= 3) {
    out.push({
      key: `gap:${today}`,
      kind: 'logging_gap',
      tone: 'neutral',
      title: `${boss(today)}, where you dey? 👀`,
      body: `Nothing logged in ${plural(quietDays, 'day')}. A two-minute catch-up keeps your safe-to-spend number right.`,
      action: { label: 'Add a transaction', screen: 'AddTransaction' }
    });
  }

  // 8. Income that swings from month to month.
  if (plan?.incomeSources.some((s: any) => s.frequency === 'irregular' || s.isEstimate)) {
    const byMonth = new Map<string, number>();
    for (const t of txs) {
      if (t.type !== 'income') continue;
      const key = new Date(t.occurredAt).toISOString().slice(0, 7);
      if (key < month) byMonth.set(key, (byMonth.get(key) ?? 0) + Number(t.amount));
    }
    const values = [...byMonth.values()].filter((v) => v > 0);
    if (values.length >= 2) {
      const low = Math.min(...values);
      const high = Math.max(...values);
      if (high > low * 1.3) {
        out.push({
          key: `irregular:${month}`,
          kind: 'irregular_income',
          tone: 'neutral',
          title: 'Your income dey change change',
          body: `It ranged from ${money(low)} to ${money(high)} recently. Plan around the lower amount and save anything extra.`,
          action: { label: 'Update your income', screen: 'IncomeBills' }
        });
      }
    }
  }

  // Business early warnings: cash runway, money owed, slow sales, costs and bills.
  if (space === 'business') out.push(...(await computeBusinessWarnings(userId, today).catch(() => [] as Insight[])));

  const hidden = new Set((dismissed as any[]).map((d) => d.key));
  return out
    .filter((i) => !hidden.has(i.key))
    .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone])
    .slice(0, 5);
}
