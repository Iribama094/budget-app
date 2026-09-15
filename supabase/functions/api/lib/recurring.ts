import { sql } from './db.ts';
import { addDaysIso, formatIsoDateUtc, parseIsoDateUtcNoon, todayIso } from './dates.ts';
import { budgetCovering } from './budgets.ts';
import { afterTransactionCreated } from './effects.ts';
import { currencyFor, formatMoney, notifyUser } from './notify.ts';
import { voice } from './voice.ts';
import type { Space } from './http.ts';

// Catch up at most this many missed occurrences per run (e.g. after a long outage).
const MAX_CATCH_UP = 24;

export type Frequency = 'weekly' | 'monthly' | 'yearly';

export type RecurringRow = {
  id: string;
  userId: string;
  spaceId: Space;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string;
  frequency: Frequency;
  anchorDay: number | null;
  nextDueDate: string;
  endDate: string | null;
  autoCreate: boolean;
  remindDaysBefore: number;
  budgetCategory: string | null;
  paused: boolean;
  lastCreatedFor: string | null;
  lastRemindedFor: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Next due date after `iso`. Monthly and yearly schedules keep their anchor day where the month allows. */
export function nextOccurrence(iso: string, frequency: Frequency, anchorDay?: number | null): string {
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

/**
 * Advances a schedule through every due date up to `today`. Each occurrence is claimed atomically
 * and the created transaction carries a deterministic clientId, so concurrent runs can't double-create.
 */
export async function materializeDue(rec: RecurringRow, today = todayIso()): Promise<number> {
  let current: RecurringRow | null = rec;
  let created = 0;
  let lastAmount = 0;

  for (let i = 0; i < MAX_CATCH_UP && current; i++) {
    if (current.paused || current.nextDueDate > today) break;
    if (current.endDate && current.nextDueDate > current.endDate) {
      await sql`update public.recurring set paused = true where id = ${current.id}`;
      break;
    }

    const due: string = current.nextDueDate;
    const next = nextOccurrence(due, current.frequency, current.anchorDay);
    const [claimed]: RecurringRow[] = await sql<RecurringRow[]>`
      update public.recurring set
        next_due_date = ${next}::date,
        last_created_for = case when auto_create then ${due}::date else last_created_for end
      where id = ${current.id} and next_due_date = ${due}::date and not paused
      returning *
    `;
    if (!claimed) break;

    if (current.autoCreate) {
      // Only expenses attach to a budget; recurring income shouldn't silently grow budget totals.
      const budgetId = current.type === 'expense' ? await budgetCovering(current.userId, current.spaceId ?? 'personal', due) : null;
      const [tx] = await sql`
        insert into public.transactions
          (user_id, space_id, type, amount, category, description, budget_id, budget_category, client_id, recurring_id, occurred_at)
        values
          (${current.userId}, ${current.spaceId ?? 'personal'}, ${current.type}, ${current.amount}, ${current.category},
           ${current.description || current.category}, ${budgetId}, ${budgetId ? current.budgetCategory ?? null : null},
           ${`recurring:${current.id}:${due}`}, ${current.id}, ${new Date(`${due}T11:00:00.000Z`)})
        on conflict (user_id, client_id) do nothing
        returning id, user_id, space_id, type, amount, budget_id, budget_category
      `;
      if (tx) {
        created++;
        lastAmount = Number(current.amount);
        await afterTransactionCreated(tx as any);
      }
    }
    current = claimed;
  }

  if (created > 0) {
    const currency = await currencyFor(rec.userId);
    const name = rec.description || rec.category;
    await notifyUser(rec.userId, {
      kind: 'recurring',
      ...voice.recurringRecorded(name, formatMoney(lastAmount, currency), rec.type === 'income', created),
      spaceId: rec.spaceId === 'business' ? 'business' : 'personal',
      data: { screen: 'Recurring', recurringId: rec.id }
    });
  }
  return created;
}

export async function runRecurringForUser(userId: string, today = todayIso()): Promise<number> {
  const due = await sql<RecurringRow[]>`
    select * from public.recurring where user_id = ${userId} and not paused and next_due_date <= ${today}::date
  `;
  let created = 0;
  for (const rec of due) created += await materializeDue(rec, today);
  return created;
}

export async function runAllDueRecurring(today = todayIso()): Promise<{ schedules: number; created: number }> {
  const due = await sql<RecurringRow[]>`
    select * from public.recurring where not paused and next_due_date <= ${today}::date limit 5000
  `;
  let created = 0;
  for (const rec of due) {
    try {
      created += await materializeDue(rec, today);
    } catch (err) {
      console.error('[recurring] failed for', rec.id, err);
    }
  }
  return { schedules: due.length, created };
}

/** Pushes "bill due soon" reminders once per occurrence, `remindDaysBefore` days ahead. */
export async function sendBillReminders(today = todayIso()): Promise<number> {
  const upcoming = await sql<RecurringRow[]>`
    select * from public.recurring
    where not paused and type = 'expense' and remind_days_before > 0
      and next_due_date > ${today}::date and next_due_date <= ${addDaysIso(today, 14)}::date
      and (last_reminded_for is null or last_reminded_for <> next_due_date)
      and next_due_date - remind_days_before <= ${today}::date
    limit 5000
  `;
  let sent = 0;
  for (const rec of upcoming) {
    const claimed = await sql`
      update public.recurring set last_reminded_for = next_due_date
      where id = ${rec.id} and next_due_date = ${rec.nextDueDate}::date
        and (last_reminded_for is null or last_reminded_for <> next_due_date)
      returning id
    `;
    if (!claimed.length) continue;

    const currency = await currencyFor(rec.userId);
    const name = rec.description || rec.category;
    await notifyUser(rec.userId, {
      kind: 'bill',
      ...voice.billDue(name, describeDue(rec.nextDueDate, today), formatMoney(Number(rec.amount), currency), rec.autoCreate),
      data: { screen: 'Recurring', recurringId: rec.id }
    });
    sent++;
  }
  return sent;
}

export function toApiRecurring(r: RecurringRow) {
  return {
    id: r.id,
    spaceId: r.spaceId ?? 'personal',
    type: r.type,
    amount: Number(r.amount),
    category: r.category,
    description: r.description,
    frequency: r.frequency,
    nextDueDate: r.nextDueDate,
    endDate: r.endDate ?? null,
    autoCreate: r.autoCreate,
    remindDaysBefore: r.remindDaysBefore,
    budgetCategory: r.budgetCategory ?? null,
    paused: r.paused,
    lastCreatedFor: r.lastCreatedFor ?? null,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString()
  };
}
