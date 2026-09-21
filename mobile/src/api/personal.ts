import { apiFetch } from './client';
import type { ApiBudget, ApiUser } from './endpoints';
import type { Bucket } from '../theme/buckets';

type SpaceId = 'personal' | 'business';

/* ------------------------------------------------------------ categories */

export type ApiCategory = {
  id: string;
  spaceId: SpaceId;
  name: string;
  type: 'income' | 'expense';
  bucket: Bucket | null;
  icon: string;
  isDefault: boolean;
  hidden: boolean;
  sortOrder: number;
};

export async function listCategories(spaceId: SpaceId): Promise<ApiCategory[]> {
  const data = await apiFetch(`/v1/categories?spaceId=${spaceId}`, { method: 'GET' });
  return Array.isArray(data?.items) ? (data.items as ApiCategory[]) : [];
}

export async function createCategory(input: { name: string; type: 'income' | 'expense'; bucket?: Bucket | null; icon?: string; spaceId?: SpaceId }): Promise<ApiCategory> {
  return (await apiFetch('/v1/categories', { method: 'POST', body: JSON.stringify(input) })).category as ApiCategory;
}

export type CategoryPatch = Partial<Pick<ApiCategory, 'name' | 'bucket' | 'icon' | 'hidden'>> & {
  /** With a bucket change: also move this period's spending in the category to the new bucket. */
  moveThisPeriod?: boolean;
};

/** `moved` is how many of this period's transactions followed the category to its new bucket. */
export async function updateCategory(id: string, patch: CategoryPatch): Promise<{ category: ApiCategory; moved: number }> {
  const data = await apiFetch(`/v1/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return { category: data.category as ApiCategory, moved: Number(data.moved) || 0 };
}

export async function deleteCategory(id: string): Promise<void> {
  await apiFetch(`/v1/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export type CategorySuggestion = { category: string; bucket: Bucket | null; source: 'learned' | 'keyword' };

export async function suggestCategory(text: string, type: 'income' | 'expense', spaceId: SpaceId): Promise<CategorySuggestion | null> {
  const qs = new URLSearchParams({ text, type, spaceId });
  const data = await apiFetch(`/v1/categories/suggest?${qs.toString()}`, { method: 'GET' });
  return (data?.suggestion as CategorySuggestion | null) ?? null;
}

/* ------------------------------------------------------------ income and plan */

export type IncomeKind = 'salary' | 'business' | 'side_hustle' | 'allowance' | 'other';
export type IncomeFrequency = 'daily' | 'monthly' | 'biweekly' | 'weekly' | 'irregular';
export type BillFrequency = 'monthly' | 'termly' | 'yearly' | 'weekly';
export type PainPoint = 'runs_out' | 'no_idea' | 'cant_save' | 'debt' | 'irregular';

export type IncomeInput = {
  name: string;
  kind: IncomeKind;
  amount: number;
  frequency: IncomeFrequency;
  payDay?: number | null;
  nextPayDate?: string | null;
  isEstimate?: boolean;
};

export type ApiIncomeSource = IncomeInput & { id: string; payDay: number | null; nextPayDate: string | null; isEstimate: boolean; monthlyAmount: number };

export type BillInput = { name: string; category: string; bucket?: Bucket | null; amount: number; frequency: BillFrequency; dueDay?: number | null };

export type PlanPeriod = { start: string; end: string; nextPayday: string; daysToPayday: number; days: number; basis: 'payday' | 'monthly'; label: string };

export type ApiPlan = {
  monthlyIncome: number;
  committed: number;
  left: number;
  status: 'healthy' | 'tight' | 'short' | 'no_income';
  shortfall: number;
  split: Record<Bucket, number>;
  percents: Record<Bucket, number>;
  tips: string[];
  budgetPeriod: 'payday' | 'monthly';
  period: PlanPeriod;
  incomeSources?: ApiIncomeSource[];
  bills?: Array<BillInput & { monthlyAmount: number }>;
};

export async function listIncomeSources(): Promise<ApiIncomeSource[]> {
  const data = await apiFetch('/v1/income-sources', { method: 'GET' });
  return Array.isArray(data?.items) ? data.items : [];
}

export async function createIncomeSource(input: IncomeInput): Promise<ApiIncomeSource> {
  return (await apiFetch('/v1/income-sources', { method: 'POST', body: JSON.stringify(input) })).incomeSource;
}

export async function updateIncomeSource(id: string, patch: Partial<IncomeInput>): Promise<ApiIncomeSource> {
  return (await apiFetch(`/v1/income-sources/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })).incomeSource;
}

export async function deleteIncomeSource(id: string): Promise<void> {
  await apiFetch(`/v1/income-sources/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getPlan(): Promise<ApiPlan> {
  return (await apiFetch('/v1/plan', { method: 'GET' })).plan;
}

export type PlanInputs = { income: IncomeInput[]; bills: BillInput[]; painPoints: PainPoint[]; budgetPeriod: 'payday' | 'monthly' };

export async function previewPlan(input: PlanInputs): Promise<ApiPlan> {
  return (await apiFetch('/v1/plan/preview', { method: 'POST', body: JSON.stringify(input) })).plan;
}

export type BudgetMode = 'solo' | 'shared' | 'both';

export async function completeOnboarding(
  input: PlanInputs & { createBudget: boolean; mode?: BudgetMode; inviteCode?: string; leftUntilPayday?: number }
): Promise<{ user: ApiUser; plan: ApiPlan; budget: ApiBudget | null; ownBudget?: ApiBudget | null; sharedBudget?: ApiBudget | null }> {
  return apiFetch('/v1/onboarding/complete', { method: 'POST', body: JSON.stringify(input) });
}

export async function skipOnboarding(): Promise<{ user: ApiUser }> {
  return apiFetch('/v1/onboarding/skip', { method: 'POST' });
}

/* ------------------------------------------------------------ insights */

export type ApiInsight = {
  key: string;
  kind: string;
  tone: 'positive' | 'neutral' | 'warning';
  title: string;
  body: string;
  action: { label: string; screen: string; params?: Record<string, unknown> } | null;
};

export async function listInsights(spaceId: SpaceId): Promise<ApiInsight[]> {
  const data = await apiFetch(`/v1/insights?spaceId=${spaceId}`, { method: 'GET' });
  return Array.isArray(data?.items) ? data.items : [];
}

export async function dismissInsight(key: string): Promise<void> {
  await apiFetch(`/v1/insights/${encodeURIComponent(key)}/dismiss`, { method: 'POST' });
}
