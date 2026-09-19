import { iso, sql } from './db.ts';
import { addDaysIso, parseIsoDateUtcNoon, todayIso } from './dates.ts';
import { budgetCovering } from './budgets.ts';
import { afterTransactionCreated } from './effects.ts';
import { defaultBucketFor, ensureCategories, type Bucket } from './categories.ts';
import { clampedIso } from './plan.ts';
import { computeTax, loadRuleForCountry } from './tax.ts';
import { currencyFor, formatMoney, notifyUser } from './notify.ts';
import { pick, voice } from './voice.ts';
import type { Insight } from './insights.ts';
import type { Space } from './http.ts';

export const OWNER_PAY_CATEGORY = 'Owner’s pay';
export const BUSINESS_PAY_INCOME = 'Pay from business';

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const round2 = (n: number) => Math.round(n * 100) / 100;

export const tzOffsetMinutes = () => {
  const n = Number(Deno.env.get('APP_TZ_OFFSET_MINUTES') ?? 60);
  return Number.isFinite(n) ? n : 60;
};

/** "2026-08" → "August 2026". */
export function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

/* ------------------------------------------------------------------ settings */

export async function getBusinessSettings(userId: string) {
  const [row] = await sql`
    insert into public.business_settings (user_id) values (${userId})
    on conflict (user_id) do update set user_id = excluded.user_id
    returning *
  `;
  return row;
}

export function toApiSettings(s: any) {
  return {
    businessName: s.businessName ?? null,
    businessEmail: s.businessEmail ?? null,
    businessPhone: s.businessPhone ?? null,
    businessAddress: s.businessAddress ?? null,
    vatRegistered: s.vatRegistered,
    vatRate: Number(s.vatRate),
    taxSetAsidePct: Number(s.taxSetAsidePct),
    runwayBufferMonths: Number(s.runwayBufferMonths),
    invoicePrefix: s.invoicePrefix,
    filingReminders: s.filingReminders
  };
}

/* ------------------------------------------------------------------ recording */

/** Adds a category when it's missing so recorded transactions show with the right name, bucket and icon. */
export async function ensureCategory(userId: string, space: Space, name: string, type: 'income' | 'expense', bucket: Bucket | null, icon: string) {
  await ensureCategories(userId, space);
  await sql`
    insert into public.categories (user_id, space_id, name, type, bucket, icon, sort_order)
    values (${userId}, ${space}, ${name}, ${type}, ${type === 'expense' ? bucket : null}, ${icon}, 500)
    on conflict do nothing
  `;
}

/**
 * Records a payment the person made or received in the real world as a transaction. The client id makes it
 * idempotent, so a retried request never records the same payment twice.
 */
export async function recordTransaction(input: {
  userId: string;
  space: Space;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string;
  occurredOn: string;
  clientId: string;
  bucket?: Bucket | null;
}): Promise<string | null> {
  const bucket = input.type === 'expense' ? input.bucket ?? defaultBucketFor(input.category, input.space) ?? 'Needs' : null;
  const budgetId = input.type === 'expense' ? await budgetCovering(input.userId, input.space, input.occurredOn) : null;
  const [tx] = await sql`
    insert into public.transactions (user_id, space_id, type, amount, category, description, budget_id, budget_category, client_id, occurred_at)
    values (${input.userId}, ${input.space}, ${input.type}, ${round2(input.amount)}, ${input.category}, ${input.description.slice(0, 120)},
            ${budgetId}, ${budgetId ? bucket : null}, ${input.clientId}, ${new Date(`${input.occurredOn}T11:00:00.000Z`)})
    on conflict (user_id, client_id) do nothing
    returning id, user_id, space_id, type, amount, budget_id, budget_category, occurred_at
  `;
  if (!tx) {
    const [existing] = await sql`select id from public.transactions where user_id = ${input.userId} and client_id = ${input.clientId}`;
    return existing?.id ?? null;
  }
  await afterTransactionCreated(tx as any);
  return tx.id;
}

/* ------------------------------------------------------------------ invoices and bills */

export type InvoiceItem = { description: string; quantity: number; unitPrice: number };

export function invoiceTotals(items: InvoiceItem[], vatRate: number) {
  const subtotal = round2(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
  const vatAmount = round2((subtotal * vatRate) / 100);
  return { subtotal, vatAmount, total: round2(subtotal + vatAmount) };
}

/** Status from what's been paid, keeping drafts and voided documents as they are. */
export function paymentStatus(total: number, paid: number, current: string): string {
  if (current === 'void' || current === 'draft') return current;
  if (paid <= 0) return 'unpaid';
  return paid + 0.005 >= total ? 'paid' : 'part_paid';
}

const daysBetween = (from: string, to: string) => Math.round((parseIsoDateUtcNoon(to).getTime() - parseIsoDateUtcNoon(from).getTime()) / 86400000);

export function toApiInvoice(r: any, today = todayIso()) {
  const total = Number(r.total);
  const paid = Number(r.amountPaid);
  const open = r.status === 'unpaid' || r.status === 'part_paid';
  const daysOverdue = open ? Math.max(0, daysBetween(r.dueDate, today)) : 0;
  return {
    id: r.id,
    number: r.number,
    customerName: r.customerName,
    customerPhone: r.customerPhone ?? null,
    customerEmail: r.customerEmail ?? null,
    issueDate: r.issueDate,
    dueDate: r.dueDate,
    items: (r.items ?? []).map((i: any) => ({ description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })),
    subtotal: Number(r.subtotal),
    vatRate: Number(r.vatRate),
    vatAmount: Number(r.vatAmount),
    total,
    amountPaid: paid,
    balance: round2(Math.max(0, total - paid)),
    status: r.status,
    overdue: open && daysOverdue > 0,
    daysOverdue,
    notes: r.notes ?? null,
    sentAt: iso(r.sentAt),
    paidAt: iso(r.paidAt),
    createdAt: iso(r.createdAt)
  };
}

export function toApiBill(r: any, today = todayIso()) {
  const amount = Number(r.amount);
  const paid = Number(r.amountPaid);
  const open = r.status === 'unpaid' || r.status === 'part_paid';
  const dueIn = daysBetween(today, r.dueDate);
  return {
    id: r.id,
    kind: r.kind,
    supplierName: r.supplierName,
    description: r.description,
    category: r.category,
    amount,
    amountPaid: paid,
    balance: round2(Math.max(0, amount - paid)),
    billDate: r.billDate,
    dueDate: r.dueDate,
    status: r.status,
    overdue: open && dueIn < 0,
    dueInDays: dueIn,
    notes: r.notes ?? null,
    paidAt: iso(r.paidAt),
    createdAt: iso(r.createdAt)
  };
}

/* ------------------------------------------------------------------ payroll */

/** Estimated monthly PAYE for a gross salary, using the app's tax rules (Nigeria by default). An estimate only. */
export function monthlyPaye(country: string | null | undefined, monthlyGross: number): number {
  const rule = loadRuleForCountry(country || 'ng') ?? loadRuleForCountry('ng');
  if (!rule || monthlyGross <= 0) return 0;
  return Math.round(computeTax(rule, { grossAnnual: monthlyGross * 12 }).totalTaxAnnual / 12);
}

export function toApiStaff(s: any, country: string | null) {
  const gross = Number(s.monthlyGross);
  const paye = monthlyPaye(country, gross);
  return { id: s.id, name: s.name, role: s.role ?? null, monthlyGross: gross, payeEstimate: paye, netEstimate: Math.max(0, gross - paye), active: s.active };
}

/* ------------------------------------------------------------------ tax deadlines */

export type Deadline = { kind: 'vat' | 'paye'; title: string; dueDate: string; forPeriod: string; note: string };

/** Upcoming filing dates to remind about. Dates follow common Nigerian practice; people should confirm with an accountant. */
export function taxDeadlines(settings: any, hasStaff: boolean, today = todayIso()): Deadline[] {
  const t = parseIsoDateUtcNoon(today);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  const next = (day: number) => {
    const thisMonth = clampedIso(y, m, day);
    const [dy, dm] = (thisMonth >= today ? thisMonth : clampedIso(y, m + 1, day)).split('-').map(Number);
    const due = thisMonth >= today ? thisMonth : clampedIso(y, m + 1, day);
    const prev = new Date(Date.UTC(dy, dm - 2, 1));
    return { due, period: `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}` };
  };
  const out: Deadline[] = [];
  if (settings?.vatRegistered) {
    const n = next(21);
    out.push({ kind: 'vat', title: `VAT return for ${monthLabel(n.period)}`, dueDate: n.due, forPeriod: n.period, note: 'Usually due by the 21st of the following month.' });
  }
  if (hasStaff) {
    const n = next(10);
    out.push({ kind: 'paye', title: `PAYE for ${monthLabel(n.period)}`, dueDate: n.due, forPeriod: n.period, note: 'Usually due by the 10th of the following month.' });
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/* ------------------------------------------------------------------ summary */

/** Everything the business home, tax and pay-yourself screens show, computed from recorded data. */
export async function businessSummary(userId: string, today = todayIso()) {
  const settings = await getBusinessSettings(userId);
  const offset = tzOffsetMinutes();
  const t = parseIsoDateUtcNoon(today);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  const keys = Array.from({ length: 6 }, (_, i) => clampedIso(y, m - 5 + i, 1).slice(0, 7));
  const monthStart = clampedIso(y, m, 1);

  const [rows, [cashRow], [recv], [pay], [{ staffCount }], [vat], [profile], [paidRow]] = await Promise.all([
    sql`
      select to_char((occurred_at at time zone 'UTC') + make_interval(mins => ${offset}), 'YYYY-MM') as month, type, category, sum(amount) as total
      from public.transactions
      where user_id = ${userId} and space_id = 'business' and occurred_at >= ${new Date(`${keys[0]}-01T00:00:00Z`)}
      group by 1, 2, 3
    `,
    sql`select coalesce(sum(case when type = 'income' then amount else -amount end), 0) as cash from public.transactions where user_id = ${userId} and space_id = 'business'`,
    sql`
      select count(*)::int as open_count, coalesce(sum(total - amount_paid), 0) as open_total,
             count(*) filter (where due_date < ${today}::date)::int as overdue_count,
             coalesce(sum(total - amount_paid) filter (where due_date < ${today}::date), 0) as overdue_total
      from public.invoices where user_id = ${userId} and status in ('unpaid', 'part_paid')
    `,
    sql`
      select count(*)::int as open_count, coalesce(sum(amount - amount_paid), 0) as open_total,
             count(*) filter (where due_date <= ${addDaysIso(today, 7)}::date)::int as due_soon_count,
             coalesce(sum(amount - amount_paid) filter (where due_date <= ${addDaysIso(today, 7)}::date), 0) as due_soon_total,
             coalesce(sum(amount - amount_paid) filter (where kind = 'paye'), 0) as paye_owed
      from public.supplier_bills where user_id = ${userId} and status in ('unpaid', 'part_paid')
    `,
    sql`select count(*)::int as staff_count from public.staff where user_id = ${userId} and active`,
    sql`
      select coalesce(sum(p.amount * case when i.total > 0 then i.vat_amount / i.total else 0 end), 0) as collected
      from public.invoice_payments p join public.invoices i on i.id = p.invoice_id
      where p.user_id = ${userId} and p.paid_on >= ${monthStart}::date
    `,
    sql`select tax_profile from public.profiles where id = ${userId}`,
    sql`select coalesce(sum(amount), 0) as paid from public.owner_pay where user_id = ${userId} and period = ${monthStart.slice(0, 7)}`
  ]);

  const months = new Map(keys.map((k) => [k, { revenue: 0, costs: 0, ownerPay: 0 }]));
  const costsByCategory = new Map<string, number>();
  for (const r of rows) {
    const mm = months.get(r.month);
    if (!mm) continue;
    const amount = Number(r.total);
    if (r.type === 'income') mm.revenue += amount;
    else if (r.category === OWNER_PAY_CATEGORY) mm.ownerPay += amount;
    else {
      mm.costs += amount;
      if (r.month === keys[5]) costsByCategory.set(r.category, (costsByCategory.get(r.category) ?? 0) + amount);
    }
  }
  const series = keys.map((k) => {
    const v = months.get(k)!;
    return { month: k, label: MONTHS_LONG[Number(k.slice(5)) - 1].slice(0, 3), revenue: round2(v.revenue), costs: round2(v.costs), profit: round2(v.revenue - v.costs), ownerPay: round2(v.ownerPay) };
  });
  const current = series[5];
  const previous = series[4];
  const past = series.slice(2, 5).map((s) => s.costs).filter((c) => c > 0);
  const avgCosts = past.length ? past.reduce((a, b) => a + b, 0) / past.length : current.costs;
  const cash = round2(Number(cashRow.cash));
  const taxSetAsidePct = Number(settings.taxSetAsidePct);
  const taxSetAside = Math.round((Math.max(0, current.profit) * taxSetAsidePct) / 100);

  const receivables = { openCount: recv.openCount, openTotal: round2(Number(recv.openTotal)), overdueCount: recv.overdueCount, overdueTotal: round2(Number(recv.overdueTotal)) };
  const payables = {
    openCount: pay.openCount,
    openTotal: round2(Number(pay.openTotal)),
    dueSoonCount: pay.dueSoonCount,
    dueSoonTotal: round2(Number(pay.dueSoonTotal)),
    payeOwed: round2(Number(pay.payeOwed))
  };

  // What the owner could safely pay themselves this month: never more than this month's profit after the tax
  // set-aside, and never so much that tracked cash drops below the chosen buffer of monthly costs plus money owed.
  const bufferMonths = Number(settings.runwayBufferMonths);
  const buffer = Math.round(avgCosts * bufferMonths);
  const alreadyPaid = round2(Number(paidRow.paid));
  const fromProfit = current.profit - taxSetAside;
  const fromCash = cash + alreadyPaid - buffer - taxSetAside - payables.openTotal;
  const suggested = Math.max(0, Math.floor((Math.min(fromProfit, fromCash) - alreadyPaid) / 1000) * 1000);

  return {
    settings: toApiSettings(settings),
    month: monthStart.slice(0, 7),
    series,
    current,
    margin: current.revenue > 0 ? Math.round((current.profit / current.revenue) * 100) : null,
    changeVsLastMonth: previous.profit !== 0 ? Math.round(((current.profit - previous.profit) / Math.abs(previous.profit)) * 100) : null,
    topCosts: [...costsByCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([category, amount]) => ({ category, amount: round2(amount) })),
    cash,
    avgMonthlyCosts: Math.round(avgCosts),
    runwayMonths: avgCosts > 0 ? round2(cash / avgCosts) : null,
    receivables,
    payables,
    staffCount,
    tax: {
      setAsidePct: taxSetAsidePct,
      setAside: taxSetAside,
      vatCollectedThisMonth: Math.round(Number(vat.collected)),
      payeOwed: payables.payeOwed,
      deadlines: taxDeadlines(settings, staffCount > 0, today)
    },
    payYourself: {
      suggested,
      alreadyPaid,
      profit: current.profit,
      taxSetAside,
      cash,
      buffer,
      bufferMonths,
      openBills: payables.openTotal,
      country: profile?.taxProfile?.country ?? 'NG'
    }
  };
}

/* ------------------------------------------------------------------ early warnings */

/** Business-space suggestions: cash runway, slow sales, costs outgrowing sales, overdue invoices and bills due. */
export async function computeBusinessWarnings(userId: string, today = todayIso()): Promise<Insight[]> {
  const [summary, currency, weeks, trend] = await Promise.all([
    businessSummary(userId, today),
    currencyFor(userId),
    sql`
      select floor(extract(epoch from (now() - occurred_at)) / 604800)::int as week, sum(amount) as total
      from public.transactions
      where user_id = ${userId} and space_id = 'business' and type = 'income' and occurred_at > now() - interval '63 days'
      group by 1
    `,
    sql`
      select type,
        coalesce(sum(amount) filter (where occurred_at > now() - interval '30 days'), 0) as cur,
        coalesce(sum(amount) filter (where occurred_at <= now() - interval '30 days' and occurred_at > now() - interval '60 days'), 0) as prev
      from public.transactions
      where user_id = ${userId} and space_id = 'business' and category <> ${OWNER_PAY_CATEGORY} and occurred_at > now() - interval '60 days'
      group by type
    `
  ]);
  const money = (n: number) => formatMoney(n, currency);
  const month = today.slice(0, 7);
  const out: Insight[] = [];

  if (summary.runwayMonths != null && summary.runwayMonths < 2 && summary.avgMonthlyCosts > 0) {
    out.push({
      key: `biz-runway:${month}`,
      kind: 'runway',
      tone: 'warning',
      title: summary.runwayMonths <= 0 ? 'Business cash has run out' : `Cash may only last ${summary.runwayMonths.toFixed(1)} months`,
      body: `${money(Math.max(0, summary.cash))} tracked covers costs of about ${money(summary.avgMonthlyCosts)} a month. Chase money owed or trim one cost this week.`,
      action: summary.receivables.openCount ? { label: 'See who owes you', screen: 'Invoices' } : { label: 'See the report', screen: 'BusinessReports' }
    });
  }

  if (summary.receivables.overdueCount > 0) {
    out.push({
      key: `biz-overdue:${today}`,
      kind: 'spike',
      tone: 'warning',
      title: pick([`${money(summary.receivables.overdueTotal)} is overdue`, `Customers owe you ${money(summary.receivables.overdueTotal)}`], today),
      body: `${summary.receivables.overdueCount} invoice${summary.receivables.overdueCount === 1 ? ' is' : 's are'} past due. A friendly reminder usually does it.`,
      action: { label: 'Send reminders', screen: 'Invoices' }
    });
  }

  const byWeek = new Map(weeks.map((w) => [w.week, Number(w.total)]));
  const prior = Array.from({ length: 8 }, (_, i) => byWeek.get(i + 1) ?? 0);
  const activeWeeks = prior.filter((v) => v > 0);
  if (activeWeeks.length >= 4) {
    const usual = activeWeeks.reduce((a, b) => a + b, 0) / activeWeeks.length;
    const thisWeek = byWeek.get(0) ?? 0;
    if (thisWeek < usual * 0.5) {
      out.push({
        key: `biz-slow:${today.slice(0, 8)}${Math.floor(Number(today.slice(8)) / 7)}`,
        kind: 'spike',
        tone: 'warning',
        title: 'Sales are slow this week',
        body: `${money(thisWeek)} in the last 7 days, compared with about ${money(usual)} in a normal week. A quick promo or follow-up with regular customers can help.`,
        action: { label: 'See the numbers', screen: 'BusinessReports' }
      });
    }
  }

  const rev = trend.find((r) => r.type === 'income');
  const cost = trend.find((r) => r.type === 'expense');
  if (cost && Number(cost.prev) > 0 && rev && Number(rev.prev) > 0) {
    const costGrowth = Math.round((Number(cost.cur) / Number(cost.prev) - 1) * 100);
    const revGrowth = Math.round((Number(rev.cur) / Number(rev.prev) - 1) * 100);
    if (costGrowth >= 15 && costGrowth - revGrowth >= 20) {
      out.push({
        key: `biz-costs:${month}`,
        kind: 'plan_drift',
        tone: 'neutral',
        title: 'Costs are growing faster than sales',
        body: `Costs are up ${costGrowth}% over the last 30 days while sales ${revGrowth >= 0 ? `grew ${revGrowth}%` : `fell ${Math.abs(revGrowth)}%`}. Check the biggest costs first.`,
        action: { label: 'See biggest costs', screen: 'BusinessReports' }
      });
    }
  }

  if (summary.payables.dueSoonCount > 0) {
    out.push({
      key: `biz-bills:${today}`,
      kind: 'regular_bill',
      tone: 'neutral',
      title: `${summary.payables.dueSoonCount} bill${summary.payables.dueSoonCount === 1 ? '' : 's'} due this week`,
      body: `${money(summary.payables.dueSoonTotal)} to pay suppliers and others in the next 7 days.`,
      action: { label: 'See bills', screen: 'Bills' }
    });
  }

  if (summary.current.profit > 0 && summary.payYourself.suggested > 0) {
    out.push({
      key: `biz-payself:${month}`,
      kind: 'kept',
      tone: 'positive',
      title: pick(['Business dey move 💪', 'You can pay yourself this month 🎉'], month),
      body: `After tax set-aside and a safety buffer, about ${money(summary.payYourself.suggested)} looks safe to pay yourself.`,
      action: { label: 'Pay yourself', screen: 'PayYourself' }
    });
  }
  return out;
}

/* ------------------------------------------------------------------ reminders */

/** Daily: nudges for invoices due or overdue, supplier bills due, and VAT / PAYE filing dates. */
export async function sendBusinessReminders(today = todayIso()): Promise<{ invoices: number; bills: number; filing: number }> {
  let invoices = 0;
  let bills = 0;
  let filing = 0;

  const dueInvoices = await sql`
    select id, user_id, number, customer_name, total, amount_paid, due_date from public.invoices
    where status in ('unpaid', 'part_paid') and due_date in (${addDaysIso(today, 1)}::date, ${addDaysIso(today, -1)}::date, ${addDaysIso(today, -7)}::date)
    limit 2000
  `;
  for (const inv of dueInvoices) {
    const currency = await currencyFor(inv.userId);
    const balance = formatMoney(Number(inv.total) - Number(inv.amountPaid), currency);
    const overdueDays = daysBetween(inv.dueDate, today);
    const note = overdueDays < 0 ? voice.invoiceDueSoon(inv.customerName, balance, inv.number) : voice.invoiceOverdue(inv.customerName, balance, overdueDays);
    const sent = await notifyUser(inv.userId, {
      kind: 'invoice',
      ...note,
      spaceId: 'business',
      data: { screen: 'InvoiceDetail', invoiceId: inv.id },
      dedupeKey: `invoice:${inv.id}:${overdueDays}`,
      dedupeTtlSec: 3 * 86400
    });
    if (sent) invoices++;
  }

  const dueBills = await sql`
    select id, user_id, supplier_name, amount, amount_paid, due_date from public.supplier_bills
    where status in ('unpaid', 'part_paid') and due_date in (${today}::date, ${addDaysIso(today, 2)}::date)
    limit 2000
  `;
  for (const bill of dueBills) {
    const currency = await currencyFor(bill.userId);
    const sent = await notifyUser(bill.userId, {
      kind: 'bill',
      ...voice.billDueSoon(bill.supplierName, formatMoney(Number(bill.amount) - Number(bill.amountPaid), currency), bill.dueDate === today ? 'today' : 'in 2 days'),
      spaceId: 'business',
      data: { screen: 'Bills' },
      dedupeKey: `supplier-bill:${bill.id}:${bill.dueDate === today ? 0 : 2}`,
      dedupeTtlSec: 3 * 86400
    });
    if (sent) bills++;
  }

  const day = Number(today.slice(8));
  if (day === 14 || day === 5) {
    const prevMonth = clampedIso(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1).slice(0, 7);
    const people = await sql`
      select s.user_id, s.vat_registered,
        exists (select 1 from public.staff st where st.user_id = s.user_id and st.active) as has_staff,
        (select coalesce(sum(b.amount - b.amount_paid), 0) from public.supplier_bills b where b.user_id = s.user_id and b.kind = 'paye' and b.status in ('unpaid', 'part_paid')) as paye_owed
      from public.business_settings s where s.filing_reminders
      limit 5000
    `;
    for (const p of people) {
      if (day === 14 && p.vatRegistered) {
        if (await notifyUser(p.userId, { kind: 'tax', spaceId: 'business', ...voice.vatReminder(monthLabel(prevMonth)), data: { screen: 'BusinessTax' }, dedupeKey: `vat:${prevMonth}`, dedupeTtlSec: 20 * 86400 })) filing++;
      }
      if (day === 5 && p.hasStaff) {
        const currency = await currencyFor(p.userId);
        const owed = Number(p.payeOwed);
        if (await notifyUser(p.userId, { kind: 'tax', spaceId: 'business', ...voice.payeReminder(monthLabel(prevMonth), owed > 0 ? formatMoney(owed, currency) : null), data: { screen: 'BusinessTax' }, dedupeKey: `paye:${prevMonth}`, dedupeTtlSec: 20 * 86400 })) filing++;
      }
    }
  }
  return { invoices, bills, filing };
}
