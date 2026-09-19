import crypto from 'crypto';
import { z } from 'zod';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendJson } from '../../_lib/http.js';
import { requireUserId } from '../../_lib/user.js';
import { exchangeCode, getAccount, MonoError, monoConfigured } from '../../_lib/mono.js';
import { syncBankLink } from '../../_lib/bankSync.js';

const ExchangeSchema = z.object({
  code: z.string().min(4).max(200),
  spaceId: z.enum(['personal', 'business']).optional()
});

/** POST /v1/bank-links/mono — finish Mono Connect: exchange the code, save the account, import recent transactions. */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const userId = await requireUserId(req, res);
  if (!userId) return;
  if (!monoConfigured()) return sendError(res, 501, 'NOT_CONFIGURED', 'Live bank connections are not set up on this server yet.');

  try {
    const input = ExchangeSchema.parse(await readJson<unknown>(req));
    const db = await getDb();
    const { bankLinks } = collections(db);
    const now = new Date();
    const spaceId = input.spaceId ?? 'personal';

    const accountId = await exchangeCode(input.code);
    const account = await getAccount(accountId);

    // Re-linking the same account updates the existing connection instead of duplicating it.
    let link = await bankLinks.findOne({ userId, externalAccountId: accountId });
    if (link) {
      await bankLinks.updateOne({ _id: link._id }, { $set: { status: 'active', bankName: account.institutionName, updatedAt: now } });
      link = { ...link, status: 'active', bankName: account.institutionName };
    } else {
      link = {
        _id: crypto.randomUUID(),
        userId,
        spaceId,
        provider: 'mono',
        bankName: account.institutionName,
        externalAccountId: accountId,
        status: 'active',
        lastSyncedAt: null,
        createdAt: now,
        updatedAt: now
      };
      await bankLinks.insertOne(link);
    }

    const { imported } = await syncBankLink(db, link);
    const { bankAccounts } = collections(db);
    const accounts = await bankAccounts.find({ userId, bankLinkId: link._id }).toArray();

    return sendJson(res, 201, {
      imported,
      link: {
        id: link._id,
        spaceId: link.spaceId ?? 'personal',
        provider: link.provider,
        bankName: link.bankName,
        status: 'active',
        lastSyncedAt: new Date().toISOString(),
        createdAt: link.createdAt.toISOString(),
        accounts: accounts.map((a) => ({ id: a._id, bankLinkId: a.bankLinkId, name: a.name, mask: a.mask, type: a.type, currency: a.currency, balance: a.balance ?? 0 }))
      }
    });
  } catch (err: any) {
    if (err?.name === 'ZodError') return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', err.issues);
    if (err instanceof MonoError) return sendError(res, 502, 'BANK_PROVIDER_ERROR', `Your bank could not be connected: ${err.message}`);
    console.error('[bank-links/mono] unexpected error', err);
    return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error');
  }
}
