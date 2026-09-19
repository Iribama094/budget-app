import { iso, isUniqueViolation, isUuid, sql } from '../lib/db.ts';
import { requireAuth } from '../lib/auth.ts';
import { badRequest, body, HttpError, json, methodNotAllowed, noContent, notFound, spaceParam, z } from '../lib/http.ts';
import { addDaysIso, ISO_DATE, todayIso } from '../lib/dates.ts';
import { clampedIso } from '../lib/plan.ts';
import { merchantFromNarration } from '../lib/bank.ts';
import {
  BUSINESS_PAY_INCOME,
  businessSummary,
  ensureCategory,
  getBusinessSettings,
  invoiceTotals,
  monthLabel,
  monthlyPaye,
  OWNER_PAY_CATEGORY,
  paymentStatus,
  recordTransaction,
  toApiBill,
  toApiInvoice,
  toApiSettings,
  toApiStaff
} from '../lib/business.ts';
import { computeWrapped } from '../lib/wrapped.ts';
import type { Ctx } from '../index.ts';

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = z.number().finite().positive().max(1e12);

/* ------------------------------------------------------------------ settings and summary */

const SettingsSchema = z
  .object({
    businessName: z.string().trim().max(80).nullable().optional(),
    businessEmail: z.string().trim().email().max(120).nullable().optional().or(z.literal('')),
    businessPhone: z.string().trim().max(30).nullable().optional(),
    businessAddress: z.string().trim().max(200).nullable().optional(),
    vatRegistered: z.boolean().optional(),
    vatRate: z.number().min(0).max(50).optional(),
    taxSetAsidePct: z.number().min(0).max(60).optional(),
    runwayBufferMonths: z.number().min(0).max(24).optional(),
    invoicePrefix: z.string().trim().min(1).max(8).regex(/^[A-Za-z0-9-]+$/).optional(),
    filingReminders: z.boolean().optional()
  })
  .strict();

/** GET/PATCH /v1/business/settings */
export async function businessSettings(ctx: Ctx) {
  if (ctx.method !== 'GET' && ctx.method !== 'PATCH') methodNotAllowed(['GET', 'PATCH']);
  const { userId } = await requireAuth(ctx.req);
  const current = await getBusinessSettings(userId);
  if (ctx.method === 'GET') return json(200, { settings: toApiSettings(current) });

  const p = await body(ctx.req, SettingsSchema);
  const pick = <T>(v: T | undefined, fallback: T) => (v !== undefined ? v : fallback);
  const [row] = await sql`
    update public.business_settings set
      business_name = ${pick(p.businessName, current.businessName)},
      business_email = ${pick(p.businessEmail || null, current.businessEmail)},
      business_phone = ${pick(p.businessPhone, current.businessPhone)},
      business_address = ${pick(p.businessAddress, current.businessAddress)},
      vat_registered = ${pick(p.vatRegistered, current.vatRegistered)},
      vat_rate = ${pick(p.vatRate, Number(current.vatRate))},
      tax_set_aside_pct = ${pick(p.taxSetAsidePct, Number(current.taxSetAsidePct))},
      runway_buffer_months = ${pick(p.runwayBufferMonths, Number(current.runwayBufferMonths))},
      invoice_prefix = ${pick(p.invoicePrefix?.toUpperCase(), current.invoicePrefix)},
      filing_reminders = ${pick(p.filingReminders, current.filingReminders)}
    where user_id = ${userId}
    returning *
  `;
  return json(200, { settings: toApiSettings(row) });
}

/** GET /v1/business/summary */
export async function businessSummaryRoute(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const { userId } = await requireAuth(ctx.req);
  return json(200, { summary: await businessSummary(userId) });
}

/* ------------------------------------------------------------------ invoices */

const ItemSchema = z.object({ description: z.string().trim().min(1).max(120), quantity: z.number().positive().max(1e6), unitPrice: z.number().min(0).max(1e12) });

const InvoiceSchema = z.object({
  customerName: z.string().trim().min(1).max(80),
  customerPhone: z.string().trim().max(30).nullable().optional(),
  customerEmail: z.string().trim().email().max(120).nullable().optional().or(z.literal('')),
  issueDate: z.string().regex(ISO_DATE).optional(),
  dueDate: z.string().regex(ISO_DATE),
  items: z.array(ItemSchema).min(1).max(50),
  applyVat: z.boolean().optional(),
  notes: z.string().trim().max(500).nullable().optional()
});

/** GET/POST /v1/invoices?status=open|paid|all */
export async function invoicesIndex(ctx: Ctx) {
  if (ctx.method !== 'GET' && ctx.method !== 'POST') methodNotAllowed(['GET', 'POST']);
  const { userId } = await requireAuth(ctx.req);
  const today = todayIso();

  if (ctx.method === 'POST') {
    const input = await body(ctx.req, InvoiceSchema);
    const settings = await getBusinessSettings(userId);
    const issueDate = input.issueDate ?? today;
    if (input.dueDate < issueDate) badRequest('The due date can’t be before the invoice date.');
    const vatRate = (input.applyVat ?? settings.vatRegistered) ? Number(settings.vatRate) : 0;
    const totals = invoiceTotals(input.items, vatRate);
    if (totals.total <= 0) badRequest('Add at least one item with a price.');
    const [{ n }] = await sql`
      update public.business_settings set next_invoice_number = next_invoice_number + 1
      where user_id = ${userId} returning next_invoice_number - 1 as n
    `;
    const number = `${settings.invoicePrefix}-${String(n).padStart(4, '0')}`;
    const [row] = await sql`
      insert into public.invoices
        (user_id, number, customer_name, customer_phone, customer_email, issue_date, due_date, items, subtotal, vat_rate, vat_amount, total, notes)
      values (${userId}, ${number}, ${input.customerName}, ${input.customerPhone ?? null}, ${input.customerEmail || null}, ${issueDate}::date, ${input.dueDate}::date,
              ${sql.json(input.items)}, ${totals.subtotal}, ${vatRate}, ${totals.vatAmount}, ${totals.total}, ${input.notes ?? null})
      returning *
    `;
    return json(201, { invoice: toApiInvoice(row, today) });
  }

  const status = ctx.query.get('status') ?? 'all';
  const rows = await sql`
    select * from public.invoices where user_id = ${userId}
      ${status === 'open' ? sql`and status in ('unpaid', 'part_paid')` : status === 'paid' ? sql`and status = 'paid'` : sql``}
    order by (status in ('unpaid', 'part_paid')) desc, due_date asc, created_at desc
    limit 500
  `;
  const items = rows.map((r) => toApiInvoice(r, today));
  const open = items.filter((i) => i.status === 'unpaid' || i.status === 'part_paid');
  return json(200, {
    items,
    totals: {
      owed: round2(open.reduce((s, i) => s + i.balance, 0)),
      overdue: round2(open.filter((i) => i.overdue).reduce((s, i) => s + i.balance, 0)),
      overdueCount: open.filter((i) => i.overdue).length
    }
  });
}

/** GET/PATCH/DELETE /v1/invoices/:id — once money has been received, only the due date and notes can change. */
export async function invoiceById(ctx: Ctx) {
  if (!['GET', 'PATCH', 'DELETE'].includes(ctx.method)) methodNotAllowed(['GET', 'PATCH', 'DELETE']);
  const { userId } = await requireAuth(ctx.req);
  const id = ctx.parts[1];
  const [inv] = isUuid(id) ? await sql`select * from public.invoices where id = ${id} and user_id = ${userId}` : [];
  if (!inv) notFound('Invoice not found');
  const today = todayIso();

  if (ctx.method === 'GET') {
    const [payments, settings] = await Promise.all([
      sql`select id, amount, paid_on, transaction_id, created_at from public.invoice_payments where invoice_id = ${id} order by paid_on, created_at`,
      getBusinessSettings(userId)
    ]);
    return json(200, {
      invoice: toApiInvoice(inv, today),
      payments: payments.map((p) => ({ id: p.id, amount: Number(p.amount), paidOn: p.paidOn, transactionId: p.transactionId })),
      business: toApiSettings(settings)
    });
  }

  if (ctx.method === 'DELETE') {
    if (Number(inv.amountPaid) > 0) badRequest('This invoice has payments recorded. Void it instead.');
    await sql`delete from public.invoices where id = ${id} and user_id = ${userId}`;
    return noContent();
  }

  const PatchSchema = InvoiceSchema.partial().extend({ status: z.enum(['void']).optional() }).strict();
  const p = await body(ctx.req, PatchSchema);
  if (p.status === 'void') {
    const [row] = await sql`update public.invoices set status = 'void' where id = ${id} returning *`;
    return json(200, { invoice: toApiInvoice(row, today) });
  }
  const hasPayments = Number(inv.amountPaid) > 0;
  if (hasPayments && (p.items || p.customerName || p.applyVat !== undefined)) badRequest('Payments are recorded on this invoice, so only the due date and notes can change.');

  const items = p.items ?? inv.items;
  const vatRate = p.applyVat === undefined ? Number(inv.vatRate) : p.applyVat ? Number((await getBusinessSettings(userId)).vatRate) : 0;
  const totals = invoiceTotals(items, vatRate);
  const dueDate = p.dueDate ?? inv.dueDate;
  const issueDate = p.issueDate ?? inv.issueDate;
  if (dueDate < issueDate) badRequest('The due date can’t be before the invoice date.');
  const [row] = await sql`
    update public.invoices set
      customer_name = ${p.customerName ?? inv.customerName},
      customer_phone = ${p.customerPhone !== undefined ? p.customerPhone : inv.customerPhone},
      customer_email = ${p.customerEmail !== undefined ? p.customerEmail || null : inv.customerEmail},
      issue_date = ${issueDate}::date,
      due_date = ${dueDate}::date,
      items = ${sql.json(items)},
      subtotal = ${totals.subtotal},
      vat_rate = ${vatRate},
      vat_amount = ${totals.vatAmount},
      total = ${totals.total},
      notes = ${p.notes !== undefined ? p.notes : inv.notes},
      status = ${paymentStatus(totals.total, Number(inv.amountPaid), inv.status)}
    where id = ${id}
    returning *
  `;
  return json(200, { invoice: toApiInvoice(row, today) });
}

const PaymentSchema = z.object({ amount: money.optional(), paidOn: z.string().regex(ISO_DATE).optional(), category: z.string().trim().min(1).max(40).optional() });

/** POST /v1/invoices/:id/payments (record money received) and /v1/invoices/:id/sent */
export async function invoiceAction(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { userId } = await requireAuth(ctx.req);
  const [, id, action] = ctx.parts;
  const [inv] = isUuid(id) ? await sql`select * from public.invoices where id = ${id} and user_id = ${userId}` : [];
  if (!inv) notFound('Invoice not found');
  const today = todayIso();

  if (action === 'sent') {
    const [row] = await sql`update public.invoices set sent_at = now(), status = case when status = 'draft' then 'unpaid' else status end where id = ${id} returning *`;
    return json(200, { invoice: toApiInvoice(row, today) });
  }
  if (action !== 'payments') notFound('Route not found');
  if (inv.status === 'void') badRequest('This invoice was voided.');

  const input = await body(ctx.req, PaymentSchema);
  const balance = round2(Number(inv.total) - Number(inv.amountPaid));
  if (balance <= 0) badRequest('This invoice is already fully paid.');
  const amount = round2(input.amount ?? balance);
  if (amount > balance + 0.005) badRequest(`That’s more than the ${balance.toLocaleString()} still owed.`);
  const paidOn = input.paidOn ?? today;
  const category = input.category ?? 'Sales';

  const [payment] = await sql`insert into public.invoice_payments (user_id, invoice_id, amount, paid_on) values (${userId}, ${id}, ${amount}, ${paidOn}::date) returning id`;
  await ensureCategory(userId, 'business', category, 'income', null, 'store');
  const txId = await recordTransaction({
    userId,
    space: 'business',
    type: 'income',
    amount,
    category,
    description: `${inv.number} · ${inv.customerName}`,
    occurredOn: paidOn,
    clientId: `invoice-payment:${payment.id}`
  });
  await sql`update public.invoice_payments set transaction_id = ${txId} where id = ${payment.id}`;
  const paid = round2(Number(inv.amountPaid) + amount);
  const status = paymentStatus(Number(inv.total), paid, inv.status === 'draft' ? 'unpaid' : inv.status);
  const [row] = await sql`
    update public.invoices set amount_paid = ${paid}, status = ${status}, paid_at = ${status === 'paid' ? new Date() : null}
    where id = ${id} returning *
  `;
  return json(201, { invoice: toApiInvoice(row, today), transactionId: txId });
}

/* ------------------------------------------------------------------ supplier bills */

const BillSchema = z.object({
  supplierName: z.string().trim().min(1).max(80),
  description: z.string().trim().max(120).optional(),
  category: z.string().trim().min(1).max(40).optional(),
  amount: money,
  billDate: z.string().regex(ISO_DATE).optional(),
  dueDate: z.string().regex(ISO_DATE),
  notes: z.string().trim().max(500).nullable().optional()
});

/** GET/POST /v1/bills?status=open|paid|all */
export async function billsIndex(ctx: Ctx) {
  if (ctx.method !== 'GET' && ctx.method !== 'POST') methodNotAllowed(['GET', 'POST']);
  const { userId } = await requireAuth(ctx.req);
  const today = todayIso();

  if (ctx.method === 'POST') {
    const input = await body(ctx.req, BillSchema);
    const [row] = await sql`
      insert into public.supplier_bills (user_id, supplier_name, description, category, amount, bill_date, due_date, notes)
      values (${userId}, ${input.supplierName}, ${input.description ?? ''}, ${input.category ?? 'Stock & supplies'}, ${input.amount},
              ${input.billDate ?? today}::date, ${input.dueDate}::date, ${input.notes ?? null})
      returning *
    `;
    return json(201, { bill: toApiBill(row, today) });
  }

  const status = ctx.query.get('status') ?? 'all';
  const rows = await sql`
    select * from public.supplier_bills where user_id = ${userId}
      ${status === 'open' ? sql`and status in ('unpaid', 'part_paid')` : status === 'paid' ? sql`and status = 'paid'` : sql``}
    order by (status in ('unpaid', 'part_paid')) desc, due_date asc, created_at desc
    limit 500
  `;
  const items = rows.map((r) => toApiBill(r, today));
  const open = items.filter((b) => b.status === 'unpaid' || b.status === 'part_paid');
  return json(200, {
    items,
    totals: {
      owe: round2(open.reduce((s, b) => s + b.balance, 0)),
      dueThisWeek: round2(open.filter((b) => b.dueInDays <= 7).reduce((s, b) => s + b.balance, 0)),
      overdueCount: open.filter((b) => b.overdue).length
    }
  });
}

/** PATCH/DELETE /v1/bills/:id and POST /v1/bills/:id/payments */
export async function billById(ctx: Ctx) {
  const { userId } = await requireAuth(ctx.req);
  const [, id, action] = ctx.parts;
  const [bill] = isUuid(id) ? await sql`select * from public.supplier_bills where id = ${id} and user_id = ${userId}` : [];
  if (!bill) notFound('Bill not found');
  const today = todayIso();

  if (action === 'payments') {
    if (ctx.method !== 'POST') methodNotAllowed(['POST']);
    if (bill.status === 'void') badRequest('This bill was voided.');
    const input = await body(ctx.req, PaymentSchema);
    const balance = round2(Number(bill.amount) - Number(bill.amountPaid));
    if (balance <= 0) badRequest('This bill is already fully paid.');
    const amount = round2(input.amount ?? balance);
    if (amount > balance + 0.005) badRequest(`That’s more than the ${balance.toLocaleString()} still owed.`);
    const paidOn = input.paidOn ?? today;
    const [payment] = await sql`insert into public.bill_payments (user_id, bill_id, amount, paid_on) values (${userId}, ${id}, ${amount}, ${paidOn}::date) returning id`;
    await ensureCategory(userId, 'business', bill.category, 'expense', null, 'box');
    const txId = await recordTransaction({
      userId,
      space: 'business',
      type: 'expense',
      amount,
      category: bill.category,
      description: [bill.supplierName, bill.description].filter(Boolean).join(' · '),
      occurredOn: paidOn,
      clientId: `bill-payment:${payment.id}`
    });
    await sql`update public.bill_payments set transaction_id = ${txId} where id = ${payment.id}`;
    const paid = round2(Number(bill.amountPaid) + amount);
    const status = paymentStatus(Number(bill.amount), paid, bill.status);
    const [row] = await sql`update public.supplier_bills set amount_paid = ${paid}, status = ${status}, paid_at = ${status === 'paid' ? new Date() : null} where id = ${id} returning *`;
    return json(201, { bill: toApiBill(row, today), transactionId: txId });
  }
  if (action) notFound('Route not found');

  if (ctx.method === 'DELETE') {
    if (Number(bill.amountPaid) > 0) badRequest('Payments are recorded on this bill, so it can’t be deleted.');
    await sql`delete from public.supplier_bills where id = ${id} and user_id = ${userId}`;
    return noContent();
  }
  if (ctx.method !== 'PATCH') methodNotAllowed(['PATCH', 'DELETE']);
  const p = await body(ctx.req, BillSchema.partial().extend({ status: z.enum(['void']).optional() }).strict());
  const amount = p.amount ?? Number(bill.amount);
  if (amount < Number(bill.amountPaid)) badRequest('The amount can’t be less than what’s already been paid.');
  const [row] = await sql`
    update public.supplier_bills set
      supplier_name = ${p.supplierName ?? bill.supplierName},
      description = ${p.description ?? bill.description},
      category = ${p.category ?? bill.category},
      amount = ${amount},
      bill_date = ${p.billDate ?? bill.billDate}::date,
      due_date = ${p.dueDate ?? bill.dueDate}::date,
      notes = ${p.notes !== undefined ? p.notes : bill.notes},
      status = ${p.status === 'void' ? 'void' : paymentStatus(amount, Number(bill.amountPaid), bill.status)}
    where id = ${id} returning *
  `;
  return json(200, { bill: toApiBill(row, today) });
}

/* ------------------------------------------------------------------ staff and payroll */

const StaffSchema = z.object({ name: z.string().trim().min(1).max(80), role: z.string().trim().max(60).nullable().optional(), monthlyGross: z.number().min(0).max(1e11), active: z.boolean().optional() });

async function countryOf(userId: string): Promise<string> {
  const [p] = await sql`select tax_profile from public.profiles where id = ${userId}`;
  return p?.taxProfile?.country ?? 'NG';
}

/** GET /v1/payroll — staff with PAYE estimates, recent pay runs. POST /v1/staff adds someone. */
export async function payrollIndex(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const { userId } = await requireAuth(ctx.req);
  const [staff, runs, country] = await Promise.all([
    sql`select * from public.staff where user_id = ${userId} order by active desc, name asc`,
    sql`select * from public.payroll_runs where user_id = ${userId} order by period desc limit 24`,
    countryOf(userId)
  ]);
  const items = staff.map((s) => toApiStaff(s, country));
  const active = items.filter((s) => s.active);
  return json(200, {
    staff: items,
    totals: {
      gross: active.reduce((s, x) => s + x.monthlyGross, 0),
      paye: active.reduce((s, x) => s + x.payeEstimate, 0),
      net: active.reduce((s, x) => s + x.netEstimate, 0)
    },
    runs: runs.map((r) => ({
      id: r.id,
      period: r.period,
      label: monthLabel(r.period),
      paidOn: r.paidOn,
      totalGross: Number(r.totalGross),
      totalPaye: Number(r.totalPaye),
      totalNet: Number(r.totalNet),
      lines: r.lines,
      payeBillId: r.payeBillId,
      createdAt: iso(r.createdAt)
    }))
  });
}

export async function staffIndex(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { userId } = await requireAuth(ctx.req);
  const input = await body(ctx.req, StaffSchema);
  const [{ n }] = await sql`select count(*)::int as n from public.staff where user_id = ${userId}`;
  if (n >= 200) badRequest('You can add up to 200 staff.');
  const [row] = await sql`insert into public.staff (user_id, name, role, monthly_gross, active) values (${userId}, ${input.name}, ${input.role ?? null}, ${input.monthlyGross}, ${input.active ?? true}) returning *`;
  return json(201, { staff: toApiStaff(row, await countryOf(userId)) });
}

/** PATCH/DELETE /v1/staff/:id */
export async function staffById(ctx: Ctx) {
  if (ctx.method !== 'PATCH' && ctx.method !== 'DELETE') methodNotAllowed(['PATCH', 'DELETE']);
  const { userId } = await requireAuth(ctx.req);
  const id = ctx.parts[1];
  const [s] = isUuid(id) ? await sql`select * from public.staff where id = ${id} and user_id = ${userId}` : [];
  if (!s) notFound('Staff member not found');
  if (ctx.method === 'DELETE') {
    await sql`delete from public.staff where id = ${id}`;
    return noContent();
  }
  const p = await body(ctx.req, StaffSchema.partial().strict());
  const [row] = await sql`
    update public.staff set name = ${p.name ?? s.name}, role = ${p.role !== undefined ? p.role : s.role},
      monthly_gross = ${p.monthlyGross ?? s.monthlyGross}, active = ${p.active ?? s.active}
    where id = ${id} returning *
  `;
  return json(200, { staff: toApiStaff(row, await countryOf(userId)) });
}

const RunSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  paidOn: z.string().regex(ISO_DATE).optional(),
  lines: z.array(z.object({ staffId: z.string().uuid(), gross: z.number().min(0).max(1e11) })).max(200).optional()
});

/**
 * POST /v1/payroll/runs — records a month's pay: each person's take-home pay as a Payroll cost, and the PAYE
 * withheld as a bill to remit by the 10th of the next month.
 */
export async function payrollRun(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { userId } = await requireAuth(ctx.req);
  const input = await body(ctx.req, RunSchema);
  const today = todayIso();
  const paidOn = input.paidOn ?? today;
  const [existing] = await sql`select id from public.payroll_runs where user_id = ${userId} and period = ${input.period}`;
  if (existing) throw new HttpError(409, 'ALREADY_RUN', `Pay for ${monthLabel(input.period)} has already been recorded.`);

  const staff = await sql`select * from public.staff where user_id = ${userId} and active order by name`;
  if (!staff.length) badRequest('Add your staff first.');
  const country = await countryOf(userId);
  const override = new Map((input.lines ?? []).map((l) => [l.staffId, l.gross]));
  const lines = staff
    .map((s) => {
      const gross = round2(override.get(s.id) ?? Number(s.monthlyGross));
      const paye = monthlyPaye(country, gross);
      return { staffId: s.id, name: s.name, gross, paye, net: round2(Math.max(0, gross - paye)) };
    })
    .filter((l) => l.gross > 0);
  if (!lines.length) badRequest('Everyone’s pay is zero for this month.');

  const totals = lines.reduce((t, l) => ({ gross: t.gross + l.gross, paye: t.paye + l.paye, net: t.net + l.net }), { gross: 0, paye: 0, net: 0 });
  const [run] = await sql`
    insert into public.payroll_runs (user_id, period, paid_on, lines, total_gross, total_paye, total_net)
    values (${userId}, ${input.period}, ${paidOn}::date, ${sql.json(lines)}, ${round2(totals.gross)}, ${round2(totals.paye)}, ${round2(totals.net)})
    returning *
  `;

  await ensureCategory(userId, 'business', 'Payroll', 'expense', 'Needs', 'family');
  for (const l of lines) {
    if (l.net <= 0) continue;
    await recordTransaction({
      userId,
      space: 'business',
      type: 'expense',
      amount: l.net,
      category: 'Payroll',
      description: `Salary · ${l.name} (${monthLabel(input.period)})`,
      occurredOn: paidOn,
      clientId: `payroll:${run.id}:${l.staffId}`
    });
  }

  let payeBillId: string | null = null;
  if (totals.paye > 0) {
    const [y, m] = input.period.split('-').map(Number);
    const [bill] = await sql`
      insert into public.supplier_bills (user_id, kind, supplier_name, description, category, amount, bill_date, due_date)
      values (${userId}, 'paye', 'Tax authority (PAYE)', ${`PAYE for ${monthLabel(input.period)}`}, 'Taxes & fees', ${round2(totals.paye)}, ${paidOn}::date, ${clampedIso(y, m, 10)}::date)
      returning id
    `;
    payeBillId = bill.id;
    await sql`update public.payroll_runs set paye_bill_id = ${payeBillId} where id = ${run.id}`;
  }

  return json(201, {
    run: { id: run.id, period: run.period, label: monthLabel(run.period), paidOn, totalGross: round2(totals.gross), totalPaye: round2(totals.paye), totalNet: round2(totals.net), lines, payeBillId }
  });
}

/* ------------------------------------------------------------------ pay yourself */

const PaySelfSchema = z.object({ amount: money, paidOn: z.string().regex(ISO_DATE).optional() });

/**
 * GET: a suggested safe amount to pay yourself this month, with the reasoning.
 * POST: records it as an Owner's pay cost in Business and matching income in Personal. No money moves.
 */
export async function payYourself(ctx: Ctx) {
  if (ctx.method !== 'GET' && ctx.method !== 'POST') methodNotAllowed(['GET', 'POST']);
  const { userId } = await requireAuth(ctx.req);
  const summary = await businessSummary(userId);
  if (ctx.method === 'GET') {
    const history = await sql`select id, period, amount, suggested, paid_on from public.owner_pay where user_id = ${userId} order by paid_on desc limit 12`;
    return json(200, {
      suggestion: summary.payYourself,
      history: history.map((h) => ({ id: h.id, period: h.period, amount: Number(h.amount), suggested: h.suggested == null ? null : Number(h.suggested), paidOn: h.paidOn }))
    });
  }

  const input = await body(ctx.req, PaySelfSchema);
  const paidOn = input.paidOn ?? todayIso();
  const [row] = await sql`
    insert into public.owner_pay (user_id, period, amount, suggested, paid_on)
    values (${userId}, ${paidOn.slice(0, 7)}, ${input.amount}, ${summary.payYourself.suggested}, ${paidOn}::date)
    returning id
  `;
  await ensureCategory(userId, 'business', OWNER_PAY_CATEGORY, 'expense', 'Savings', 'wallet');
  await ensureCategory(userId, 'personal', BUSINESS_PAY_INCOME, 'income', null, 'briefcase');
  const businessTx = await recordTransaction({ userId, space: 'business', type: 'expense', amount: input.amount, category: OWNER_PAY_CATEGORY, description: 'Paid myself', occurredOn: paidOn, clientId: `owner-pay:${row.id}:business` });
  const personalTx = await recordTransaction({ userId, space: 'personal', type: 'income', amount: input.amount, category: BUSINESS_PAY_INCOME, description: 'From my business', occurredOn: paidOn, clientId: `owner-pay:${row.id}:personal` });
  await sql`update public.owner_pay set business_transaction_id = ${businessTx}, personal_transaction_id = ${personalTx} where id = ${row.id}`;
  return json(201, { id: row.id, amount: input.amount, businessTransactionId: businessTx, personalTransactionId: personalTx, overSuggestion: input.amount > summary.payYourself.suggested });
}

/* ------------------------------------------------------------------ reports */

/** GET /v1/business/report?from=&to= — profit and loss, cash flow and what's owed, for a lender-ready PDF. */
export async function businessReport(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const { userId } = await requireAuth(ctx.req);
  const today = todayIso();
  const to = ctx.query.get('to') ?? today;
  const from = ctx.query.get('from') ?? clampedIso(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, 1);
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) badRequest('Choose a valid date range.');
  const offset = Number(Deno.env.get('APP_TZ_OFFSET_MINUTES') ?? 60) * 60000;
  const fromTs = new Date(Date.parse(`${from}T00:00:00Z`) - offset);
  const toTs = new Date(Date.parse(`${to}T23:59:59.999Z`) - offset);

  const [byCategory, byMonth, [opening], [recv], [pay], settings, [profile]] = await Promise.all([
    sql`
      select type, category, sum(amount) as total, count(*)::int as n from public.transactions
      where user_id = ${userId} and space_id = 'business' and occurred_at >= ${fromTs} and occurred_at <= ${toTs}
      group by type, category order by total desc
    `,
    sql`
      select to_char((occurred_at at time zone 'UTC') + make_interval(mins => ${offset / 60000}), 'YYYY-MM') as month,
        coalesce(sum(amount) filter (where type = 'income'), 0) as money_in,
        coalesce(sum(amount) filter (where type = 'expense'), 0) as money_out
      from public.transactions
      where user_id = ${userId} and space_id = 'business' and occurred_at >= ${fromTs} and occurred_at <= ${toTs}
      group by 1 order by 1
    `,
    sql`select coalesce(sum(case when type = 'income' then amount else -amount end), 0) as balance from public.transactions where user_id = ${userId} and space_id = 'business' and occurred_at < ${fromTs}`,
    sql`select count(*)::int as n, coalesce(sum(total - amount_paid), 0) as total from public.invoices where user_id = ${userId} and status in ('unpaid', 'part_paid')`,
    sql`select count(*)::int as n, coalesce(sum(amount - amount_paid), 0) as total from public.supplier_bills where user_id = ${userId} and status in ('unpaid', 'part_paid')`,
    getBusinessSettings(userId),
    sql`select name, email, currency from public.profiles where id = ${userId}`
  ]);

  const revenue = byCategory.filter((r) => r.type === 'income').map((r) => ({ category: r.category, amount: round2(Number(r.total)), count: r.n }));
  const allCosts = byCategory.filter((r) => r.type === 'expense');
  const costs = allCosts.filter((r) => r.category !== OWNER_PAY_CATEGORY).map((r) => ({ category: r.category, amount: round2(Number(r.total)), count: r.n }));
  const ownerPay = round2(allCosts.filter((r) => r.category === OWNER_PAY_CATEGORY).reduce((s, r) => s + Number(r.total), 0));
  const revenueTotal = round2(revenue.reduce((s, r) => s + r.amount, 0));
  const costsTotal = round2(costs.reduce((s, r) => s + r.amount, 0));
  const openingBalance = round2(Number(opening.balance));
  const months = byMonth.map((m) => ({ month: m.month, label: monthLabel(m.month), moneyIn: round2(Number(m.moneyIn)), moneyOut: round2(Number(m.moneyOut)), net: round2(Number(m.moneyIn) - Number(m.moneyOut)) }));
  const closingBalance = round2(openingBalance + months.reduce((s, m) => s + m.net, 0));

  return json(200, {
    report: {
      business: { name: settings.businessName || profile?.name || 'My business', email: settings.businessEmail ?? profile?.email ?? null, phone: settings.businessPhone ?? null, address: settings.businessAddress ?? null },
      currency: profile?.currency ?? 'NGN',
      from,
      to,
      generatedAt: new Date().toISOString(),
      profitAndLoss: {
        revenue,
        revenueTotal,
        costs,
        costsTotal,
        netProfit: round2(revenueTotal - costsTotal),
        margin: revenueTotal > 0 ? Math.round(((revenueTotal - costsTotal) / revenueTotal) * 100) : null,
        ownerPay,
        retained: round2(revenueTotal - costsTotal - ownerPay)
      },
      cashFlow: { openingBalance, months, closingBalance },
      position: { receivables: { count: recv.n, total: round2(Number(recv.total)) }, payables: { count: pay.n, total: round2(Number(pay.total)) } },
      note: 'Prepared from transactions recorded in BudgetFriendly. Not an audited statement.'
    }
  });
}

/* ------------------------------------------------------------------ statement import */

const SOURCE_LABEL: Record<string, string> = { paystack: 'Paystack', moniepoint: 'Moniepoint', bank: 'Bank statement', other: 'Uploaded statement' };

const ImportSchema = z.object({
  source: z.enum(['paystack', 'moniepoint', 'bank', 'other']),
  fileName: z.string().trim().max(120).optional(),
  spaceId: z.enum(['personal', 'business']).optional(),
  rows: z
    .array(
      z.object({
        date: z.string().min(8).max(40),
        amount: z.number().positive().max(1e12),
        direction: z.enum(['credit', 'debit']),
        description: z.string().max(300).default(''),
        reference: z.string().max(120).nullable().optional()
      })
    )
    .min(1)
    .max(3000)
});

async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * POST /v1/imports/statement — rows parsed on the phone from a Paystack, Moniepoint or bank CSV. They land in
 * the review queue (Pending transactions); re-uploading the same file adds nothing twice.
 */
export async function statementImport(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { userId } = await requireAuth(ctx.req);
  const input = await body(ctx.req, ImportSchema, 'That file couldn’t be read. Check it’s a CSV export.');
  const space = input.spaceId ?? 'business';
  const provider = `upload:${input.source}`;
  const label = SOURCE_LABEL[input.source];

  let [link] = await sql`select id from public.bank_links where user_id = ${userId} and provider = ${provider} and space_id = ${space} limit 1`;
  if (!link) {
    [link] = await sql`insert into public.bank_links (user_id, space_id, provider, bank_name) values (${userId}, ${space}, ${provider}, ${label}) returning id`;
  }
  let [account] = await sql`select id, name from public.bank_accounts where bank_link_id = ${link.id} limit 1`;
  if (!account) {
    [account] = await sql`
      insert into public.bank_accounts (user_id, space_id, bank_link_id, name, mask, type, currency)
      values (${userId}, ${space}, ${link.id}, ${`${label} (uploaded)`}, 'CSV', 'statement', 'NGN') returning id, name
    `;
  }

  let imported = 0;
  let skipped = 0;
  for (const r of input.rows) {
    const when = new Date(/^\d{4}-\d{2}-\d{2}$/.test(r.date) ? `${r.date}T11:00:00.000Z` : r.date);
    if (Number.isNaN(when.getTime())) {
      skipped++;
      continue;
    }
    const externalId = r.reference?.trim()
      ? `${input.source}:${r.reference.trim()}:${r.direction}`
      : `${input.source}:${await hashText(`${when.toISOString().slice(0, 10)}|${r.amount}|${r.direction}|${r.description.trim().toLowerCase()}`)}`;
    const description = r.description.trim() || (r.direction === 'credit' ? `${label} payment` : `${label} debit`);
    const inserted = await sql`
      insert into public.imported_transactions
        (user_id, space_id, bank_account_id, bank_name, bank_account_name, amount, currency, direction, description, merchant, occurred_at, external_id)
      values (${userId}, ${space}, ${account.id}, ${label}, ${account.name}, ${round2(r.amount)}, 'NGN', ${r.direction}, ${description.slice(0, 300)},
              ${merchantFromNarration(description)}, ${when}, ${externalId})
      on conflict (user_id, external_id) do nothing
      returning id
    `;
    imported += inserted.length;
  }
  const duplicates = input.rows.length - imported - skipped;
  await sql`update public.bank_links set last_synced_at = now() where id = ${link.id}`;
  await sql`
    insert into public.statement_imports (user_id, space_id, source, file_name, rows_total, rows_imported, rows_duplicate)
    values (${userId}, ${space}, ${input.source}, ${input.fileName ?? null}, ${input.rows.length}, ${imported}, ${duplicates})
  `;
  return json(201, { imported, duplicates, skipped, total: input.rows.length, source: input.source });
}

/* ------------------------------------------------------------------ wrapped */

/** GET /v1/wrapped?kind=h1|year&year=2026&spaceId=personal */
export async function wrappedRoute(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const { userId } = await requireAuth(ctx.req);
  const today = todayIso();
  const kind = ctx.query.get('kind') === 'h1' ? 'h1' : 'year';
  const year = Number(ctx.query.get('year') ?? today.slice(0, 4));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) badRequest('Choose a valid year.');
  const space = spaceParam(ctx.query.get('spaceId')) ?? 'personal';
  return json(200, { wrapped: await computeWrapped(userId, space, kind, year, today) });
}

export const _internal = { addDaysIso, isUniqueViolation };
