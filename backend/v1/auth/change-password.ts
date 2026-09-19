import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendNoContent } from '../../_lib/http.js';
import { requireUser } from '../../_lib/user.js';
import { parseWith, zPassword } from '../../_lib/validate.js';
import { notifyUser } from '../../_lib/notify.js';

const ChangeSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: zPassword
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const body = await readJson<unknown>(req);
    const input = parseWith(ChangeSchema, body);

    const ok = await bcrypt.compare(input.oldPassword, user.passwordHash);
    if (!ok) return sendError(res, 400, 'INVALID_PASSWORD', 'Your current password is incorrect');

    const db = await getDb();
    const { users } = collections(db);
    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await users.updateOne({ _id: user._id }, { $set: { passwordHash, updatedAt: new Date() } });
    await notifyUser(db, user._id, {
      kind: 'security',
      title: 'Password changed',
      body: 'Your BudgetFriendly password was just changed. If this was not you, reset it now from the sign-in screen.'
    }).catch(() => undefined);

    return sendNoContent(res);
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return sendError(res, 400, 'VALIDATION_ERROR', 'New password must be at least 8 characters', err.issues);
    }
    console.error('[auth/change-password] unexpected error', err);
    const details = process.env.NODE_ENV === 'production' ? undefined : String(err?.message ?? err);
    return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error', details);
  }
}
