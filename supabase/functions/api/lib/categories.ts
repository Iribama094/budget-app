import { iso, sql } from './db.ts';
import type { Space } from './http.ts';

export type Bucket = 'Needs' | 'Wants' | 'Savings';
export const BUCKETS: Bucket[] = ['Needs', 'Wants', 'Savings'];

/** Maps any bucket label, including the older ones (Essential, Free Spending, …), onto Needs / Wants / Savings. */
export function normalizeBucket(value: unknown): Bucket | null {
  const k = String(value ?? '').trim().toLowerCase();
  if (!k) return null;
  if (k.startsWith('need') || k.startsWith('essential') || k.includes('operating') || k.startsWith('debt') || k.includes('loan') || k.includes('must')) return 'Needs';
  if (k.startsWith('want') || k.startsWith('free') || k.includes('discretionary') || k.startsWith('misc') || k.includes('flexible')) return 'Wants';
  if (k.startsWith('saving') || k.includes('reserve') || k.startsWith('invest') || k.includes('growth')) return 'Savings';
  return null;
}

type Def = [name: string, icon: string];
type Group = { type: 'income' | 'expense'; bucket: Bucket | null; items: Def[] };

// Icon keys are resolved to icons in the app (src/lib/categoryIcons.ts).
const DEFAULTS: Record<Space, Group[]> = {
  personal: [
    {
      type: 'expense',
      bucket: 'Needs',
      items: [
        ['Food & groceries', 'cart'],
        ['Rent & housing', 'home'],
        ['Transport', 'car'],
        ['Bills & utilities', 'zap'],
        ['Data & airtime', 'wifi'],
        ['Health', 'heart'],
        ['School fees', 'school'],
        ['Family support', 'family'],
        ['Tithe & offering', 'church'],
        ['Debt repayment', 'card']
      ]
    },
    {
      type: 'expense',
      bucket: 'Wants',
      items: [
        ['Eating out', 'utensils'],
        ['Shopping', 'bag'],
        ['Entertainment', 'tv'],
        ['Subscriptions', 'repeat'],
        ['Personal care', 'sparkles'],
        ['Gifts', 'gift'],
        ['Travel', 'plane'],
        ['Other', 'tag']
      ]
    },
    { type: 'expense', bucket: 'Savings', items: [['Savings', 'piggy'], ['Emergency fund', 'shield'], ['Investments', 'trending']] },
    {
      type: 'income',
      bucket: null,
      items: [
        ['Salary', 'briefcase'],
        ['Business income', 'store'],
        ['Side hustle', 'coins'],
        ['Allowance', 'wallet'],
        ['Gift received', 'gift'],
        ['Interest', 'percent'],
        ['Refund', 'undo'],
        ['Other income', 'tag']
      ]
    }
  ],
  business: [
    {
      type: 'expense',
      bucket: 'Needs',
      items: [
        ['Payroll', 'family'],
        ['Rent', 'home'],
        ['Utilities', 'zap'],
        ['Stock & supplies', 'box'],
        ['Professional services', 'briefcase'],
        ['Taxes & fees', 'landmark'],
        ['Shipping & delivery', 'truck'],
        ['Loan repayment', 'card']
      ]
    },
    {
      type: 'expense',
      bucket: 'Wants',
      items: [
        ['Marketing', 'megaphone'],
        ['Software & subscriptions', 'laptop'],
        ['Travel', 'plane'],
        ['Equipment', 'box'],
        ['Other', 'tag']
      ]
    },
    { type: 'expense', bucket: 'Savings', items: [['Business savings', 'piggy'], ['Growth & expansion', 'trending']] },
    {
      type: 'income',
      bucket: null,
      items: [
        ['Client payment', 'briefcase'],
        ['Sales', 'store'],
        ['Service revenue', 'coins'],
        ['Interest', 'percent'],
        ['Other income', 'tag']
      ]
    }
  ]
};

export function defaultBucketFor(name: string, space: Space = 'personal'): Bucket | null {
  const n = name.trim().toLowerCase();
  for (const g of DEFAULTS[space]) if (g.items.some(([d]) => d.toLowerCase() === n)) return g.bucket;
  return null;
}

/** Gives a new user (or space) the default categories the first time they're needed. */
export async function ensureCategories(userId: string, space: Space): Promise<void> {
  const [{ n }] = await sql`select count(*)::int as n from public.categories where user_id = ${userId} and space_id = ${space}`;
  if (n > 0) return;
  let order = 0;
  const rows = DEFAULTS[space].flatMap((g) =>
    g.items.map(([name, icon]) => ({
      user_id: userId,
      space_id: space,
      name,
      type: g.type,
      bucket: g.bucket,
      icon,
      is_default: true,
      sort_order: order++
    }))
  );
  await sql`
    insert into public.categories ${sql(rows, 'user_id', 'space_id', 'name', 'type', 'bucket', 'icon', 'is_default', 'sort_order')}
    on conflict do nothing
  `;
}

export function toApiCategory(c: any) {
  return {
    id: c.id,
    spaceId: c.spaceId,
    name: c.name,
    type: c.type,
    bucket: c.bucket ?? null,
    icon: c.icon,
    isDefault: c.isDefault,
    hidden: c.hidden,
    sortOrder: c.sortOrder,
    createdAt: iso(c.createdAt)
  };
}

/* ------------------------------------------------------------------ learning */

const STOP = new Set([
  'pos', 'web', 'nip', 'trf', 'transfer', 'purchase', 'payment', 'pmt', 'frm', 'from', 'to', 'for', 'the', 'and', 'at', 'via', 'ref',
  'ng', 'nga', 'lagos', 'abuja', 'ltd', 'limited', 'plc', 'debit', 'credit', 'card', 'online', 'txn', 'trx', 'of', 'my', 'in', 'on', 'paid', 'bought'
]);

/** "POS PURCHASE SHOPRITE LEKKI 0042" → "shoprite lekki": the words that identify who was paid. */
export function patternOf(text: string | null | undefined): string | null {
  const words = String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
  return words.length ? words.slice(0, 2).join(' ') : null;
}

/** Remembers which category a person uses for a payee, so the next one is suggested for them. */
export async function learnCategory(
  userId: string,
  type: 'income' | 'expense',
  description: string | null | undefined,
  category: string | null | undefined,
  budgetCategory: string | null | undefined
): Promise<void> {
  const pattern = patternOf(description);
  const cat = String(category ?? '').trim();
  if (!pattern || !cat) return;
  await sql`
    insert into public.category_rules (user_id, type, pattern, category, bucket)
    values (${userId}, ${type}, ${pattern}, ${cat}, ${normalizeBucket(budgetCategory)})
    on conflict (user_id, type, pattern) do update set
      hits = case when category_rules.category = excluded.category then category_rules.hits + 1 else 1 end,
      category = excluded.category,
      bucket = coalesce(excluded.bucket, category_rules.bucket),
      updated_at = now()
  `;
}

// Common Nigerian payees and words, used until someone's own history takes over.
const EXPENSE_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(uber|bolt|taxify|indrive|keke|okada|brt|danfo|fuel|petrol|filling station|conoil|oando|transport|bus fare)\b/, 'Transport'],
  [/\b(shoprite|spar|justrite|ebeano|market|grocer\w*|supermarket|foodstuff|provisions?)\b/, 'Food & groceries'],
  [/\b(chicken republic|kfc|domino\w*|pizza|restaurant|eatery|suya|cafe|coldstone|mr biggs|bukka|amala)\b/, 'Eating out'],
  [/\b(mtn|airtel|glo|9mobile|airtime|data bundle|data|recharge|vtu)\b/, 'Data & airtime'],
  [/\b(ikeja electric|eko electric|ibedc|aedc|phed|electricity|prepaid meter|nepa|water bill|lawma|diesel|cooking gas|gas refill)\b/, 'Bills & utilities'],
  [/\b(netflix|spotify|dstv|gotv|showmax|startimes|youtube|icloud|prime video|subscription)\b/, 'Subscriptions'],
  [/\b(church|tithes?|offering|seed|mosque|zakat|sadaqah|rccg|winners|deeper life)\b/, 'Tithe & offering'],
  [/\b(rent|landlord|caution fee|service charge)\b/, 'Rent & housing'],
  [/\b(pharmacy|hospital|clinic|medplus|drugs?|dental|hmo|lab test)\b/, 'Health'],
  [/\b(school|fees|tuition|lesson|textbooks?|uniform|waec|jamb)\b/, 'School fees'],
  [/\b(mum|mom|mummy|mama|dad|daddy|papa|sister|brother|family|aunty|uncle|parents)\b/, 'Family support'],
  [/\b(loan|repayment|carbon|fairmoney|palmcredit|renmoney|quickcheck)\b/, 'Debt repayment'],
  [/\b(jumia|konga|clothes|shoes|boutique|mall|shopping)\b/, 'Shopping'],
  [/\b(cinema|filmhouse|genesis|games?|bet9ja|sportybet|betking|club|lounge)\b/, 'Entertainment'],
  [/\b(salon|barber|spa|makeup|nails|hair)\b/, 'Personal care'],
  [/\b(piggyvest|cowrywise|savings|ajo|esusu|thrift)\b/, 'Savings'],
  [/\b(risevest|bamboo|trove|stocks?|investment|crypto)\b/, 'Investments']
];

const INCOME_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(salary|payroll|wages?)\b/, 'Salary'],
  [/\b(sales?|customer|client|invoice|order)\b/, 'Business income'],
  [/\b(interest)\b/, 'Interest'],
  [/\b(refund|reversal|cashback)\b/, 'Refund'],
  [/\b(allowance|upkeep|pocket money)\b/, 'Allowance'],
  [/\b(gift|birthday)\b/, 'Gift received']
];

export type Suggestion = { category: string; bucket: Bucket | null; source: 'learned' | 'keyword' };

/** Best category for a description: the person's own history first, then common payees. */
export async function suggestCategory(userId: string, type: 'income' | 'expense', space: Space, text: string): Promise<Suggestion | null> {
  const pattern = patternOf(text);
  if (pattern) {
    const first = pattern.split(' ')[0];
    const [rule] = await sql`
      select category, bucket from public.category_rules
      where user_id = ${userId} and type = ${type}
        and (pattern = ${pattern} or pattern = ${first} or pattern like ${`${first} %`})
      order by (pattern = ${pattern}) desc, hits desc, updated_at desc
      limit 1
    `;
    if (rule) return { category: rule.category, bucket: normalizeBucket(rule.bucket), source: 'learned' };
  }

  const lower = ` ${String(text).toLowerCase()} `;
  const hit = (type === 'expense' ? EXPENSE_KEYWORDS : INCOME_KEYWORDS).find(([re]) => re.test(lower));
  if (!hit) return null;
  await ensureCategories(userId, space);
  const [cat] = await sql`
    select name, bucket from public.categories
    where user_id = ${userId} and space_id = ${space} and type = ${type} and lower(name) = lower(${hit[1]}) and not hidden
    limit 1
  `;
  return cat ? { category: cat.name, bucket: normalizeBucket(cat.bucket), source: 'keyword' } : null;
}
