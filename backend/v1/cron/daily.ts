import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { sendError, sendJson } from '../../_lib/http.js';
import { todayIso } from '../../_lib/budgets.js';
import { runAllDueRecurring, sendBillReminders } from '../../_lib/recurring.js';
import { syncBankLink } from '../../_lib/bankSync.js';
import { monoConfigured } from '../../_lib/mono.js';

const HOUR_MS = 60 * 60 * 1000;

/**
 * GET /v1/cron/daily. Scheduled by vercel.json. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 * Records due recurring transactions, sends bill reminders and refreshes live bank connections.
 * The weekly check-in reminder is scheduled on each phone, in its own time zone.
 */
export default async function handler(req: any, res: any) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return sendError(res, 500, 'NOT_CONFIGURED', 'CRON_SECRET is not set');
  if (req.headers?.authorization !== `Bearer ${secret}`) return sendError(res, 401, 'UNAUTHORIZED', 'Invalid cron secret');

  const db = await getDb();
  const today = todayIso();
  const summary: Record<string, unknown> = { today };

  summary.recurring = await runAllDueRecurring(db, today);
  summary.billReminders = await sendBillReminders(db, today);

  if (monoConfigured()) {
    const { bankLinks } = collections(db);
    const stale = await bankLinks
      .find({ provider: 'mono', status: { $ne: 'reauth_required' }, $or: [{ lastSyncedAt: null }, { lastSyncedAt: { $lt: new Date(Date.now() - 12 * HOUR_MS) } }] })
      .limit(300)
      .toArray();
    let imported = 0;
    let failed = 0;
    for (const link of stale) {
      try {
        imported += (await syncBankLink(db, link)).imported;
      } catch {
        failed++;
      }
    }
    summary.bankSync = { links: stale.length, imported, failed };
  }

  return sendJson(res, 200, summary);
}
