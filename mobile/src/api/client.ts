import { clearTokens, getTokens, setTokens } from './storage';

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
const API_STUB = (process.env.EXPO_API_STUB ?? '').toLowerCase() === 'true';

// Simple in-memory stub state used when API_STUB=true
type StubBankAccount = {
  id: string;
  bankLinkId: string;
  name: string;
  mask: string;
  type: string;
  currency: string;
};

type StubBankLink = {
  id: string;
  spaceId: StubSpaceId;
  provider: string;
  bankName: string;
  createdAt: string;
  accounts: StubBankAccount[];
};

type StubImportedStatus = 'pending' | 'reconciled' | 'ignored';

type StubImportedTransaction = {
  id: string;
  spaceId: StubSpaceId;
  bankAccountId: string;
  bankName: string;
  bankAccountName: string;
  amount: number;
  currency: string;
  direction: 'debit' | 'credit';
  description: string;
  merchant: string;
  occurredAt: string;
  status: StubImportedStatus;
  reconciledAt?: string;
};

const STUB_BANK_LINKS: StubBankLink[] = [];
const STUB_IMPORTED_TRANSACTIONS: StubImportedTransaction[] = [];

function pickActiveBudgetFor(spaceId: StubSpaceId, startMs: number, endMs: number): StubBudget | null {
  const budgets = STUB_BUDGETS
    .filter((b) => b.spaceId === spaceId)
    .slice()
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  return (
    budgets.find((b) => {
      const bs = new Date(b.startDate).getTime();
      const be = b.endDate ? new Date(b.endDate).getTime() : Infinity;
      return bs <= endMs && be >= startMs;
    }) ?? budgets[0] ?? null
  );
}

function inferBudgetBucketFromCategory(category: string, spaceId: StubSpaceId): string {
  const c = (category || '').toLowerCase();

  // Business defaults
  if (spaceId === 'business') {
    if (/payroll|salary|wage|staff/.test(c)) return 'Essential';
    if (/rent|lease|utilities|power|internet|office|suppl|subscription|software|tools/.test(c)) return 'Essential';
    if (/tax|fee|charges|compliance/.test(c)) return 'Essential';
    if (/equipment|device|laptop|machine|hardware/.test(c)) return 'Investments';
    if (/marketing|ads?|advert|growth|campaign/.test(c)) return 'Investments';
    if (/travel|flight|hotel|transport/.test(c)) return 'Miscellaneous';
    if (/loan|credit|interest|repay/.test(c)) return 'Debt Financing';
    return 'Miscellaneous';
  }

  // Personal defaults
  if (/rent|housing|mortgage|utilities|bills|electric|water|internet/.test(c)) return 'Essential';
  if (/food|grocer|groceries|transport|fuel|petrol|gas|health|medical|pharmacy/.test(c)) return 'Essential';
  if (/subscription|netflix|spotify|dstv|gotv|airtime|data/.test(c)) return 'Free Spending';
  if (/shopping|clothing|entertainment|eating out|restaurant|dining/.test(c)) return 'Free Spending';
  if (/saving|savings|reserve/.test(c)) return 'Savings';
  if (/investment|stocks?|crypto|mutual|fund/.test(c)) return 'Investments';
  if (/loan|credit|interest|repay/.test(c)) return 'Debt Financing';
  return 'Miscellaneous';
}

type StubSpaceId = 'personal' | 'business';

type StubTransaction = {
  id: string;
  spaceId: StubSpaceId;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string;
  occurredAt: string;
  budgetId?: string | number | null;
  budgetCategory?: string | null;
  miniBudget?: string | null;
  createdAt: string;
  updatedAt: string;
};

type StubBudget = {
  id: string;
  spaceId: StubSpaceId;
  name: string;
  totalBudget: number;
  period: 'monthly' | 'weekly';
  startDate: string;
  endDate?: string;
  categories: Record<string, { budgeted: number } & Record<string, any>>;
  createdAt: string;
  updatedAt: string;
};

type StubGoal = {
  id: string;
  spaceId: StubSpaceId;
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

type StubMiniBudget = {
  id: string;
  budgetId: string;
  name: string;
  amount: number;
  category?: string | null;
  createdAt: string;
  updatedAt: string;
};

const STUB_TRANSACTIONS: StubTransaction[] = [];
const STUB_BUDGETS: StubBudget[] = [];
const STUB_GOALS: StubGoal[] = [];
const STUB_MINI_BUDGETS: StubMiniBudget[] = [];

function normalizeSpaceId(v: unknown): StubSpaceId {
  return v === 'business' ? 'business' : 'personal';
}

type ApiError = {
  error?: {
    message?: string;
  };
};

async function parseJsonSafe(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const tokens = await getTokens();
  if (!tokens) return null;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken })
      });

      if (!res.ok) {
        await clearTokens();
        return null;
      }

      const data = await res.json();
      if (!data?.accessToken || !data?.refreshToken) {
        await clearTokens();
        return null;
      }

      await setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return data.accessToken as string;
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

export async function apiFetch(path: string, init?: RequestInit & { skipAuth?: boolean }): Promise<any> {
  // If stub mode is enabled, return local fake responses instead of calling network.
  if (API_STUB) {
    const method = (init?.method ?? 'GET').toUpperCase();
    const makeUser = () => {
      const now = new Date().toISOString();
      return {
        id: 'local-user',
        email: 'local@local',
        name: 'Local User',
        currency: '₦',
        locale: 'en-NG',
        monthlyIncome: null,
        createdAt: now,
        updatedAt: now
      };
    };

    const raw = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const urlObj = (() => {
      try {
        return new URL(raw);
      } catch {
        try {
          return new URL('http://local' + raw);
        } catch {
          return null as any;
        }
      }
    })();
    const p = urlObj ? urlObj.pathname : path;

    // Minimal stubs for common endpoints
    if (p === '/v1/auth/login' && method === 'POST') {
      const user = makeUser();
      return { user, accessToken: 'local-access-token', refreshToken: 'local-refresh-token' };
    }
    if (p === '/v1/auth/register' && method === 'POST') {
      const user = makeUser();
      return { user, accessToken: 'local-access-token', refreshToken: 'local-refresh-token' };
    }
    if (p === '/v1/auth/me' && method === 'GET') {
      return { user: makeUser() };
    }
    if (p === '/v1/auth/refresh' && method === 'POST') {
      return { accessToken: 'local-access-token', refreshToken: 'local-refresh-token' };
    }
    if (p === '/v1/auth/logout' && method === 'POST') {
      return {};
    }
    if (p === '/v1/tax/rules' && method === 'GET') {
      const country = (urlObj?.searchParams.get('country') ?? 'NG').toUpperCase();

      // Demo-only brackets to show country-specific behavior in local mode.
      const BRACKETS_BY_COUNTRY: Record<string, Array<{ upTo: number | null; rate: number }>> = {
        NG: [
          { upTo: 600000, rate: 0.075 },
          { upTo: 1650000, rate: 0.15 },
          { upTo: 3200000, rate: 0.225 },
          { upTo: null, rate: 0.275 }
        ],
        US: [
          { upTo: 11000, rate: 0.1 },
          { upTo: 44725, rate: 0.12 },
          { upTo: 95375, rate: 0.22 },
          { upTo: null, rate: 0.24 }
        ],
        GB: [
          { upTo: 37700, rate: 0.2 },
          { upTo: 125140, rate: 0.4 },
          { upTo: null, rate: 0.45 }
        ]
      };

      const brackets = BRACKETS_BY_COUNTRY[country] ?? BRACKETS_BY_COUNTRY.NG;
      return { country, brackets };
    }
    if (p === '/v1/tax/calc' && method === 'POST') {
      try {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const country = String(body?.country ?? 'NG').toUpperCase();
        const gross = Number(body?.grossAnnual ?? 0) || 0;

        const rules = await (async () => {
          // reuse the same demo brackets as /v1/tax/rules
          const BRACKETS_BY_COUNTRY: Record<string, Array<{ upTo: number | null; rate: number }>> = {
            NG: [
              { upTo: 600000, rate: 0.075 },
              { upTo: 1650000, rate: 0.15 },
              { upTo: 3200000, rate: 0.225 },
              { upTo: null, rate: 0.275 }
            ],
            US: [
              { upTo: 11000, rate: 0.1 },
              { upTo: 44725, rate: 0.12 },
              { upTo: 95375, rate: 0.22 },
              { upTo: null, rate: 0.24 }
            ],
            GB: [
              { upTo: 37700, rate: 0.2 },
              { upTo: 125140, rate: 0.4 },
              { upTo: null, rate: 0.45 }
            ]
          };

          return BRACKETS_BY_COUNTRY[country] ?? BRACKETS_BY_COUNTRY.NG;
        })();

        const taxable = gross; // demo stub: no deductions
        let remaining = taxable;
        let lower = 0;
        let total = 0;
        for (const b of rules) {
          const upper = b.upTo == null ? null : Math.max(0, b.upTo);
          const span = upper == null ? remaining : Math.max(0, Math.min(remaining, upper - lower));
          if (span <= 0) {
            lower = upper ?? lower;
            continue;
          }
          total += span * b.rate;
          remaining -= span;
          lower = upper ?? lower;
          if (remaining <= 0) break;
        }

        const tax = Math.round(total);
        return { country, grossAnnual: gross, taxableIncome: taxable, totalTax: tax };
      } catch {
        return { grossAnnual: 0, taxableIncome: 0, totalTax: 0 };
      }
    }

    // Assistant chat stub
    if (p === '/v1/assistant/chat' && method === 'POST') {
      try {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const message: string = body?.message || '';
        const lower = message.toLowerCase();

        let reply = "I'm your local budget assistant. Ask me about spending, goals, or what‑if scenarios.";
        if (lower.includes('spent') || lower.includes('spending')) {
          reply = "Roughly speaking, your biggest expenses tend to be food, transport and small daily debits. Try capping those first.";
        } else if (lower.includes('remind') || lower.includes('reminder')) {
          reply = "Use your calendar or reminders app for exact dates, and think of this app as the place you reconcile what actually happened.";
        } else if (lower.includes('what if') && lower.includes('income')) {
          reply = "If income drops, protect Essentials, trim Free Spend + Misc, and slow—but don’t stop—Savings and Investments.";
        } else if (lower.includes('goal') || lower.includes('car') || lower.includes('house')) {
          reply = "Big goals work best when at least 20% of income consistently flows into Savings + Investments.";
        }

        return { reply };
      } catch {
        return { reply: 'Assistant stub unavailable.' };
      }
    }

    // Avatar upload stub
    if (p === '/v1/users/me/avatar' && method === 'POST') {
      // In stub mode, pretend we uploaded and return a fake remote URL
      const now = Date.now();
      return { avatarUrl: `https://example.com/local-avatar-${now}.jpg` };
    }

    // Bank linking + imported transactions stubs
    if (p === '/v1/bank-links' && method === 'GET') {
      const spaceId = normalizeSpaceId(urlObj?.searchParams.get('spaceId'));
      return { items: STUB_BANK_LINKS.filter((l) => l.spaceId === spaceId) };
    }

    if (p === '/v1/bank-links' && method === 'POST') {
      const now = new Date().toISOString();
      const body = init?.body ? JSON.parse(init.body as string) : {};
      const spaceId = normalizeSpaceId(body?.spaceId);
      const provider: string = body?.provider || 'demo-provider';
      const index = STUB_BANK_LINKS.length + 1;
      const id = `link-${index}`;
      const bankName = body?.bankName || `Demo Bank ${index}`;

      const accounts: StubBankAccount[] = [
        {
          id: `${id}-acct-1`,
          bankLinkId: id,
          name: 'Main account',
          mask: '1234',
          type: 'checking',
          currency: 'NGN'
        },
        {
          id: `${id}-acct-2`,
          bankLinkId: id,
          name: 'Savings pocket',
          mask: '5678',
          type: 'savings',
          currency: 'NGN'
        }
      ];

      const link: StubBankLink = { id, spaceId, provider, bankName, createdAt: now, accounts };
      STUB_BANK_LINKS.push(link);

      // Seed a few imported transactions as pending for reconciliation
      const seed: Omit<StubImportedTransaction, 'id' | 'status' | 'spaceId'>[] = [
        {
          bankAccountId: accounts[0].id,
          bankName,
          bankAccountName: accounts[0].name,
          amount: 4500,
          currency: 'NGN',
          direction: 'debit',
          description: 'Groceries at Local Mart',
          merchant: 'Local Mart',
          occurredAt: now
        },
        {
          bankAccountId: accounts[0].id,
          bankName,
          bankAccountName: accounts[0].name,
          amount: 1300,
          currency: 'NGN',
          direction: 'debit',
          description: 'Transport – ride share',
          merchant: 'RideShare',
          occurredAt: now
        },
        {
          bankAccountId: accounts[1].id,
          bankName,
          bankAccountName: accounts[1].name,
          amount: 20000,
          currency: 'NGN',
          direction: 'credit',
          description: 'Salary top‑up',
          merchant: 'Employer Ltd',
          occurredAt: now
        }
      ];

      seed.forEach((s, idx) => {
        const tx: StubImportedTransaction = {
          id: `imp-${STUB_IMPORTED_TRANSACTIONS.length + idx + 1}`,
          status: 'pending',
          ...s,
          spaceId
        };
        STUB_IMPORTED_TRANSACTIONS.push(tx);
      });

      return { link };
    }

    if (p === '/v1/imported-transactions' && method === 'GET') {
      const status = (urlObj?.searchParams.get('status') as StubImportedStatus | null) || 'pending';
      const spaceId = normalizeSpaceId(urlObj?.searchParams.get('spaceId'));
      const items = STUB_IMPORTED_TRANSACTIONS.filter((t) => t.spaceId === spaceId && t.status === status);
      return { items };
    }

    if (p.startsWith('/v1/imported-transactions/') && method === 'POST') {
      const rest = p.replace('/v1/imported-transactions/', '');
      const [id, action] = rest.split('/');
      const tx = STUB_IMPORTED_TRANSACTIONS.find((t) => t.id === id);
      if (!tx) return { error: { message: 'Not found' } };

      const spaceId = tx.spaceId;

      if (action === 'reconcile') {
        const now = new Date().toISOString();
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const reconciledType: 'income' | 'expense' = body?.type === 'income' ? 'income' : 'expense';
        const reconciledCategory: string = String(body?.category ?? (tx.direction === 'debit' ? 'General spending' : 'Income'));

        tx.status = 'reconciled';
        tx.reconciledAt = new Date().toISOString();

        // Create a real transaction so budgets + analytics reflect reconciled imports.
        // If we can map it to a budget window, attach it to that budgetId and bucket.
        const occurredAt = tx.occurredAt;
        const occurredMs = (() => {
          try {
            return new Date(occurredAt).getTime();
          } catch {
            return Date.now();
          }
        })();

        const budget = pickActiveBudgetFor(spaceId, occurredMs, occurredMs);
        const bucket = budget ? inferBudgetBucketFromCategory(reconciledCategory, spaceId) : null;

        const created: StubTransaction = {
          id: `tx-${STUB_TRANSACTIONS.length + 1}`,
          spaceId,
          type: reconciledType,
          amount: Number(tx.amount ?? 0) || 0,
          category: reconciledCategory,
          description: tx.merchant ? `${tx.merchant} • ${tx.description}` : tx.description,
          occurredAt,
          budgetId: budget?.id ?? null,
          budgetCategory: bucket,
          miniBudget: null,
          createdAt: now,
          updatedAt: now
        };
        STUB_TRANSACTIONS.push(created);

        return { transaction: tx };
      }
      if (action === 'ignore') {
        tx.status = 'ignored';
        return { transaction: tx };
      }
    }

    // generic list endpoints
    if (p.startsWith('/v1/transactions')) {
      if (method === 'GET') {
        const spaceId = normalizeSpaceId(urlObj?.searchParams.get('spaceId'));
        const start = urlObj?.searchParams.get('start');
        const end = urlObj?.searchParams.get('end');

        let items = STUB_TRANSACTIONS.filter((t) => t.spaceId === spaceId);

        if (start) {
          const s = new Date(start).getTime();
          items = items.filter((t) => new Date(t.occurredAt).getTime() >= s);
        }
        if (end) {
          const e = new Date(end).getTime();
          items = items.filter((t) => new Date(t.occurredAt).getTime() <= e);
        }

        items = items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
        const limit = Number(urlObj?.searchParams.get('limit') ?? '') || 50;
        return { items: items.slice(0, limit), nextCursor: null };
      }

      if (method === 'POST') {
        const now = new Date().toISOString();
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const tx: StubTransaction = {
          id: `tx-${STUB_TRANSACTIONS.length + 1}`,
          spaceId: normalizeSpaceId(body?.spaceId),
          type: body?.type === 'income' ? 'income' : 'expense',
          amount: Number(body?.amount ?? 0) || 0,
          category: String(body?.category ?? 'Other'),
          description: String(body?.description ?? ''),
          occurredAt: String(body?.occurredAt ?? now),
          budgetId: body?.budgetId ?? null,
          budgetCategory: body?.budgetCategory ?? null,
          miniBudget: body?.miniBudget ?? null,
          createdAt: now,
          updatedAt: now
        };
        STUB_TRANSACTIONS.push(tx);
        return { transaction: tx };
      }
    }
    if (p.startsWith('/v1/goals')) {
      if (method === 'GET') {
        const spaceId = normalizeSpaceId(urlObj?.searchParams.get('spaceId'));
        const items = STUB_GOALS.filter((g) => g.spaceId === spaceId);
        return { items };
      }
      if (method === 'POST') {
        const now = new Date().toISOString();
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const goal: StubGoal = {
          id: `goal-${STUB_GOALS.length + 1}`,
          spaceId: normalizeSpaceId(body?.spaceId),
          name: String(body?.name ?? 'Goal'),
          targetAmount: Number(body?.targetAmount ?? 0) || 0,
          currentAmount: Number(body?.currentAmount ?? 0) || 0,
          targetDate: String(body?.targetDate ?? now),
          emoji: body?.emoji ?? null,
          color: body?.color ?? null,
          category: body?.category ?? null,
          createdAt: now,
          updatedAt: now
        };
        STUB_GOALS.push(goal);
        return { goal };
      }
    }
    if (p.startsWith('/v1/budgets')) {
      const miniMatch = p.match(/^\/v1\/budgets\/([^/]+)\/mini-budgets$/);
      if (miniMatch) {
        const budgetId = decodeURIComponent(miniMatch[1] ?? '');
        if (method === 'GET') {
          const items = STUB_MINI_BUDGETS.filter((m) => m.budgetId === budgetId);
          return { items };
        }
        if (method === 'POST') {
          const now = new Date().toISOString();
          const body = init?.body ? JSON.parse(init.body as string) : {};
          const miniBudget: StubMiniBudget = {
            id: `mini-${STUB_MINI_BUDGETS.length + 1}`,
            budgetId,
            name: String(body?.name ?? 'Mini budget'),
            amount: Number(body?.amount ?? 0) || 0,
            category: body?.category ?? null,
            createdAt: now,
            updatedAt: now
          };
          STUB_MINI_BUDGETS.unshift(miniBudget);
          return { miniBudget };
        }
      }

      if (method === 'GET') {
        const spaceId = normalizeSpaceId(urlObj?.searchParams.get('spaceId'));
        const txInSpace = STUB_TRANSACTIONS.filter((t) => t.spaceId === spaceId && t.type === 'expense');

        const items = STUB_BUDGETS
          .filter((b) => b.spaceId === spaceId)
          .map((b) => {
            const startTs = (() => {
              try {
                return new Date(b.startDate).getTime();
              } catch {
                return -Infinity;
              }
            })();
            const endTs = (() => {
              try {
                return b.endDate ? new Date(b.endDate).getTime() : Infinity;
              } catch {
                return Infinity;
              }
            })();

            const categories: Record<string, any> = {};
            Object.entries(b.categories || {}).forEach(([k, v]) => {
              categories[k] = { ...(v as any), spent: 0 };
            });

            txInSpace
              .filter((t) => String(t.budgetId ?? '') === String(b.id))
              .filter((t) => {
                try {
                  const ts = new Date(t.occurredAt).getTime();
                  return ts >= startTs && ts <= endTs;
                } catch {
                  return true;
                }
              })
              .forEach((t) => {
                const bucket = t.budgetCategory ?? null;
                if (!bucket) return;
                if (!categories[bucket]) return;
                categories[bucket].spent = (Number(categories[bucket].spent) || 0) + (Number(t.amount) || 0);
              });

            return { ...b, categories };
          });

        return { items };
      }
      if (method === 'POST') {
        const now = new Date().toISOString();
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const budget: StubBudget = {
          id: `budget-${STUB_BUDGETS.length + 1}`,
          spaceId: normalizeSpaceId(body?.spaceId),
          name: String(body?.name ?? 'Budget'),
          totalBudget: Number(body?.totalBudget ?? 0) || 0,
          period: body?.period === 'weekly' ? 'weekly' : 'monthly',
          startDate: String(body?.startDate ?? now),
          endDate: body?.endDate ? String(body.endDate) : undefined,
          categories: body?.categories ?? {},
          createdAt: now,
          updatedAt: now
        };
        STUB_BUDGETS.unshift(budget);
        return { budget };
      }
    }
    if (p.startsWith('/v1/analytics/summary')) {
      const spaceId = normalizeSpaceId(urlObj?.searchParams.get('spaceId'));
      const start = urlObj?.searchParams.get('start');
      const end = urlObj?.searchParams.get('end');
      const s = start ? new Date(start).getTime() : -Infinity;
      const e = end ? new Date(end).getTime() : Infinity;

      const scoped = STUB_TRANSACTIONS.filter((t) => t.spaceId === spaceId);

      const activeBudget = pickActiveBudgetFor(spaceId, s, e);

      const inRange = scoped.filter((t) => {
        const ts = new Date(t.occurredAt).getTime();
        return ts >= s && ts <= e;
      });

      const inBudget = activeBudget
        ? inRange.filter((t) => String(t.budgetId ?? '') === String(activeBudget.id))
        : inRange;

      const income = inBudget.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
      const expenses = inBudget.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

      const spendingByCategory: Record<string, number> = {};
      inBudget
        .filter((t) => t.type === 'expense')
        .forEach((t) => {
          spendingByCategory[t.category] = (spendingByCategory[t.category] ?? 0) + t.amount;
        });

      const spendingByBucket: Record<string, number> = {};
      inBudget
        .filter((t) => t.type === 'expense')
        .forEach((t) => {
          const bucket = String(t.budgetCategory ?? '').trim();
          if (!bucket) return;
          spendingByBucket[bucket] = (spendingByBucket[bucket] ?? 0) + (Number(t.amount) || 0);
        });

      const miniNameById = new Map<string, string>();
      if (activeBudget) {
        STUB_MINI_BUDGETS
          .filter((m) => String(m.budgetId) === String(activeBudget.id))
          .forEach((m) => miniNameById.set(String(m.id), String(m.name)));
      }

      const spendingByMiniBudget: Record<string, number> = {};
      inBudget
        .filter((t) => t.type === 'expense')
        .forEach((t) => {
          const miniId = String(t.miniBudget ?? '').trim();
          if (!miniId) return;
          const label = miniNameById.get(miniId) ?? miniId;
          spendingByMiniBudget[label] = (spendingByMiniBudget[label] ?? 0) + (Number(t.amount) || 0);
        });

      const remainingBudget = activeBudget ? Math.max(0, Number(activeBudget.totalBudget || 0) - expenses) : 0;

      return {
        totalBalance: income - expenses,
        income,
        expenses,
        remainingBudget,
        spendingByCategory,
        spendingByBucket,
        spendingByMiniBudget
      };
    }

    // fallback: return empty object for unknown stubs
    return {};
  }

  if (!API_BASE && !path.startsWith('http')) {
    throw new Error('Missing EXPO_PUBLIC_API_BASE_URL. Create mobile/.env and set EXPO_PUBLIC_API_BASE_URL to your backend base URL (e.g. https://your-deployment.vercel.app). Then restart Expo.');
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  const headers = new Headers(init?.headers ?? {});
  // Only set JSON content type when the body is a plain string/object, not FormData.
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  if (!headers.has('Content-Type') && init?.body && !isFormData) headers.set('Content-Type', 'application/json');

  if (!init?.skipAuth) {
    const tokens = await getTokens();
    if (tokens?.accessToken) headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  }

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401 && !init?.skipAuth) {
    const newAccess = await refreshAccessToken();
    if (!newAccess) {
      const errBody = (await parseJsonSafe(res)) as ApiError | null;
      const message = errBody?.error?.message || 'Unauthorized';
      throw new Error(message);
    }

    const retryHeaders = new Headers(init?.headers ?? {});
    if (!retryHeaders.has('Content-Type') && init?.body) retryHeaders.set('Content-Type', 'application/json');
    retryHeaders.set('Authorization', `Bearer ${newAccess}`);

    const retryRes = await fetch(url, { ...init, headers: retryHeaders });
    const retryData = await parseJsonSafe(retryRes);
    if (!retryRes.ok) {
      const message = (retryData as ApiError | null)?.error?.message || `Request failed (${retryRes.status})`;
      throw new Error(message);
    }
    return retryData;
  }

  const data = await parseJsonSafe(res);
  if (!res.ok) {
    const message = (data as ApiError | null)?.error?.message || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data;
}
