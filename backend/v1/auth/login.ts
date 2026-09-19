import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { signAccessToken, signRefreshToken, hashToken } from '../../_lib/auth.js';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendJson } from '../../_lib/http.js';
import { parseWith, zEmail, zPassword } from '../../_lib/validate.js';
import { clientIp, enforceRateLimits } from '../../_lib/rateLimit.js';

const LoginSchema = z.object({
  email: zEmail,
  password: zPassword,
  deviceName: z.string().max(100).optional()
});

function toApiUser(user: any) {
  return {
    id: user._id,
    email: user.email,
    name: user.name ?? null,
    currency: user.currency ?? null,
    locale: user.locale ?? null,
    monthlyIncome: user.monthlyIncome ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const body = await readJson<unknown>(req);
    const input = parseWith(LoginSchema, body);

    const db = await getDb();
    const { users, sessions } = collections(db);

    const email = input.email.toLowerCase();
    const allowed = await enforceRateLimits(db, res, [
      { key: `login:ip:${clientIp(req)}`, limit: 30, windowSec: 15 * 60 },
      { key: `login:email:${email}`, limit: 8, windowSec: 15 * 60 }
    ]);
    if (!allowed) return;

    const user = await users.findOne({ email });
    if (!user) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Invalid email or password');
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Invalid email or password');
    }

    const now = new Date();
    const sessionId = crypto.randomUUID();
    const refreshToken = signRefreshToken(user._id, sessionId);

    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 30);

    await sessions.insertOne({
      _id: sessionId,
      userId: user._id,
      refreshTokenHash: hashToken(refreshToken),
      deviceName: input.deviceName ?? null,
      createdAt: now,
      expiresAt,
      revokedAt: null,
      rotatedAt: null,
      startedAt: now,
      lastUsedAt: now
    });

    const accessToken = signAccessToken(user._id, sessionId);

    return sendJson(res, 200, {
      user: toApiUser(user),
      accessToken,
      refreshToken
    });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', err.issues);
    }
    console.error('[auth/login] unexpected error', err);
    const details = process.env.NODE_ENV === 'production' ? undefined : String(err?.message ?? err);
    return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error', details);
  }
}
