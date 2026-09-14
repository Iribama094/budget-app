import { z } from 'zod';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendJson } from '../../_lib/http.js';
import { requireUserId } from '../../_lib/user.js';
import { DEFAULT_NOTIFICATION_PREFS, getNotificationPrefs } from '../../_lib/notify.js';

const PrefsSchema = z
  .object({
    paceAlerts: z.boolean().optional(),
    billReminders: z.boolean().optional(),
    weeklyCheckIn: z.boolean().optional(),
    autoSave: z.boolean().optional()
  })
  .strict();

const ReadSchema = z.object({ ids: z.array(z.string().max(80)).max(200).optional() });

/**
 * GET   /v1/notifications            feed (newest first) + unread count
 * POST  /v1/notifications/read       mark some (ids) or all as read
 * GET   /v1/notifications/prefs      delivery preferences
 * PATCH /v1/notifications/prefs
 */
export default async function handler(req: any, res: any) {
  const userId = await requireUserId(req, res);
  if (!userId) return;

  const action = req.query?.action ? String(req.query.action) : null;
  const db = await getDb();
  const { notifications, users } = collections(db);

  try {
    if (action === 'prefs') {
      if (req.method === 'GET') return sendJson(res, 200, { prefs: await getNotificationPrefs(db, userId) });
      if (req.method !== 'PATCH') return methodNotAllowed(res, ['GET', 'PATCH']);
      const patch = PrefsSchema.parse(await readJson<unknown>(req));
      const current = await getNotificationPrefs(db, userId);
      const next = { ...DEFAULT_NOTIFICATION_PREFS, ...current, ...patch };
      await users.updateOne({ _id: userId }, { $set: { notificationPrefs: next, updatedAt: new Date() } });
      return sendJson(res, 200, { prefs: next });
    }

    if (action === 'read') {
      if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
      const input = ReadSchema.parse((await readJson<unknown>(req)) ?? {});
      const filter: Record<string, unknown> = { userId, readAt: null };
      if (input.ids?.length) filter._id = { $in: input.ids };
      const result = await notifications.updateMany(filter, { $set: { readAt: new Date() } });
      return sendJson(res, 200, { updated: result.modifiedCount });
    }

    if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
    const before = req.query?.before ? new Date(String(req.query.before)) : null;
    const filter: Record<string, unknown> = { userId };
    if (before && !Number.isNaN(before.getTime())) filter.createdAt = { $lt: before };

    const [items, unread] = await Promise.all([
      notifications.find(filter).sort({ createdAt: -1 }).limit(50).toArray(),
      notifications.countDocuments({ userId, readAt: null })
    ]);
    return sendJson(res, 200, {
      unread,
      items: items.map((n) => ({
        id: n._id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        data: n.data ?? null,
        read: !!n.readAt,
        createdAt: n.createdAt.toISOString()
      }))
    });
  } catch (err: any) {
    if (err?.name === 'ZodError') return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', err.issues);
    console.error('[notifications] failed', err);
    return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error');
  }
}
