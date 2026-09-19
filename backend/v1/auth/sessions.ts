import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, sendError, sendJson } from '../../_lib/http.js';
import { requireAuth } from '../../_lib/user.js';

/**
 * GET    /v1/auth/sessions                    signed-in devices
 * POST   /v1/auth/sessions/revoke-others      sign out every other device
 * DELETE /v1/auth/sessions/:id                sign out one device
 *
 * Revoked devices can't refresh; their current access token expires within JWT_ACCESS_TTL_MIN.
 */
export default async function handler(req: any, res: any) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const db = await getDb();
  const { sessions } = collections(db);
  const now = new Date();
  const id = req.query?.id ? String(req.query.id) : null;
  const action = req.query?.action ? String(req.query.action) : null;

  if (req.method === 'GET' && !id) {
    const items = await sessions
      .find({ userId: auth.userId, revokedAt: null, expiresAt: { $gt: now } })
      .sort({ lastUsedAt: -1, createdAt: -1 })
      .toArray();
    return sendJson(res, 200, {
      items: items.map((s) => ({
        id: s._id,
        deviceName: s.deviceName ?? null,
        startedAt: (s.startedAt ?? s.createdAt).toISOString(),
        lastUsedAt: (s.lastUsedAt ?? s.createdAt).toISOString(),
        current: s._id === auth.sessionId
      }))
    });
  }

  if (req.method === 'POST' && (action === 'revoke-others' || id === 'revoke-others')) {
    if (!auth.sessionId) {
      return sendError(res, 400, 'SESSION_UNKNOWN', 'Sign out and back in on this phone first, then try again.');
    }
    const result = await sessions.updateMany({ userId: auth.userId, revokedAt: null, _id: { $ne: auth.sessionId } }, { $set: { revokedAt: now } });
    return sendJson(res, 200, { revoked: result.modifiedCount });
  }

  if (req.method === 'DELETE' && id) {
    if (id === auth.sessionId) return sendError(res, 400, 'CURRENT_SESSION', 'To sign out this phone, use Log out.');
    const result = await sessions.updateOne({ _id: id, userId: auth.userId, revokedAt: null }, { $set: { revokedAt: now } });
    if (!result.matchedCount) return sendError(res, 404, 'NOT_FOUND', 'Device not found');
    return sendJson(res, 200, { ok: true });
  }

  return methodNotAllowed(res, ['GET', 'POST', 'DELETE']);
}
