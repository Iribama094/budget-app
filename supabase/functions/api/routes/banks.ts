import { iso, isUuid, sql } from '../lib/db.ts';
import { requireAuth } from '../lib/auth.ts';
import { badRequest, body, HttpError, json, methodNotAllowed, notFound, spaceParam, z } from '../lib/http.ts';
import { exchangeCode, getAccount, MonoError, monoConfigured, syncBankLink, unlinkAccount, type BankLinkRow } from '../lib/bank.ts';
import { bumpBudget, budgetCovering } from '../lib/budgets.ts';
import { afterTransactionCreated } from '../lib/effects.ts';
import type { Ctx } from '../index.ts';

const toApiAccount = (a: any) => ({
  id: a.id,
  bankLinkId: a.bankLinkId,
  name: a.name,
  mask: a.mask,
  type: a.type,
  currency: a.currency,
  balance: a.balance == null ? 0 : Number(a.balance)
});

const toApiImported = (t: any) => ({
  id: t.id,
  spaceId: t.spaceId ?? 'personal',
  bankAccountId: t.bankAccountId,
  bankName: t.bankName,
  bankAccountName: t.bankAccountName,
  amount: Number(t.amount),
  currency: t.currency,
  direction: t.direction,
  description: t.description,
  merchant: t.merchant,
  occurredAt: iso(t.occurredAt),
  status: t.status,
  reconciledAt: t.reconciledAt ? iso(t.reconciledAt) : undefined
});

const DemoLinkSchema = z.object({
  provider: z.string().min(1).max(80),
  bankName: z.string().min(1).max(120).optional(),
  userName: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  spaceId: z.enum(['personal', 'business']).optional()
});

/** GET /v1/bank-links, POST /v1/bank-links (demo connection with sample data) */
export async function bankLinksIndex(ctx: Ctx) {
  if (ctx.method !== 'GET' && ctx.method !== 'POST') methodNotAllowed(['GET', 'POST']);
  const { userId } = await requireAuth(ctx.req);

  if (ctx.method === 'POST') {
    const input = await body(ctx.req, DemoLinkSchema);
    const space = input.spaceId ?? 'personal';
    const [{ n }] = await sql`select count(*)::int as n from public.bank_links where user_id = ${userId} ${space === 'business' ? sql`and space_id = 'business'` : sql``}`;
    const bankName = input.bankName || `Demo Bank ${n + 1}`;

    const [link] = await sql`
      insert into public.bank_links (user_id, space_id, provider, bank_name, user_name, email, phone)
      values (${userId}, ${space}, ${input.provider}, ${bankName}, ${input.userName ?? null}, ${input.email ?? null}, ${input.phone ?? null})
      returning *
    `;
    const accounts = await sql`
      insert into public.bank_accounts (user_id, space_id, bank_link_id, name, mask, type, currency, balance)
      values (${userId}, ${space}, ${link.id}, 'Main account', '1234', 'checking', 'NGN', 185000),
             (${userId}, ${space}, ${link.id}, 'Savings pocket', '5678', 'savings', 'NGN', 420000)
      returning *
    `;
    const [main, savings] = [accounts.find((a) => a.mask === '1234')!, accounts.find((a) => a.mask === '5678')!];
    await sql`
      insert into public.imported_transactions
        (user_id, space_id, bank_account_id, bank_name, bank_account_name, amount, currency, direction, description, merchant, occurred_at)
      values
        (${userId}, ${space}, ${main.id}, ${bankName}, 'Main account', 4500, 'NGN', 'debit', 'Groceries at Local Mart', 'Local Mart', now()),
        (${userId}, ${space}, ${main.id}, ${bankName}, 'Main account', 1300, 'NGN', 'debit', 'Transport – ride share', 'RideShare', now()),
        (${userId}, ${space}, ${savings.id}, ${bankName}, 'Savings pocket', 20000, 'NGN', 'credit', 'Salary top-up', 'Employer Ltd', now())
    `;
    return json(201, {
      link: { id: link.id, spaceId: space, provider: link.provider, bankName, createdAt: iso(link.createdAt), accounts: [main, savings].map(toApiAccount) }
    });
  }

  const space = spaceParam(ctx.query.get('spaceId'));
  const links = await sql`
    select * from public.bank_links where user_id = ${userId} ${space ? sql`and space_id = ${space}` : sql``}
    order by created_at desc, id desc
  `;
  const accounts = links.length
    ? await sql`select * from public.bank_accounts where user_id = ${userId} and bank_link_id in ${sql(links.map((l) => l.id))} order by created_at desc, id desc`
    : [];
  return json(200, {
    items: links.map((l) => ({
      id: l.id,
      spaceId: l.spaceId ?? 'personal',
      provider: l.provider,
      bankName: l.bankName,
      status: l.status ?? 'active',
      lastSyncedAt: iso(l.lastSyncedAt),
      createdAt: iso(l.createdAt),
      accounts: accounts.filter((a) => a.bankLinkId === l.id).map(toApiAccount)
    }))
  });
}

/** DELETE /v1/bank-links/:id */
export async function bankLinkById(ctx: Ctx) {
  if (ctx.method !== 'DELETE') methodNotAllowed(['DELETE']);
  const { userId } = await requireAuth(ctx.req);
  const id = ctx.parts[1];
  const space = spaceParam(ctx.query.get('spaceId'));
  const [link] = isUuid(id) ? await sql<BankLinkRow[]>`select * from public.bank_links where id = ${id} and user_id = ${userId}` : [];
  if (!link || (space && link.spaceId !== space)) notFound('Bank connection not found');

  if (link.provider === 'mono' && link.externalAccountId && monoConfigured()) {
    // Revoke data access at Mono too; a failure here shouldn't block disconnecting.
    await unlinkAccount(link.externalAccountId).catch((err) => console.error('[bank-links] mono unlink failed', err));
  }
  // Accounts and their imported transactions go with the link (on delete cascade).
  await sql`delete from public.bank_links where id = ${id} and user_id = ${userId}`;
  return json(200, { ok: true });
}

const ExchangeSchema = z.object({ code: z.string().min(4).max(200), spaceId: z.enum(['personal', 'business']).optional() });

/** POST /v1/bank-links/mono — finish Mono Connect: exchange the code, save the account, import recent transactions. */
export async function monoConnect(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { userId } = await requireAuth(ctx.req);
  if (!monoConfigured()) throw new HttpError(501, 'NOT_CONFIGURED', 'Live bank connections are not set up on this server yet.');
  const input = await body(ctx.req, ExchangeSchema);

  try {
    const accountId = await exchangeCode(input.code);
    const account = await getAccount(accountId);
    // Re-linking the same account updates the existing connection instead of duplicating it.
    const [link] = await sql<BankLinkRow[]>`
      insert into public.bank_links (user_id, space_id, provider, bank_name, external_account_id, status)
      values (${userId}, ${input.spaceId ?? 'personal'}, 'mono', ${account.institutionName}, ${accountId}, 'active')
      on conflict (user_id, external_account_id) do update set status = 'active', bank_name = excluded.bank_name
      returning *
    `;
    const { imported } = await syncBankLink(link);
    const accounts = await sql`select * from public.bank_accounts where user_id = ${userId} and bank_link_id = ${link.id}`;
    return json(201, {
      imported,
      link: {
        id: link.id,
        spaceId: link.spaceId ?? 'personal',
        provider: link.provider,
        bankName: link.bankName,
        status: 'active',
        lastSyncedAt: new Date().toISOString(),
        createdAt: iso(link.createdAt),
        accounts: accounts.map(toApiAccount)
      }
    });
  } catch (err) {
    if (err instanceof MonoError) throw new HttpError(502, 'BANK_PROVIDER_ERROR', `Your bank could not be connected: ${err.message}`);
    throw err;
  }
}

/** POST /v1/bank-links/:id/sync — import new transactions now. */
export async function bankSync(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { userId } = await requireAuth(ctx.req);
  const id = ctx.parts[1];
  const [link] = isUuid(id) ? await sql<BankLinkRow[]>`select * from public.bank_links where id = ${id} and user_id = ${userId}` : [];
  if (!link) notFound('Bank connection not found');
  if (link.provider !== 'mono') return json(200, { imported: 0, live: false });
  if (!monoConfigured()) throw new HttpError(501, 'NOT_CONFIGURED', 'Live bank connections are not set up on this server yet.');
  try {
    const { imported } = await syncBankLink(link);
    return json(200, { imported, live: true });
  } catch (err) {
    if (err instanceof MonoError) {
      throw err.needsReauth
        ? new HttpError(409, 'REAUTH_REQUIRED', `Reconnect ${link.bankName} to keep importing.`)
        : new HttpError(502, 'BANK_PROVIDER_ERROR', err.message);
    }
    throw err;
  }
}

/** GET /v1/imported-transactions?status&spaceId */
export async function importedIndex(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const { userId } = await requireAuth(ctx.req);
  const raw = ctx.query.get('status') ?? 'pending';
  const status = ['pending', 'reconciled', 'ignored'].includes(raw) ? raw : 'pending';
  const space = spaceParam(ctx.query.get('spaceId'));
  const items = await sql`
    select * from public.imported_transactions
    where user_id = ${userId} and status = ${status} ${space ? sql`and space_id = ${space}` : sql``}
    order by occurred_at desc, id desc
  `;
  return json(200, { items: items.map(toApiImported) });
}

const ReconcileSchema = z.object({
  type: z.enum(['income', 'expense']).optional(),
  category: z.string().min(1).max(60).optional(),
  description: z.string().max(120).optional(),
  budgetId: z.union([z.string().min(1).max(120), z.null()]).optional(),
  budgetCategory: z.union([z.string().min(1).max(60), z.null()]).optional(),
  miniBudgetId: z.union([z.string().min(1).max(120), z.null()]).optional()
});

/** POST /v1/imported-transactions/:id/reconcile | /ignore */
export async function importedAction(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { userId } = await requireAuth(ctx.req);
  const [, id, action] = ctx.parts;
  if (!id || !action) badRequest('Missing id/action in route');
  const space = spaceParam(ctx.query.get('spaceId'));
  const [tx] = isUuid(id) ? await sql`select * from public.imported_transactions where id = ${id} and user_id = ${userId}` : [];
  if (!tx || (space && tx.spaceId !== space)) notFound('Imported transaction not found');

  if (action === 'ignore') {
    const [out] = await sql`update public.imported_transactions set status = 'ignored' where id = ${tx.id} returning *`;
    return json(200, { transaction: toApiImported(out) });
  }
  if (action !== 'reconcile') badRequest('Unsupported action');

  const input = await body(ctx.req, ReconcileSchema);
  const type = input.type ?? (tx.direction === 'debit' ? 'expense' : 'income');
  const category = input.category ?? (type === 'income' ? 'Other income' : 'Uncategorized');
  const txSpace = tx.spaceId ?? 'personal';

  const clean = (v: string | null | undefined) => (v == null ? null : String(v).trim() || null);
  let budgetId = clean(input.budgetId);
  let budgetCategory = clean(input.budgetCategory);
  let miniBudgetId = clean(input.miniBudgetId);
  if (budgetId && !isUuid(budgetId)) budgetId = null;

  // No budget chosen: attach it to the budget that covers the transaction date.
  if (!budgetId) budgetId = await budgetCovering(userId, txSpace, new Date(tx.occurredAt).toISOString().slice(0, 10));
  if (!budgetId) {
    budgetCategory = null;
    miniBudgetId = null;
  }

  const [created] = await sql`
    insert into public.transactions (user_id, space_id, type, amount, category, description, budget_id, budget_category, mini_budget_id, occurred_at)
    values (${userId}, ${txSpace}, ${type}, ${tx.amount}, ${category}, ${input.description ?? (tx.description || tx.merchant || 'Imported transaction')},
            ${budgetId}, ${budgetCategory}, ${miniBudgetId}, ${tx.occurredAt})
    returning id, user_id, space_id, type, amount, budget_id, budget_category
  `;
  if (type === 'income' && budgetId) {
    await bumpBudget(budgetId, Number(tx.amount), budgetCategory, sql`b.user_id = ${userId} and b.space_id = ${txSpace}`);
  }
  await afterTransactionCreated(created as any);

  const [out] = await sql`update public.imported_transactions set status = 'reconciled', reconciled_at = now() where id = ${tx.id} returning *`;
  return json(200, { transaction: toApiImported(out) });
}
