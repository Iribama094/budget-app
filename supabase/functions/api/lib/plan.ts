import { sql } from './db.ts';
import { addDaysIso, formatIsoDateUtc, parseIsoDateUtcNoon, todayIso } from './dates.ts';
import { formatMoney } from './notify.ts';
import { defaultBucketFor, normalizeBucket, type Bucket } from './categories.ts';

export type IncomeKind = 'salary' | 'business' | 'side_hustle' | 'allowance' | 'other';
export type IncomeFrequency = 'monthly' | 'biweekly' | 'weekly' | 'irregular';
export type BillFrequency = 'monthly' | 'yearly' | 'weekly';
export type BudgetPeriodBasis = 'payday' | 'monthly';

export type IncomeInput = {
  name: string;
  kind: IncomeKind;
  amount: number;
  frequency: IncomeFrequency;
  payDay?: number | null;
  nextPayDate?: string | null;
  isEstimate?: boolean;
};

export type BillInput = { name: string; category: string; bucket?: Bucket | null; amount: number; frequency: BillFrequency; dueDay?: number | null };

export const PAIN_POINTS = ['runs_out', 'no_idea', 'cant_save', 'debt', 'irregular'] as const;

const MONTH_DAYS = 365 / 12;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthlyIncome(amount: number, frequency: IncomeFrequency): number {
  if (frequency === 'weekly') return (amount * 52) / 12;
  if (frequency === 'biweekly') return (amount * 26) / 12;
  return amount;
}

export function monthlyBill(amount: number, frequency: BillFrequency): number {
  if (frequency === 'weekly') return (amount * 52) / 12;
  if (frequency === 'yearly') return amount / 12;
  return amount;
}

const roundTo = (n: number, step = 100) => Math.round(n / step) * step;

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** YYYY-MM-DD for a day in a month, clamped to the month's length (the 31st becomes the 30th in September). */
export function clampedIso(year: number, month0: number, day: number): string {
  const y = year + Math.floor(month0 / 12);
  const m = ((month0 % 12) + 12) % 12;
  return formatIsoDateUtc(new Date(Date.UTC(y, m, Math.min(day, daysInMonth(y, m)), 12)));
}

const diffDays = (from: string, to: string) => Math.round((parseIsoDateUtcNoon(to).getTime() - parseIsoDateUtcNoon(from).getTime()) / 86400000);

export type PaySource = { frequency: IncomeFrequency; payDay: number | null; nextPayDate: string | null };

export type PayPeriod = { start: string; end: string; nextPayday: string; daysToPayday: number; days: number; basis: BudgetPeriodBasis; label: string };

/**
 * The period a budget should cover today. With a known payday it runs from the last payday to the day before
 * the next one; otherwise (or when the person prefers it) it's the calendar month.
 */
export function payPeriod(source: PaySource | null, basis: BudgetPeriodBasis, today = todayIso()): PayPeriod {
  const t = parseIsoDateUtcNoon(today);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  let start: string;
  let next: string;
  let used: BudgetPeriodBasis = 'payday';

  if (basis === 'payday' && source?.frequency === 'monthly' && source.payDay) {
    const thisPay = clampedIso(y, m, source.payDay);
    if (today >= thisPay) {
      start = thisPay;
      next = clampedIso(y, m + 1, source.payDay);
    } else {
      start = clampedIso(y, m - 1, source.payDay);
      next = thisPay;
    }
  } else if (basis === 'payday' && (source?.frequency === 'weekly' || source?.frequency === 'biweekly') && source.nextPayDate) {
    const step = source.frequency === 'weekly' ? 7 : 14;
    let n = source.nextPayDate;
    if (n <= today) n = addDaysIso(n, (Math.floor(diffDays(n, today) / step) + 1) * step);
    else {
      n = addDaysIso(n, -Math.floor(diffDays(today, n) / step) * step);
      if (n <= today) n = addDaysIso(n, step);
    }
    next = n;
    start = addDaysIso(n, -step);
  } else {
    used = 'monthly';
    start = clampedIso(y, m, 1);
    next = clampedIso(y, m + 1, 1);
  }

  const end = addDaysIso(next, -1);
  const s = parseIsoDateUtcNoon(start);
  const e = parseIsoDateUtcNoon(end);
  const label =
    used === 'monthly'
      ? `${MONTHS_LONG[s.getUTCMonth()]} ${s.getUTCFullYear()}`
      : `${s.getUTCDate()} ${MONTHS_SHORT[s.getUTCMonth()]} – ${e.getUTCDate()} ${MONTHS_SHORT[e.getUTCMonth()]}`;
  return { start, end, nextPayday: next, daysToPayday: Math.max(0, diffDays(today, next)), days: diffDays(start, next), basis: used, label };
}

/** The income that sets payday: a salary with pay dates, otherwise any source with pay dates. */
export function primarySource<T extends PaySource & { kind: IncomeKind }>(sources: T[]): T | null {
  const hasDates = (s: T) => (s.frequency === 'monthly' && !!s.payDay) || ((s.frequency === 'weekly' || s.frequency === 'biweekly') && !!s.nextPayDate);
  return sources.find((s) => s.kind === 'salary' && hasDates(s)) ?? sources.find(hasDates) ?? null;
}

type PeriodCategories = Record<Bucket, { budgeted: number }>;

/** The monthly plan's Needs / Wants / Savings, scaled to a period of `days`. */
export function periodCategories(split: Record<Bucket, number>, days: number): PeriodCategories {
  const factor = days / (365 / 12);
  const amount = (n: number) => roundTo(n * factor);
  return { Needs: { budgeted: amount(split.Needs) }, Wants: { budgeted: amount(split.Wants) }, Savings: { budgeted: amount(split.Savings) } };
}

/**
 * A starter budget for someone who joins partway through a period: only what they have left, shared between
 * Needs and Wants the way their plan shares them. Savings starts with the first full period, on payday.
 */
export function starterCategories(split: Record<Bucket, number>, left: number): PeriodCategories {
  const spendable = split.Needs + split.Wants;
  const needs = Math.min(left, spendable > 0 ? roundTo((left * split.Needs) / spendable) : left);
  return { Needs: { budgeted: needs }, Wants: { budgeted: Math.max(0, left - needs) }, Savings: { budgeted: 0 } };
}

/** Days from the start of a period to today, and days left including today. */
export function periodProgress(period: { start: string; nextPayday: string }, today = todayIso()) {
  return { elapsed: Math.max(0, diffDays(period.start, today)), left: Math.max(1, diffDays(today, period.nextPayday)) };
}

export type Plan = {
  monthlyIncome: number;
  committed: number;
  left: number;
  status: 'healthy' | 'tight' | 'short' | 'no_income';
  shortfall: number;
  split: Record<Bucket, number>;
  percents: Record<Bucket, number>;
  tips: string[];
};

/**
 * Turns income and bills into a Needs / Wants / Savings plan in plain language.
 * Starts from the 50/30/20 guide, makes sure bills are covered first, and never pretends there's money to
 * save when bills already take everything.
 */
export function computePlan(input: { income: IncomeInput[]; bills: BillInput[]; painPoints: string[]; currency: string | null }): Plan {
  const money = (n: number) => formatMoney(n, input.currency);
  const income = input.income.reduce((s, i) => s + monthlyIncome(Math.max(0, i.amount), i.frequency), 0);
  const billBucket = (b: BillInput): Bucket => normalizeBucket(b.bucket) ?? defaultBucketFor(b.category) ?? 'Needs';
  const sumBills = (bucket: Bucket) => input.bills.filter((b) => billBucket(b) === bucket).reduce((s, b) => s + monthlyBill(b.amount, b.frequency), 0);
  const needsBills = sumBills('Needs');
  const wantsBills = sumBills('Wants');
  const savingsBills = sumBills('Savings');
  const committed = needsBills + wantsBills + savingsBills;

  if (income <= 0) {
    return {
      monthlyIncome: 0,
      committed: Math.round(committed),
      left: 0,
      status: 'no_income',
      shortfall: 0,
      split: { Needs: 0, Wants: 0, Savings: 0 },
      percents: { Needs: 0, Wants: 0, Savings: 0 },
      tips: ['Add what you earn, even a rough number, and we’ll build your plan.']
    };
  }

  const savingsGoal = income * (input.painPoints.includes('debt') ? 0.1 : 0.2);
  let needs: number;
  let wants: number;
  let savings: number;
  let status: Plan['status'];
  let shortfall = 0;

  if (committed >= income) {
    status = 'short';
    shortfall = committed - income;
    needs = Math.min(income, needsBills);
    wants = Math.min(income - needs, wantsBills);
    savings = income - needs - wants;
  } else {
    needs = Math.min(Math.max(needsBills, income * 0.5), income - wantsBills - savingsBills);
    const remaining = income - needs;
    savings = Math.max(savingsBills, Math.min(savingsGoal, remaining - wantsBills));
    wants = income - needs - savings;
    status = savings >= income * 0.1 ? 'healthy' : 'tight';
  }

  const total = roundTo(income);
  const split = { Needs: roundTo(needs), Wants: 0, Savings: roundTo(savings) };
  split.Wants = Math.max(0, total - split.Needs - split.Savings);
  const pct = (n: number) => Math.round((n / income) * 100);
  const percents = { Needs: pct(split.Needs), Wants: pct(split.Wants), Savings: pct(split.Savings) };

  const tips: string[] = [];
  tips.push(committed > 0 ? `${money(total)} comes in each month and ${money(committed)} already goes to bills.` : `${money(total)} comes in each month.`);
  if (status === 'short') {
    tips.push(`Your bills come to ${money(shortfall)} more than you earn. Your plan only counts money you actually have, so the gap shows here instead of as savings that aren’t there.`);
    tips.push('Pay in this order: rent, food, school fees and loan repayments first; subscriptions and extras are the first to pause. Adding a side hustle or money you expect closes the gap from the other side.');
  } else if (status === 'tight') {
    tips.push(`Money is tight, so savings starts small at ${money(split.Savings)} a month. Small amounts still add up.`);
  } else {
    tips.push(`Pay yourself first: move ${money(split.Savings)} to savings as soon as you get paid.`);
  }
  if (needsBills / income > 0.6) tips.push(`Bills take ${pct(needsBills)}% of your income. The usual guide is about half, so look for one bill you can lower.`);
  if (input.painPoints.includes('runs_out')) tips.push('We’ll show how much is safe to spend each day so your money lasts until payday.');
  if (input.painPoints.includes('irregular') || input.income.some((i) => i.frequency === 'irregular' || i.isEstimate)) {
    tips.push('Your income changes, so this plan uses your estimate. Update it whenever you get paid.');
  }
  if (input.painPoints.includes('debt')) tips.push('Loan repayments count as needs, so they’re covered before wants.');

  return { monthlyIncome: total, committed: Math.round(committed), left: Math.max(0, total - Math.round(committed)), status, shortfall: Math.round(shortfall), split, percents, tips };
}

export function toApiIncomeSource(r: any) {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    amount: Number(r.amount),
    frequency: r.frequency,
    payDay: r.payDay ?? null,
    nextPayDate: r.nextPayDate ?? null,
    isEstimate: r.isEstimate,
    monthlyAmount: Math.round(monthlyIncome(Number(r.amount), r.frequency)),
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString()
  };
}

/** The saved plan: stored income sources, active bills and preferences, with today's pay period. */
export async function loadPlan(userId: string, today = todayIso()) {
  const [[profile], sources, bills] = await Promise.all([
    sql`select currency, pain_points, budget_period from public.profiles where id = ${userId}`,
    sql`select * from public.income_sources where user_id = ${userId} order by created_at asc`,
    sql`
      select description, category, amount, frequency, budget_category from public.recurring
      where user_id = ${userId} and space_id = 'personal' and type = 'expense' and not paused
    `
  ]);
  const income: IncomeInput[] = sources.map((s) => ({
    name: s.name,
    kind: s.kind,
    amount: Number(s.amount),
    frequency: s.frequency,
    payDay: s.payDay,
    nextPayDate: s.nextPayDate,
    isEstimate: s.isEstimate
  }));
  const billInputs: BillInput[] = bills.map((b) => ({
    name: b.description || b.category,
    category: b.category,
    bucket: normalizeBucket(b.budgetCategory),
    amount: Number(b.amount),
    frequency: b.frequency
  }));
  const painPoints: string[] = profile?.painPoints ?? [];
  const basis: BudgetPeriodBasis = profile?.budgetPeriod === 'monthly' ? 'monthly' : 'payday';
  const plan = computePlan({ income, bills: billInputs, painPoints, currency: profile?.currency ?? null });
  const primary = primarySource(sources as any[]);
  return {
    ...plan,
    budgetPeriod: basis,
    period: payPeriod(primary, basis, today),
    incomeSources: sources.map(toApiIncomeSource),
    bills: billInputs.map((b) => ({ ...b, monthlyAmount: Math.round(monthlyBill(b.amount, b.frequency)) }))
  };
}
