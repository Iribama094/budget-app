import type { ApiIncomeSource, BillFrequency, BillInput, IncomeFrequency, IncomeInput, IncomeKind } from '../api/personal';
import type { Bucket } from '../theme/buckets';
import { formatNumberInput, parseNumberInput, toIsoDate } from '../utils/format';

let seq = 0;
const draftKey = () => `d${Date.now().toString(36)}${seq++}`;

export const INCOME_KINDS: Array<{ key: IncomeKind; label: string }> = [
  { key: 'salary', label: 'Salary' },
  { key: 'business', label: 'Business' },
  { key: 'side_hustle', label: 'Side hustle' },
  { key: 'allowance', label: 'Allowance' },
  { key: 'other', label: 'Other' }
];

export const INCOME_FREQUENCIES: ReadonlyArray<{ key: IncomeFrequency; label: string }> = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'biweekly', label: '2 weeks' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'irregular', label: 'Varies' }
];

export const FREQUENCY_WORD: Record<IncomeFrequency, string> = { monthly: 'a month', biweekly: 'every 2 weeks', weekly: 'a week', irregular: 'in a normal month' };

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const kindLabel = (kind: IncomeKind) => INCOME_KINDS.find((k) => k.key === kind)?.label ?? 'Income';

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${s}`;
}

export type DraftIncome = {
  key: string;
  name: string;
  kind: IncomeKind;
  amount: string;
  frequency: IncomeFrequency;
  payDay: number | null;
  payWeekday: number | null;
};

export function blankIncome(kind: IncomeKind = 'salary'): DraftIncome {
  return { key: draftKey(), name: kindLabel(kind), kind, amount: '', frequency: 'monthly', payDay: null, payWeekday: null };
}

/** The next date (today included) that falls on a weekday, 0 = Sunday. */
export function nextWeekdayIso(weekday: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
  return toIsoDate(d);
}

export function toIncomeInput(d: DraftIncome): IncomeInput | null {
  const amount = parseNumberInput(d.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const weekly = d.frequency === 'weekly' || d.frequency === 'biweekly';
  return {
    name: d.name.trim() || kindLabel(d.kind),
    kind: d.kind,
    amount,
    frequency: d.frequency,
    payDay: d.frequency === 'monthly' ? d.payDay : null,
    nextPayDate: weekly && d.payWeekday != null ? nextWeekdayIso(d.payWeekday) : null,
    isEstimate: d.frequency === 'irregular'
  };
}

export function fromApiIncome(s: ApiIncomeSource): DraftIncome {
  return {
    key: s.id,
    name: s.name,
    kind: s.kind,
    amount: formatNumberInput(String(Math.round(s.amount))),
    frequency: s.frequency,
    payDay: s.payDay,
    payWeekday: s.nextPayDate ? new Date(`${s.nextPayDate}T12:00:00`).getDay() : null
  };
}

/** "paid on the 25th", "paid on Fridays", "amount varies". */
export function describePay(s: { frequency: IncomeFrequency; payDay: number | null; nextPayDate: string | null }): string {
  if (s.frequency === 'irregular') return 'amount varies';
  if (s.frequency === 'monthly') return s.payDay ? `paid on the ${ordinal(s.payDay)}` : 'monthly';
  const day = s.nextPayDate ? WEEKDAYS[new Date(`${s.nextPayDate}T12:00:00`).getDay()] : null;
  return `${s.frequency === 'weekly' ? 'weekly' : 'every 2 weeks'}${day ? ` on ${day}` : ''}`;
}

export type DraftBill = {
  key: string;
  name: string;
  category: string;
  bucket: Bucket;
  amount: string;
  frequency: BillFrequency;
  dueDay: number | null;
};

// Regular commitments. Day-to-day spending like food and transport comes out of Needs, so it isn't listed.
export const BILL_PRESETS: Array<Omit<DraftBill, 'key' | 'amount' | 'dueDay'>> = [
  { name: 'Rent', category: 'Rent & housing', bucket: 'Needs', frequency: 'yearly' },
  { name: 'Electricity', category: 'Bills & utilities', bucket: 'Needs', frequency: 'monthly' },
  { name: 'Data & airtime', category: 'Data & airtime', bucket: 'Needs', frequency: 'monthly' },
  { name: 'School fees', category: 'School fees', bucket: 'Needs', frequency: 'yearly' },
  { name: 'Family support', category: 'Family support', bucket: 'Needs', frequency: 'monthly' },
  { name: 'Tithe & offering', category: 'Tithe & offering', bucket: 'Needs', frequency: 'monthly' },
  { name: 'Loan repayment', category: 'Debt repayment', bucket: 'Needs', frequency: 'monthly' },
  { name: 'Subscriptions', category: 'Subscriptions', bucket: 'Wants', frequency: 'monthly' },
  { name: 'Ajo / contribution', category: 'Savings', bucket: 'Savings', frequency: 'monthly' }
];

export function blankBill(preset?: Omit<DraftBill, 'key' | 'amount' | 'dueDay'>): DraftBill {
  return { key: draftKey(), amount: '', dueDay: null, ...(preset ?? { name: '', category: 'Other', bucket: 'Needs', frequency: 'monthly' }) };
}

export function toBillInput(d: DraftBill): BillInput | null {
  const amount = parseNumberInput(d.amount);
  if (!d.name.trim() || !Number.isFinite(amount) || amount <= 0) return null;
  return { name: d.name.trim(), category: d.category, bucket: d.bucket, amount, frequency: d.frequency, dueDay: d.dueDay };
}
