import { getDb } from '../../_lib/mongo.js';
import { collections, type ImportedTransactionStatus } from '../../_lib/collections.js';
import { methodNotAllowed, sendJson, type ApiRequest, type ApiResponse } from '../../_lib/http.js';
import { requireUserId } from '../../_lib/user.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'GET') {
    const userId = await requireUserId(req, res);
    if (!userId) return;

    const statusRaw = String(req.query?.status ?? 'pending');
    const status = (['pending', 'reconciled', 'ignored'] as ImportedTransactionStatus[]).includes(statusRaw as ImportedTransactionStatus)
      ? (statusRaw as ImportedTransactionStatus)
      : 'pending';

    const db = await getDb();
    const { importedTransactions } = collections(db);

    const { spaceId } = req.query ?? {};
    const filter: any = { userId, status };
    if (spaceId === 'business') {
      filter.spaceId = 'business';
    } else if (spaceId === 'personal') {
      filter.$or = [{ spaceId: 'personal' }, { spaceId: { $exists: false } }, { spaceId: null }];
    }

    const items = await importedTransactions
      .find(filter)
      .sort({ occurredAt: -1, _id: -1 })
      .toArray();

    return sendJson(res, 200, {
      items: items.map((t) => ({
        id: t._id,
        spaceId: t.spaceId ?? 'personal',
        bankAccountId: t.bankAccountId,
        bankName: t.bankName,
        bankAccountName: t.bankAccountName,
        amount: t.amount,
        currency: t.currency,
        direction: t.direction,
        description: t.description,
        merchant: t.merchant,
        occurredAt: t.occurredAt.toISOString(),
        status: t.status,
        reconciledAt: t.reconciledAt ? t.reconciledAt.toISOString() : undefined
      }))
    });
  }

  if (req.method === 'POST') {
    // For actions like reconcile/ignore we expect /imported-transactions/:id/:action routed to [id].ts
    return methodNotAllowed(res, ['GET']);
  }

  return methodNotAllowed(res, ['GET']);
}
