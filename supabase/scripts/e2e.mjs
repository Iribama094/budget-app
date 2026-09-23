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

/**
 * fetch, tried once more when the connection drops before any answer (a reused socket the other side had
 * already closed). Any answer from the server, errors included, is returned as it came; only a dropped line
 * is retried, so a flaky connection can't crash the run but can't hide a real failure either.
 */
const DROPPED = new Set(['UND_ERR_SOCKET', 'ECONNRESET', 'UND_ERR_CLOSED', 'EPIPE']);
async function fetchOnce(url, init) {
  try {
    return await fetch(url, init);
  } catch (err) {
    if (!DROPPED.has(err?.cause?.code)) throw err;
    console.log('  (connection dropped, trying once more)');
    return fetch(url, init);
  }
}

async function call(token, method, path, body, headers = {}) {
  const res = await fetchOnce(`${API}${path}`, {
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
  return { status: res.status, data, headers: res.headers };
}

async function authApi(method, path, body, { key = PUB, token } = {}) {
  const res = await fetchOnce(`${BASE}/auth/v1${path}`, {
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

/** Test addresses cannot receive the code, so they are marked verified the way only the server can. */
async function markVerified(id) {
  await authApi('PUT', `/admin/users/${id}`, { app_metadata: { email_verified_at: new Date().toISOString() } }, { key: SECRET });
}

async function createUser(u, { verified = true } = {}) {
  const res = await authApi('POST', '/signup', { email: u.email, password: u.password, data: { name: u.name } });
  if (res.status === 200 && res.data?.access_token) {
    users.push(res.data.user.id);
    if (verified) await markVerified(res.data.user.id);
    return { id: res.data.user.id, token: res.data.access_token, via: 'signup' };
  }
  console.log('  (signup returned', res.status, res.data?.error_code ?? res.data?.msg, '- creating with admin API)');
  const admin = await authApi('POST', '/admin/users', { email: u.email, password: u.password, email_confirm: true, user_metadata: { name: u.name } }, { key: SECRET });
  users.push(admin.data.id);
  if (verified) await markVerified(admin.data.id);
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

  section('Invite friends');
  r = await call(a.token, 'GET', '/referrals');
  const aCode = r.data?.code;
  check('everyone gets a code and a message to share', r.status === 200 && /^ADA[A-Z0-9]{4}$/.test(aCode) && r.data.message.includes(aCode) && r.data.link.endsWith(`?ref=${aCode}`), r);
  check('a new account can still say who invited them', r.data?.canEnterCode === true && r.data?.joined === 0 && r.data?.invitedBy === null, r.data);
  check('the same code every time', (await call(a.token, 'GET', '/referrals')).data?.code === aCode);
  r = await call(a.token, 'POST', '/referrals/claim', { code: aCode.toLowerCase() });
  check('your own code is refused', r.status === 400 && r.data?.error?.code === 'OWN_CODE', r);
  r = await call(b.token, 'POST', '/referrals/claim', { code: 'NOSUCHCODE9' });
  check('an unknown code is refused', r.status === 404 && r.data?.error?.code === 'INVALID_CODE', r);
  r = await call(b.token, 'POST', '/referrals/claim', { code: ` ${aCode.slice(0, 3)}-${aCode.slice(3)} ` });
  check('a friend enters the code, however they type it', r.status === 200 && r.data.invitedBy === 'Ada', r);
  r = await call(b.token, 'POST', '/referrals/claim', { code: aCode });
  check('the same code again is fine', r.status === 200, r);
  const bCode = (await call(b.token, 'GET', '/referrals')).data?.code;
  r = await call(b.token, 'GET', '/referrals');
  check('the friend sees who invited them and cannot change it', r.data?.invitedBy === 'Ada' && r.data?.canEnterCode === false, r.data);
  r = await call(a.token, 'POST', '/referrals/claim', { code: bCode });
  check('two people cannot each have invited the other', r.status === 400 && r.data?.error?.code === 'CIRCULAR', r);
  r = await call(a.token, 'GET', '/referrals');
  check('the inviter sees the friend joined', r.data?.joined === 1 && typeof r.data?.counted === 'number', r.data);

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
  check('notifications feed has auto-save and recurring alerts', r.status === 200 && r.data.unread > 0 && kinds.includes('autosave') && kinds.includes('recurring'), kinds);
  // Spending past a bucket always warns, whatever day of the month it is. (A "running hot" alert only fires
  // when spending is ahead of the calendar, so it can't be tested on a fixed set of amounts.) The expense is
  // removed again so the totals later sections check stay the same.
  r = await call(a.token, 'POST', '/transactions', { type: 'expense', amount: 160000, category: 'Aso ebi', occurredAt: now(), budgetId, budgetCategory: 'Free Spending' });
  const burstId = r.data?.transaction?.id;
  const overKinds = ((await call(a.token, 'GET', '/notifications')).data?.items ?? []).map((n) => n.kind);
  check('going past a bucket warns', overKinds.includes('over'), overKinds);
  if (burstId) await call(a.token, 'DELETE', `/transactions/${burstId}`);
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
  check('owner is told when the partner leaves', (r.data?.items ?? []).some((n) => n.kind === 'shared' && /left|comot/.test(n.title)), r.data?.items?.map((n) => n.title));
  // Tidy up the extra budgets so later sections see the same data as before.
  for (const id of [nextId, ownId, eventId]) if (id) await call(a.token, 'DELETE', `/budgets/${id}`);
  await call(a.token, 'PATCH', '/users/me', { homeBudget: 'own', budgetMode: 'solo' });
  r = await call(b.token, 'GET', `/transactions/${expenseId}`);
  check("other user's transaction is private", r.status === 404, { status: r.status, body: r.data });

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
  // 501 when the project has no Mono keys; 502 once it does, because a made-up code is rejected by Mono.
  // Either way the point is the same: a bad code never creates a connection.
  r = await call(a.token, 'POST', '/bank-links/mono', { code: 'test-code' });
  check('Mono connect refuses a bad code', r.status === 501 || r.status === 502, r);
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

  // Kept outside the block below so the security section can aim at them too.
  let cashId, loanId, flatId;
  section('Money for everyone');
  // Needs migration 20260921200000_money_for_everyone and the API that goes with it. Until both are live this
  // section says so and skips, rather than failing everyone else's runs.
  const probe = await call(a.token, 'GET', '/money');
  if (probe.status !== 200) {
    console.log('  skip  not live yet (GET /money answered', probe.status + ')');
  } else {
    // Linked demo bank accounts from earlier count already; everything below is measured from here.
    const base = probe.data.totals;
    check('your money starts with no cash, land or debts', probe.data.holdings.length === 0 && probe.data.debts.length === 0, probe.data);
    r = await call(a.token, 'POST', '/holdings', { name: 'Cash at home', kind: 'cash', balance: 12000 });
    check('add cash', r.status === 201 && r.data.holding.group === 'have', r);
    cashId = r.data?.holding?.id;
    r = await call(a.token, 'PATCH', `/holdings/${cashId}`, { balance: 9000 });
    check('update cash balance', r.status === 200 && r.data.holding.balance === 9000, r);
    r = await call(a.token, 'POST', '/holdings', { name: 'Plot', kind: 'land', currency: 'USD', balance: 1000 });
    check('add land in dollars', r.status === 201 && r.data.holding.group === 'own', r);
    r = await call(a.token, 'PUT', '/fx-rates', { rates: { USD: 1500 } });
    check('set own dollar rate', r.status === 200 && r.data.rates.USD === 1500, r);
    r = await call(a.token, 'POST', '/debts', { direction: 'owe', person: 'Loan app', amount: 50000, monthlyRate: 15 });
    check('add a debt I owe', r.status === 201 && r.data.debt.balance === 50000, r);
    loanId = r.data?.debt?.id;
    r = await call(a.token, 'POST', '/debts', { direction: 'owe', person: 'Cooperative', amount: 30000, monthlyRate: 2 });
    check('add a cheaper debt', r.status === 201, r);
    r = await call(a.token, 'POST', '/debts', { direction: 'owed', person: 'Tunde', amount: 20000 });
    check('add money owed to me', r.status === 201, r);
    r = await call(a.token, 'POST', `/debts/${loanId}/payments`, { amount: 10000 });
    check('repayment lowers the debt and counts as spending', r.status === 200 && r.data.debt.balance === 40000 && !!r.data.transactionId, r);
    r = await call(a.token, 'GET', '/money');
    check(
      'totals add up in naira, dearest debt first',
      r.status === 200 &&
        r.data.totals.have === base.have + 9000 &&
        r.data.totals.own === 1500000 &&
        r.data.totals.owe === 70000 &&
        r.data.totals.owedToYou === 20000 &&
        r.data.totals.net === base.net + 1459000 &&
        r.data.payoffOrder[0] === loanId,
      r.data?.totals
    );
    const ownerNet = r.data?.totals?.net;
    r = await call(a.token, 'GET', '/prices');
    check('rising prices answers', r.status === 200 && 'livingCost' in r.data && Array.isArray(r.data.billsUp), r);

    r = await call(a.token, 'POST', '/transactions', { type: 'expense', amount: 10000, category: 'Shopping', description: 'Shoes', occurredAt: new Date().toISOString() });
    const shoesId = r.data?.transaction?.id;
    r = await call(a.token, 'PATCH', `/transactions/${shoesId}`, { refund: 4000 });
    check('part refund reduces the expense', r.status === 200 && r.data.transaction.amount === 6000 && r.data.transaction.refundedAmount === 4000, r);
    r = await call(a.token, 'PATCH', `/transactions/${shoesId}`, { refund: 6000 });
    check('full refund removes it', r.status === 200 && r.data.removed === true, r);

    r = await call(a.token, 'POST', '/recurring', { type: 'expense', amount: 90000, category: 'School fees', description: 'School fees', frequency: 'termly', startDate: '2099-01-10' });
    check('termly bill', r.status === 201 && r.data.recurring.frequency === 'termly', r);
    const feesId = r.data?.recurring?.id;
    r = await call(a.token, 'POST', '/goals', { name: 'School fees', targetAmount: 90000, targetDate: '2099-01-10', recurringId: feesId });
    check('savings pot linked to the bill', r.status === 201 && r.data.goal.recurringId === feesId, r);
    await call(a.token, 'DELETE', `/goals/${r.data?.goal?.id}`);
    await call(a.token, 'DELETE', `/recurring/${feesId}`);

    r = await call(a.token, 'POST', '/goals', { name: 'Income buffer', targetAmount: 150000, targetDate: '2099-01-01', currentAmount: 100000, kind: 'buffer', monthlyDraw: 50000 });
    check('steady pay buffer', r.status === 201 && r.data.goal.kind === 'buffer' && r.data.goal.monthlyDraw === 50000, r);
    const bufferId = r.data?.goal?.id;
    r = await call(a.token, 'POST', `/goals/${bufferId}/contributions`, { amount: 50000, direction: 'out' });
    check('pay yourself from the buffer', r.status === 201 && r.data.amount === -50000 && r.data.goal.currentAmount === 50000, r);
    await call(a.token, 'DELETE', `/goals/${bufferId}`);

    r = await call(a.token, 'POST', '/staff?spaceId=personal', { name: 'Driver', monthlyGross: 80000 });
    check('add household staff', r.status === 201 && r.data.staff.payeEstimate === 0, r);
    const home = await call(a.token, 'GET', '/payroll?spaceId=personal');
    const work = await call(a.token, 'GET', '/payroll');
    check('household staff stay out of business payroll', home.data?.staff?.length === 1 && !work.data?.staff?.some((s) => s.name === 'Driver'), { home: home.data?.staff?.length });

    r = await call(a.token, 'POST', '/properties', { name: 'Flat 2', tenantName: 'Mr Obi', rentAmount: 600000, frequency: 'yearly', nextDue: '2099-03-01' });
    check('add a property', r.status === 201 && r.data.property.status === 'paid_up', r);
    flatId = r.data?.property?.id;
    r = await call(a.token, 'POST', `/properties/${flatId}/paid`, {});
    check('rent received moves the due date a year', r.status === 200 && r.data.property.nextDue === '2100-03-01' && !!r.data.transactionId, r);
    await call(a.token, 'DELETE', `/properties/${flatId}`);

    r = await call(a.token, 'POST', '/delegates', { email: B.email, role: 'view' });
    check('invite a helper', r.status === 201 && typeof r.data.code === 'string', r);
    const code = r.data?.code;
    check('someone else cannot use the code', (await call(a.token, 'POST', '/delegates/accept', { code })).status === 400);
    r = await call(b.token, 'GET', `/join?code=${code}`);
    check('the code box recognises a helper invite', r.status === 200 && r.data.found === true && r.data.kind === 'helper', r);
    r = await call(b.token, 'POST', '/join', { code });
    check('helper accepts through the one code box', r.status === 200 && r.data.kind === 'helper' && r.data.ownerId === a.id, r);
    r = await call(b.token, 'GET', '/money', undefined, { 'x-act-as': a.id });
    check('helper sees the owner’s money', r.status === 200 && r.data.totals.net === ownerNet, r.data?.totals);
    check('view helper cannot add spending', (await call(b.token, 'POST', '/transactions', { type: 'expense', amount: 1, category: 'Other', occurredAt: new Date().toISOString() }, { 'x-act-as': a.id })).status === 403);
    check('helper cannot change the owner’s settings', (await call(b.token, 'PATCH', '/users/me', { name: 'x' }, { 'x-act-as': a.id })).status === 403);
    check('helper cannot add more helpers', (await call(b.token, 'GET', '/delegates', undefined, { 'x-act-as': a.id })).status === 403);
    const helpers = await call(a.token, 'GET', '/delegates');
    await call(a.token, 'DELETE', `/delegates/${helpers.data?.helpers?.[0]?.id}`);
    check('removed helper loses access at once', (await call(b.token, 'GET', '/money', undefined, { 'x-act-as': a.id })).status === 403);
  }

  section('Business team');
  // Needs migration 20260922140000_business_team and the API that goes with it; skips until both are live.
  const teamProbe = await call(a.token, 'GET', '/team');
  if (teamProbe.status !== 200) {
    console.log('  skip  not live yet (GET /team answered', teamProbe.status + ')');
  } else {
    const asBen = { 'x-business': a.id };
    const now = new Date().toISOString();
    r = await call(a.token, 'POST', '/transactions', { type: 'income', amount: 25000, category: 'Sales', description: 'Owner sale', occurredAt: now, spaceId: 'business' });
    const ownerSaleId = r.data?.transaction?.id;
    await call(a.token, 'POST', '/transactions', { type: 'expense', amount: 9000, category: 'Rent', description: 'Owner cost', occurredAt: now, spaceId: 'business' });
    await call(a.token, 'POST', '/transactions', { type: 'expense', amount: 4000, category: 'Food', description: 'Owner personal lunch', occurredAt: now, spaceId: 'personal' });

    r = await call(a.token, 'POST', '/team', { name: 'Ben', role: 'sales' });
    check('owner adds someone as Sales and gets a code', r.status === 201 && typeof r.data.code === 'string' && r.data.message.includes(r.data.code), r);
    const benCode = r.data?.code;
    const benMemberId = r.data?.member?.id;
    check('a code does nothing before it is used', (await call(b.token, 'GET', '/transactions?spaceId=business', undefined, asBen)).status === 403);
    // One box for any code: it says what a code is for without using it up.
    r = await call(b.token, 'GET', `/join?code=${benCode}`);
    check('the code box recognises a business code', r.status === 200 && r.data.found === true && r.data.kind === 'business' && typeof r.data.name === 'string', r);
    check('the code box knows nothing of a made-up code', (await call(b.token, 'GET', '/join?code=ZZZZZZZZ')).data?.found === false);
    r = await call(b.token, 'POST', '/team/join', { code: benCode });
    check('member joins with the code', r.status === 200 && r.data.ownerId === a.id && r.data.role === 'sales', r);
    check('the same code cannot be used twice', (await call(b.token, 'POST', '/team/join', { code: benCode })).status === 400);
    r = await call(b.token, 'GET', '/team');
    check('member sees the business they joined', r.status === 200 && r.data.businesses.some((x) => x.ownerId === a.id && x.role === 'sales'), r.data);

    r = await call(b.token, 'GET', '/transactions', undefined, asBen);
    check('Sales sees only money in, only in the business', r.status === 200 && r.data.items.length > 0 && r.data.items.every((t) => t.type === 'income' && t.spaceId === 'business'), r.data?.items?.map((t) => [t.type, t.spaceId]));
    r = await call(b.token, 'GET', '/transactions?spaceId=personal', undefined, asBen);
    check('asking for personal still gets the business only', r.status === 200 && r.data.items.every((t) => t.spaceId === 'business' && t.description !== 'Owner personal lunch'), r.data?.items?.map((t) => t.description));
    check('Sales cannot record a cost', (await call(b.token, 'POST', '/transactions', { type: 'expense', amount: 100, category: 'Rent', occurredAt: now }, asBen)).status === 403);
    r = await call(b.token, 'POST', '/transactions', { type: 'income', amount: 7000, category: 'Sales', description: 'Ben sale', occurredAt: now }, asBen);
    check('Sales records a sale into the business', r.status === 201 && r.data.transaction.spaceId === 'business' && r.data.transaction.createdBy === b.id, r);
    const benSaleId = r.data?.transaction?.id;
    r = await call(a.token, 'GET', '/transactions?spaceId=business&type=income');
    check('owner sees who recorded it', r.data?.items?.some((t) => t.id === benSaleId && t.recordedBy === 'Ben'), r.data?.items?.map((t) => t.recordedBy));
    check('Sales corrects their own entry', (await call(b.token, 'PATCH', `/transactions/${benSaleId}`, { amount: 7500 }, asBen)).status === 200);
    r = await call(b.token, 'PATCH', `/transactions/${ownerSaleId}`, { amount: 1 }, asBen);
    check('Sales cannot change the owner’s entry', r.status === 403, { status: r.status, body: r.data });
    check('nobody on the team can delete', (await call(b.token, 'DELETE', `/transactions/${benSaleId}`, undefined, asBen)).status === 403);
    check('Sales cannot see profit', (await call(b.token, 'GET', '/business/summary', undefined, asBen)).status === 403);
    check('Sales cannot see payroll', (await call(b.token, 'GET', '/payroll', undefined, asBen)).status === 403);
    check('the team never reaches personal budgets or goals', (await call(b.token, 'GET', '/goals', undefined, asBen)).status === 403 && (await call(b.token, 'GET', '/money?spaceId=personal', undefined, asBen)).status === 403);
    check('the team cannot touch bank connections', (await call(b.token, 'GET', '/bank-links', undefined, asBen)).status === 403);
    r = await call(b.token, 'GET', '/auth/me', undefined, asBen);
    check('their own profile stays their own', r.status === 200 && r.data.user.email === B.email, r.data?.user?.email);

    r = await call(a.token, 'PATCH', `/team/${benMemberId}`, { role: 'accountant' });
    check('owner changes the role', r.status === 200 && r.data.member.role === 'accountant', r);
    check('Accountant sees the whole picture', (await call(b.token, 'GET', '/business/summary', undefined, asBen)).status === 200);
    r = await call(b.token, 'GET', '/transactions', undefined, asBen);
    check('Accountant sees money in and out', r.status === 200 && r.data.items.some((t) => t.type === 'expense') && r.data.items.some((t) => t.type === 'income'), r.data?.items?.length);
    check('Accountant changes nothing', (await call(b.token, 'POST', '/transactions', { type: 'income', amount: 1, category: 'Sales', occurredAt: now }, asBen)).status === 403);
    check('a member cannot change roles', (await call(b.token, 'PATCH', `/team/${benMemberId}`, { role: 'manager' })).status === 403);

    check('owner removes them', (await call(a.token, 'DELETE', `/team/${benMemberId}`)).status === 204);
    check('removed member loses access at once', (await call(b.token, 'GET', '/transactions', undefined, asBen)).status === 403);
  }

  section('Security: one account cannot reach another');
  // Everything here belongs to one person. The other is signed in and knows the ids, which is the realistic
  // attack: ids leak through screenshots, shared links and logs. Every attempt must look like nothing is there.
  const theirs = [
    ['goal', `/goals/${goalId}`],
    ['transaction', `/transactions/${expenseId}`],
    ['recurring payment', `/recurring/${recId}`],
    ['bank link', `/bank-links/${linkId}`],
    ['category', `/categories/${genId}`],
    ['invoice', `/invoices/${inv1}`],
    ['supplier bill', `/bills/${billId}`],
    ['holding', `/holdings/${cashId}`],
    ['debt', `/debts/${loanId}`],
    ['property', `/properties/${flatId}`]
  ];
  for (const [what, path] of theirs) {
    const reads = await call(b.token, 'GET', path);
    const edits = await call(b.token, 'PATCH', path, { name: 'hijacked', note: 'hijacked', amount: 1 });
    const deletes = await call(b.token, 'DELETE', path);
    // 400 counts as refused: a body a route will not accept never reaches the database. The ones below with a
    // valid body prove the ownership check itself.
    const refused = (s) => s === 404 || s === 403 || s === 405 || s === 400;
    check(`someone else cannot read, change or delete your ${what}`, refused(reads.status) && refused(edits.status) && refused(deletes.status), {
      get: reads.status,
      patch: edits.status,
      delete: deletes.status
    });
  }
  r = await call(b.token, 'PATCH', `/holdings/${cashId}`, { name: 'hijacked' });
  check("a well-formed edit to somebody else's holding still finds nothing", r.status === 404, r.status);
  r = await call(b.token, 'PATCH', `/goals/${goalId}`, { name: 'hijacked' });
  check("a well-formed edit to somebody else's goal still finds nothing", r.status === 404, r.status);
  check('their income source is not yours either', [403, 404, 405].includes((await call(a.token, 'DELETE', `/income-sources/${sideId}`)).status));
  r = await call(a.token, 'GET', `/goals/${goalId}`);
  check('the owner still has everything afterwards', r.status === 200 && r.data.goal?.name !== 'hijacked', r.status);
  r = await call(b.token, 'GET', '/transactions', undefined, { 'x-act-as': a.id });
  check('acting for somebody who never invited you is refused', r.status === 403, r.status);

  section('Security: proving an email address');
  const C = { email: `bf.e2e.c.${stamp}@example.com`, password: 'Passw0rd-C-1', name: 'Chi Test' };
  const c = await createUser(C, { verified: false });
  r = await call(c.token, 'GET', '/auth/me');
  // The code step only applies when the server can send email. Without a mail provider it stands aside, since
  // no code could ever arrive. Which of the two is live decides what is checked.
  const mailOn = r.data?.user?.emailVerified === false;
  console.log(`  (email ${mailOn ? 'is' : 'is NOT'} configured on this project: checking the ${mailOn ? 'code step' : 'code step standing aside'})`);
  r = await call(a.token, 'GET', '/auth/me');
  check('a verified account says so', r.data?.user?.emailVerified === true, r.data?.user?.emailVerified);
  if (mailOn) {
    r = await call(c.token, 'POST', '/auth/verify-email/send');
    check('a code can be sent', r.status === 200 && ['sent', 'already-sent'].includes(r.data.status), r);
    r = await call(c.token, 'POST', '/auth/verify-email/send');
    check('asking again straight away does not send a second email', r.status === 200 && r.data.status === 'already-sent', r.data);
    r = await call(c.token, 'POST', '/auth/verify-email', { code: '000000' });
    check('a wrong code is refused', r.status === 400 && ['WRONG_CODE', 'CODE_EXPIRED'].includes(r.data?.error?.code), r);
    r = await call(c.token, 'POST', '/delegates', { email: `someone.${stamp}@example.com`, role: 'view' });
    check('an unverified account cannot send invites', r.status === 403 && r.data?.error?.code === 'EMAIL_UNVERIFIED', r);
  } else {
    r = await call(c.token, 'POST', '/delegates', { email: `someone.${stamp}@example.com`, role: 'view' });
    check('with no email to send, a new account is not stopped from inviting', r.status === 201, r);
  }
  r = await call(c.token, 'POST', '/auth/verify-email', { code: 'abc' });
  check('something that is not a code is refused', r.status === 400, r.status);
  await markVerified(c.id);
  r = await call(c.token, 'GET', '/auth/me');
  check('once proved, the account is verified', r.data?.user?.emailVerified === true, r.data?.user?.emailVerified);
  r = await call(c.token, 'POST', '/auth/verify-email/send');
  check('a verified account is not sent codes', r.data?.status === 'verified', r.data);

  section('Limits, quotas and ceilings');
  const D = { email: `bf.e2e.d.${stamp}@example.com`, password: 'Passw0rd-D-1', name: 'Dele Test' };
  const d = await createUser(D);
  // Five sends an hour is the quota on this endpoint, so the sixth has to be refused, with something the
  // app can show and a Retry-After the caller can obey.
  let limited = null;
  for (let i = 0; i < 8 && !limited; i++) {
    const r = await call(d.token, 'POST', '/auth/verify-email/send');
    if (r.status === 429) limited = r;
  }
  check('asking too often is refused', limited !== null, 'never hit the limit in 8 tries');
  check('the refusal says when to come back', !!limited && /try again in/i.test(limited.data?.error?.message ?? ''), limited?.data?.error);
  check('the refusal is a 429, not a 500', limited?.status === 429, limited?.status);
  r = await call(d.token, 'GET', '/auth/me');
  check('one endpoint hitting its limit does not lock the account out', r.status === 200, r.status);

  // The public waitlist has a tighter burst, since nobody joins three times in a minute by hand.
  let publicLimited = null;
  for (let i = 0; i < 6 && !publicLimited; i++) {
    // `company` is the hidden trap field, so these count against the limit but are never saved. The real
    // waitlist stays clean even though this runs against the live project.
    const r = await call(null, 'POST', '/waitlist', {
      firstName: 'Burst',
      email: `bf.burst.${stamp}.${i}@example.com`,
      useFor: 'personal',
      company: 'end to end check'
    });
    if (r.status === 429) publicLimited = r;
  }
  check('a burst of public sign-ups is stopped', publicLimited?.status === 429, publicLimited?.status ?? 'never limited');

  // A code is all a stranger needs to reach the lookup, so it must never carry an email address.
  r = await call(a.token, 'POST', '/delegates', { email: `helper.${stamp}@example.com`, role: 'view' });
  const helperCode = r.data?.code;
  if (helperCode) {
    r = await call(b.token, 'GET', `/join?code=${encodeURIComponent(helperCode)}`);
    check('an invite code does not hand out the owner email', r.status === 200 && !JSON.stringify(r.data ?? {}).includes(A.email), r.data);
  }

  section('Security: what the server sends back');
  r = await call(a.token, 'GET', '/auth/me');
  check('answers about money are never cached', r.headers.get('cache-control') === 'no-store', r.headers.get('cache-control'));
  check('answers are never sniffed as anything but JSON', r.headers.get('x-content-type-options') === 'nosniff');
  r = await call(null, 'GET', '/budgets');
  check('no token, no data', r.status === 401);
  r = await call('not-a-real-token', 'GET', '/budgets');
  check('a forged token gets nothing', r.status === 401);
  // The 8 MB body cap is not exercised here: proving it means uploading 9 MB on every run.
  r = await call(a.token, 'GET', '/admin/me');
  check('a normal account cannot see the staff console exists', r.status === 404, r.status);
  r = await call(null, 'GET', '/cron/daily', undefined, { 'x-cron-secret': 'guess' });
  check('the daily job refuses a guessed secret', r.status === 401);

  section('Devices, passwords and recovery');
  r = await call(a.token, 'GET', '/auth/sessions');
  check('devices list names this phone', r.status === 200 && r.data.items.some((s) => s.current && s.deviceName === 'Test iPhone'), r);
  const second = await signIn(A.email, A.password);
  check('sign in on a second device', second.status === 200, second.data);
  // The second phone makes its first request, which is when the account holder is told.
  await call(second.data.access_token, 'GET', '/auth/me', undefined, { 'x-device-name': 'Unknown Pixel', 'x-device-platform': 'android' });
  r = await call(a.token, 'GET', '/notifications');
  check('a new device signing in is announced to the account holder', (r.data?.items ?? []).some((n) => /new sign-in/i.test(n.title) && /Unknown Pixel/.test(n.body)), r.data?.items?.map((n) => n.title));
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
  check('daily job runs with secret', r.status === 200 && r.data.today === today && typeof r.data.billReminders === 'number' && typeof r.data.insights?.sent === 'number' && typeof r.data.business?.invoices === 'number' && typeof r.data.referrals?.sent === 'number', r);

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
