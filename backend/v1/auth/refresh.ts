import crypto from 'crypto';
import { z } from 'zod';
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from '../../_lib/auth.js';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { envNumber } from '../../_lib/env.js';
import { methodNotAllowed, readJson, sendError, sendJson } from '../../_lib/http.js';
import { parseWith } from '../../_lib/validate.js';

const RefreshSchema = z.object({
  refreshToken: z.string().min(1)
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const body = await readJson<unknown>(req);
    const input = parseWith(RefreshSchema, body);

    const payload = verifyRefreshToken(input.refreshToken);

    const db = await getDb();
    const { sessions } = collections(db);

    const session = await sessions.findOne({ _id: payload.sid, userId: payload.sub });
    if (!session || session.revokedAt) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Session is not valid');
    }

    if (session.refreshTokenHash !== hashToken(input.refreshToken)) {
      await sessions.updateOne({ _id: session._id }, { $set: { revokedAt: new Date() } });
      return sendError(res, 401, 'UNAUTHORIZED', 'Refresh token reuse detected');
    }

    const now = new Date();
    const rotatedSessionId = crypto.randomUUID();
    const newRefreshToken = signRefreshToken(payload.sub, rotatedSessionId);

    const ttlDays = envNumber('JWT_REFRESH_TTL_DAYS', 30);
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + ttlDays);

    await sessions.updateOne(
      { _id: session._id },
      { $set: { revokedAt: now, rotatedAt: now } }
    );

    await sessions.insertOne({
      _id: rotatedSessionId,
      userId: payload.sub,
      refreshTokenHash: hashToken(newRefreshToken),
      deviceName: session.deviceName ?? null,
      createdAt: now,
      expiresAt,
      revokedAt: null,
      rotatedAt: null
    });

    const accessToken = signAccessToken(payload.sub);

    return sendJson(res, 200, { accessToken, refreshToken: newRefreshToken });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', err.issues);
    }
    return sendError(res, 401, 'UNAUTHORIZED', 'Invalid refresh token');
  }
}
