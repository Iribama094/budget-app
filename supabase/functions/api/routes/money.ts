import { iso, isUuid, sql } from '../lib/db.ts';
import { requireAuth } from '../lib/auth.ts';
import { badRequest, body, json, methodNotAllowed, noContent, notFound, spaceParam, z } from '../lib/http.ts';
import { ISO_DATE, todayIso } from '../lib/dates.ts';
import { computePriceWatch } from '../lib/prices.ts';
import { budgetCovering } from '../lib/budgets.ts';
import { afterTransactionCreated } from '../lib/effects.ts';
import type { Ctx } from '../index.ts';

/*
 * Your money: what you have, what you own, what you're owed and what you owe, in one place. Balances are what
 * the person last told us (plus linked bank balances), never a ledger to keep in step. Anything in another
 * currency is counted at the person's own rate, or the app's when they haven't set one.
 */

const HAVE = ['cash', 'bank', 'wallet'] as const;
const OWN = ['property', 'land', 'vehicle', 'investment', 'pension', 'crypto', 'other'] as const;
const KINDS = [...HAVE, ...OWN] as const;
const SYMBOL_CODES: Record<string, string> = { '₦': 'NGN', $: 'USD', '€': 'EUR', '£': 'GBP', 'GH₵': 'GHS', KSh: 'KES', R: 'ZAR', '₹': 'INR' };

/** The person's own currency as an ISO code, whether it was saved as NGN or ₦. */
export function homeCode(currency: string | null | undefined): string {
  const c = String(currency ?? '').trim();
  if (/^[A-Za-z]{3}$/.test(c)) return c.toUpperCase();
  return SYMBOL_CODES[c] ?? 'NGN';
}

/** Rates into the person's own currency: theirs first, then the ones staff keep up to date. */
export async function ratesFor(userId: string): Promise<{ home: string; rates: Record<string, number>; own: Record<string, number> }> {
  const [[profile], blocks] = await Promise.all([
    sql`select currency, fx_rates from public.profiles where id = ${userId}`,
    sql<{ value: any }[]>`select value from public.content_blocks where kind = 'fx_rate' and enabled`
  ]);
  const home = homeCode(profile?.currency);
  const rates: Record<string, number> = {};
  // Staff rates are kept against the naira; they only apply to people whose own currency is the naira.
  if (home === 'NGN') for (const b of blocks) if (b.value?.currency && Number(b.value?.rate) > 0) rates[String(b.value.currency).toUpperCase()] = Number(b.value.rate);
  const own: Record<string, number> = {};
  for (const [k, v] of Object.entries(profile?.fxRates ?? {})) if (Number(v) > 0) own[k.toUpperCase()] = Number(v);
  return { home, rates: { ...rates, ...own }, own };
}

/** An amount in the person's own currency, or null when there's no rate to count it with. */
export function toHome(amount: number, currency: string | null | undefined, fx: { home: string; rates: Record<string, number> }): number | null {
  const c = (currency ?? fx.home).toUpperCase();
  if (c === fx.home) return amount;
  const rate = fx.rates[c];
  return rate ? amount * rate : null;
}

/* ------------------------------------------------------------------ prices */

/** GET /v1/prices?spaceId: rising prices on the person's own needs and bills. */
export async function pricesRoute(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const { userId } = await requireAuth(ctx.req);
  return json(200, await computePriceWatch(userId, spaceParam(ctx.query.get('spaceId')) ?? 'personal'));
}

/* ------------------------------------------------------------------ exchange rates */

const RatesSchema = z.object({ rates: z.record(z.string().regex(/^[A-Za-z]{3}$/), z.number().finite().positive().nullable()) });

/** GET/PUT /v1/fx-rates: the rates this person counts foreign money at. A null rate goes back to the app's. */
export async function fxRatesRoute(ctx: Ctx) {
  if (ctx.method !== 'GET' && ctx.method !== 'PUT') methodNotAllowed(['GET', 'PUT']);
  const { userId } = await requireAuth(ctx.req);
  if (ctx.method === 'PUT') {
    const input = await body(ctx.req, RatesSchema);
    const current = (await ratesFor(userId)).own;
    for (const [k, v] of Object.entries(input.rates)) {
      if (v == null) delete current[k.toUpperCase()];
      else current[k.toUpperCase()] = v;
    }
    await sql`update public.profiles set fx_rates = ${sql.json(current)} where id = ${userId}`;
  }
  return json(200, await ratesFor(userId));
}

/* ------------------------------------------------------------------ holdings */

const HoldingSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(KINDS),
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  balance: z.number().finite().nonnegative().max(1e14),
  note: z.string().max(200).nullable().optional(),
  spaceId: z.enum(['personal', 'business']).optional()
});

const toApiHolding = (h: any) => ({
  id: h.id,
  spaceId: h.spaceId,
  name: h.name,
  kind: h.kind,
  group: (HAVE as readonly string[]).includes(h.kind) ? 'have' : 'own',
  currency: h.currency,
  balance: Number(h.balance),
  note: h.note ?? null,
  updatedAt: iso(h.updatedAt)
});

/** GET/POST /v1/holdings */
export async function holdingsIndex(ctx: Ctx) {
  if (ctx.method !== 'GET' && ctx.method !== 'POST') methodNotAllowed(['GET', 'POST']);
  const { userId } = await requireAuth(ctx.req);
  if (ctx.method === 'POST') {
    const input = await body(ctx.req, HoldingSchema);
    const home = (await ratesFor(userId)).home;
    const [h] = await sql`
      insert into public.holdings (user_id, space_id, name, kind, currency, balance, note)
      values (${userId}, ${input.spaceId ?? 'personal'}, ${input.name}, ${input.kind}, ${(input.currency ?? home).toUpperCase()}, ${input.balance}, ${input.note ?? null})
      returning *
    `;
    return json(201, { holding: toApiHolding(h) });
  }
  const space = spaceParam(ctx.query.get('spaceId')) ?? 'personal';
  const items = await sql`select * from public.holdings where user_id = ${userId} and space_id = ${space} order by kind, name`;
  return json(200, { items: items.map(toApiHolding) });
}

/** PATCH/DELETE /v1/holdings/:id. Updating the balance is the whole point: "I have ₦12,000 cash now". */
export async function holdingById(ctx: Ctx) {
  const { userId } = await requireAuth(ctx.req);
  const id = ctx.parts[1];
  if (!isUuid(id)) notFound('Not found');
  if (ctx.method === 'DELETE') {
    const gone = await sql`delete from public.holdings where id = ${id} and user_id = ${userId} returning id`;
    if (!gone.length) notFound('Not found');
    return noContent();
  }
  if (ctx.method !== 'PATCH') methodNotAllowed(['PATCH', 'DELETE']);
  const p = await body(ctx.req, HoldingSchema.partial().omit({ spaceId: true }).strict());
  const [h] = await sql`
    update public.holdings set
      name = coalesce(${p.name ?? null}, name),
      kind = coalesce(${p.kind ?? null}, kind),
      currency = coalesce(${p.currency?.toUpperCase() ?? null}, currency),
      balance = coalesce(${p.balance ?? null}, balance),
      note = ${p.note !== undefined ? p.note : sql`note`}
    where id = ${id} and user_id = ${userId}
    returning *
  `;
  if (!h) notFound('Not found');
  return json(200, { holding: toApiHolding(h) });
}

/* ------------------------------------------------------------------ debts */

const DebtSchema = z.object({
  direction: z.enum(['owe', 'owed']),
  person: z.string().trim().min(1).max(80),
  amount: z.number().finite().positive().max(1e14),
  /** What's still unpaid, when some was already paid before it was added here. Defaults to the amount. */
  balance: z.number().finite().nonnegative().max(1e14).optional(),
  monthlyRate: z.number().min(0).max(100).nullable().optional(),
  dueDate: z.string().regex(ISO_DATE).nullable().optional(),
  note: z.string().max(200).nullable().optional(),
  spaceId: z.enum(['personal', 'business']).optional()
});

const toApiDebt = (d: any) => ({
  id: d.id,
  spaceId: d.spaceId,
  direction: d.direction,
  person: d.person,
  amount: Number(d.amount),
  balance: Number(d.balance),
  monthlyRate: d.monthlyRate == null ? null : Number(d.monthlyRate),
  dueDate: d.dueDate ?? null,
  note: d.note ?? null,
  closedAt: d.closedAt ? iso(d.closedAt) : null,
  createdAt: iso(d.createdAt)
});

/**
 * Which debt to clear first: the dearest (highest interest) first, then the smallest, so the most expensive
 * money goes and small wins come quickly. Returns ids in order.
 */
export function payoffOrder(debts: Array<{ id: string; balance: number; monthlyRate: number | null }>): string[] {
  return [...debts]
    .filter((d) => d.balance > 0)
    .sort((a, b) => (b.monthlyRate ?? 0) - (a.monthlyRate ?? 0) || a.balance - b.balance)
    .map((d) => d.id);
}

/** GET/POST /v1/debts */
export async function debtsIndex(ctx: Ctx) {
  if (ctx.method !== 'GET' && ctx.method !== 'POST') methodNotAllowed(['GET', 'POST']);
  const { userId } = await requireAuth(ctx.req);
  if (ctx.method === 'POST') {
    const input = await body(ctx.req, DebtSchema);
    const [d] = await sql`
      insert into public.debts (user_id, space_id, direction, person, amount, balance, monthly_rate, due_date, note)
      values (${userId}, ${input.spaceId ?? 'personal'}, ${input.direction}, ${input.person}, ${input.amount},
              ${Math.min(input.balance ?? input.amount, input.amount)}, ${input.monthlyRate ?? null}, ${input.dueDate ?? null}::date, ${input.note ?? null})
      returning *
    `;
    return json(201, { debt: toApiDebt(d) });
  }
  const space = spaceParam(ctx.query.get('spaceId')) ?? 'personal';
  const all = ctx.query.get('includeClosed') === '1';
  const items = await sql`
    select * from public.debts where user_id = ${userId} and space_id = ${space} ${all ? sql`` : sql`and closed_at is null`}
    order by closed_at nulls first, due_date nulls last, created_at desc
  `;
  const owe = items.filter((d) => d.direction === 'owe' && !d.closedAt).map((d) => ({ id: d.id, balance: Number(d.balance), monthlyRate: d.monthlyRate == null ? null : Number(d.monthlyRate) }));
  return json(200, { items: items.map(toApiDebt), payoffOrder: payoffOrder(owe) });
}

const PaymentSchema = z.object({
  amount: z.number().finite().positive().max(1e14),
  paidOn: z.string().regex(ISO_DATE).optional(),
  /** Also record it as spending (repaying what you owe) so the budget knows the money left. */
  record: z.boolean().optional()
});

/** PATCH/DELETE /v1/debts/:id, POST /v1/debts/:id/payments */
export async function debtById(ctx: Ctx) {
  const { userId } = await requireAuth(ctx.req);
  const [, id, sub] = ctx.parts;
  if (!isUuid(id)) notFound('Not found');
  const [debt] = await sql`select * from public.debts where id = ${id} and user_id = ${userId}`;
  if (!debt) notFound('Not found');

  if (sub === 'payments') {
    if (ctx.method !== 'POST') methodNotAllowed(['POST']);
    const input = await body(ctx.req, PaymentSchema);
    const paidOn = input.paidOn ?? todayIso();
    const amount = Math.min(input.amount, Number(debt.balance));
    if (amount <= 0) badRequest('This one is already cleared');
    let transactionId: string | null = null;
    if ((input.record ?? debt.direction === 'owe') && debt.direction === 'owe') {
      const budgetId = await budgetCovering(userId, debt.spaceId, paidOn);
      const [tx] = await sql`
        insert into public.transactions (user_id, space_id, type, amount, category, description, budget_id, budget_category, occurred_at)
        values (${userId}, ${debt.spaceId}, 'expense', ${amount}, ${debt.spaceId === 'business' ? 'Loan repayment' : 'Debt repayment'}, ${`Paid ${debt.person}`}, ${budgetId}, ${budgetId ? 'Needs' : null},
                ${new Date(`${paidOn}T12:00:00.000Z`)})
        returning id, user_id, space_id, type, amount, budget_id, budget_category
      `;
      transactionId = tx.id;
      await afterTransactionCreated(tx as any);
    }
    await sql`insert into public.debt_payments (user_id, debt_id, amount, paid_on, transaction_id) values (${userId}, ${id}, ${amount}, ${paidOn}::date, ${transactionId})`;
    const [d] = await sql`
      update public.debts set balance = greatest(0, balance - ${amount}),
        closed_at = case when balance - ${amount} <= 0.005 then now() else null end
      where id = ${id} returning *
    `;
    return json(200, { debt: toApiDebt(d), transactionId });
  }

  if (ctx.method === 'DELETE') {
    await sql`delete from public.debts where id = ${id} and user_id = ${userId}`;
    return noContent();
  }
  if (ctx.method !== 'PATCH') methodNotAllowed(['PATCH', 'DELETE']);
  const p = await body(ctx.req, DebtSchema.partial().omit({ spaceId: true, direction: true }).strict());
  const balance = p.balance ?? Number(debt.balance);
  const [d] = await sql`
    update public.debts set
      person = ${p.person ?? debt.person},
      amount = ${p.amount ?? debt.amount},
      balance = ${balance},
      monthly_rate = ${p.monthlyRate !== undefined ? p.monthlyRate : debt.monthlyRate},
      due_date = ${p.dueDate !== undefined ? p.dueDate : debt.dueDate}::date,
      note = ${p.note !== undefined ? p.note : debt.note},
      closed_at = ${balance <= 0 ? debt.closedAt ?? new Date() : null},
      reminded_for = ${p.dueDate !== undefined ? null : debt.remindedFor}::date
    where id = ${id} returning *
  `;
  return json(200, { debt: toApiDebt(d) });
}

/* ------------------------------------------------------------------ the overview */

/**
 * GET /v1/money?spaceId: everything on the "Your money" screen in one call. Also keeps this month's net worth
 * snapshot fresh, so the history builds itself just by looking.
 */
export async function moneyRoute(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const { userId } = await requireAuth(ctx.req);
  const space = spaceParam(ctx.query.get('spaceId')) ?? 'personal';
  const [fx, holdings, accounts, debts] = await Promise.all([
    ratesFor(userId),
    sql`select * from public.holdings where user_id = ${userId} and space_id = ${space} order by kind, name`,
    sql`
      select a.id, a.name, a.mask, a.currency, a.balance, l.bank_name, l.logo_url from public.bank_accounts a
      join public.bank_links l on l.id = a.bank_link_id
      where a.user_id = ${userId} and a.space_id = ${space}
    `,
    sql`select * from public.debts where user_id = ${userId} and space_id = ${space} and closed_at is null order by due_date nulls last, created_at desc`
  ]);

  const missing = new Set<string>();
  const add = (amount: number, currency: string | null) => {
    const v = toHome(amount, currency, fx);
    if (v == null) missing.add(String(currency).toUpperCase());
    return v ?? 0;
  };
  const items = holdings.map(toApiHolding);
  const have = items.filter((h) => h.group === 'have').reduce((s, h) => s + add(h.balance, h.currency), 0) + accounts.reduce((s, a) => s + add(Number(a.balance ?? 0), a.currency), 0);
  const own = items.filter((h) => h.group === 'own').reduce((s, h) => s + add(h.balance, h.currency), 0);
  const owedToYou = debts.filter((d) => d.direction === 'owed').reduce((s, d) => s + Number(d.balance), 0);
  const owe = debts.filter((d) => d.direction === 'owe').reduce((s, d) => s + Number(d.balance), 0);

  // Only worth remembering once there's something in it.
  const month = `${todayIso().slice(0, 7)}-01`;
  if (space === 'personal' && (items.length || accounts.length || debts.length)) {
    await sql`
      insert into public.net_worth_snapshots (user_id, month, have, own, owed_to_you, owe)
      values (${userId}, ${month}::date, ${have}, ${own}, ${owedToYou}, ${owe})
      on conflict (user_id, month) do update set have = excluded.have, own = excluded.own, owed_to_you = excluded.owed_to_you, owe = excluded.owe, updated_at = now()
    `;
  }
  const history =
    space === 'personal'
      ? await sql`select month, have + own + owed_to_you - owe as net from public.net_worth_snapshots where user_id = ${userId} order by month desc limit 12`
      : [];

  // Settled debts stay in the list to look back on, but nobody should be told to pay one off again. The debts
  // route already leaves them out; this one did not, so a debt closed while still carrying a balance, one that
  // was written off or forgiven, could turn up as the next thing to clear.
  const oweList = debts
    .filter((d) => d.direction === 'owe' && !d.closedAt)
    .map((d) => ({ id: d.id, balance: Number(d.balance), monthlyRate: d.monthlyRate == null ? null : Number(d.monthlyRate) }));
  return json(200, {
    home: fx.home,
    rates: fx.rates,
    missingRates: [...missing],
    totals: { have: Math.round(have), own: Math.round(own), owedToYou: Math.round(owedToYou), owe: Math.round(owe), net: Math.round(have + own + owedToYou - owe) },
    holdings: items,
    bankAccounts: accounts.map((a) => ({ id: a.id, name: a.name, mask: a.mask, currency: a.currency, balance: Number(a.balance ?? 0), bankName: a.bankName, logoUrl: a.logoUrl ?? null })),
    debts: debts.map(toApiDebt),
    payoffOrder: payoffOrder(oweList),
    history: history.map((h) => ({ month: String(h.month).slice(0, 7), net: Math.round(Number(h.net)) })).reverse()
  });
}
