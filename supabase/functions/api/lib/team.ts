/**
 * Business teams: the one place that decides what each role may do in someone else's business.
 *
 * A member's request carries `X-Business: <owner id>`. The router forces it into the business space, and
 * requireAuth checks the membership and then TEAM_RULES below before any route runs. Anything not listed here
 * is refused, so a new route is closed to team members until someone adds a line for it on purpose.
 *
 * Read docs/team-access.md before changing a role. The e2e suite has a section per role; keep it in step.
 */

export type TeamRole = 'sales' | 'purchases' | 'hr' | 'manager' | 'accountant';

export const TEAM_ROLES: TeamRole[] = ['sales', 'purchases', 'hr', 'manager', 'accountant'];

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type Rule = { path: RegExp } & Partial<Record<Method, TeamRole[]>>;

const ALL: TeamRole[] = ['sales', 'purchases', 'hr', 'manager', 'accountant'];
const LEADS: TeamRole[] = ['manager', 'accountant'];
const M: TeamRole[] = ['manager'];

/*
 * Paths are everything after /v1, e.g. "invoices/<id>/send". Nobody on a team may DELETE: deleting stays with
 * the owner, so there is always a trail. Personal money is never reachable: every allowed path is a business one,
 * and the router forces spaceId=business on every team request.
 */
export const TEAM_RULES: Rule[] = [
  // Everyone needs the business's name, VAT settings and categories to record anything.
  { path: /^business\/settings$/, GET: ALL },
  { path: /^categories(\/suggest)?$/, GET: ALL, POST: M },

  // Money in and out. Sales see only income and Purchases only costs (filtered in routes/transactions.ts).
  { path: /^transactions$/, GET: ['sales', 'purchases', 'manager', 'accountant'], POST: ['sales', 'purchases', 'manager'] },
  { path: /^transactions\/[^/]+$/, GET: ['sales', 'purchases', 'manager', 'accountant'], PATCH: ['sales', 'purchases', 'manager'] },

  // Selling: customers and invoices.
  { path: /^customers(\/[^/]+)?$/, GET: ['sales', 'manager', 'accountant'], POST: ['sales', 'manager'], PATCH: ['sales', 'manager'] },
  { path: /^invoices(\/[^/]+)?$/, GET: ['sales', 'manager', 'accountant'], POST: ['sales', 'manager'], PATCH: ['sales', 'manager'] },
  { path: /^invoices\/[^/]+\/[^/]+$/, POST: ['sales', 'manager'] },

  // Buying: supplier bills.
  { path: /^bills(\/[^/]+)?$/, GET: ['purchases', 'manager', 'accountant'], POST: ['purchases', 'manager'], PATCH: ['purchases', 'manager'] },
  { path: /^bills\/[^/]+\/[^/]+$/, POST: ['purchases', 'manager'] },

  // People: staff and pay.
  { path: /^payroll$/, GET: ['hr', 'manager', 'accountant'] },
  { path: /^payroll\/runs$/, POST: ['hr', 'manager'] },
  { path: /^staff(\/[^/]+)?$/, POST: ['hr', 'manager'], PATCH: ['hr', 'manager'] },

  // The whole picture: profit, reports, tax, plans. For those who run or check the business.
  { path: /^business\/(summary|report|filings)$/, GET: LEADS },
  { path: /^analytics\/summary$/, GET: LEADS },
  { path: /^insights$/, GET: LEADS },
  { path: /^insights\/[^/]+\/dismiss$/, POST: LEADS },
  { path: /^prices$/, GET: LEADS },
  { path: /^(money|holdings|debts|properties)$/, GET: LEADS, POST: M },
  { path: /^(holdings|debts|properties)\/[^/]+$/, GET: LEADS, PATCH: M },
  { path: /^(debts|properties)\/[^/]+\/[^/]+$/, POST: M },
  { path: /^(budgets|recurring|goals)$/, GET: LEADS, POST: M },
  { path: /^(budgets|recurring|goals)\/[^/]+$/, GET: LEADS, PATCH: M },
  { path: /^budgets\/[^/]+\/(pace|mini-budgets)$/, GET: LEADS, POST: M }

  // Never for a team: bank connections and imports, owner pay, Wrapped, adding people, and every DELETE.
];

/**
 * Routes that are always about the person holding the phone, never the business they're in: signing in, their own
 * profile and alerts, and team membership itself. The X-Business header is ignored on these.
 */
export const SELF_PATHS = /^(health|auth|users\/me|config|push-tokens|notifications|delegates|team|join|voice|cron|admin|waitlist|referrals)(\/|$)/;

/** Bodies that choose a space: a team request always goes to the business space. */
export const BODY_SPACE_PATHS = /^(transactions|recurring|categories|budgets|goals|holdings|debts)$/;

export function teamMayDo(role: TeamRole, method: string, path: string): boolean {
  const m = method.toUpperCase() === 'HEAD' ? 'GET' : (method.toUpperCase() as Method);
  return TEAM_RULES.some((r) => r.path.test(path) && (r[m] ?? []).includes(role));
}

/** The path after /v1, read exactly as the router reads it. */
export function apiPath(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  return segments.slice(segments.indexOf('v1') + 1).join('/');
}

/** Which money a role sees in the transaction list: Sales only what came in, Purchases only what went out. */
export function teamTransactionType(role: TeamRole | null | undefined): 'income' | 'expense' | null {
  return role === 'sales' ? 'income' : role === 'purchases' ? 'expense' : null;
}

export const ROLE_LABEL: Record<TeamRole, string> = {
  sales: 'Sales',
  purchases: 'Purchases',
  hr: 'HR and payroll',
  manager: 'Manager',
  accountant: 'Accountant'
};
