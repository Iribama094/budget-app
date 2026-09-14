import crypto from 'crypto';
import { z } from 'zod';
import { hashToken } from '../../_lib/auth.js';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { sendEmail } from '../../_lib/email.js';
import { envNumber } from '../../_lib/env.js';
import { methodNotAllowed, readJson, sendError, sendJson } from '../../_lib/http.js';
import { parseWith, zEmail } from '../../_lib/validate.js';
import { clientIp, enforceRateLimits } from '../../_lib/rateLimit.js';

const ForgotSchema = z.object({
  email: zEmail
});

const RESEND_COOLDOWN_MS = 60 * 1000;

export function hashResetCode(userId: string, code: string): string {
  return hashToken(`${userId}:${code}`);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const body = await readJson<unknown>(req);
    const input = parseWith(ForgotSchema, body);

    const db = await getDb();
    const { users, passwordResets } = collections(db);

    const email = input.email.toLowerCase();
    // Limits apply whether or not the account exists, so they reveal nothing.
    const allowed = await enforceRateLimits(db, res, [
      { key: `forgot:ip:${clientIp(req)}`, limit: 20, windowSec: 60 * 60 },
      { key: `forgot:email:${email}`, limit: 5, windowSec: 60 * 60 }
    ]);
    if (!allowed) return;

    const user = await users.findOne({ email });

    // Always answer the same way so the endpoint can't be used to discover accounts.
    const okBody: Record<string, unknown> = { ok: true };

    if (!user) return sendJson(res, 200, okBody);

    const now = new Date();
    const latest = await passwordResets.find({ userId: user._id }).sort({ createdAt: -1 }).limit(1).next();
    if (latest && !latest.usedAt && now.getTime() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      return sendJson(res, 200, okBody);
    }

    await passwordResets.updateMany({ userId: user._id, usedAt: null }, { $set: { usedAt: now } });

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const ttlMin = envNumber('PASSWORD_RESET_TTL_MIN', 15);
    const expiresAt = new Date(now.getTime() + ttlMin * 60 * 1000);

    await passwordResets.insertOne({
      _id: crypto.randomUUID(),
      userId: user._id,
      codeHash: hashResetCode(user._id, code),
      attempts: 0,
      createdAt: now,
      expiresAt,
      usedAt: null
    });

    await sendEmail({
      to: email,
      subject: `${code} is your BudgetFriendly reset code`,
      text: `Use this code to reset your BudgetFriendly password: ${code}\n\nIt expires in ${ttlMin} minutes. If you didn't ask for a reset, you can ignore this email; your password hasn't changed.`,
      html: `<p>Use this code to reset your BudgetFriendly password:</p><p style="font-size:28px;font-weight:600;letter-spacing:6px">${code}</p><p>It expires in ${ttlMin} minutes. If you didn't ask for a reset, you can ignore this email; your password hasn't changed.</p>`
    });

    // Opt-in only, for testing on devices without an email provider configured.
    if (process.env.AUTH_DEV_EXPOSE_RESET_CODE === '1') okBody.devCode = code;

    return sendJson(res, 200, okBody);
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Enter a valid email address', err.issues);
    }
    console.error('[auth/forgot-password] unexpected error', err);
    const details = process.env.NODE_ENV === 'production' ? undefined : String(err?.message ?? err);
    return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error', details);
  }
}
