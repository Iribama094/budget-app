import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, sendError, sendJson } from '../../_lib/http.js';
import { requireUserId } from '../../_lib/user.js';

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
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const userId = await requireUserId(req, res);
  if (!userId) return;

  const db = await getDb();
  const { users } = collections(db);
  const user = await users.findOne({ _id: userId });
  if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'User no longer exists');

  return sendJson(res, 200, { user: toApiUser(user) });
}
