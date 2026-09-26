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

export function effectiveEndIso(b: { startDate: string; endDate?: string | null; period: string }): string {
  if (b.endDate) return b.endDate;
  if (b.period === 'weekly') return addDaysIso(b.startDate, 6);
  const d = parseIsoDateUtcNoon(b.startDate);
  return formatIsoDateUtc(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)));
}

/** Minutes the app's day is ahead of UTC. West Africa Time (UTC+1) unless APP_TZ_OFFSET_MINUTES says otherwise. */
export function tzOffsetMinutes(): number {
  const offset = Number(Deno.env.get('APP_TZ_OFFSET_MINUTES') ?? 60);
  return Number.isFinite(offset) ? offset : 60;
}

/** Today's calendar date for the app's users. Defaults to West Africa Time (UTC+1); override with APP_TZ_OFFSET_MINUTES. */
export function todayIso(now = new Date()): string {
  return formatIsoDateUtc(new Date(now.getTime() + tzOffsetMinutes() * 60000));
}

/**
 * Day-precise bounds for a budget, for transaction queries.
 *
 * A day here is the person's day, not UTC's. Buying something at half past midnight in Lagos used to land in
 * the day before, and on the 1st of a month in the period before, because the bounds were UTC midnights.
 */
export function budgetBounds(b: { startDate: string; endDate?: string | null; period: string }): { start: Date; end: Date } {
  const shift = tzOffsetMinutes() * 60000;
  const [sy, sm, sd] = b.startDate.split('-').map(Number);
  const [ey, em, ed] = effectiveEndIso(b).split('-').map(Number);
  return {
    start: new Date(Date.UTC(sy, sm - 1, sd, 0, 0, 0, 0) - shift),
    end: new Date(Date.UTC(ey, em - 1, ed, 23, 59, 59, 999) - shift)
  };
}

/** Date-only query values are UTC day boundaries; anything else is parsed as a timestamp. */
export function parseQueryDate(raw: string, mode: 'start' | 'end'): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map((x) => Number(x));
    const shift = tzOffsetMinutes() * 60000;
    return mode === 'start'
      ? new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - shift)
      : new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - shift);
  }
  return new Date(raw);
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
