import { apiFetch } from './client';
import type { ApiBankLink, ApiBudget } from './endpoints';

type SpaceId = 'personal' | 'business';

const withSpace = (path: string, spaceId?: SpaceId) => (spaceId ? `${path}?spaceId=${spaceId}` : path);

/* ------------------------------------------------------------ recurring */

export type RecurringFrequency = 'weekly' | 'monthly' | 'termly' | 'yearly';

export type ApiRecurring = {
  id: string;
  spaceId: SpaceId;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string;
  frequency: RecurringFrequency;
  nextDueDate: string;
  endDate: string | null;
  autoCreate: boolean;
  remindDaysBefore: number;
  budgetCategory: string | null;
  paused: boolean;
  lastCreatedFor: string | null;
  /** A contribution group (ajo, esusu): when it's your turn and how much you collect. */
  payoutDate?: string | null;
  payoutAmount?: number | null;
  createdAt: string;
  updatedAt: string;
};

/** What a schedule costs in an average month. School terms are three a year. */
export function monthlyEquivalent(r: Pick<ApiRecurring, 'amount' | 'frequency'>): number {
  if (r.frequency === 'weekly') return (r.amount * 52) / 12;
  if (r.frequency === 'termly') return r.amount / 4;
  if (r.frequency === 'yearly') return r.amount / 12;
  return r.amount;
}

export type RecurringInput = {
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description?: string;
  frequency: RecurringFrequency;
  startDate: string;
  endDate?: string | null;
  autoCreate?: boolean;
  remindDaysBefore?: number;
  budgetCategory?: string | null;
  payoutDate?: string | null;
  payoutAmount?: number | null;
  spaceId?: SpaceId;
};

export async function listRecurring(spaceId?: SpaceId): Promise<ApiRecurring[]> {
  const data = await apiFetch(withSpace('/v1/recurring', spaceId), { method: 'GET' });
  return (data?.items ?? []) as ApiRecurring[];
}

export async function createRecurring(input: RecurringInput): Promise<{ recurring: ApiRecurring; created: number }> {
  return apiFetch('/v1/recurring', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateRecurring(
  id: string,
  patch: Partial<Omit<RecurringInput, 'startDate' | 'spaceId'>> & { nextDueDate?: string; paused?: boolean }
): Promise<{ recurring: ApiRecurring; created: number }> {
  return apiFetch(`/v1/recurring/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function deleteRecurring(id: string): Promise<void> {
  await apiFetch(`/v1/recurring/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Records anything due today or earlier for the signed-in user. */
export async function runRecurring(): Promise<{ created: number }> {
  return apiFetch('/v1/recurring/run', { method: 'POST' });
}

/* -------------------------------------------------------- notifications */

export type NotificationKind =
  | 'pace'
  | 'over'
  | 'bill'
  | 'recurring'
  | 'autosave'
  | 'weekly'
  | 'shared'
  | 'security'
  | 'bank'
  | 'rollover'
  | 'insight'
  | 'invoice'
  | 'tax'
  | 'household'
  | 'referral';

export type ApiNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  /** null for account-wide notifications, which show in both spaces. */
  spaceId?: 'personal' | 'business' | null;
  read: boolean;
  createdAt: string;
};

export type NotificationPrefs = {
  paceAlerts: boolean;
  billReminders: boolean;
  weeklyCheckIn: boolean;
  autoSave: boolean;
  invoiceReminders: boolean;
  /** The daily summary of what others spent in budgets you share. */
  sharedActivity: boolean;
  /** Pushes say only "You have an update": nothing on the lock screen for someone else to read. */
  privateNotifications: boolean;
};

/** With a spaceId, returns that space's notifications (plus account-wide ones) and its unread count. */
export async function listNotifications(opts: { before?: string; spaceId?: 'personal' | 'business' } = {}): Promise<{ items: ApiNotification[]; unread: number }> {
  const qs = new URLSearchParams();
  if (opts.before) qs.set('before', opts.before);
  if (opts.spaceId) qs.set('spaceId', opts.spaceId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/v1/notifications${suffix}`, { method: 'GET' });
}

export async function markNotificationsRead(ids?: string[], spaceId?: 'personal' | 'business'): Promise<void> {
  const payload = { ...(ids?.length ? { ids } : {}), ...(spaceId ? { spaceId } : {}) };
  await apiFetch('/v1/notifications/read', { method: 'POST', body: JSON.stringify(payload) });
}

/* -------------------------------------------------------------- voice notes */

/** Sends a short recording (base64) and gets the words back. */
export async function transcribeVoiceNote(audio: string, mimeType?: string): Promise<{ text: string }> {
  return apiFetch('/v1/voice/transcribe', { method: 'POST', body: JSON.stringify({ audio, mimeType }) });
}

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const data = await apiFetch('/v1/notifications/prefs', { method: 'GET' });
  return data.prefs as NotificationPrefs;
}

export async function updateNotificationPrefs(patch: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
  const data = await apiFetch('/v1/notifications/prefs', { method: 'PATCH', body: JSON.stringify(patch) });
  return data.prefs as NotificationPrefs;
}

export async function registerPushToken(token: string, platform: string): Promise<void> {
  await apiFetch('/v1/push-tokens', { method: 'POST', body: JSON.stringify({ token, platform }) });
}

export async function unregisterPushToken(token: string): Promise<void> {
  await apiFetch('/v1/push-tokens', { method: 'DELETE', body: JSON.stringify({ token }) });
}

/* ------------------------------------------------------------- sessions */

export type ApiSession = {
  id: string;
  deviceName: string | null;
  startedAt: string;
  lastUsedAt: string;
  current: boolean;
};

export async function listSessions(): Promise<ApiSession[]> {
  const data = await apiFetch('/v1/auth/sessions', { method: 'GET' });
  return (data?.items ?? []) as ApiSession[];
}

export async function revokeSession(id: string): Promise<void> {
  await apiFetch(`/v1/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function revokeOtherSessions(): Promise<{ revoked: number }> {
  return apiFetch('/v1/auth/sessions/revoke-others', { method: 'POST' });
}

/* ------------------------------------------------------------- rollover */

export type RolloverPreview = {
  eligible: boolean;
  ended: boolean;
  rollover: { destination: 'goal' | 'next-budget'; amount: number; goalId: string | null; budgetId: string | null; at: string } | null;
  totalSpent: number;
  unspent: number;
  buckets: Array<{ bucket: string; budgeted: number; spent: number; unspent: number }>;
  goals: Array<{ id: string; name: string; emoji: string | null; remaining: number }>;
  nextBudget: { id: string; name: string; startDate: string } | null;
};

export async function getRollover(budgetId: string): Promise<RolloverPreview> {
  return apiFetch(`/v1/budgets/${encodeURIComponent(budgetId)}/rollover`, { method: 'GET' });
}

export async function applyRollover(
  budgetId: string,
  body: { destination: 'goal'; goalId: string } | { destination: 'next-budget' }
): Promise<{ moved: number; destination: 'goal' | 'next-budget' }> {
  return apiFetch(`/v1/budgets/${encodeURIComponent(budgetId)}/rollover`, { method: 'POST', body: JSON.stringify(body) });
}

/* ------------------------------------------------------- shared budgets */

export type ApiBudgetMember = {
  userId: string;
  role: 'owner' | 'member';
  name: string | null;
  email: string;
  joinedAt: string;
};

export async function listBudgetMembers(budgetId: string): Promise<{ role: 'owner' | 'member'; items: ApiBudgetMember[] }> {
  return apiFetch(`/v1/budgets/${encodeURIComponent(budgetId)}/members`, { method: 'GET' });
}

export async function removeBudgetMember(budgetId: string, userId: string): Promise<void> {
  await apiFetch(`/v1/budgets/${encodeURIComponent(budgetId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}

export async function createBudgetInvite(budgetId: string): Promise<{ code: string; expiresAt: string }> {
  return apiFetch(`/v1/budgets/${encodeURIComponent(budgetId)}/invites`, { method: 'POST' });
}

export async function acceptBudgetInvite(code: string): Promise<ApiBudget> {
  const data = await apiFetch('/v1/budget-invites/accept', { method: 'POST', body: JSON.stringify({ code }) });
  return data.budget as ApiBudget;
}

/* ---------------------------------------------------------- live banks */

export async function connectMonoAccount(code: string, spaceId?: SpaceId): Promise<{ imported: number; link: ApiBankLink }> {
  return apiFetch('/v1/bank-links/mono', { method: 'POST', body: JSON.stringify({ code, spaceId }) });
}

export async function syncBankConnection(id: string): Promise<{ imported: number; live: boolean }> {
  return apiFetch(`/v1/bank-links/${encodeURIComponent(id)}/sync`, { method: 'POST' });
}
