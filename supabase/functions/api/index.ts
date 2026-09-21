import { sql } from './lib/db.ts';
import { CORS_HEADERS, errorResponse, HttpError, json } from './lib/http.ts';
import { todayIso } from './lib/dates.ts';
import { runAllDueRecurring, sendBillReminders } from './lib/recurring.ts';
import { monoConfigured, syncBankLink, type BankLinkRow } from './lib/bank.ts';
import { authMe, changePassword, forgotPassword, notifications, pushTokens, sessions, usersMe } from './routes/account.ts';
import { acceptInvite, budgetById, budgetPace, budgetsIndex, miniBudgets, nextPeriod, rollover, sharing } from './routes/budgets.ts';
import { sendPeriodEndingReminders, sendSharedDigests } from './lib/shared.ts';
import { analyticsSummary, transactionById, transactionsIndex } from './routes/transactions.ts';
import { goalById, goalsIndex, recurringById, recurringIndex, taxCalc, taxRules } from './routes/planning.ts';
import { bankLinkById, bankLinksIndex, bankSync, importedAction, importedBulk, importedIndex, monoConnect } from './routes/banks.ts';
import {
  categoriesIndex,
  categoryById,
  categorySuggest,
  getPlan,
  incomeSourceById,
  incomeSourcesIndex,
  onboardingComplete,
  onboardingSkip,
  planPreview
} from './routes/personal.ts';
import { assistantChat, insightDismiss, insightsIndex } from './routes/coach.ts';
import { computeInsights } from './lib/insights.ts';
import { notifyUser } from './lib/notify.ts';
import {
  billById,
  billsIndex,
  businessReport,
  businessSettings,
  businessSummaryRoute,
  invoiceAction,
  invoiceById,
  invoicesIndex,
  customerById,
  customersIndex,
  taxFilings,
  payYourself,
  payrollIndex,
  payrollRun,
  staffById,
  staffIndex,
  statementImport,
  wrappedRoute
} from './routes/business.ts';
import { goalAddMoney, goalContributionAction, goalContributionsIndex } from './routes/savings.ts';
import { voiceTranscribe } from './routes/voice.ts';
import { sendBusinessReminders } from './lib/business.ts';
import { voice } from './lib/voice.ts';
import { weeklySummary } from './lib/weekly.ts';
import { appConfig } from './routes/config.ts';
import { openWrappedPeriod } from './lib/admin.ts';
import { adminAudit, adminFlags, adminMe, adminOverview, adminStaff, adminWrapped } from './routes/admin.ts';
import { adminPeople, adminPerson, adminPersonAction } from './routes/adminPeople.ts';
import { adminContent, adminSeedQuotes } from './routes/adminContent.ts';
import { adminTaxRules, adminTaxVersion } from './routes/adminTax.ts';
import { adminWrappedPreview } from './routes/admin.ts';
import { ensureTaxRules } from './lib/tax.ts';
import { debtById, debtsIndex, fxRatesRoute, holdingById, holdingsIndex, moneyRoute, pricesRoute } from './routes/money.ts';
import { delegatesRoute, propertiesRoute } from './routes/people.ts';
import { sendMoneyReminders } from './lib/reminders.ts';
import { waitlistJoin } from './routes/waitlist.ts';

export type Ctx = {
  req: Request;
  method: string;
  /** Path segments after /v1, e.g. ["budgets", "<id>", "rollover"]. */
  parts: string[];
  query: URLSearchParams;
};

type Handler = (ctx: Ctx) => Response | Promise<Response>;

/**
 * GET /v1/cron/daily — called once a day by pg_cron with the shared secret.
 * Records due recurring transactions, sends bill reminders and refreshes live bank connections.
 */
async function cronDaily(ctx: Ctx): Promise<Response> {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) throw new HttpError(500, 'NOT_CONFIGURED', 'CRON_SECRET is not set');
  if (ctx.req.headers.get('x-cron-secret') !== secret) throw new HttpError(401, 'UNAUTHORIZED', 'Invalid cron secret');

  const today = todayIso();
  const summary: Record<string, unknown> = { today };
  summary.recurring = await runAllDueRecurring(today);
  summary.billReminders = await sendBillReminders(today);
  summary.money = await sendMoneyReminders(today);
  summary.business = await sendBusinessReminders(today);
  summary.shared = { ...(await sendSharedDigests(today)), periodEnding: await sendPeriodEndingReminders(today) };

  if (monoConfigured()) {
    const stale = await sql<BankLinkRow[]>`
      select * from public.bank_links
      where provider = 'mono' and status <> 'reauth_required'
        and (last_synced_at is null or last_synced_at < now() - interval '12 hours')
      limit 300
    `;
    let imported = 0;
    let failed = 0;
    for (const link of stale) {
      try {
        imported += (await syncBankLink(link)).imported;
      } catch {
        failed++;
      }
    }
    summary.bankSync = { links: stale.length, imported, failed };
  }

  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();

  // Sundays (or on demand with ?weekly=1): one summary of the week for everyone active in their Personal space.
  if (weekday === 0 || ctx.query.get('weekly') === '1') {
    const people = await sql`
      select distinct user_id from public.transactions
      where space_id = 'personal' and occurred_at > now() - interval '14 days' limit 5000
    `;
    let sent = 0;
    for (const { userId } of people) {
      try {
        const note = await weeklySummary(userId, today);
        if (!note) continue;
        const delivered = await notifyUser(userId, {
          kind: 'weekly',
          ...note,
          data: { screen: 'WeeklyCheckInDetail' },
          spaceId: 'personal',
          dedupeKey: `weekly:${today}`,
          dedupeTtlSec: 6 * 86400
        });
        if (delivered) sent++;
      } catch (err) {
        console.error('[cron] weekly summary failed', err);
      }
    }
    summary.weekly = { users: people.length, sent };
  }

  // Wednesdays (or on demand with ?insights=1), push each active person's most useful insight. It moved off
  // Sunday so it doesn't land on the same day as the weekly summary.
  if (weekday === 3 || ctx.query.get('insights') === '1') {
    const active = await sql`select distinct user_id, space_id from public.transactions where occurred_at > now() - interval '14 days' limit 1000`;
    let sent = 0;
    for (const { userId, spaceId } of active) {
      try {
        // The most useful nudge; when everything is going well, a word of encouragement instead.
        const list = await computeInsights(userId, spaceId, today);
        const top = list.find((i) => i.tone !== 'positive') ?? list[0];
        if (!top) continue;
        const delivered = await notifyUser(userId, {
          kind: 'insight',
          title: top.title,
          body: top.body,
          data: top.action ? { screen: top.action.screen } : undefined,
          spaceId: spaceId === 'business' ? 'business' : 'personal',
          dedupeKey: `insight:${spaceId}:${top.key}`,
          dedupeTtlSec: 7 * 86400
        });
        if (delivered) sent++;
      } catch (err) {
        console.error('[cron] insight failed', err);
      }
    }
    summary.insights = { users: active.length, sent };
  }

  // Money Wrapped: never on a date alone. A period has to be certified in the staff console AND inside its
  // window, which is the same check the app itself makes, so nobody is told about a story they cannot open.
  const openWrapped = await openWrappedPeriod(today);
  if (openWrapped) {
    const { kind, year } = openWrapped;
    const people = await sql`select distinct user_id from public.transactions where occurred_at > now() - interval '60 days' limit 5000`;
    let sent = 0;
    for (const { userId } of people) {
      try {
        const delivered = await notifyUser(userId, {
          kind: 'insight',
          ...voice.wrappedReady(kind === 'h1' ? `H1 ${year}` : `${year}`),
          data: { screen: 'Wrapped', kind, year },
          // Once per person per period, however long the window stays open.
          dedupeKey: `wrapped:${kind}:${year}`,
          dedupeTtlSec: 120 * 86400
        });
        if (delivered) sent++;
      } catch (err) {
        console.error('[cron] wrapped failed', err);
      }
    }
    summary.wrapped = { users: people.length, sent };
  }

  await sql`delete from public.rate_limits where expires_at < now()`;
  await sql`delete from public.alert_log where expires_at < now()`;
  return json(200, summary);
}

function route(parts: string[]): Handler | null {
  const [a, b, c] = parts;
  const n = parts.length;

  if (a === 'health') return () => json(200, { ok: true });

  if (a === 'auth' && b === 'me') return authMe;
  if (a === 'auth' && b === 'change-password') return changePassword;
  if (a === 'auth' && b === 'forgot-password') return forgotPassword;
  if (a === 'auth' && b === 'sessions') return sessions;
  if (a === 'users' && b === 'me' && n === 2) return usersMe;

  if (a === 'recurring' && n === 1) return recurringIndex;
  if (a === 'recurring' && n === 2) return recurringById;

  if (a === 'config' && n === 1) return appConfig;

  // Public: the pre-launch waitlist page posts here. No sign-in; rate limited inside.
  if (a === 'waitlist' && n === 1) return waitlistJoin;

  // The staff console. Each one checks the admin_users table before anything else.
  if (a === 'admin' && b === 'me') return adminMe;
  if (a === 'admin' && b === 'overview') return adminOverview;
  if (a === 'admin' && b === 'flags' && n <= 3) return adminFlags;
  if (a === 'admin' && b === 'wrapped' && c === 'preview') return adminWrappedPreview;
  if (a === 'admin' && b === 'wrapped' && n <= 3) return adminWrapped;
  if (a === 'admin' && b === 'audit') return adminAudit;
  if (a === 'admin' && b === 'staff' && n <= 3) return adminStaff;
  if (a === 'admin' && b === 'people' && n === 2) return adminPeople;
  if (a === 'admin' && b === 'people' && n === 3) return adminPerson;
  if (a === 'admin' && b === 'people' && n === 4 && parts[3] === 'action') return adminPersonAction;
  if (a === 'admin' && b === 'content' && c === 'seed-quotes') return adminSeedQuotes;
  if (a === 'admin' && b === 'content' && n <= 3) return adminContent;
  if (a === 'admin' && b === 'tax-rules' && n <= 2) return adminTaxRules;
  if (a === 'admin' && b === 'tax-rules' && n <= 4) return adminTaxVersion;

  if (a === 'notifications' && n <= 2) return notifications;
  if (a === 'push-tokens' && n === 1) return pushTokens;
  if (a === 'voice' && b === 'transcribe') return voiceTranscribe;
  if (a === 'cron' && b === 'daily') return cronDaily;

  if (a === 'budget-invites' && b === 'accept') return acceptInvite;
  if (a === 'budgets' && n === 1) return budgetsIndex;
  if (a === 'budgets' && n === 2) return budgetById;
  if (a === 'budgets' && n === 3 && c === 'rollover') return rollover;
  if (a === 'budgets' && n === 3 && c === 'next') return nextPeriod;
  if (a === 'budgets' && n === 3 && c === 'pace') return budgetPace;
  if (a === 'budgets' && n === 3 && c === 'mini-budgets') return miniBudgets;
  if (a === 'budgets' && (c === 'members' || c === 'invites') && n <= 4) return sharing;

  if (a === 'transactions' && n === 1) return transactionsIndex;
  if (a === 'transactions' && n === 2) return transactionById;
  if (a === 'analytics' && b === 'summary') return analyticsSummary;

  if (a === 'goals' && n === 1) return goalsIndex;
  if (a === 'goals' && n === 2) return goalById;
  if (a === 'goals' && n === 3 && c === 'contributions') return goalAddMoney;
  if (a === 'goal-contributions' && n === 1) return goalContributionsIndex;
  if (a === 'goal-contributions' && n === 3) return goalContributionAction;

  if (a === 'tax' && b === 'calc') return taxCalc;
  if (a === 'tax' && b === 'rules') return taxRules;

  if (a === 'bank-links' && b === 'mono' && n === 2) return monoConnect;
  if (a === 'bank-links' && n === 1) return bankLinksIndex;
  if (a === 'bank-links' && n === 2) return bankLinkById;
  if (a === 'bank-links' && n === 3 && c === 'sync') return bankSync;

  if (a === 'imported-transactions' && n === 1) return importedIndex;
  if (a === 'imported-transactions' && n === 2 && b === 'bulk') return importedBulk;
  if (a === 'imported-transactions' && n === 3) return importedAction;

  if (a === 'income-sources' && n === 1) return incomeSourcesIndex;
  if (a === 'income-sources' && n === 2) return incomeSourceById;
  if (a === 'plan' && n === 1) return getPlan;
  if (a === 'plan' && b === 'preview' && n === 2) return planPreview;
  if (a === 'onboarding' && b === 'complete') return onboardingComplete;
  if (a === 'onboarding' && b === 'skip') return onboardingSkip;
  if (a === 'categories' && b === 'suggest' && n === 2) return categorySuggest;
  if (a === 'categories' && n === 1) return categoriesIndex;
  if (a === 'categories' && n === 2) return categoryById;
  if (a === 'insights' && n === 1) return insightsIndex;
  if (a === 'insights' && n === 3 && c === 'dismiss') return insightDismiss;
  if (a === 'assistant' && b === 'chat') return assistantChat;

  if (a === 'business' && b === 'settings' && n === 2) return businessSettings;
  if (a === 'business' && b === 'summary' && n === 2) return businessSummaryRoute;
  if (a === 'business' && b === 'pay-yourself' && n === 2) return payYourself;
  if (a === 'business' && b === 'report' && n === 2) return businessReport;
  if (a === 'customers' && n === 1) return customersIndex;
  if (a === 'customers' && n === 2) return customerById;
  if (a === 'business' && b === 'filings' && n === 2) return taxFilings;
  if (a === 'invoices' && n === 1) return invoicesIndex;
  if (a === 'invoices' && n === 2) return invoiceById;
  if (a === 'invoices' && n === 3) return invoiceAction;
  if (a === 'bills' && n === 1) return billsIndex;
  if (a === 'bills' && (n === 2 || n === 3)) return billById;
  if (a === 'staff' && n === 1) return staffIndex;
  if (a === 'staff' && n === 2) return staffById;
  if (a === 'payroll' && n === 1) return payrollIndex;
  if (a === 'payroll' && b === 'runs' && n === 2) return payrollRun;
  if (a === 'imports' && b === 'statement' && n === 2) return statementImport;
  if (a === 'wrapped' && n === 1) return wrappedRoute;

  // Your money (docs/money-for-everyone.md): what you have, own, owe and are owed, rising prices, and helpers.
  if (a === 'money' && n === 1) return moneyRoute;
  if (a === 'prices' && n === 1) return pricesRoute;
  if (a === 'fx-rates' && n === 1) return fxRatesRoute;
  if (a === 'holdings' && n === 1) return holdingsIndex;
  if (a === 'holdings' && n === 2) return holdingById;
  if (a === 'debts' && n === 1) return debtsIndex;
  if (a === 'debts' && (n === 2 || (n === 3 && c === 'payments'))) return debtById;
  if (a === 'delegates' && n <= 2) return delegatesRoute;
  if (a === 'properties' && n <= 3) return propertiesRoute;

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const url = new URL(req.url);
  // The function is mounted at /functions/v1/api; the platform passes the path from /api onwards.
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const v1 = segments.indexOf('v1');
  if (v1 === -1) return errorResponse(404, 'NOT_FOUND', 'Route not found');
  const parts = segments.slice(v1 + 1);

  // Approved tax rules, if any, before anything can ask what somebody owes.
  await ensureTaxRules();
  const handler = route(parts);
  if (!handler) return errorResponse(404, 'NOT_FOUND', 'Route not found');

  try {
    return await handler({ req, method: req.method.toUpperCase(), parts, query: url.searchParams });
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err.status, err.code, err.message, err.details, err.headers);
    console.error('[api] unexpected error', req.method, url.pathname, err);
    return errorResponse(500, 'SERVER_ERROR', 'Unexpected error');
  }
});
