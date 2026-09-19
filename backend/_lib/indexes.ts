import type { Db } from 'mongodb';
import { collections } from './collections.js';

let ensured: Promise<void> | null = null;

/** Creates the indexes the app relies on (TTL clean-up, uniqueness, hot queries). Safe to call repeatedly. */
export function ensureIndexes(db: Db): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const c = collections(db);
      await Promise.all([
        // Expired reset codes, rate-limit windows, alert de-dupe keys and sessions clean themselves up.
        c.passwordResets.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 }),
        c.passwordResets.createIndex({ userId: 1, createdAt: -1 }),
        c.rateLimits.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        c.alertLog.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        c.budgetInvites.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 }),
        c.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        c.sessions.createIndex({ userId: 1, revokedAt: 1 }),
        // Offline retries and bank syncs must never create duplicates.
        c.transactions.createIndex({ userId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }),
        c.importedTransactions.createIndex({ userId: 1, externalId: 1 }, { unique: true, partialFilterExpression: { externalId: { $type: 'string' } } }),
        c.transactions.createIndex({ budgetId: 1, occurredAt: -1 }),
        c.transactions.createIndex({ userId: 1, occurredAt: -1 }),
        c.recurring.createIndex({ paused: 1, nextDueDate: 1 }),
        c.recurring.createIndex({ userId: 1 }),
        c.notifications.createIndex({ userId: 1, createdAt: -1 }),
        c.pushTokens.createIndex({ userId: 1 }),
        c.budgets.createIndex({ 'members.userId': 1 }),
        c.goalContributions.createIndex({ goalId: 1, createdAt: -1 })
      ]);
    })().catch((err) => {
      ensured = null;
      console.error('[indexes] could not ensure indexes', err);
    });
  }
  return ensured;
}
