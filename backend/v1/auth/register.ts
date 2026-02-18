import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { signAccessToken, signRefreshToken, hashToken } from '../../_lib/auth.js';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendJson } from '../../_lib/http.js';
import { parseWith, zEmail, zPassword } from '../../_lib/validate.js';

const RegisterSchema = z.object({
  email: zEmail,
  password: zPassword,
  name: z.string().min(1).max(100).optional()
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
    const input = parseWith(RegisterSchema, body);

    const db = await getDb();
    const { users, sessions } = collections(db);

    const email = input.email.toLowerCase();
    const existing = await users.findOne({ email });
    if (existing) {
      return sendError(res, 409, 'VALIDATION_ERROR', 'Email already in use');
    }

    const now = new Date();
    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(input.password, 12);

    await users.insertOne({
      _id: userId,
      email,
      passwordHash,
      name: input.name ?? null,
      currency: null,
      locale: null,
      monthlyIncome: null,
      createdAt: now,
      updatedAt: now
    });

    const sessionId = crypto.randomUUID();
    const refreshToken = signRefreshToken(userId, sessionId);
    const refreshTokenHash = hashToken(refreshToken);

    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 30);

    await sessions.insertOne({
      _id: sessionId,
      userId,
      refreshTokenHash,
      deviceName: null,
      createdAt: now,
      expiresAt,
      revokedAt: null,
      rotatedAt: null
    });

    const accessToken = signAccessToken(userId);
    const user = await users.findOne({ _id: userId });

    return sendJson(res, 200, {
      user: toApiUser(user),
      accessToken,
      refreshToken
    });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', err.issues);
    }
    console.error('[auth/register] unexpected error', err);
    const details = process.env.NODE_ENV === 'production' ? undefined : String(err?.message ?? err);
    return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error', details);
  }
}
