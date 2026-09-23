import type { Collection, Db } from 'mongodb';

export type NotificationPrefs = {
  paceAlerts: boolean;
  billReminders: boolean;
  weeklyCheckIn: boolean;
  autoSave: boolean;
};

export type UserDoc = {
  _id: string;
  email: string;
  passwordHash: string;
  name?: string | null;
  currency?: string | null;
  locale?: string | null;
  monthlyIncome?: number | null;
  notificationPrefs?: Partial<NotificationPrefs> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SessionDoc = {
  _id: string;
  userId: string;
  refreshTokenHash: string;
  deviceName?: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
  rotatedAt?: Date | null;
  /** When the device first signed in; carried across refresh-token rotation. */
  startedAt?: Date | null;
  lastUsedAt?: Date | null;
};

export type PasswordResetDoc = {
  _id: string;
  userId: string;
  codeHash: string;
  attempts: number;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
};

export type TransactionDoc = {
  _id: string;
  userId: string;
  spaceId?: 'personal' | 'business' | null;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string;
  budgetId?: string | null;
  budgetCategory?: string | null;
  miniBudgetId?: string | null;
  /** Client-generated id so offline retries never create duplicates. */
  clientId?: string | null;
  recurringId?: string | null;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type BudgetMember = {
  userId: string;
  role: 'owner' | 'member';
  name?: string | null;
  email: string;
  joinedAt: Date;
};

export type BudgetRollover = {
  destination: 'goal' | 'next-budget';
  amount: number;
  goalId?: string | null;
  budgetId?: string | null;
  at: Date;
};

export type BudgetDoc = {
  _id: string;
  userId: string;
  spaceId?: 'personal' | 'business' | null;
  name: string;
  totalBudget: number;
  period: 'monthly' | 'weekly';
  startDate: string; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD
  categories: Record<string, { budgeted: number; spent?: number }>;
  /** Household members who share this budget (the owner is userId). */
  members?: BudgetMember[] | null;
  rollover?: BudgetRollover | null;
  createdAt: Date;
  updatedAt: Date;
};

export type GoalDoc = {
  _id: string;
  userId: string;
  spaceId?: 'personal' | 'business' | null;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string; // YYYY-MM-DD
  emoji?: string | null;
  color?: string | null;
  category?: string | null;
  /** Share of every income transaction moved into this goal automatically (0–50). */
  autoSavePercent?: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MiniBudgetDoc = {
  _id: string;
  userId: string;
  budgetId: string;
  name: string;
  amount: number;
  category?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BankLinkDoc = {
  _id: string;
  userId: string;
  spaceId?: 'personal' | 'business' | null;
  provider: string;
  bankName: string;
  createdAt: Date;
  updatedAt: Date;
  userName?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Provider account id (e.g. Mono) for live connections. */
  externalAccountId?: string | null;
  status?: 'active' | 'reauth_required' | null;
  lastSyncedAt?: Date | null;
};

export type BankAccountDoc = {
  _id: string;
  userId: string;
  spaceId?: 'personal' | 'business' | null;
  bankLinkId: string;
  name: string;
  mask: string;
  type: string;
  currency: string;
  balance?: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ImportedTransactionStatus = 'pending' | 'reconciled' | 'ignored';

export type ImportedTransactionDoc = {
  _id: string;
  userId: string;
  spaceId?: 'personal' | 'business' | null;
  bankAccountId: string;
  bankName: string;
  bankAccountName: string;
  amount: number;
  currency: string;
  direction: 'debit' | 'credit';
  description: string;
  merchant: string;
  occurredAt: Date;
  status: ImportedTransactionStatus;
  /** Provider transaction id, unique per user, so syncs are idempotent. */
  externalId?: string | null;
  reconciledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly';

export type RecurringDoc = {
  _id: string;
  userId: string;
  spaceId?: 'personal' | 'business' | null;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string;
  frequency: RecurringFrequency;
  /** Day of month the schedule started on, so a bill on the 31st stays at month end. */
  anchorDay?: number | null;
  /** Next date (YYYY-MM-DD) the transaction is due. */
  nextDueDate: string;
  endDate?: string | null;
  /** Create the transaction automatically on the due date. */
  autoCreate: boolean;
  remindDaysBefore: number;
  budgetCategory?: string | null;
  paused: boolean;
  lastCreatedFor?: string | null;
  lastRemindedFor?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NotificationKind = 'pace' | 'over' | 'bill' | 'recurring' | 'autosave' | 'weekly' | 'shared' | 'security' | 'bank' | 'rollover';

export type NotificationDoc = {
  _id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
};

export type PushTokenDoc = {
  /** The Expo push token. */
  _id: string;
  userId: string;
  platform: string;
  createdAt: Date;
  updatedAt: Date;
};

export type RateLimitDoc = {
  _id: string;
  count: number;
  expiresAt: Date;
};

export type AlertLogDoc = {
  /** userId:dedupeKey: an insert conflict means the alert was already sent. */
  _id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
};

export type BudgetInviteDoc = {
  /** Short code the partner types in. */
  _id: string;
  budgetId: string;
  invitedBy: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedBy?: string | null;
  acceptedAt?: Date | null;
};

export type GoalContributionDoc = {
  _id: string;
  userId: string;
  goalId: string;
  amount: number;
  source: 'manual' | 'autosave' | 'rollover';
  transactionId?: string | null;
  budgetId?: string | null;
  createdAt: Date;
};

export function collections(db: Db): {
  users: Collection<UserDoc>;
  sessions: Collection<SessionDoc>;
  passwordResets: Collection<PasswordResetDoc>;
  transactions: Collection<TransactionDoc>;
  budgets: Collection<BudgetDoc>;
  goals: Collection<GoalDoc>;
  miniBudgets: Collection<MiniBudgetDoc>;
  bankLinks: Collection<BankLinkDoc>;
  bankAccounts: Collection<BankAccountDoc>;
  importedTransactions: Collection<ImportedTransactionDoc>;
  recurring: Collection<RecurringDoc>;
  notifications: Collection<NotificationDoc>;
  pushTokens: Collection<PushTokenDoc>;
  rateLimits: Collection<RateLimitDoc>;
  alertLog: Collection<AlertLogDoc>;
  budgetInvites: Collection<BudgetInviteDoc>;
  goalContributions: Collection<GoalContributionDoc>;
} {
  return {
    users: db.collection<UserDoc>('users'),
    sessions: db.collection<SessionDoc>('sessions'),
    passwordResets: db.collection<PasswordResetDoc>('passwordResets'),
    transactions: db.collection<TransactionDoc>('transactions'),
    budgets: db.collection<BudgetDoc>('budgets'),
    goals: db.collection<GoalDoc>('goals'),
    miniBudgets: db.collection<MiniBudgetDoc>('miniBudgets'),
    bankLinks: db.collection<BankLinkDoc>('bankLinks'),
    bankAccounts: db.collection<BankAccountDoc>('bankAccounts'),
    importedTransactions: db.collection<ImportedTransactionDoc>('importedTransactions'),
    recurring: db.collection<RecurringDoc>('recurring'),
    notifications: db.collection<NotificationDoc>('notifications'),
    pushTokens: db.collection<PushTokenDoc>('pushTokens'),
    rateLimits: db.collection<RateLimitDoc>('rateLimits'),
    alertLog: db.collection<AlertLogDoc>('alertLog'),
    budgetInvites: db.collection<BudgetInviteDoc>('budgetInvites'),
    goalContributions: db.collection<GoalContributionDoc>('goalContributions')
  };
}
