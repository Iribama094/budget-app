import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, sendError, sendJson } from '../../_lib/http.js';
import { requireUserId } from '../../_lib/user.js';
import { MonoError, monoConfigured } from '../../_lib/mono.js';
import { syncBankLink } from '../../_lib/bankSync.js';

/** POST /v1/bank-links/:id/sync: import new transactions now. */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const userId = await requireUserId(req, res);
  if (!userId) return;

  const id = String(req.query?.id ?? '');
  const db = await getDb();
  const { bankLinks } = collections(db);
  const link = await bankLinks.findOne({ _id: id, userId });
  if (!link) return sendError(res, 404, 'NOT_FOUND', 'Bank connection not found');
  if (link.provider !== 'mono') return sendJson(res, 200, { imported: 0, live: false });
  if (!monoConfigured()) return sendError(res, 501, 'NOT_CONFIGURED', 'Live bank connections are not set up on this server yet.');

  try {
    const { imported } = await syncBankLink(db, link);
    return sendJson(res, 200, { imported, live: true });
  } catch (err) {
    if (err instanceof MonoError) {
      return sendError(res, err.needsReauth ? 409 : 502, err.needsReauth ? 'REAUTH_REQUIRED' : 'BANK_PROVIDER_ERROR', err.needsReauth ? `Reconnect ${link.bankName} to keep importing.` : err.message);
    }
    console.error('[bank-links/sync] unexpected error', err);
    return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error');
  }
}
