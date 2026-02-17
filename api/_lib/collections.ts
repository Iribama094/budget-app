import type { Collection, Db } from 'mongodb';

export type UserDoc = {
  _id: string;
  email: string;
  passwordHash: string;
  name?: string | null;
  currency?: string | null;
  locale?: string | null;
  monthlyIncome?: number | null;
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
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
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
  reconciledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function collections(db: Db): {
  users: Collection<UserDoc>;
  sessions: Collection<SessionDoc>;
  transactions: Collection<TransactionDoc>;
  budgets: Collection<BudgetDoc>;
  goals: Collection<GoalDoc>;
  miniBudgets: Collection<MiniBudgetDoc>;
  bankLinks: Collection<BankLinkDoc>;
  bankAccounts: Collection<BankAccountDoc>;
  importedTransactions: Collection<ImportedTransactionDoc>;
} {
  return {
    users: db.collection<UserDoc>('users'),
    sessions: db.collection<SessionDoc>('sessions'),
    transactions: db.collection<TransactionDoc>('transactions'),
    budgets: db.collection<BudgetDoc>('budgets'),
    goals: db.collection<GoalDoc>('goals'),
    miniBudgets: db.collection<MiniBudgetDoc>('miniBudgets'),
    bankLinks: db.collection<BankLinkDoc>('bankLinks'),
    bankAccounts: db.collection<BankAccountDoc>('bankAccounts'),
    importedTransactions: db.collection<ImportedTransactionDoc>('importedTransactions')
  };
}
