import { clearTokens, getTokens, setTokens } from './storage';

type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? '';

const USE_STUBS = (import.meta as any).env?.VITE_USE_STUBS === 'true';

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
  provider: string;
  bankName: string;
  createdAt: string;
  accounts: StubBankAccount[];
};

type StubImportedStatus = 'pending' | 'reconciled' | 'ignored';

type StubImportedTransaction = {
  id: string;
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

async function handleStub(path: string, init: RequestInit & { body?: any } = {}): Promise<any> {
  // small artificial delay to simulate quick network
  await new Promise((r) => setTimeout(r, 120));
  const method = (init.method || 'GET').toUpperCase();
  try {
    if (path.startsWith('/v1/auth/me')) {
      return { user: { id: 'dev-user', email: 'dev@example.com', name: 'Dev User', monthlyIncome: 150000, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } };
    }

    if (path.startsWith('/v1/budgets') && method === 'GET') {
      return { items: [] };
    }

    if (path === '/v1/budgets' && method === 'POST') {
      const body = init.body ? JSON.parse(String(init.body)) : {};
      return {
        budget: {
          id: 'dev-budget-1',
          name: body.name || 'Monthly Budget',
          totalBudget: body.totalBudget || 0,
          period: body.period || 'monthly',
          startDate: body.startDate || new Date().toISOString(),
          categories: body.categories || {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };
    }

    if (path.startsWith('/v1/budgets/') && method === 'PATCH') {
      const body = init.body ? JSON.parse(String(init.body)) : {};
      return {
        budget: {
          id: path.split('/')[3] || 'dev-budget-1',
          name: body.name || 'Monthly Budget',
          totalBudget: body.totalBudget || 0,
          period: body.period || 'monthly',
          startDate: body.startDate || new Date().toISOString(),
          categories: body.categories || {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };
    }

    if (path.startsWith('/v1/transactions') && method === 'POST') {
      const body = init.body ? JSON.parse(String(init.body)) : {};
      return {
        transaction: {
          id: 'dev-tx-1',
          type: body.type || 'expense',
          amount: body.amount || 0,
          category: body.category || 'Uncategorized',
          description: body.description || '',
          occurredAt: body.occurredAt || new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };
    }

    if (path.startsWith('/v1/goals') && method === 'GET') {
      return { items: [] };
    }

    if (path.startsWith('/v1/assistant/chat') && method === 'POST') {
      const body = init.body ? JSON.parse(String(init.body)) : {};
      const message: string = body.message || '';

      let reply = "I'm your cost-optimized budget assistant. Ask me anything about your money.";
      const lower = message.toLowerCase();

      if (lower.includes('spent') || lower.includes('spending')) {
        reply = "You've spent about ₦32,500 this week. Your biggest expense category looks like Food & Drinks, followed by Transport.";
      } else if (lower.includes('remind') || lower.includes('reminder')) {
        reply = "I can remind you about key bills and savings moves. For now, imagine a rent reminder set for the end of the month.";
      } else if (lower.includes('goal') || lower.includes('car') || lower.includes('house')) {
        reply = "For a big goal, try saving 20–30% of your income, with at least half of that going into long-term investments.";
      } else if (lower.includes('what if') && lower.includes('income')) {
        reply = "If your income dropped by 20%, I’d first protect Essentials, then trim Free Spend and Miscellaneous, and slow down—but not stop—Investments.";
      } else if (lower.includes('what if') && (lower.includes('invest') || lower.includes('investment'))) {
        reply = "Increasing investments by 10% is great if Essentials are covered and you still keep a small buffer for Miscellaneous and emergencies.";
      } else if (lower.includes('streak') || lower.includes('habit')) {
        reply = "Think in streaks: even a 7‑day run of sticking to your budget is a strong signal you’re building a new money habit.";
      }

      return { reply };
    }

    // Bank linking + imported transactions stubs (web)
    if (path === '/v1/bank-links' && method === 'GET') {
      return { items: STUB_BANK_LINKS };
    }

    if (path === '/v1/bank-links' && method === 'POST') {
      const nowIso = new Date().toISOString();
      const body = init.body ? JSON.parse(String(init.body)) : {};
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

      const link: StubBankLink = { id, provider, bankName, createdAt: nowIso, accounts };
      STUB_BANK_LINKS.push(link);

      const seed: Omit<StubImportedTransaction, 'id' | 'status'>[] = [
        {
          bankAccountId: accounts[0].id,
          bankName,
          bankAccountName: accounts[0].name,
          amount: 4500,
          currency: 'NGN',
          direction: 'debit',
          description: 'Groceries at Local Mart',
          merchant: 'Local Mart',
          occurredAt: nowIso
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
          occurredAt: nowIso
        },
        {
          bankAccountId: accounts[1].id,
          bankName,
          bankAccountName: accounts[1].name,
          amount: 20000,
          currency: 'NGN',
          direction: 'credit',
          description: 'Salary top-up',
          merchant: 'Employer Ltd',
          occurredAt: nowIso
        }
      ];

      seed.forEach((s, idx) => {
        const tx: StubImportedTransaction = {
          id: `imp-${STUB_IMPORTED_TRANSACTIONS.length + idx + 1}`,
          status: 'pending',
          ...s
        };
        STUB_IMPORTED_TRANSACTIONS.push(tx);
      });

      return { link };
    }

    if (path.startsWith('/v1/imported-transactions') && method === 'GET') {
      const url = new URL('http://local' + path);
      const status = (url.searchParams.get('status') as StubImportedStatus | null) || 'pending';
      const items = STUB_IMPORTED_TRANSACTIONS.filter((t) => t.status === status);
      return { items };
    }

    // default empty
    return {};
  } catch (err) {
    return {};
  }
}

function joinUrl(path: string): string {
  if (!path.startsWith('/')) path = `/${path}`;
  return `${API_BASE}${path}`;
}

async function parseJsonSafe(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  const res = await fetch(joinUrl('/v1/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });

  if (!res.ok) return null;
  const json = await res.json();
  if (!json?.accessToken || !json?.refreshToken) return null;
  return { accessToken: json.accessToken, refreshToken: json.refreshToken };
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { skipAuth?: boolean } = {}
): Promise<T> {
  const { skipAuth = false, ...requestInit } = init;
  const auth = !skipAuth;
  const tokens = getTokens();

  const headers = new Headers(requestInit.headers);
  if (!headers.has('Content-Type') && requestInit.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (auth && tokens?.accessToken) {
    headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  }

  const doRequest = async (): Promise<Response> => {
    return fetch(joinUrl(path), { ...requestInit, headers });
  };

  // If dev stubs enabled, short-circuit to stub handler and return the data
  if (USE_STUBS) {
    const stub = await handleStub(path, { ...requestInit });
    return stub as unknown as T;
  }

  let res = await doRequest();

  if (auth && res.status === 401 && tokens?.refreshToken) {
    const refreshed = await refreshTokens(tokens.refreshToken);
    if (refreshed) {
      setTokens(refreshed);
      headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
      res = await doRequest();
    } else {
      clearTokens();
    }
  }

  if (!res.ok) {
    const maybe = (await parseJsonSafe(res)) as ApiError | null;
    const message = maybe?.error?.message || `Request failed (${res.status})`;
    throw new Error(message);
  }

  // 204
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}
