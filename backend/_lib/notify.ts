import crypto from 'crypto';
import type { Db } from 'mongodb';
import { collections, type NotificationKind, type NotificationPrefs } from './collections.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  paceAlerts: true,
  billReminders: true,
  weeklyCheckIn: true,
  autoSave: true
};

const PREF_FOR_KIND: Partial<Record<NotificationKind, keyof NotificationPrefs>> = {
  pace: 'paceAlerts',
  over: 'paceAlerts',
  bill: 'billReminders',
  recurring: 'billReminders',
  autosave: 'autoSave',
  weekly: 'weeklyCheckIn'
};

export async function getNotificationPrefs(db: Db, userId: string): Promise<NotificationPrefs> {
  const { users } = collections(db);
  const u = await users.findOne({ _id: userId }, { projection: { notificationPrefs: 1 } });
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(u?.notificationPrefs ?? {}) };
}

/** Sends through Expo's push service and forgets tokens for uninstalled apps. */
export async function sendPushToUser(db: Db, userId: string, msg: { title: string; body: string; data?: Record<string, unknown> }): Promise<void> {
  const { pushTokens } = collections(db);
  const tokens = await pushTokens.find({ userId }).toArray();
  if (!tokens.length) return;

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {})
      },
      body: JSON.stringify(tokens.map((t) => ({ to: t._id, title: msg.title, body: msg.body, data: msg.data ?? {}, sound: 'default' })))
    });
    const json: any = await res.json().catch(() => null);
    const tickets: any[] = Array.isArray(json?.data) ? json.data : [];
    const dead = tickets
      .map((t, i) => (t?.status === 'error' && t?.details?.error === 'DeviceNotRegistered' ? tokens[i]?._id : null))
      .filter((x): x is string => !!x);
    if (dead.length) await pushTokens.deleteMany({ _id: { $in: dead } });
  } catch (err) {
    console.error('[push] send failed', err);
  }
}

/**
 * Records an in-app notification and pushes it if the user's preferences allow.
 * With a dedupeKey, the same alert is sent at most once per dedupeTtlSec.
 * Returns false when the alert was de-duplicated.
 */
export async function notifyUser(
  db: Db,
  userId: string,
  n: { kind: NotificationKind; title: string; body: string; data?: Record<string, unknown>; dedupeKey?: string; dedupeTtlSec?: number }
): Promise<boolean> {
  const { alertLog, notifications } = collections(db);
  const now = new Date();

  if (n.dedupeKey) {
    try {
      await alertLog.insertOne({
        _id: `${userId}:${n.dedupeKey}`,
        userId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + (n.dedupeTtlSec ?? 60 * 60 * 24) * 1000)
      });
    } catch (err: any) {
      if (err?.code === 11000) return false;
      throw err;
    }
  }

  await notifications.insertOne({
    _id: crypto.randomUUID(),
    userId,
    kind: n.kind,
    title: n.title,
    body: n.body,
    data: n.data ?? null,
    readAt: null,
    createdAt: now
  });

  const pref = PREF_FOR_KIND[n.kind];
  const prefs = pref ? await getNotificationPrefs(db, userId) : null;
  if (!pref || prefs![pref]) {
    await sendPushToUser(db, userId, { title: n.title, body: n.body, data: { ...(n.data ?? {}), kind: n.kind } });
  }
  return true;
}
