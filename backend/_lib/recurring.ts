import crypto from 'crypto';
import type { Db } from 'mongodb';
import { collections, type RecurringDoc, type RecurringFrequency } from './collections.js';
import { addDaysIso, andAll, effectiveEndIso, formatIsoDateUtc, parseIsoDateUtcNoon, spaceClause, todayIso } from './budgets.js';
import { currencyFor, formatMoney } from './money.js';
import { notifyUser } from './notify.js';
import { afterTransactionCreated } from './transactionEffects.js';

// Catch up at most this many missed occurrences per run (e.g. after a long outage).
const MAX_CATCH_UP = 24;

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Next due date after `iso`. Monthly and yearly schedules keep their anchor day where the month allows. */
export function nextOccurrence(iso: string, frequency: RecurringFrequency, anchorDay?: number | null): string {
  if (frequency === 'weekly') return addDaysIso(iso, 7);
  const d = parseIsoDateUtcNoon(iso);
  const year = frequency === 'yearly' ? d.getUTCFullYear() + 1 : d.getUTCFullYear() + (d.getUTCMonth() === 11 ? 1 : 0);
  const month = frequency === 'yearly' ? d.getUTCMonth() : (d.getUTCMonth() + 1) % 12;
  const day = Math.min(anchorDay ?? d.getUTCDate(), daysInMonth(year, month));
  return formatIsoDateUtc(new Date(Date.UTC(year, month, day, 12)));
}

export function describeDue(dueIso: string, today = todayIso()): string {
  const diff = Math.round((parseIsoDateUtcNoon(dueIso).getTime() - parseIsoDateUtcNoon(today).getTime()) / 86400000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return `in ${diff} days`;
}

async function budgetCovering(db: Db, rec: RecurringDoc, dateIso: string): Promise<string | null> {
  const { budgets } = collections(db);
  const candidates = await budgets
    .find(andAll({ userId: rec.userId, startDate: { $lte: dateIso } }, spaceClause(rec.spaceId ?? 'personal')))
    .sort({ startDate: -1 })
    .limit(12)
    .toArray();
  const hit = candidates.find((b) => effectiveEndIso(b) >= dateIso);
  return hit ? hit._id : null;
}

/**
 * Advances a schedule through every due date up to `today`. Each occurrence is claimed atomically
 * and the created transaction carries a deterministic clientId, so concurrent runs can't double-create.
 */
export async function materializeDue(db: Db, rec: RecurringDoc, today = todayIso()): Promise<number> {
  const { recurring, transactions } = collections(db);
  let current: RecurringDoc | null = rec;
  let created = 0;
  let lastAmount = 0;

  for (let i = 0; i < MAX_CATCH_UP && current; i++) {
    if (current.paused || current.nextDueDate > today) break;
    if (current.endDate && current.nextDueDate > current.endDate) {
      await recurring.updateOne({ _id: current._id }, { $set: { paused: true, updatedAt: new Date() } });
      break;
    }

    const due: string = current.nextDueDate;
    const now = new Date();
    const claimed: RecurringDoc | null = await recurring.findOneAndUpdate(
      { _id: current._id, nextDueDate: due, paused: false },
      { $set: { nextDueDate: nextOccurrence(due, current.frequency, current.anchorDay), updatedAt: now, ...(current.autoCreate ? { lastCreatedFor: due } : {}) } },
      { returnDocument: 'after' }
    );
    if (!claimed) break;

    if (current.autoCreate) {
      // Only expenses attach to a budget; recurring income shouldn't silently grow budget totals.
      const budgetId = current.type === 'expense' ? await budgetCovering(db, current, due) : null;
      const tx = {
        _id: crypto.randomUUID(),
        userId: current.userId,
        spaceId: current.spaceId ?? 'personal',
        type: current.type,
        amount: current.amount,
        category: current.category,
        description: current.description || current.category,
        budgetId,
        budgetCategory: budgetId ? current.budgetCategory ?? null : null,
        miniBudgetId: null,
        clientId: `recurring:${current._id}:${due}`,
        recurringId: current._id,
        occurredAt: new Date(`${due}T11:00:00.000Z`),
        createdAt: now,
        updatedAt: now
      } as const;
      try {
        await transactions.insertOne({ ...tx });
        created++;
        lastAmount = current.amount;
        await afterTransactionCreated(db, { ...tx });
      } catch (err: any) {
        if (err?.code !== 11000) throw err;
      }
    }
    current = claimed;
  }

  if (created > 0) {
    const currency = await currencyFor(db, rec.userId);
    const name = rec.description || rec.category;
    await notifyUser(db, rec.userId, {
      kind: 'recurring',
      title: created === 1 ? `${name} recorded` : `${name} recorded ${created} times`,
      body: `${formatMoney(lastAmount, currency)} ${rec.type === 'income' ? 'income' : 'expense'} was added automatically from your recurring schedule.`,
      data: { screen: 'Recurring', recurringId: rec._id }
    });
  }
  return created;
}

export async function runRecurringForUser(db: Db, userId: string, today = todayIso()): Promise<number> {
  const { recurring } = collections(db);
  const due = await recurring.find({ userId, paused: false, nextDueDate: { $lte: today } }).toArray();
  let created = 0;
  for (const rec of due) created += await materializeDue(db, rec, today);
  return created;
}

export async function runAllDueRecurring(db: Db, today = todayIso()): Promise<{ schedules: number; created: number }> {
  const { recurring } = collections(db);
  const due = await recurring.find({ paused: false, nextDueDate: { $lte: today } }).limit(5000).toArray();
  let created = 0;
  for (const rec of due) {
    try {
      created += await materializeDue(db, rec, today);
    } catch (err) {
      console.error('[recurring] failed for', rec._id, err);
    }
  }
  return { schedules: due.length, created };
}

/** Pushes "bill due soon" reminders once per occurrence, `remindDaysBefore` days ahead. */
export async function sendBillReminders(db: Db, today = todayIso()): Promise<number> {
  const { recurring } = collections(db);
  const upcoming = await recurring
    .find({ paused: false, type: 'expense', remindDaysBefore: { $gt: 0 }, nextDueDate: { $gt: today, $lte: addDaysIso(today, 14) } })
    .limit(5000)
    .toArray();

  let sent = 0;
  for (const rec of upcoming) {
    if (rec.lastRemindedFor === rec.nextDueDate) continue;
    if (addDaysIso(rec.nextDueDate, -rec.remindDaysBefore) > today) continue;
    const claimed = await recurring.updateOne({ _id: rec._id, lastRemindedFor: { $ne: rec.nextDueDate } }, { $set: { lastRemindedFor: rec.nextDueDate } });
    if (!claimed.modifiedCount) continue;

    const currency = await currencyFor(db, rec.userId);
    const name = rec.description || rec.category;
    await notifyUser(db, rec.userId, {
      kind: 'bill',
      title: `${name} is due ${describeDue(rec.nextDueDate, today)}`,
      body: rec.autoCreate
        ? `${formatMoney(rec.amount, currency)} will be recorded automatically on the due date.`
        : `${formatMoney(rec.amount, currency)} is due. Make sure the money is ready.`,
      data: { screen: 'Recurring', recurringId: rec._id }
    });
    sent++;
  }
  return sent;
}
