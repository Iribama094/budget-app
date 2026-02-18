import { getBearerToken, verifyAccessToken } from './auth.js';
import { getDb } from './mongo.js';
import { collections } from './collections.js';
import { sendError } from './http.js';

export async function requireUserId(req: { headers?: Record<string, unknown> }, res: any): Promise<string | null> {
  const token = getBearerToken(req);
  if (!token) {
    sendError(res, 401, 'UNAUTHORIZED', 'Missing Authorization header');
    return null;
  }

  try {
    const payload = verifyAccessToken(token);
    return payload.sub;
  } catch {
    sendError(res, 401, 'UNAUTHORIZED', 'Invalid or expired token');
    return null;
  }
}

export async function requireUser(req: { headers?: Record<string, unknown> }, res: any) {
  const userId = await requireUserId(req, res);
  if (!userId) return null;

  const db = await getDb();
  const { users } = collections(db);
  const user = await users.findOne({ _id: userId });
  if (!user) {
    sendError(res, 401, 'UNAUTHORIZED', 'User no longer exists');
    return null;
  }

  return user;
}
