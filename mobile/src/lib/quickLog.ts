import { readCache, writeCache } from './localCache';

/**
 * Remembers, on this phone, which categories someone uses most and their last entry, so Add transaction can
 * put their usual categories first and offer "Same as last time". Also counts days in a row with an entry.
 */
export type LastEntry = { category: string; amount: number; description: string };
type Usage = { counts: Record<string, number>; last: LastEntry | null };

const usageKey = (userId: string, space: string, type: string) => `quicklog:${userId}:${space}:${type}`;

export async function loadUsage(userId: string, space: string, type: string): Promise<Usage> {
  return (await readCache<Usage>(usageKey(userId, space, type))) ?? { counts: {}, last: null };
}

export async function recordUsage(userId: string, space: string, type: string, entry: LastEntry): Promise<void> {
  const usage = await loadUsage(userId, space, type);
  usage.counts[entry.category] = (usage.counts[entry.category] ?? 0) + 1;
  usage.last = entry;
  writeCache(usageKey(userId, space, type), usage);
}

/** Most-used first; categories never used keep their usual order. */
export function sortByUsage<T extends { name: string }>(items: T[], counts: Record<string, number>): T[] {
  return items
    .map((item, i) => ({ item, i, n: counts[item.name] ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.item);
}

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Notes that something was logged today and returns the streak if today just reached a milestone
 * (3, 7, 14… days in a row), otherwise null. Only the first entry of a day can hit a milestone.
 */
export async function recordLogDay(userId: string): Promise<number | null> {
  const key = `streak:${userId}`;
  const days = (await readCache<string[]>(key)) ?? [];
  const today = localIso(new Date());
  if (days.includes(today)) return null;
  const next = [...days, today].sort().slice(-120);
  writeCache(key, next);

  let streak = 0;
  const cursor = new Date();
  const set = new Set(next);
  while (set.has(localIso(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return STREAK_MILESTONES.includes(streak) ? streak : null;
}
