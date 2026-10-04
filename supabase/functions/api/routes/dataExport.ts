// Giving somebody their own records back. The privacy notice promises this under the Nigeria Data
// Protection Act, and both app stores expect it, so it has to be real rather than a screen that says soon.
//
// Two shapes, because two people want this for different reasons: JSON is the whole record, for moving to
// another app or keeping; CSV is the transactions alone, for a spreadsheet or an accountant.
import { sql } from '../lib/db.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, json, methodNotAllowed } from '../lib/http.ts';
import { enforceRateLimit } from '../lib/rateLimit.ts';
import type { Ctx } from '../index.ts';

/** Everything the person owns, table by table. External ids and tokens are left out on purpose. */
async function collect(userId: string) {
  const [
    profile,
    transactions,
    budgets,
    goals,
    goalContributions,
    recurring,
    categories,
    categoryRules,
    incomeSources,
    debts,
    debtPayments,
    holdings,
    properties,
    netWorth,
    banks,
    invoices,
    invoicePayments,
    customers,
    supplierBills,
    billPayments,
    staff,
    payrollRuns,
    ownerPay,
    taxFilings,
    businessSettings,
    devices
  ] = await Promise.all([
    sql`
      select name, email, currency, locale, monthly_income, spend_style, budget_mode, tax_profile, created_at
      from public.profiles where id = ${userId}
    `,
    sql`
      select space_id, type, amount, category, description, budget_category, occurred_at, created_at
      from public.transactions where user_id = ${userId} order by occurred_at
    `,
    sql`
      select space_id, name, total_budget, period, start_date, end_date, categories, created_at
      from public.budgets where user_id = ${userId} order by start_date
    `,
    sql`select name, target_amount, current_amount, target_date, auto_save_percent, created_at from public.goals where user_id = ${userId}`,
    sql`
      select g.name as goal, c.amount, c.created_at from public.goal_contributions c
      join public.goals g on g.id = c.goal_id where c.user_id = ${userId} order by c.created_at
    `,
    sql`
      select space_id, description, category, amount, type, frequency, next_due_date, paused, created_at
      from public.recurring where user_id = ${userId}
    `,
    sql`select name, space_id, monthly_limit, created_at from public.categories where user_id = ${userId}`,
    sql`select type, pattern, category, bucket, hits, updated_at from public.category_rules where user_id = ${userId}`,
    sql`select name, amount, frequency, pay_day, is_estimate, created_at from public.income_sources where user_id = ${userId}`,
    sql`select space_id, direction, person, amount, balance, due_date, note, closed_at, created_at from public.debts where user_id = ${userId}`,
    sql`
      select d.person as owed_with, p.amount, p.paid_on from public.debt_payments p
      join public.debts d on d.id = p.debt_id where p.user_id = ${userId} order by p.paid_on
    `,
    sql`select space_id, name, kind, currency, balance, note, created_at from public.holdings where user_id = ${userId}`,
    sql`select name, tenant_name, rent_amount, frequency, next_due, note, created_at from public.properties where user_id = ${userId}`,
    sql`select month, have, own, owed_to_you, owe, updated_at from public.net_worth_snapshots where user_id = ${userId} order by month`,
    // The bank's name and when it last synced. Never the provider's account id or any token.
    sql`select space_id, provider, bank_name, status, last_synced_at, created_at from public.bank_links where user_id = ${userId}`,
    sql`select number, customer_name, issue_date, due_date, items, subtotal, vat_rate, vat_amount, total, amount_paid, status, created_at from public.invoices where user_id = ${userId}`,
    sql`
      select i.number as invoice, p.amount, p.paid_on from public.invoice_payments p
      join public.invoices i on i.id = p.invoice_id where p.user_id = ${userId} order by p.paid_on
    `,
    sql`select name, email, phone, created_at from public.customers where user_id = ${userId}`,
    sql`select kind, supplier_name, description, category, amount, amount_paid, bill_date, due_date, status, created_at from public.supplier_bills where user_id = ${userId}`,
    sql`
      select b.supplier_name as supplier, p.amount, p.paid_on from public.bill_payments p
      join public.supplier_bills b on b.id = p.bill_id where p.user_id = ${userId} order by p.paid_on
    `,
    sql`select space_id, name, role, monthly_gross, pension_enabled, active, created_at from public.staff where user_id = ${userId}`,
    sql`select space_id, period, paid_on, lines, total_gross, total_paye, total_pension, total_net, created_at from public.payroll_runs where user_id = ${userId}`,
    sql`select period, amount, suggested, paid_on, created_at from public.owner_pay where user_id = ${userId} order by paid_on`,
    sql`select kind, period, amount, filed_at, note from public.tax_filings where user_id = ${userId}`,
    sql`select * from public.business_settings where user_id = ${userId}`,
    sql`select device_name, platform, last_seen_at, created_at from public.device_sessions where user_id = ${userId}`
  ]);

  return {
    exportedAt: new Date().toISOString(),
    note:
      'Your BudgetFriendly records. Amounts are in the currency shown in your profile. ' +
      'This file holds no passwords and no bank credentials, because we never have them.',
    profile: profile[0] ?? null,
    transactions,
    budgets,
    goals,
    goalContributions,
    recurring,
    categories,
    categoryRules,
    incomeSources,
    debts,
    debtPayments,
    holdings,
    properties,
    netWorthSnapshots: netWorth,
    bankConnections: banks,
    invoices,
    invoicePayments,
    customers,
    supplierBills,
    billPayments,
    staff,
    payrollRuns,
    ownerPay,
    taxFilings,
    businessSettings: businessSettings[0] ?? null,
    devices
  };
}

const CSV_HEADER = ['Date', 'Space', 'Type', 'Amount', 'Category', 'Bucket', 'Description'];

/** One cell. Quotes anything a spreadsheet would otherwise read as a new column, a new row or a formula. */
function cell(value: unknown): string {
  const s = value == null ? '' : String(value);
  // A leading =, +, - or @ makes Excel and Sheets treat the text as a formula. Prefix it so they do not.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function transactionsCsv(rows: Record<string, unknown>[]): string {
  const lines = [CSV_HEADER.join(',')];
  for (const r of rows) {
    lines.push(
      [
        cell(String(r.occurredAt ?? '').slice(0, 10)),
        cell(r.spaceId),
        cell(r.type),
        cell(r.amount),
        cell(r.category),
        cell(r.budgetCategory),
        cell(r.description)
      ].join(',')
    );
  }
  return lines.join('\r\n');
}

/**
 * GET /v1/account/export          everything, as JSON
 * GET /v1/account/export?format=csv   the transactions, as a spreadsheet
 */
export async function exportData(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const auth = await requireAuth(ctx.req);
  // A helper can see the money but may not walk off with a copy of all of it.
  if (auth.actorId !== auth.userId) {
    throw new HttpError(403, 'FORBIDDEN', 'Only the account holder can export this account.');
  }
  // Reading every table at once is the heaviest thing one person can ask for.
  await enforceRateLimit({ key: `export:${auth.userId}`, limit: 6, windowSec: 60 * 60 });

  const format = (ctx.query.get('format') ?? 'json').toLowerCase();
  const day = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    const rows = await sql`
      select space_id, type, amount, category, description, budget_category, occurred_at
      from public.transactions where user_id = ${auth.userId} order by occurred_at
    `;
    return new Response(transactionsCsv(rows as Record<string, unknown>[]), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="budgetfriendly-transactions-${day}.csv"`,
        'Cache-Control': 'no-store'
      }
    });
  }

  if (format !== 'json') throw new HttpError(400, 'VALIDATION_ERROR', 'Ask for format=json or format=csv');

  const data = await collect(auth.userId);
  return json(200, data, {
    'Content-Disposition': `attachment; filename="budgetfriendly-${day}.json"`,
    'Cache-Control': 'no-store'
  });
}
