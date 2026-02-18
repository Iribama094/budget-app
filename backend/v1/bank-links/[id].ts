import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, sendError, sendJson, type ApiRequest, type ApiResponse } from '../../_lib/http.js';
import { requireUserId } from '../../_lib/user.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'DELETE') return methodNotAllowed(res, ['DELETE']);

  const userId = await requireUserId(req, res);
  if (!userId) return;

  const { id } = req.query as { id?: string };
  if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Missing id');

  const spaceIdRaw = (req.query as any)?.spaceId;
  const spaceId = spaceIdRaw === 'personal' || spaceIdRaw === 'business' ? spaceIdRaw : undefined;

  const db = await getDb();
  const { bankLinks, bankAccounts, importedTransactions } = collections(db);

  const link = await bankLinks.findOne({ _id: String(id), userId });
  if (!link) return sendError(res, 404, 'NOT_FOUND', 'Bank connection not found');

  const linkSpaceId = (link.spaceId ?? 'personal') as 'personal' | 'business';

  // Optional strict demarcation when spaceId is provided.
  if (spaceId && linkSpaceId !== spaceId) {
    return sendError(res, 404, 'NOT_FOUND', 'Bank connection not found');
  }

  const accounts = await bankAccounts
    .find({ userId, bankLinkId: String(id), ...(linkSpaceId === 'business' ? { spaceId: 'business' } : {}) })
    .toArray();
  const accountIds = accounts.map((a) => String(a._id));

  if (accountIds.length) {
    await importedTransactions.deleteMany({ userId, bankAccountId: { $in: accountIds } });
  }

  await bankAccounts.deleteMany({ userId, bankLinkId: String(id) });

  await bankLinks.deleteOne({ _id: String(id), userId });

  return sendJson(res, 200, { ok: true });
}
