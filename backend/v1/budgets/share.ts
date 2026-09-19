import crypto from 'crypto';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, sendError, sendJson } from '../../_lib/http.js';
import { requireUserId } from '../../_lib/user.js';
import { findVisibleBudget } from '../../_lib/budgets.js';
import { notifyUser } from '../../_lib/notify.js';

// No 0/O or 1/I so codes are easy to read out loud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_TTL_DAYS = 7;
const MAX_MEMBERS = 6;

export function newInviteCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  return out;
}

/**
 * GET    /v1/budgets/:id/members             owner + members
 * DELETE /v1/budgets/:id/members/:userId     owner removes someone, or a member leaves
 * POST   /v1/budgets/:id/invites             owner creates a join code
 */
export default async function handler(req: any, res: any) {
  const userId = await requireUserId(req, res);
  if (!userId) return;

  const id = String(req.query?.id ?? '');
  const action = String(req.query?.action ?? '');
  const memberId = req.query?.memberId ? String(req.query.memberId) : null;

  const db = await getDb();
  const { budgets, budgetInvites, users } = collections(db);
  const budget = await findVisibleBudget(db, userId, id);
  if (!budget) return sendError(res, 404, 'NOT_FOUND', 'Budget not found');
  const isOwner = budget.userId === userId;
  const label = budget.name.replace(/^My Budget \((.*)\)$/, '$1');

  if (action === 'members' && req.method === 'GET') {
    const owner = await users.findOne({ _id: budget.userId }, { projection: { name: 1, email: 1 } });
    return sendJson(res, 200, {
      role: isOwner ? 'owner' : 'member',
      items: [
        { userId: budget.userId, role: 'owner', name: owner?.name ?? null, email: owner?.email ?? '', joinedAt: budget.createdAt.toISOString() },
        ...(budget.members ?? []).map((m) => ({ userId: m.userId, role: 'member', name: m.name ?? null, email: m.email, joinedAt: m.joinedAt.toISOString() }))
      ]
    });
  }

  if (action === 'members' && req.method === 'DELETE' && memberId) {
    if (memberId === budget.userId) return sendError(res, 400, 'VALIDATION_ERROR', 'The owner can’t leave their own budget. Delete it instead.');
    if (!isOwner && memberId !== userId) return sendError(res, 403, 'FORBIDDEN', 'Only the owner can remove other members.');
    const result = await budgets.updateOne({ _id: budget._id }, { $pull: { members: { userId: memberId } }, $set: { updatedAt: new Date() } });
    if (!result.modifiedCount) return sendError(res, 404, 'NOT_FOUND', 'Member not found');
    if (memberId !== userId) {
      await notifyUser(db, memberId, { kind: 'shared', title: `You were removed from ${label}`, body: 'You no longer have access to this shared budget.' }).catch(() => undefined);
    }
    return sendJson(res, 200, { ok: true });
  }

  if (action === 'invites' && req.method === 'POST') {
    if (!isOwner) return sendError(res, 403, 'FORBIDDEN', 'Only the owner can invite people.');
    if ((budget.spaceId ?? 'personal') === 'business') return sendError(res, 400, 'VALIDATION_ERROR', 'Business budgets can’t be shared yet.');
    if ((budget.members ?? []).length >= MAX_MEMBERS) return sendError(res, 400, 'VALIDATION_ERROR', `A budget can have up to ${MAX_MEMBERS} members.`);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newInviteCode();
      try {
        await budgetInvites.insertOne({ _id: code, budgetId: budget._id, invitedBy: userId, createdAt: now, expiresAt, acceptedBy: null, acceptedAt: null });
        return sendJson(res, 201, { code, expiresAt: expiresAt.toISOString() });
      } catch (err: any) {
        if (err?.code !== 11000) throw err;
      }
    }
    return sendError(res, 500, 'SERVER_ERROR', 'Could not create an invite code. Try again.');
  }

  return methodNotAllowed(res, ['GET', 'POST', 'DELETE']);
}
