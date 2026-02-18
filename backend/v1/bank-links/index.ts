import crypto from 'crypto';
import { z } from 'zod';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendJson, type ApiRequest, type ApiResponse } from '../../_lib/http.js';
import { requireUserId } from '../../_lib/user.js';

const CreateSchema = z.object({
  provider: z.string().min(1).max(80),
  bankName: z.string().min(1).max(120).optional(),
  userName: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  spaceId: z.enum(['personal', 'business']).optional()
});

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);

  const userId = await requireUserId(req, res);
  if (!userId) return;

  const db = await getDb();
  const { bankLinks, bankAccounts, importedTransactions } = collections(db);

  if (req.method === 'POST') {
    try {
      const body = await readJson<unknown>(req);
      const input = CreateSchema.parse(body);

      const now = new Date();
      const id = crypto.randomUUID();
      const spaceId = input.spaceId ?? 'personal';

      const index = (await bankLinks.countDocuments({ userId, ...(spaceId === 'business' ? { spaceId: 'business' } : {}) })) + 1;
      const bankName = input.bankName || `Demo Bank ${index}`;

      await bankLinks.insertOne({
        _id: id,
        userId,
        spaceId,
        provider: input.provider,
        bankName,
        createdAt: now,
        updatedAt: now,
        userName: input.userName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null
      });

      const accountId1 = crypto.randomUUID();
      const accountId2 = crypto.randomUUID();

      const accounts = [
        {
          _id: accountId1,
          userId,
          spaceId,
          bankLinkId: id,
          name: 'Main account',
          mask: '1234',
          type: 'checking',
          currency: 'NGN',
          balance: 185000,
          createdAt: now,
          updatedAt: now
        },
        {
          _id: accountId2,
          userId,
          spaceId,
          bankLinkId: id,
          name: 'Savings pocket',
          mask: '5678',
          type: 'savings',
          currency: 'NGN',
          balance: 420000,
          createdAt: now,
          updatedAt: now
        }
      ];

      await bankAccounts.insertMany(accounts);

      const seed = [
        {
          bankAccountId: accountId1,
          bankName,
          bankAccountName: 'Main account',
          amount: 4500,
          currency: 'NGN',
          direction: 'debit' as const,
          description: 'Groceries at Local Mart',
          merchant: 'Local Mart'
        },
        {
          bankAccountId: accountId1,
          bankName,
          bankAccountName: 'Main account',
          amount: 1300,
          currency: 'NGN',
          direction: 'debit' as const,
          description: 'Transport – ride share',
          merchant: 'RideShare'
        },
        {
          bankAccountId: accountId2,
          bankName,
          bankAccountName: 'Savings pocket',
          amount: 20000,
          currency: 'NGN',
          direction: 'credit' as const,
          description: 'Salary top-up',
          merchant: 'Employer Ltd'
        }
      ];

      const importedNow = new Date();
      await importedTransactions.insertMany(
        seed.map((s) => ({
          _id: crypto.randomUUID(),
          userId,
          spaceId,
          status: 'pending' as const,
          occurredAt: importedNow,
          createdAt: importedNow,
          updatedAt: importedNow,
          reconciledAt: null,
          ...s
        }))
      );

      const accountsOut = accounts.map((a) => ({
        id: a._id,
        bankLinkId: a.bankLinkId,
        name: a.name,
        mask: a.mask,
        type: a.type,
        currency: a.currency,
        balance: a.balance ?? 0
      }));

      return sendJson(res, 201, {
        link: {
          id,
          spaceId,
          provider: input.provider,
          bankName,
          createdAt: now.toISOString(),
          accounts: accountsOut
        }
      });
    } catch (err: any) {
      if (err?.name === 'ZodError') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', err.issues);
      }
      return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error');
    }
  }

  // GET
  const { spaceId } = req.query ?? {};
  const filter: any = { userId };
  if (spaceId === 'business') {
    filter.spaceId = 'business';
  } else if (spaceId === 'personal') {
    filter.$or = [{ spaceId: 'personal' }, { spaceId: { $exists: false } }, { spaceId: null }];
  }

  const links = await bankLinks.find(filter).sort({ createdAt: -1, _id: -1 }).toArray();
  const linkIds = links.map((l) => l._id);

  const accounts = await bankAccounts
    .find({ userId, bankLinkId: { $in: linkIds } })
    .sort({ createdAt: -1, _id: -1 })
    .toArray();

  const accountByLink = new Map<string, typeof accounts>();
  for (const acct of accounts) {
    const key = acct.bankLinkId;
    const list = accountByLink.get(key) ?? [];
    list.push(acct);
    accountByLink.set(key, list);
  }

  return sendJson(res, 200, {
    items: links.map((l) => ({
      id: l._id,
      spaceId: l.spaceId ?? 'personal',
      provider: l.provider,
      bankName: l.bankName,
      createdAt: l.createdAt.toISOString(),
      accounts: (accountByLink.get(l._id) ?? []).map((a) => ({
        id: a._id,
        bankLinkId: a.bankLinkId,
        name: a.name,
        mask: a.mask,
        type: a.type,
        currency: a.currency,
        balance: a.balance ?? (a.type === 'savings' ? 420000 : 185000)
      }))
    }))
  });
}
