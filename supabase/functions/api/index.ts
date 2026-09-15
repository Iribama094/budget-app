import { sql } from './lib/db.ts';
import { CORS_HEADERS, errorResponse, HttpError, json } from './lib/http.ts';
import { todayIso } from './lib/dates.ts';
import { runAllDueRecurring, sendBillReminders } from './lib/recurring.ts';
import { monoConfigured, syncBankLink, type BankLinkRow } from './lib/bank.ts';
import { authMe, changePassword, forgotPassword, notifications, pushTokens, sessions, usersMe } from './routes/account.ts';
import { acceptInvite, budgetById, budgetsIndex, miniBudgets, rollover, sharing } from './routes/budgets.ts';
import { analyticsSummary, transactionById, transactionsIndex } from './routes/transactions.ts';
import { goalById, goalsIndex, recurringById, recurringIndex, taxCalc, taxRules } from './routes/planning.ts';
import { bankLinkById, bankLinksIndex, bankSync, importedAction, importedIndex, monoConnect } from './routes/banks.ts';
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

  // On Sundays (or on demand with ?insights=1), push each active person's most useful insight.
  if (new Date(`${today}T12:00:00Z`).getUTCDay() === 0 || ctx.query.get('insights') === '1') {
    const active = await sql`select distinct user_id from public.transactions where occurred_at > now() - interval '14 days' limit 1000`;
    let sent = 0;
    for (const { userId } of active) {
      try {
        // The most useful nudge; when everything is going well, a word of encouragement instead.
        const list = await computeInsights(userId, 'personal', today);
        const top = list.find((i) => i.tone !== 'positive') ?? list[0];
        if (!top) continue;
        const delivered = await notifyUser(userId, {
          kind: 'insight',
          title: top.title,
          body: top.body,
          data: top.action ? { screen: top.action.screen } : undefined,
          dedupeKey: `insight:${top.key}`,
          dedupeTtlSec: 7 * 86400
        });
        if (delivered) sent++;
      } catch (err) {
        console.error('[cron] insight failed', err);
      }
    }
    summary.insights = { users: active.length, sent };
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

  if (a === 'notifications' && n <= 2) return notifications;
  if (a === 'push-tokens' && n === 1) return pushTokens;
  if (a === 'cron' && b === 'daily') return cronDaily;

  if (a === 'budget-invites' && b === 'accept') return acceptInvite;
  if (a === 'budgets' && n === 1) return budgetsIndex;
  if (a === 'budgets' && n === 2) return budgetById;
  if (a === 'budgets' && n === 3 && c === 'rollover') return rollover;
  if (a === 'budgets' && n === 3 && c === 'mini-budgets') return miniBudgets;
  if (a === 'budgets' && (c === 'members' || c === 'invites') && n <= 4) return sharing;

  if (a === 'transactions' && n === 1) return transactionsIndex;
  if (a === 'transactions' && n === 2) return transactionById;
  if (a === 'analytics' && b === 'summary') return analyticsSummary;

  if (a === 'goals' && n === 1) return goalsIndex;
  if (a === 'goals' && n === 2) return goalById;

  if (a === 'tax' && b === 'calc') return taxCalc;
  if (a === 'tax' && b === 'rules') return taxRules;

  if (a === 'bank-links' && b === 'mono' && n === 2) return monoConnect;
  if (a === 'bank-links' && n === 1) return bankLinksIndex;
  if (a === 'bank-links' && n === 2) return bankLinkById;
  if (a === 'bank-links' && n === 3 && c === 'sync') return bankSync;

  if (a === 'imported-transactions' && n === 1) return importedIndex;
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
