import type { Db } from 'mongodb';
import { collections, type BudgetDoc } from './collections.js';

export type SpaceId = 'personal' | 'business';

/** Filter clause for a space; legacy docs without spaceId count as personal. */
export function spaceClause(spaceId: unknown): Record<string, unknown> | null {
  if (spaceId === 'business') return { spaceId: 'business' };
  if (spaceId === 'personal') return { $or: [{ spaceId: 'personal' }, { spaceId: { $exists: false } }, { spaceId: null }] };
  return null;
}

export function andAll(...clauses: Array<Record<string, unknown> | null | undefined>): Record<string, unknown> {
  const parts = clauses.filter((c): c is Record<string, unknown> => !!c && Object.keys(c).length > 0);
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

/**
 * Budgets the user can see: their own (in the requested space) plus household budgets shared with them.
 * Shared budgets live in the member's personal space.
 */
export function visibleBudgetsFilter(userId: string, spaceId?: unknown): Record<string, unknown> {
  const own = andAll({ userId }, spaceClause(spaceId));
  if (spaceId === 'business') return own;
  return { $or: [own, { 'members.userId': userId }] };
}

export function isBudgetMember(b: Pick<BudgetDoc, 'userId' | 'members'>, userId: string): boolean {
  return b.userId === userId || (b.members ?? []).some((m) => m.userId === userId);
}

export function budgetMemberIds(b: Pick<BudgetDoc, 'userId' | 'members'>): string[] {
  return Array.from(new Set([b.userId, ...(b.members ?? []).map((m) => m.userId)]));
}

export async function findVisibleBudget(db: Db, userId: string, budgetId: string): Promise<BudgetDoc | null> {
  const { budgets } = collections(db);
  return budgets.findOne({ _id: budgetId, $or: [{ userId }, { 'members.userId': userId }] });
}

export function toApiBudget(b: BudgetDoc, viewerId: string) {
  const members = b.members ?? [];
  return {
    id: b._id,
    spaceId: b.spaceId ?? 'personal',
    name: b.name,
    totalBudget: b.totalBudget,
    period: b.period,
    startDate: b.startDate,
    endDate: b.endDate ?? null,
    categories: b.categories,
    ownerId: b.userId,
    role: b.userId === viewerId ? 'owner' : 'member',
    isShared: members.length > 0,
    members: members.map((m) => ({ userId: m.userId, role: m.role, name: m.name ?? null, email: m.email, joinedAt: m.joinedAt.toISOString() })),
    rollover: b.rollover
      ? { destination: b.rollover.destination, amount: b.rollover.amount, goalId: b.rollover.goalId ?? null, budgetId: b.rollover.budgetId ?? null, at: b.rollover.at.toISOString() }
      : null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString()
  };
}

/* ------------------------------------------------------------------ dates */

export function parseIsoDateUtcNoon(iso: string): Date {
  const [y, m, d] = iso.split('-').map((n) => Number(n));
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function formatIsoDateUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDateUtcNoon(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return formatIsoDateUtc(d);
}

export function effectiveEndIso(b: Pick<BudgetDoc, 'startDate' | 'endDate' | 'period'>): string {
  if (b.endDate) return b.endDate;
  if (b.period === 'weekly') return addDaysIso(b.startDate, 6);
  const d = parseIsoDateUtcNoon(b.startDate);
  return formatIsoDateUtc(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)));
}

/**
 * Today's calendar date for the app's users. Defaults to West Africa Time (UTC+1);
 * override with APP_TZ_OFFSET_MINUTES.
 */
export function todayIso(now = new Date()): string {
  const offset = Number(process.env.APP_TZ_OFFSET_MINUTES ?? 60);
  return formatIsoDateUtc(new Date(now.getTime() + (Number.isFinite(offset) ? offset : 60) * 60000));
}

/** Day-precise bounds for a budget, as Dates, for transaction queries. */
export function budgetBounds(b: Pick<BudgetDoc, 'startDate' | 'endDate' | 'period'>): { start: Date; end: Date } {
  const [sy, sm, sd] = b.startDate.split('-').map(Number);
  const [ey, em, ed] = effectiveEndIso(b).split('-').map(Number);
  return { start: new Date(Date.UTC(sy, sm - 1, sd, 0, 0, 0, 0)), end: new Date(Date.UTC(ey, em - 1, ed, 23, 59, 59, 999)) };
}
