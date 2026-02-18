import { z } from 'zod';
import { verifyRefreshToken } from '../../_lib/auth.js';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, readJson, sendNoContent, sendError } from '../../_lib/http.js';
import { parseWith } from '../../_lib/validate.js';

const LogoutSchema = z.object({
  refreshToken: z.string().min(1)
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const body = await readJson<unknown>(req);
    const input = parseWith(LogoutSchema, body);
    const payload = verifyRefreshToken(input.refreshToken);

    const db = await getDb();
    const { sessions } = collections(db);

    await sessions.updateOne(
      { _id: payload.sid, userId: payload.sub },
      { $set: { revokedAt: new Date() } }
    );

    return sendNoContent(res);
  } catch {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request');
  }
}
