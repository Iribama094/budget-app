import { z } from 'zod';
import { getDb } from '../_lib/mongo.js';
import { collections } from '../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendJson } from '../_lib/http.js';
import { requireUserId } from '../_lib/user.js';

const TokenSchema = z.object({
  token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[.+\]$/, 'Not an Expo push token'),
  platform: z.string().max(20).optional()
});

/** POST registers this device for push; DELETE removes it (e.g. on log out). */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'DELETE') return methodNotAllowed(res, ['POST', 'DELETE']);
  const userId = await requireUserId(req, res);
  if (!userId) return;

  try {
    const input = TokenSchema.parse(await readJson<unknown>(req));
    const db = await getDb();
    const { pushTokens } = collections(db);

    if (req.method === 'DELETE') {
      await pushTokens.deleteOne({ _id: input.token, userId });
      return sendJson(res, 200, { ok: true });
    }

    const now = new Date();
    // A device belongs to whoever signed in last on it.
    await pushTokens.updateOne(
      { _id: input.token },
      { $set: { userId, platform: input.platform ?? 'unknown', updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );
    return sendJson(res, 200, { ok: true });
  } catch (err: any) {
    if (err?.name === 'ZodError') return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', err.issues);
    return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error');
  }
}
