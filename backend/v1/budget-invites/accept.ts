import { z } from 'zod';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendJson } from '../../_lib/http.js';
import { requireUserId } from '../../_lib/user.js';
import { enforceRateLimits } from '../../_lib/rateLimit.js';
import { toApiBudget } from '../../_lib/budgets.js';
import { notifyUser } from '../../_lib/notify.js';

const AcceptSchema = z.object({ code: z.string().trim().min(4).max(12) });

/** POST /v1/budget-invites/accept — join a household budget with a code. */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const userId = await requireUserId(req, res);
  if (!userId) return;

  try {
    const { code: raw } = AcceptSchema.parse(await readJson<unknown>(req));
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const db = await getDb();
    if (!(await enforceRateLimits(db, res, [{ key: `invite-accept:${userId}`, limit: 10, windowSec: 15 * 60 }]))) return;

    const { budgetInvites, budgets, users } = collections(db);
    const invite = await budgetInvites.findOne({ _id: code });
    if (!invite || invite.expiresAt <= new Date() || invite.acceptedBy) {
      return sendError(res, 400, 'INVALID_CODE', 'That code has expired or was already used. Ask for a new one.');
    }

    const budget = await budgets.findOne({ _id: invite.budgetId });
    if (!budget) return sendError(res, 400, 'INVALID_CODE', 'That budget no longer exists.');
    if (budget.userId === userId) return sendError(res, 400, 'VALIDATION_ERROR', 'This is your own budget.');

    const me = await users.findOne({ _id: userId }, { projection: { name: 1, email: 1 } });
    const now = new Date();

    if (!(budget.members ?? []).some((m) => m.userId === userId)) {
      await budgets.updateOne(
        { _id: budget._id },
        { $push: { members: { userId, role: 'member', name: me?.name ?? null, email: me?.email ?? '', joinedAt: now } }, $set: { updatedAt: now } }
      );
    }
    await budgetInvites.updateOne({ _id: code }, { $set: { acceptedBy: userId, acceptedAt: now } });

    const label = budget.name.replace(/^My Budget \((.*)\)$/, '$1');
    await notifyUser(db, budget.userId, {
      kind: 'shared',
      title: `${me?.name || me?.email || 'Someone'} joined ${label}`,
      body: 'Their spending in this budget now counts toward it.',
      data: { screen: 'BudgetDetail', budgetId: budget._id }
    }).catch(() => undefined);

    const updated = await budgets.findOne({ _id: budget._id });
    return sendJson(res, 200, { budget: toApiBudget(updated!, userId) });
  } catch (err: any) {
    if (err?.name === 'ZodError') return sendError(res, 400, 'VALIDATION_ERROR', 'Enter the code you were sent', err.issues);
    console.error('[budget-invites/accept] failed', err);
    return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error');
  }
}
