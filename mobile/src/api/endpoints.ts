import { apiFetch } from './client';

export type ApiUser = {
  id: string;
  email: string;
  name: string | null;
  currency: string | null;
  locale: string | null;
  monthlyIncome: number | null;
  taxProfile?: {
    country?: string;
    withheldByEmployer?: boolean;
    netMonthlyIncome?: number;
    grossMonthlyIncome?: number;
    incomeType?: 'gross' | 'net';
    residentType?: string;
    dependents?: number;
    pensionContribution?: number;
    optInTaxFeature?: boolean;
  } | null;
  netWorth?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthResponse = { user: ApiUser; accessToken: string; refreshToken: string };

export async function register(email: string, password: string, name?: string): Promise<AuthResponse> {
  return (await apiFetch('/v1/auth/register', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({ email, password, name })
  })) as AuthResponse;
}

export async function login(email: string, password: string, deviceName?: string): Promise<AuthResponse> {
  return (await apiFetch('/v1/auth/login', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({ email, password, deviceName })
  })) as AuthResponse;
}

export async function logout(refreshToken: string): Promise<void> {
  await apiFetch('/v1/auth/logout', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({ refreshToken })
  });
}

export async function getMe(): Promise<ApiUser> {
  const data = await apiFetch('/v1/auth/me', { method: 'GET' });
  return (data as any).user as ApiUser;
}

export async function patchMe(patch: Partial<Pick<ApiUser, 'name' | 'currency' | 'locale' | 'monthlyIncome'>> & { taxProfile?: any }): Promise<ApiUser> {
  const data = await apiFetch('/v1/users/me', { method: 'PATCH', body: JSON.stringify(patch) });
  return (data as any).user as ApiUser;
}

export async function uploadAvatar(uri: string): Promise<{ avatarUrl: string }> {
  // If already a remote or data URL, just return it
  if (/^https?:\/\//.test(uri) || uri.startsWith('data:')) {
    return { avatarUrl: uri };
  }

  // FormData upload for local files (React Native)
  const form = new FormData();
  form.append('avatar', { uri, name: 'avatar.jpg', type: 'image/jpeg' } as any);
  const data = await apiFetch('/v1/users/me/avatar', { method: 'POST', body: form });
  return data as { avatarUrl: string };
}

export async function getTaxRules(country: string): Promise<any> {
  const qs = new URLSearchParams({ country });
  const data = await apiFetch(`/v1/tax/rules?${qs.toString()}`, { method: 'GET' });
  return data as any;
}

export async function calcTax(payload: { country: string; grossAnnual: number; deductions?: any; allowances?: any }): Promise<any> {
  const data = await apiFetch('/v1/tax/calc', { method: 'POST', body: JSON.stringify(payload) });
  return data as any;
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await apiFetch('/v1/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) });
}

export type ApiTransaction = {
  id: string;
  spaceId?: 'personal' | 'business';
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string;
  budgetId?: string | null;
  budgetCategory?: string | null;
  miniBudgetId?: string | null;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiMiniBudget = {
  id: string;
  budgetId: string;
  name: string;
  amount: number;
  category?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listTransactions(params: {
  start?: string;
  end?: string;
  limit?: number;
  cursor?: string;
  type?: 'income' | 'expense';
  category?: string;
  budgetId?: string;
  spaceId?: 'personal' | 'business';
}): Promise<{ items: ApiTransaction[]; nextCursor: string | null }> {
  const qs = new URLSearchParams();
  if (params.start) qs.set('start', params.start);
  if (params.end) qs.set('end', params.end);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.type) qs.set('type', params.type);
  if (params.category) qs.set('category', params.category);
  if (params.budgetId) qs.set('budgetId', params.budgetId);
  if (params.spaceId) qs.set('spaceId', params.spaceId);
  const data = await apiFetch(`/v1/transactions?${qs.toString()}`, { method: 'GET' });
  return data as any;
}

export async function createTransaction(input: {
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string;
  occurredAt: string;
  budgetId?: string | number | null;
  budgetCategory?: string | null;
  miniBudget?: string | null;
  spaceId?: 'personal' | 'business';
}): Promise<ApiTransaction> {
  const data = await apiFetch('/v1/transactions', { method: 'POST', body: JSON.stringify(input) });
  return (data as any).transaction as ApiTransaction;
}

export async function getTransaction(id: string): Promise<ApiTransaction> {
  const data = await apiFetch(`/v1/transactions/${encodeURIComponent(id)}`, { method: 'GET' });
  return (data as any).transaction as ApiTransaction;
}

export async function getTransactionInSpace(id: string, spaceId?: 'personal' | 'business'): Promise<ApiTransaction> {
  const qs = new URLSearchParams();
  if (spaceId) qs.set('spaceId', spaceId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const data = await apiFetch(`/v1/transactions/${encodeURIComponent(id)}${suffix}`, { method: 'GET' });
  return (data as any).transaction as ApiTransaction;
}

export async function patchTransaction(
  id: string,
  patch: Partial<Pick<ApiTransaction, 'type' | 'amount' | 'category' | 'description' | 'occurredAt' | 'budgetId' | 'budgetCategory' | 'miniBudgetId'>> & {
    miniBudget?: string | null;
  }
): Promise<ApiTransaction> {
  const data = await apiFetch(`/v1/transactions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return (data as any).transaction as ApiTransaction;
}

export async function patchTransactionInSpace(
  id: string,
  patch: Partial<Pick<ApiTransaction, 'type' | 'amount' | 'category' | 'description' | 'occurredAt' | 'budgetId' | 'budgetCategory' | 'miniBudgetId'>> & {
    miniBudget?: string | null;
  },
  spaceId?: 'personal' | 'business'
): Promise<ApiTransaction> {
  const qs = new URLSearchParams();
  if (spaceId) qs.set('spaceId', spaceId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const data = await apiFetch(`/v1/transactions/${encodeURIComponent(id)}${suffix}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return (data as any).transaction as ApiTransaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  await apiFetch(`/v1/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function deleteTransactionInSpace(id: string, spaceId?: 'personal' | 'business'): Promise<void> {
  const qs = new URLSearchParams();
  if (spaceId) qs.set('spaceId', spaceId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  await apiFetch(`/v1/transactions/${encodeURIComponent(id)}${suffix}`, { method: 'DELETE' });
}

export async function listMiniBudgets(budgetId: string): Promise<{ items: ApiMiniBudget[] }> {
  const data = await apiFetch(`/v1/budgets/${encodeURIComponent(budgetId)}/mini-budgets`, { method: 'GET' });
  return data as any;
}

export async function listMiniBudgetsInSpace(budgetId: string, spaceId?: 'personal' | 'business'): Promise<{ items: ApiMiniBudget[] }> {
  const qs = new URLSearchParams();
  if (spaceId) qs.set('spaceId', spaceId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const data = await apiFetch(`/v1/budgets/${encodeURIComponent(budgetId)}/mini-budgets${suffix}`, { method: 'GET' });
  return data as any;
}

export async function createMiniBudget(budgetId: string, input: { name: string; amount: number; category?: string }): Promise<any> {
  const data = await apiFetch(`/v1/budgets/${encodeURIComponent(budgetId)}/mini-budgets`, { method: 'POST', body: JSON.stringify(input) });
  return (data as any).miniBudget as ApiMiniBudget;
}

export async function createMiniBudgetInSpace(
  budgetId: string,
  input: { name: string; amount: number; category?: string },
  spaceId?: 'personal' | 'business'
): Promise<any> {
  const qs = new URLSearchParams();
  if (spaceId) qs.set('spaceId', spaceId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const data = await apiFetch(`/v1/budgets/${encodeURIComponent(budgetId)}/mini-budgets${suffix}`, {
    method: 'POST',
    body: JSON.stringify(input)
  });
  return (data as any).miniBudget as ApiMiniBudget;
}

export async function patchBudget(id: string, patch: Partial<{ name: string; totalBudget: number; period: 'monthly' | 'weekly'; startDate: string; categories: Record<string, { budgeted: number }>; endDate?: string }>): Promise<any> {
  const data = await apiFetch(`/v1/budgets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return (data as any).budget as any;
}

export async function patchBudgetInSpace(
  id: string,
  patch: Partial<{ name: string; totalBudget: number; period: 'monthly' | 'weekly'; startDate: string; categories: Record<string, { budgeted: number }>; endDate?: string }>,
  spaceId?: 'personal' | 'business'
): Promise<any> {
  const qs = new URLSearchParams();
  if (spaceId) qs.set('spaceId', spaceId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const data = await apiFetch(`/v1/budgets/${encodeURIComponent(id)}${suffix}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return (data as any).budget as any;
}

export async function deleteBudget(id: string): Promise<void> {
  await apiFetch(`/v1/budgets/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function deleteBudgetInSpace(id: string, spaceId?: 'personal' | 'business'): Promise<void> {
  const qs = new URLSearchParams();
  if (spaceId) qs.set('spaceId', spaceId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  await apiFetch(`/v1/budgets/${encodeURIComponent(id)}${suffix}`, { method: 'DELETE' });
}

export type ApiGoal = {
  id: string;
  spaceId?: 'personal' | 'business';
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  emoji?: string | null;
  color?: string | null;
  category?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listGoals(params?: { spaceId?: 'personal' | 'business' }): Promise<ApiGoal[]> {
  const qs = new URLSearchParams();
  if (params?.spaceId) qs.set('spaceId', params.spaceId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const data = await apiFetch(`/v1/goals${suffix}`, { method: 'GET' });
  return (data as any).items as ApiGoal[];
}

export async function getGoal(id: string): Promise<ApiGoal> {
  const data = await apiFetch(`/v1/goals/${encodeURIComponent(id)}`, { method: 'GET' });
  return (data as any).goal as ApiGoal;
}

export async function getGoalInSpace(id: string, spaceId?: 'personal' | 'business'): Promise<ApiGoal> {
  const qs = new URLSearchParams();
  if (spaceId) qs.set('spaceId', spaceId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const data = await apiFetch(`/v1/goals/${encodeURIComponent(id)}${suffix}`, { method: 'GET' });
  return (data as any).goal as ApiGoal;
}

export async function createGoal(input: {
  name: string;
  targetAmount: number;
  targetDate: string;
  currentAmount?: number;
  emoji?: string;
  color?: string;
  category?: string;
  spaceId?: 'personal' | 'business';
}): Promise<ApiGoal> {
  const data = await apiFetch('/v1/goals', { method: 'POST', body: JSON.stringify(input) });
  return (data as any).goal as ApiGoal;
}

export async function patchGoal(id: string, patch: Partial<ApiGoal>): Promise<ApiGoal> {
  const data = await apiFetch(`/v1/goals/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return (data as any).goal as ApiGoal;
}

export async function patchGoalInSpace(id: string, patch: Partial<ApiGoal>, spaceId?: 'personal' | 'business'): Promise<ApiGoal> {
  const qs = new URLSearchParams();
  if (spaceId) qs.set('spaceId', spaceId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const data = await apiFetch(`/v1/goals/${encodeURIComponent(id)}${suffix}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return (data as any).goal as ApiGoal;
}

export async function deleteGoal(id: string): Promise<void> {
  await apiFetch(`/v1/goals/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function deleteGoalInSpace(id: string, spaceId?: 'personal' | 'business'): Promise<void> {
  const qs = new URLSearchParams();
  if (spaceId) qs.set('spaceId', spaceId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  await apiFetch(`/v1/goals/${encodeURIComponent(id)}${suffix}`, { method: 'DELETE' });
}

export type ApiBudget = {
  id: string;
  spaceId?: 'personal' | 'business';
  name: string;
  totalBudget: number;
  period: 'monthly' | 'weekly';
  startDate: string;
  endDate?: string;
  categories: Record<string, { budgeted: number; spent?: number }>;
  createdAt: string;
  updatedAt: string;
};

export async function listBudgets(params?: { start?: string; end?: string; spaceId?: 'personal' | 'business' }): Promise<{ items: ApiBudget[] }> {
  const qs = new URLSearchParams();
  if (params?.start) qs.set('start', params.start);
  if (params?.end) qs.set('end', params.end);
  if (params?.spaceId) qs.set('spaceId', params.spaceId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const data = await apiFetch(`/v1/budgets${suffix}`, { method: 'GET' });
  return data as any;
}

export async function getBudget(id: string): Promise<ApiBudget> {
  const data = await apiFetch(`/v1/budgets/${encodeURIComponent(id)}`, { method: 'GET' });
  return (data as any).budget as ApiBudget;
}

export async function getBudgetInSpace(id: string, spaceId?: 'personal' | 'business'): Promise<ApiBudget> {
  const qs = new URLSearchParams();
  if (spaceId) qs.set('spaceId', spaceId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const data = await apiFetch(`/v1/budgets/${encodeURIComponent(id)}${suffix}`, { method: 'GET' });
  return (data as any).budget as ApiBudget;
}

export async function createBudget(input: {
  name: string;
  totalBudget: number;
  period: 'monthly' | 'weekly';
  startDate: string;
  endDate?: string;
  categories: Record<string, { budgeted: number }>;
  spaceId?: 'personal' | 'business';
}): Promise<ApiBudget> {
  const data = await apiFetch('/v1/budgets', { method: 'POST', body: JSON.stringify(input) });
  return (data as any).budget as ApiBudget;
}

export type ApiBankAccount = {
  id: string;
  bankLinkId: string;
  name: string;
  mask: string;
  type: string;
  currency: string;
  balance?: number;
};

export type ApiBankLink = {
  id: string;
  spaceId?: 'personal' | 'business';
  provider: string;
  bankName: string;
  createdAt: string;
  accounts: ApiBankAccount[];
};

export type ApiImportedTransaction = {
  id: string;
  spaceId?: 'personal' | 'business';
  bankAccountId: string;
  bankName: string;
  bankAccountName: string;
  amount: number;
  currency: string;
  direction: 'debit' | 'credit';
  description: string;
  merchant: string;
  occurredAt: string;
  status: 'pending' | 'reconciled' | 'ignored';
  reconciledAt?: string;
};
// Simple in-memory demo store as a fallback (e.g. when backend is unavailable)
let demoBankLinksMemory: ApiBankLink[] = [];

export async function listBankLinks(params?: { spaceId?: 'personal' | 'business' }): Promise<{ items: ApiBankLink[] }> {
  try {
    const qs = new URLSearchParams();
    if (params?.spaceId) qs.set('spaceId', params.spaceId);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const data = await apiFetch(`/v1/bank-links${suffix}`, { method: 'GET' });
    return data as any;
  } catch {
    const items = params?.spaceId
      ? demoBankLinksMemory.filter((l) => (l.spaceId ?? 'personal') === params.spaceId)
      : demoBankLinksMemory;
    return { items };
  }
}

export async function createBankLink(
  input: { provider: string; bankName?: string; userName?: string; email?: string; phone?: string; accountNumber?: string; spaceId?: 'personal' | 'business' }
): Promise<ApiBankLink> {
  try {
    const data = await apiFetch('/v1/bank-links', { method: 'POST', body: JSON.stringify(input) });
    return (data as any).link as ApiBankLink;
  } catch {
    const id = `demo-${Date.now()}`;
    const rawMask = (input.accountNumber || '').replace(/\D/g, '');
    const mask = rawMask ? rawMask.slice(-4) : '1234';
    const link: ApiBankLink = {
      id,
      spaceId: input.spaceId,
      provider: input.provider,
      bankName: input.bankName ?? 'Demo Bank',
      createdAt: new Date().toISOString(),
      accounts: [
        {
          id: `acct-${Date.now()}`,
          bankLinkId: id,
          name: input.bankName ? `${input.bankName} account` : input.userName ? `${input.userName}'s main account` : 'Everyday account',
          mask,
          type: 'checking',
          currency: '₦',
          balance: 185000
        }
      ]
    };

    demoBankLinksMemory = [...demoBankLinksMemory, link];
    return link;
  }
}

export async function deleteBankLink(id: string, params?: { spaceId?: 'personal' | 'business' }): Promise<void> {
  const qs = new URLSearchParams();
  if (params?.spaceId) qs.set('spaceId', params.spaceId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  await apiFetch(`/v1/bank-links/${encodeURIComponent(id)}${suffix}`, { method: 'DELETE' });

  // Keep the demo fallback store in sync.
  demoBankLinksMemory = demoBankLinksMemory.filter((l) => l.id !== id);
}

export async function listImportedTransactions(
  status: 'pending' | 'reconciled' | 'ignored' = 'pending',
  params?: { spaceId?: 'personal' | 'business' }
): Promise<{ items: ApiImportedTransaction[] }> {
  const qs = new URLSearchParams({ status });
  if (params?.spaceId) qs.set('spaceId', params.spaceId);
  const data = await apiFetch(`/v1/imported-transactions?${qs.toString()}`, { method: 'GET' });
  return data as any;
}

export async function reconcileImportedTransaction(
  id: string,
  payload?: {
    type?: 'income' | 'expense';
    category?: string;
    description?: string;
    budgetId?: string | null;
    budgetCategory?: string | null;
    miniBudgetId?: string | null;
    miniBudget?: string | null;
  }
): Promise<ApiImportedTransaction> {
  const data = await apiFetch(`/v1/imported-transactions/${encodeURIComponent(id)}/reconcile`, {
    method: 'POST',
    body: JSON.stringify(payload ?? {})
  });
  return (data as any).transaction as ApiImportedTransaction;
}

export async function reconcileImportedTransactionInSpace(
  id: string,
  payload:
    | {
        type?: 'income' | 'expense';
        category?: string;
        description?: string;
        budgetId?: string | null;
        budgetCategory?: string | null;
        miniBudgetId?: string | null;
        miniBudget?: string | null;
      }
    | undefined,
  spaceId?: 'personal' | 'business'
): Promise<ApiImportedTransaction> {
  const qs = new URLSearchParams();
  if (spaceId) qs.set('spaceId', spaceId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const data = await apiFetch(`/v1/imported-transactions/${encodeURIComponent(id)}/reconcile${suffix}`, {
    method: 'POST',
    body: JSON.stringify(payload ?? {})
  });
  return (data as any).transaction as ApiImportedTransaction;
}

export async function ignoreImportedTransaction(id: string): Promise<ApiImportedTransaction> {
  const data = await apiFetch(`/v1/imported-transactions/${encodeURIComponent(id)}/ignore`, {
    method: 'POST',
    body: JSON.stringify({})
  });
  return (data as any).transaction as ApiImportedTransaction;
}

export async function ignoreImportedTransactionInSpace(id: string, spaceId?: 'personal' | 'business'): Promise<ApiImportedTransaction> {
  const qs = new URLSearchParams();
  if (spaceId) qs.set('spaceId', spaceId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const data = await apiFetch(`/v1/imported-transactions/${encodeURIComponent(id)}/ignore${suffix}`, {
    method: 'POST',
    body: JSON.stringify({})
  });
  return (data as any).transaction as ApiImportedTransaction;
}

export type AnalyticsSummary = {
  totalBalance: number;
  income: number;
  expenses: number;
  remainingBudget: number;
  spendingByCategory: Record<string, number>;
  dailySpendingByCategory?: Array<{
    date: string; // YYYY-MM-DD (UTC bucket)
    expenses: number;
    spendingByCategory: Record<string, number>;
  }>;
  spendingByBucket?: Record<string, number>;
  spendingByMiniBudget?: Record<string, number>;
};

export async function getAnalyticsSummary(start: string, end: string, params?: { spaceId?: 'personal' | 'business' }): Promise<AnalyticsSummary> {
  const qs = new URLSearchParams({ start, end });
  if (params?.spaceId) qs.set('spaceId', params.spaceId);
  const data = await apiFetch(`/v1/analytics/summary?${qs.toString()}`, { method: 'GET' });
  return data as AnalyticsSummary;
}

export async function assistantChat(message: string, context?: any): Promise<{ reply: string }> {
  try {
    const data = await apiFetch('/v1/assistant/chat', { method: 'POST', body: JSON.stringify({ message, context }) });
    return (data as any) || { reply: 'Sorry, no reply available' };
  } catch (e) {
    throw e;
  }
}
