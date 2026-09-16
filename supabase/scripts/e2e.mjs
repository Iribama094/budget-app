// End-to-end check of the live BudgetFriendly API on Supabase, using throwaway accounts that are deleted afterwards.
// Run from the repo root after `npx supabase login`: node supabase/scripts/e2e.mjs "$(pwd)"
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const root = process.argv[2];
const REF = 'uggmyokbpwfdbustnggo';
const BASE = `https://${REF}.supabase.co`;
const API = `${BASE}/functions/v1/api/v1`;
const PUB = 'sb_publishable_lfNxkvbTpvx7iP5S4n0FUw_-F1foews';

const env = fs.readFileSync(`${root}/.env.supabase.local`, 'utf8');
const CRON = env.match(/^CRON_SECRET=(.*)$/m)[1].trim();
const keysRaw = execSync(`npx supabase projects api-keys --project-ref ${REF} -o json --reveal`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const SECRET = JSON.parse(keysRaw.slice(keysRaw.indexOf('['))).find((k) => k.type === 'secret').api_key;

let pass = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log('  ok  ', name);
  } else {
    failures.push(name);
    console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400));
  }
}
const section = (s) => console.log(`\n${s}`);

async function call(token, method, path, body, headers = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-device-name': 'Test iPhone',
      'x-device-platform': 'ios',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function authApi(method, path, body, { key = PUB, token } = {}) {
  const res = await fetch(`${BASE}/auth/v1${path}`, {
    method,
    headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : key === SECRET ? { Authorization: `Bearer ${SECRET}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

const signIn = (email, password) => authApi('POST', '/token?grant_type=password', { email, password });

const stamp = Date.now();
const users = [];
const A = { email: `bf.e2e.a.${stamp}@example.com`, password: 'Passw0rd-A-1', name: 'Ada Test' };
const B = { email: `bf.e2e.b.${stamp}@example.com`, password: 'Passw0rd-B-1', name: 'Ben Test' };

async function createUser(u) {
  const res = await authApi('POST', '/signup', { email: u.email, password: u.password, data: { name: u.name } });
  if (res.status === 200 && res.data?.access_token) {
    users.push(res.data.user.id);
    return { id: res.data.user.id, token: res.data.access_token, via: 'signup' };
  }
  console.log('  (signup returned', res.status, res.data?.error_code ?? res.data?.msg, '- creating with admin API)');
  const admin = await authApi('POST', '/admin/users', { email: u.email, password: u.password, email_confirm: true, user_metadata: { name: u.name } }, { key: SECRET });
  users.push(admin.data.id);
  const s = await signIn(u.email, u.password);
  return { id: admin.data.id, token: s.data.access_token, via: 'admin' };
}

const today = new Date(Date.now() + 60 * 60000).toISOString().slice(0, 10);
const [y, m] = today.split('-').map(Number);
const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
const prevStart = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
const now = () => new Date().toISOString();

try {
  section('Basics');
  check('health', (await call(null, 'GET', '/health')).status === 200);
  check('unauthenticated request is rejected', (await call(null, 'GET', '/budgets')).status === 401);
  const garbage = await call('abc.def.ghi', 'GET', '/budgets');
  check('garbage token is rejected', garbage.status === 401, garbage);
  check('unknown route is 404', (await call(null, 'GET', '/nope')).status === 404);

  section('Sign up and profile');
  const a = await createUser(A);
  const b = await createUser(B);
  check('sign up returns a session (email autoconfirm on)', a.via === 'signup', a.via);
  let r = await call(a.token, 'GET', '/auth/me');
  check('auth/me returns the new profile with name from sign-up', r.status === 200 && r.data.user.email === A.email && r.data.user.name === A.name, r);
  r = await call(a.token, 'PATCH', '/users/me', { currency: 'NGN', monthlyIncome: 500000, taxProfile: { country: 'NG' } });
  check('users/me PATCH', r.status === 200 && r.data.user.currency === 'NGN' && r.data.user.monthlyIncome === 500000 && r.data.user.taxProfile?.country === 'NG', r);
  check('users/me rejects unknown fields', (await call(a.token, 'PATCH', '/users/me', { role: 'admin' })).status === 400);

  section('Budgets');
  r = await call(a.token, 'POST', '/budgets', {
    name: 'My Budget (This month)',
    totalBudget: 300000,
    period: 'monthly',
    startDate: monthStart,
    categories: { Essential: { budgeted: 100000 }, Savings: { budgeted: 50000 }, 'Free Spending': { budgeted: 150000 } }
  });
  check('create budget', r.status === 201 && r.data.budget.role === 'owner', r);
  const budgetId = r.data?.budget?.id;
  check('overlapping budget is rejected', (await call(a.token, 'POST', '/budgets', { name: 'x', totalBudget: 1, period: 'monthly', startDate: monthStart, categories: {} })).status === 400);
  r = await call(a.token, 'POST', '/budgets', { name: 'My Budget (Last month)', totalBudget: 200000, period: 'monthly', startDate: prevStart, categories: { Essential: { budgeted: 120000 }, Savings: { budgeted: 80000 } } });
  check('create last month budget', r.status === 201, r);
  const prevBudgetId = r.data?.budget?.id;
  r = await call(a.token, 'GET', '/budgets?spaceId=personal');
  check('list budgets', r.status === 200 && r.data.items.length === 2, r);
  r = await call(a.token, 'GET', `/budgets/${budgetId}`);
  check('get budget', r.status === 200 && r.data.budget.totalBudget === 300000, r);
  r = await call(a.token, 'PATCH', `/budgets/${budgetId}`, { name: 'My Budget (September)' });
  check('patch budget', r.status === 200 && r.data.budget.name === 'My Budget (September)', r);
  check('bad budget id is 404', (await call(a.token, 'GET', '/budgets/not-a-uuid')).status === 404);
  r = await call(a.token, 'POST', `/budgets/${budgetId}/mini-budgets`, { name: 'Weekend trip', amount: 40000, category: 'Free Spending' });
  check('create mini budget', r.status === 201 && r.data.miniBudget.amount === 40000, r);
  r = await call(a.token, 'GET', `/budgets/${budgetId}/mini-budgets`);
  check('list mini budgets', r.status === 200 && r.data.items.length === 1, r);

  section('Goals and transactions');
  r = await call(a.token, 'POST', '/goals', { name: 'Emergency fund', targetAmount: 1000000, targetDate: '2027-06-30', emoji: '🛟', autoSavePercent: 10 });
  check('create goal with auto-save', r.status === 201 && r.data.goal.autoSavePercent === 10, r);
  const goalId = r.data?.goal?.id;
  const clientId = `e2e-client-${stamp}`;
  r = await call(a.token, 'POST', '/transactions', { type: 'expense', amount: 70000, category: 'Groceries', description: 'Shoprite', occurredAt: now(), budgetId, budgetCategory: 'Essential', clientId });
  check('create expense in budget', r.status === 201 && r.data.transaction.amount === 70000, r);
  const expenseId = r.data?.transaction?.id;
  r = await call(a.token, 'POST', '/transactions', { type: 'expense', amount: 70000, category: 'Groceries', occurredAt: now(), budgetId, budgetCategory: 'Essential', clientId });
  check('offline retry with same clientId is de-duplicated', r.status === 200 && r.data.duplicate === true && r.data.transaction.id === expenseId, r);
  r = await call(a.token, 'POST', '/transactions', { type: 'income', amount: 100000, category: 'Salary', occurredAt: now(), budgetId, budgetCategory: 'Savings' });
  check('create income applies auto-save', r.status === 201 && r.data.autoSaved?.[0]?.amount === 10000, r);
  const incomeId = r.data?.transaction?.id;
  r = await call(a.token, 'GET', `/budgets/${budgetId}`);
  check('income grows budget total and bucket', r.data.budget.totalBudget === 400000 && r.data.budget.categories.Savings.budgeted === 150000, r.data?.budget);
  r = await call(a.token, 'GET', '/transactions?limit=1&spaceId=personal');
  check('list transactions page 1', r.status === 200 && r.data.items.length === 1 && !!r.data.nextCursor, r);
  const r2 = await call(a.token, 'GET', `/transactions?limit=1&cursor=${encodeURIComponent(r.data.nextCursor)}`);
  check('list transactions page 2 via cursor', r2.status === 200 && r2.data.items.length === 1 && r2.data.items[0].id !== r.data.items[0].id, r2);
  r = await call(a.token, 'PATCH', `/transactions/${incomeId}`, { amount: 120000 });
  check('patch income amount', r.status === 200 && r.data.transaction.amount === 120000, r);
  r = await call(a.token, 'GET', `/budgets/${budgetId}`);
  check('budget follows edited income', r.data.budget.totalBudget === 420000 && r.data.budget.categories.Savings.budgeted === 170000, r.data?.budget);
  check('get transaction', (await call(a.token, 'GET', `/transactions/${expenseId}`)).status === 200);
  r = await call(a.token, 'GET', `/analytics/summary?start=${monthStart}&end=${today}&spaceId=personal`);
  check('analytics summary', r.status === 200 && r.data.expenses === 70000 && r.data.income === 120000 && r.data.spendingByBucket.Essential === 70000 && r.data.dailySpendingByCategory.length > 0, r);
  check('delete income', (await call(a.token, 'DELETE', `/transactions/${incomeId}`)).status === 204);
  r = await call(a.token, 'GET', `/budgets/${budgetId}`);
  check('deleting income reverses budget growth', r.data.budget.totalBudget === 300000 && r.data.budget.categories.Savings.budgeted === 50000, r.data?.budget);
  r = await call(a.token, 'GET', '/goals');
  check('auto-save waits for "I moved it" before the goal grows', r.status === 200 && r.data.items[0].currentAmount === 0, r);
  r = await call(a.token, 'POST', '/transactions', { type: 'income', amount: 50000, category: 'Salary', occurredAt: now(), budgetId, budgetCategory: 'Savings' });
  check('new income suggests a pending auto-save', r.status === 201 && r.data.autoSaved?.[0]?.amount === 5000, r);
  r = await call(a.token, 'GET', '/goal-contributions?status=pending');
  const pendingSave = r.data?.items?.[0];
  check('pending auto-save listed; one from deleted income hidden', r.status === 200 && r.data.items.length === 1 && pendingSave.amount === 5000 && pendingSave.goal.id === goalId, r);
  r = await call(a.token, 'POST', `/goal-contributions/${pendingSave?.id}/confirm`, {});
  check('confirming grows the goal and records a Savings entry', r.status === 200 && r.data.goal.currentAmount === 5000 && !!r.data.transactionId, r);
  check('an answered auto-save cannot be confirmed twice', (await call(a.token, 'POST', `/goal-contributions/${pendingSave?.id}/confirm`, {})).status === 400);
  r = await call(a.token, 'GET', `/transactions/${r.data?.transactionId}`);
  check('Savings entry sits in the budget', r.status === 200 && r.data.transaction.category === 'Savings' && r.data.transaction.budgetId === budgetId && r.data.transaction.budgetCategory === 'Savings', r);
  r = await call(a.token, 'PATCH', `/goals/${goalId}`, { name: 'Rainy day fund' });
  check('patch goal', r.status === 200 && r.data.goal.name === 'Rainy day fund', r);
  check('get goal', (await call(a.token, 'GET', `/goals/${goalId}`)).status === 200);

  section('Recurring and notifications');
  r = await call(a.token, 'POST', '/recurring', { type: 'expense', amount: 5000, category: 'Subscriptions', description: 'Netflix', frequency: 'monthly', startDate: today, budgetCategory: 'Free Spending' });
  check('create recurring due today records it', r.status === 201 && r.data.created === 1 && r.data.recurring.nextDueDate > today, r);
  const recId = r.data?.recurring?.id;
  check('list recurring', (await call(a.token, 'GET', '/recurring')).data?.items?.length === 1);
  r = await call(a.token, 'PATCH', `/recurring/${recId}`, { paused: true });
  check('pause recurring', r.status === 200 && r.data.recurring.paused === true, r);
  r = await call(a.token, 'POST', '/recurring/run');
  check('run recurring', r.status === 200 && r.data.created === 0, r);
  check('delete recurring', (await call(a.token, 'DELETE', `/recurring/${recId}`)).status === 204);
  r = await call(a.token, 'GET', '/notifications');
  const kinds = (r.data?.items ?? []).map((n) => n.kind);
  check('notifications feed has pace, auto-save and recurring alerts', r.status === 200 && r.data.unread > 0 && kinds.includes('pace') && kinds.includes('autosave') && kinds.includes('recurring'), kinds);
  r = await call(a.token, 'POST', '/notifications/read', {});
  check('mark notifications read', r.status === 200 && r.data.updated > 0, r);
  check('unread count is zero', (await call(a.token, 'GET', '/notifications')).data?.unread === 0);
  r = await call(a.token, 'PATCH', '/notifications/prefs', { weeklyCheckIn: false });
  check('update notification prefs', r.status === 200 && r.data.prefs.weeklyCheckIn === false && r.data.prefs.paceAlerts === true, r);
  check('read notification prefs', (await call(a.token, 'GET', '/notifications/prefs')).data?.prefs?.weeklyCheckIn === false);
  r = await call(a.token, 'PATCH', '/notifications/prefs', { invoiceReminders: false });
  check('invoice reminder preference saves', r.status === 200 && r.data.prefs.invoiceReminders === false && r.data.prefs.billReminders === true, r);
  r = await call(a.token, 'GET', '/notifications?spaceId=personal');
  check('personal feed holds personal and account-wide alerts only', r.status === 200 && r.data.items.length > 0 && r.data.items.every((n) => n.spaceId === 'personal' || n.spaceId === null), r.data?.items?.map((n) => n.spaceId));
  r = await call(a.token, 'GET', '/notifications?spaceId=business');
  check('business feed leaves out personal alerts', r.status === 200 && r.data.items.every((n) => n.spaceId !== 'personal') && r.data.unread === 0, r.data?.items?.map((n) => [n.kind, n.spaceId]));
  check('register push token', (await call(a.token, 'POST', '/push-tokens', { token: `ExponentPushToken[e2e-${stamp}]`, platform: 'ios' })).status === 200);
  check('reject non-Expo push token', (await call(a.token, 'POST', '/push-tokens', { token: 'nope' })).status === 400);
  // Voice notes: the route is reachable and validates, without spending a real transcription.
  check('voice transcribe needs a recording', (await call(a.token, 'POST', '/voice/transcribe', { audio: 'x' })).status === 400);
  check('voice transcribe needs sign-in', (await call(null, 'POST', '/voice/transcribe', { audio: 'x'.repeat(200) })).status === 401);
  // Telling Flux about spending comes back as a draft to confirm, with no AI key needed.
  r = await call(a.token, 'POST', '/assistant/chat', { message: 'I spent 5k on fuel yesterday' });
  check('Flux turns spending into a draft', r.status === 200 && r.data.draft?.type === 'expense' && r.data.draft?.amount === 5000 && /fuel/i.test(r.data.draft?.description ?? ''), r.data);
  check('Flux draft is dated yesterday', r.data?.draft?.occurredOn < today && /Save/.test(r.data?.reply ?? ''), r.data?.draft);
  r = await call(a.token, 'POST', '/assistant/chat', { message: 'How much did I spend on fuel?' });
  check('a question is not turned into a draft', r.data?.draft === undefined, r.data);
  check('unregister push token', (await call(a.token, 'DELETE', '/push-tokens', { token: `ExponentPushToken[e2e-${stamp}]` })).status === 200);

  section('Month-end rollover');
  r = await call(a.token, 'GET', `/budgets/${prevBudgetId}/rollover`);
  check('ended budget is eligible for rollover', r.status === 200 && r.data.eligible === true && r.data.unspent === 200000 && r.data.goals.length === 1, r);
  r = await call(a.token, 'POST', `/budgets/${prevBudgetId}/rollover`, { destination: 'goal', goalId });
  check('move leftover into goal', r.status === 200 && r.data.moved === 200000, r);
  check('second rollover is refused', (await call(a.token, 'POST', `/budgets/${prevBudgetId}/rollover`, { destination: 'goal', goalId })).status === 409);
  check('goal received the leftover', (await call(a.token, 'GET', `/goals/${goalId}`)).data?.goal?.currentAmount === 205000);
  check('running budget is not eligible', (await call(a.token, 'POST', `/budgets/${budgetId}/rollover`, { destination: 'next-budget' })).status === 400);
  r = await call(a.token, 'POST', `/goals/${goalId}/contributions`, { amount: 10000 });
  check('add money to a goal', r.status === 201 && r.data.goal.currentAmount === 215000 && !!r.data.transactionId, r);

  section('Shared household budget');
  r = await call(a.token, 'POST', `/budgets/${budgetId}/invites`);
  check('owner creates invite code', r.status === 201 && /^[A-Z2-9]{6}$/.test(r.data.code), r);
  const code = r.data?.code;
  check('member cannot see budget before joining', (await call(b.token, 'GET', `/budgets/${budgetId}`)).status === 404);
  r = await call(b.token, 'POST', '/budget-invites/accept', { code: code?.toLowerCase() });
  check('partner joins with code', r.status === 200 && r.data.budget.role === 'member' && r.data.budget.isShared === true, r);
  check('used code cannot be reused', (await call(b.token, 'POST', '/budget-invites/accept', { code })).status === 400);
  r = await call(b.token, 'GET', '/budgets?spaceId=personal');
  check('shared budget appears in partner list', r.data?.items?.some((x) => x.id === budgetId));
  r = await call(b.token, 'POST', '/transactions', { type: 'expense', amount: 2000, category: 'Snacks', occurredAt: now(), budgetId, budgetCategory: 'Free Spending' });
  check('partner adds spending to shared budget', r.status === 201, r);
  r = await call(a.token, 'GET', `/transactions?budgetId=${budgetId}`);
  check('owner sees partner spending', r.data?.items?.some((t) => t.userId === b.id), r.data?.items?.map((t) => t.userId));
  check('partner cannot edit owner budget', (await call(b.token, 'PATCH', `/budgets/${budgetId}`, { name: 'Hijack' })).status === 404);
  check('partner cannot invite', (await call(b.token, 'POST', `/budgets/${budgetId}/invites`)).status === 403);
  r = await call(a.token, 'GET', `/budgets/${budgetId}/members`);
  check('members list', r.status === 200 && r.data.items.length === 2 && r.data.items[1].name === B.name, r);
  check('sharing makes it a household budget', (await call(a.token, 'GET', `/budgets/${budgetId}`)).data?.budget?.purpose === 'household');
  r = await call(a.token, 'POST', `/budgets/${budgetId}/next`);
  check('start next period keeps the people', r.status === 201 && r.data.budget.purpose === 'household' && r.data.budget.members.some((mm) => mm.userId === b.id) && r.data.budget.startDate > monthStart, r);
  const nextId = r.data?.budget?.id;
  check('starting it again returns the same budget', (await call(a.token, 'POST', `/budgets/${budgetId}/next`)).data?.budget?.id === nextId);
  check('partner sees the next period', (await call(b.token, 'GET', '/budgets?spaceId=personal')).data?.items?.some((x) => x.id === nextId));
  check('partner cannot start the next period', (await call(b.token, 'POST', `/budgets/${budgetId}/next`)).status === 403);
  r = await call(a.token, 'POST', '/budgets', { name: 'My Budget (Own)', totalBudget: 100000, period: 'monthly', startDate: monthStart, categories: {}, purpose: 'personal' });
  check('own plan runs alongside a shared budget', r.status === 201 && r.data.budget.purpose === 'personal', r);
  const ownId = r.data?.budget?.id;
  r = await call(a.token, 'POST', '/budgets', { name: 'Ada’s wedding', totalBudget: 2000000, period: 'monthly', startDate: monthStart, categories: {}, purpose: 'event' });
  check('event budget can overlap other budgets', r.status === 201 && r.data.budget.purpose === 'event', r);
  const eventId = r.data?.budget?.id;
  check('second shared budget for the same dates is rejected', (await call(a.token, 'POST', '/budgets', { name: 'Another home', totalBudget: 1, period: 'monthly', startDate: monthStart, categories: {}, purpose: 'household' })).status === 400);
  r = await call(a.token, 'PATCH', '/users/me', { homeBudget: 'shared', budgetMode: 'both' });
  check('home budget preference saves', r.status === 200 && r.data.user.homeBudget === 'shared' && r.data.user.budgetMode === 'both', r);
  r = await call(b.token, 'PATCH', '/notifications/prefs', { sharedActivity: false });
  check('shared activity preference saves', r.status === 200 && r.data.prefs.sharedActivity === false, r);
  check('partner leaves', (await call(b.token, 'DELETE', `/budgets/${budgetId}/members/${b.id}`)).status === 200);
  check('partner loses access after leaving', (await call(b.token, 'GET', `/budgets/${budgetId}`)).status === 404);
  r = await call(a.token, 'GET', '/notifications');
  check('owner is told when the partner leaves', (r.data?.items ?? []).some((n) => n.kind === 'shared' && /comot/.test(n.title)), r.data?.items?.map((n) => n.title));
  // Tidy up the extra budgets so later sections see the same data as before.
  for (const id of [nextId, ownId, eventId]) if (id) await call(a.token, 'DELETE', `/budgets/${id}`);
  await call(a.token, 'PATCH', '/users/me', { homeBudget: 'own', budgetMode: 'solo' });
  check("other user's transaction is private", (await call(b.token, 'GET', `/transactions/${expenseId}`)).status === 404);

  section('Bank connections');
  r = await call(a.token, 'POST', '/bank-links', { provider: 'demo', bankName: 'Demo Bank' });
  check('create demo bank link', r.status === 201 && r.data.link.accounts.length === 2, r);
  const linkId = r.data?.link?.id;
  check('list bank links', (await call(a.token, 'GET', '/bank-links')).data?.items?.[0]?.accounts?.length === 2);
  r = await call(a.token, 'GET', '/imported-transactions?status=pending');
  check('imported transactions pending', r.status === 200 && r.data.items.length === 3, r);
  const imported = r.data?.items ?? [];
  const debit = imported.find((t) => t.direction === 'debit');
  r = await call(a.token, 'POST', `/imported-transactions/${debit?.id}/reconcile`, { category: 'Groceries', budgetCategory: 'Essential' });
  check('reconcile imported transaction', r.status === 200 && r.data.transaction.status === 'reconciled', r);
  const other = imported.find((t) => t.id !== debit?.id);
  check('ignore imported transaction', (await call(a.token, 'POST', `/imported-transactions/${other?.id}/ignore`)).data?.transaction?.status === 'ignored');
  check('demo link sync reports not live', (await call(a.token, 'POST', `/bank-links/${linkId}/sync`)).data?.live === false);
  check('Mono connect reports not configured', (await call(a.token, 'POST', '/bank-links/mono', { code: 'test-code' })).status === 501);
  check('disconnect bank', (await call(a.token, 'DELETE', `/bank-links/${linkId}`)).status === 200);
  check('imported transactions removed with link', (await call(a.token, 'GET', '/imported-transactions?status=pending')).data?.items?.length === 0);

  section('Tax');
  check('tax rules', (await call(a.token, 'GET', '/tax/rules?country=NG')).data?.meta?.country === 'NG');
  r = await call(a.token, 'POST', '/tax/calc', { country: 'NG', grossAnnual: 6000000 });
  check('tax calculation', r.status === 200 && r.data.result.totalTax > 0 && r.data.result.bands.length > 0, r);
  // Nigeria Tax Act 2025: 0% to ₦800k, 15% to ₦3m, 18% to ₦12m → ₦330,000 + ₦540,000 on ₦6m.
  check('tax uses 2026 bands', r.data?.result?.totalTax === 870000 && r.data.result.taxableIncome === 6000000, r.data?.result);
  r = await call(a.token, 'POST', '/tax/calc', { country: 'NG', grossAnnual: 6000000, deductions: { annualRent: 1000000 } });
  {
    const saved = await call(a.token, 'PATCH', '/users/me', { taxProfile: { country: 'NG', optInTaxFeature: true, grossMonthlyIncome: 500000, annualRent: 1200000, pensionContribution: 40000, nhfContribution: 5000 } });
    check('tax reliefs save to the profile', saved.status === 200 && saved.data.user.taxProfile?.annualRent === 1200000 && saved.data.user.taxProfile?.nhfContribution === 5000, saved);
  }
  check('rent relief is 20% of rent',r.status === 200 && r.data.result.taxableIncome === 5800000 && r.data.result.totalTax === 834000, r.data?.result ?? r);

  section('Categories and learning');
  r = await call(a.token, 'GET', '/categories?spaceId=personal');
  const tithe = r.data?.items?.find((c) => c.name === 'Tithe & offering');
  check('default categories include tithe under Needs', r.status === 200 && r.data.items.length > 20 && tithe?.bucket === 'Needs', r.data?.items?.length);
  r = await call(a.token, 'POST', '/categories', { name: 'Generator fuel', type: 'expense', bucket: 'Needs', icon: 'fuel' });
  check('create a custom category', r.status === 201 && r.data.category.name === 'Generator fuel' && r.data.category.isDefault === false, r);
  const genId = r.data?.category?.id;
  check('duplicate category name is refused', (await call(a.token, 'POST', '/categories', { name: 'generator FUEL', type: 'expense' })).status === 409);
  r = await call(a.token, 'PATCH', `/categories/${genId}`, { name: 'Gen fuel', bucket: 'Needs' });
  check('rename a category', r.status === 200 && r.data.category.name === 'Gen fuel', r);
  r = await call(a.token, 'GET', `/categories/suggest?text=${encodeURIComponent('POS PURCHASE JUSTRITE IKOTA')}&type=expense`);
  check('suggests a category from common payees', r.status === 200 && r.data.suggestion?.category === 'Food & groceries' && r.data.suggestion.source === 'keyword', r);
  r = await call(a.token, 'POST', '/transactions', { type: 'expense', amount: 15000, category: 'Gen fuel', description: 'Adewale Ventures diesel', occurredAt: now(), budgetId, budgetCategory: 'Needs' });
  check('transaction with the custom category', r.status === 201, r);
  r = await call(a.token, 'GET', `/categories/suggest?text=${encodeURIComponent('adewale ventures')}&type=expense`);
  check('learns the category from past choices', r.data?.suggestion?.category === 'Gen fuel' && r.data.suggestion.source === 'learned', r);
  check('delete a category', (await call(a.token, 'DELETE', `/categories/${genId}`)).status === 204);

  section('First-run plan and income');
  const income = [{ name: 'Salary', kind: 'salary', amount: 300000, frequency: 'monthly', payDay: 25 }];
  const bills = [
    { name: 'Rent', category: 'Rent & housing', amount: 1200000, frequency: 'yearly' },
    { name: 'Tithe', category: 'Tithe & offering', amount: 30000, frequency: 'monthly', dueDay: 1 }
  ];
  r = await call(b.token, 'POST', '/plan/preview', { income, bills, painPoints: ['runs_out'], budgetPeriod: 'payday' });
  const preview = r.data?.plan;
  check(
    'plan preview splits income into needs, wants and savings',
    r.status === 200 && preview.monthlyIncome === 300000 && preview.committed === 130000 && preview.split.Needs + preview.split.Wants + preview.split.Savings === 300000 && preview.period.basis === 'payday' && preview.tips.length >= 2,
    preview
  );
  r = await call(b.token, 'GET', '/auth/me');
  check('new account needs the first-run plan', r.data?.user?.onboarding?.completedAt === null && r.data.user.budgetPeriod === 'payday', r.data?.user?.onboarding);
  r = await call(b.token, 'POST', '/onboarding/complete', { income, bills, painPoints: ['runs_out', 'cant_save'], budgetPeriod: 'payday', createBudget: true });
  check(
    'complete onboarding creates a payday budget',
    r.status === 200 && !!r.data.user.onboarding.completedAt && r.data.budget && Object.keys(r.data.budget.categories).join(',') === 'Needs,Wants,Savings' && r.data.budget.startDate === preview.period.start,
    r.data?.budget ?? r
  );
  r = await call(b.token, 'GET', '/recurring');
  check('bills become reminders', r.data?.items?.some((x) => x.description === 'Rent' && x.autoCreate === false) && r.data.items.some((x) => x.description === 'Tithe'), r.data?.items?.map((x) => x.description));
  r = await call(b.token, 'GET', '/plan');
  check('saved plan reflects income and bills', r.status === 200 && r.data.plan.incomeSources.length === 1 && r.data.plan.bills.length >= 2 && r.data.plan.monthlyIncome === 300000, r.data?.plan);
  r = await call(b.token, 'POST', '/income-sources', { name: 'POS business', kind: 'side_hustle', amount: 20000, frequency: 'weekly', nextPayDate: today });
  check('add an income source', r.status === 201 && r.data.incomeSource.monthlyAmount === Math.round((20000 * 52) / 12), r);
  const sideId = r.data?.incomeSource?.id;
  check('plan grows with the new income', (await call(b.token, 'GET', '/plan')).data?.plan?.monthlyIncome === Math.round((300000 + (20000 * 52) / 12) / 100) * 100);
  check('edit an income source', (await call(b.token, 'PATCH', `/income-sources/${sideId}`, { amount: 25000 })).data?.incomeSource?.amount === 25000);
  check('remove an income source', (await call(b.token, 'DELETE', `/income-sources/${sideId}`)).status === 204);
  r = await call(b.token, 'PATCH', '/users/me', { budgetPeriod: 'monthly' });
  check('switch to calendar-month budgets', r.data?.user?.budgetPeriod === 'monthly' && (await call(b.token, 'GET', '/plan')).data?.plan?.period?.basis === 'monthly', r);
  r = await call(a.token, 'POST', '/onboarding/skip');
  check('skip the first-run plan', r.status === 200 && !!r.data.user.onboarding.skippedAt, r);

  section('Insights and AI coach');
  r = await call(a.token, 'GET', '/insights?spaceId=personal');
  check('insights load', r.status === 200 && Array.isArray(r.data.items), r);
  const firstInsight = r.data?.items?.[0];
  if (firstInsight) {
    check('dismiss an insight', (await call(a.token, 'POST', `/insights/${encodeURIComponent(firstInsight.key)}/dismiss`)).status === 200);
    check('dismissed insight stays hidden', !(await call(a.token, 'GET', '/insights')).data?.items?.some((i) => i.key === firstInsight.key));
  }
  r = await call(a.token, 'POST', '/assistant/chat', { message: 'Will my money last until payday?', history: [] });
  check('assistant answers, or says it is not switched on yet', (r.status === 200 && typeof r.data.reply === 'string') || (r.status === 501 && r.data.error.code === 'NOT_CONFIGURED'), r);
  console.log(`  (assistant responded with ${r.status}${r.status === 501 ? ': add ANTHROPIC_API_KEY to switch it on' : ''})`);
  check('assistant rejects empty questions', (await call(a.token, 'POST', '/assistant/chat', { message: '   ' })).status === 400);

  section('Business tools');
  const addDays = (n) => new Date(Date.parse(`${today}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  r = await call(a.token, 'PATCH', '/business/settings', { businessName: 'Ada Foods', vatRegistered: true });
  check('business settings', r.status === 200 && r.data.settings.businessName === 'Ada Foods' && r.data.settings.vatRegistered === true && r.data.settings.vatRate === 7.5, r);
  r = await call(a.token, 'POST', '/invoices', { customerName: 'Mama Put Ltd', customerPhone: '08030000000', dueDate: addDays(14), items: [{ description: 'Jollof trays', quantity: 5, unitPrice: 10000 }] });
  check('create invoice with VAT', r.status === 201 && r.data.invoice.number === 'INV-0001' && r.data.invoice.total === 53750 && r.data.invoice.status === 'unpaid', r);
  const inv1 = r.data?.invoice?.id;
  r = await call(a.token, 'POST', `/invoices/${inv1}/payments`, { amount: 20000 });
  check('part payment records Sales income', r.status === 201 && r.data.invoice.status === 'part_paid' && r.data.invoice.balance === 33750 && !!r.data.transactionId, r);
  check('payment above balance is refused', (await call(a.token, 'POST', `/invoices/${inv1}/payments`, { amount: 99999 })).status === 400);
  r = await call(a.token, 'POST', `/invoices/${inv1}/payments`, {});
  check('pay the rest', r.status === 201 && r.data.invoice.status === 'paid', r);
  check('paid invoice cannot be deleted', (await call(a.token, 'DELETE', `/invoices/${inv1}`)).status === 400);
  r = await call(a.token, 'POST', '/invoices', { customerName: 'Chidi Stores', issueDate: addDays(-30), dueDate: addDays(-10), applyVat: false, items: [{ description: 'Small chops', quantity: 1, unitPrice: 15000 }] });
  check('overdue invoice', r.status === 201 && r.data.invoice.number === 'INV-0002' && r.data.invoice.overdue === true && r.data.invoice.total === 15000, r);
  r = await call(a.token, 'GET', '/invoices?status=open');
  check('open invoices with totals', r.status === 200 && r.data.items.length === 1 && r.data.totals.owed === 15000 && r.data.totals.overdueCount === 1, r.data);
  r = await call(a.token, 'GET', `/invoices/${inv1}`);
  check('invoice detail with payments and business details', r.status === 200 && r.data.payments.length === 2 && r.data.business.businessName === 'Ada Foods', r);

  r = await call(a.token, 'POST', '/bills', { supplierName: 'Golden Flour', amount: 40000, dueDate: addDays(2), category: 'Stock & supplies' });
  check('record a supplier bill', r.status === 201 && r.data.bill.balance === 40000, r);
  const billId = r.data?.bill?.id;
  r = await call(a.token, 'POST', `/bills/${billId}/payments`, { amount: 15000 });
  check('part pay a bill', r.status === 201 && r.data.bill.status === 'part_paid' && r.data.bill.balance === 25000, r);
  r = await call(a.token, 'GET', '/bills?status=open');
  check('bills list with what you owe', r.status === 200 && r.data.totals.owe === 25000 && r.data.totals.dueThisWeek === 25000, r.data);

  r = await call(a.token, 'POST', '/staff', { name: 'Tunde', role: 'Chef', monthlyGross: 300000 });
  check('add staff with PAYE estimate', r.status === 201 && r.data.staff.netEstimate + r.data.staff.payeEstimate === 300000, r);
  r = await call(a.token, 'POST', '/payroll/runs', { period: today.slice(0, 7) });
  const run = r.data?.run;
  check('run payroll', r.status === 201 && run.totalGross === 300000 && Math.abs(run.totalNet + run.totalPaye - 300000) < 0.01 && (run.totalPaye === 0 || !!run.payeBillId), r);
  check('same month cannot be paid twice', (await call(a.token, 'POST', '/payroll/runs', { period: today.slice(0, 7) })).status === 409);
  r = await call(a.token, 'GET', '/payroll');
  check('payroll history', r.status === 200 && r.data.runs.length === 1 && r.data.staff.length === 1, r.data);

  r = await call(a.token, 'GET', '/business/summary');
  const biz = r.data?.summary;
  check('business summary', r.status === 200 && biz.current.revenue === 53750 && biz.receivables.overdueCount === 1 && biz.payables.openTotal >= 25000 && Array.isArray(biz.tax.deadlines), biz ?? r);
  r = await call(a.token, 'GET', '/business/pay-yourself');
  check('pay-yourself suggestion explains itself', r.status === 200 && typeof r.data.suggestion.suggested === 'number' && r.data.suggestion.suggested >= 0 && typeof r.data.suggestion.buffer === 'number', r.data);
  r = await call(a.token, 'POST', '/business/pay-yourself', { amount: 5000 });
  check('record owner pay in both spaces', r.status === 201 && !!r.data.businessTransactionId && !!r.data.personalTransactionId, r);
  r = await call(a.token, 'GET', `/business/report?from=${monthStart}&to=${today}`);
  check('profit and loss report', r.status === 200 && r.data.report.profitAndLoss.revenueTotal === 53750 && r.data.report.profitAndLoss.ownerPay === 5000 && r.data.report.business.name === 'Ada Foods', r.data?.report?.profitAndLoss ?? r);

  const statementRows = [
    { date: today, amount: 12500, direction: 'credit', description: 'Paystack payment from Ngozi', reference: `PSK-${stamp}-1` },
    { date: today, amount: 250, direction: 'debit', description: 'Paystack fee', reference: `PSK-${stamp}-2` }
  ];
  r = await call(a.token, 'POST', '/imports/statement', { source: 'paystack', fileName: 'paystack.csv', rows: statementRows });
  check('upload a Paystack statement', r.status === 201 && r.data.imported === 2 && r.data.duplicates === 0, r);
  r = await call(a.token, 'POST', '/imports/statement', { source: 'paystack', fileName: 'paystack.csv', rows: statementRows });
  check('re-uploading adds nothing twice', r.status === 201 && r.data.imported === 0 && r.data.duplicates === 2, r);
  r = await call(a.token, 'GET', '/insights?spaceId=business');
  check('business early warnings include overdue invoices', r.status === 200 && r.data.items.some((i) => i.key.startsWith('biz-overdue')), r.data?.items?.map((i) => i.key));

  section('Money Wrapped');
  r = await call(a.token, 'GET', `/wrapped?kind=year&year=${y}&spaceId=personal`);
  check('personal Wrapped for the year', r.status === 200 && r.data.wrapped.hasData === true && r.data.wrapped.period.kind === 'year' && !!r.data.wrapped.persona, r.data?.wrapped?.period ?? r);
  r = await call(a.token, 'GET', `/wrapped?kind=year&year=${y}&spaceId=business`);
  check('business Wrapped names the top customer', r.status === 200 && r.data.wrapped.business?.topCustomer?.name === 'Mama Put Ltd', r.data?.wrapped?.business ?? r);
  check('future Wrapped is refused', (await call(a.token, 'GET', '/wrapped?kind=h1&year=2099')).status === 400);

  section('Devices, passwords and recovery');
  r = await call(a.token, 'GET', '/auth/sessions');
  check('devices list names this phone', r.status === 200 && r.data.items.some((s) => s.current && s.deviceName === 'Test iPhone'), r);
  const second = await signIn(A.email, A.password);
  check('sign in on a second device', second.status === 200, second.data);
  check('devices list shows both', (await call(a.token, 'GET', '/auth/sessions')).data?.items?.length >= 2);
  r = await call(a.token, 'POST', '/auth/sessions/revoke-others');
  check('sign out other devices', r.status === 200 && r.data.revoked >= 1, r);
  check('signed-out device loses access immediately', (await call(second.data.access_token, 'GET', '/auth/me')).status === 401);
  check('current device keeps access', (await call(a.token, 'GET', '/auth/me')).status === 200);

  check('change password rejects wrong current password', (await call(a.token, 'POST', '/auth/change-password', { oldPassword: 'wrong-pass', newPassword: 'NewPassw0rd-2' })).status === 400);
  r = await call(a.token, 'POST', '/auth/change-password', { oldPassword: A.password, newPassword: 'NewPassw0rd-2' });
  check('change password', r.status === 204, r);
  r = await call(a.token, 'GET', '/auth/me');
  check('device that changed the password stays signed in', r.status === 200, r);
  check('sign in with new password', (await signIn(A.email, 'NewPassw0rd-2')).status === 200);
  check('old password no longer works', (await signIn(A.email, A.password)).status === 400);

  r = await call(null, 'POST', '/auth/forgot-password', { email: A.email });
  check('forgot password answers ok without exposing a code', r.status === 200 && r.data.ok === true && !r.data.devCode, r);
  check('forgot password for unknown email looks the same', (await call(null, 'POST', '/auth/forgot-password', { email: `nobody.${stamp}@example.com` })).data?.ok === true);
  const link = await authApi('POST', '/admin/generate_link', { type: 'recovery', email: A.email }, { key: SECRET });
  const otp = link.data?.email_otp ?? link.data?.properties?.email_otp;
  check('recovery code is 6 digits', /^\d{6}$/.test(String(otp)), link.status);
  const verified = await authApi('POST', '/verify', { type: 'recovery', email: A.email, token: otp });
  check('app verifies recovery code (verifyOtp)', verified.status === 200 && !!verified.data?.access_token, verified.data);
  const upd = await authApi('PUT', '/user', { password: 'ResetPassw0rd-3' }, { token: verified.data?.access_token });
  check('app sets new password after recovery', upd.status === 200, upd.data);
  check('sign in with recovered password', (await signIn(A.email, 'ResetPassw0rd-3')).status === 200);

  section('Scheduled job');
  check('daily job rejects missing secret', (await call(null, 'POST', '/cron/daily')).status === 401);
  r = await call(null, 'POST', '/cron/daily?insights=1', {}, { 'x-cron-secret': CRON });
  check('daily job runs with secret', r.status === 200 && r.data.today === today && typeof r.data.billReminders === 'number' && typeof r.data.insights?.sent === 'number' && typeof r.data.business?.invoices === 'number', r);

  section('Clean up');
  const fresh = (await signIn(A.email, 'ResetPassw0rd-3')).data?.access_token ?? a.token;
  r = await call(fresh, 'DELETE', `/budgets/${prevBudgetId}`);
  check('delete last month budget', r.status === 204, r);
  r = await call(fresh, 'DELETE', `/goals/${goalId}`);
  check('delete goal', r.status === 204, r);
} catch (err) {
  failures.push(`crashed: ${err?.message ?? err}`);
  console.log('  CRASH', err);
} finally {
  for (const id of users) {
    const res = await authApi('DELETE', `/admin/users/${id}`, undefined, { key: SECRET });
    check(`delete test user ${id.slice(0, 8)}`, res.status === 200, res.data);
  }
  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) console.log('Failed:\n - ' + failures.join('\n - '));
  process.exit(failures.length ? 1 : 0);
}
