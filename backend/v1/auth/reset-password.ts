import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { signAccessToken, signRefreshToken, hashToken } from '../../_lib/auth.js';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { envNumber } from '../../_lib/env.js';
import { methodNotAllowed, readJson, sendError, sendJson } from '../../_lib/http.js';
import { parseWith, zEmail, zPassword } from '../../_lib/validate.js';
import { hashResetCode } from './forgot-password.js';
import { clientIp, enforceRateLimits } from '../../_lib/rateLimit.js';
import { notifyUser } from '../../_lib/notify.js';

const ResetSchema = z.object({
  email: zEmail,
  code: z.string().regex(/^\d{6}$/),
  newPassword: zPassword,
  deviceName: z.string().max(100).optional()
});

const MAX_ATTEMPTS = 5;

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

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const body = await readJson<unknown>(req);
    const input = parseWith(ResetSchema, body);

    const db = await getDb();
    const { users, sessions, passwordResets } = collections(db);

    const email = input.email.toLowerCase();
    const allowed = await enforceRateLimits(db, res, [
      { key: `reset:ip:${clientIp(req)}`, limit: 20, windowSec: 15 * 60 },
      { key: `reset:email:${email}`, limit: 10, windowSec: 15 * 60 }
    ]);
    if (!allowed) return;

    const user = await users.findOne({ email });
    const expired = () => sendError(res, 400, 'INVALID_CODE', 'This code has expired. Request a new one.');
    if (!user) return expired();

    const now = new Date();
    const reset = await passwordResets.find({ userId: user._id, usedAt: null }).sort({ createdAt: -1 }).limit(1).next();
    if (!reset || reset.expiresAt <= now || reset.attempts >= MAX_ATTEMPTS) return expired();

    if (!safeEqual(reset.codeHash, hashResetCode(user._id, input.code))) {
      await passwordResets.updateOne({ _id: reset._id }, { $inc: { attempts: 1 } });
      const left = MAX_ATTEMPTS - reset.attempts - 1;
      return sendError(
        res,
        400,
        'INVALID_CODE',
        left > 0 ? `That code isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Request a new one.'
      );
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await users.updateOne({ _id: user._id }, { $set: { passwordHash, updatedAt: now } });
    await passwordResets.updateOne({ _id: reset._id }, { $set: { usedAt: now } });
    // A reset signs out every other device.
    await sessions.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: now } });

    const sessionId = crypto.randomUUID();
    const refreshToken = signRefreshToken(user._id, sessionId);
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + envNumber('JWT_REFRESH_TTL_DAYS', 30));

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

    await notifyUser(db, user._id, {
      kind: 'security',
      title: 'Your password was reset',
      body: 'All other devices were signed out. If this was not you, reset your password again right away.'
    }).catch(() => undefined);

    const updated = await users.findOne({ _id: user._id });
    return sendJson(res, 200, { user: toApiUser(updated), accessToken: signAccessToken(user._id, sessionId), refreshToken });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Enter the 6-digit code and a password of at least 8 characters', err.issues);
    }
    console.error('[auth/reset-password] unexpected error', err);
    const details = process.env.NODE_ENV === 'production' ? undefined : String(err?.message ?? err);
    return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error', details);
  }
}
