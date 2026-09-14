import postgres from 'npm:postgres@3.4.9';

const url = Deno.env.get('SUPABASE_DB_URL');
if (!url) throw new Error('SUPABASE_DB_URL is not set');

/**
 * One small pool per function instance. Columns come back camelCased, numerics as numbers
 * and dates as "YYYY-MM-DD" strings, which is the shape the app already uses.
 */
export const sql = postgres(url, {
  prepare: false,
  max: 4,
  idle_timeout: 20,
  connect_timeout: 10,
  transform: postgres.camel,
  types: {
    numeric: { to: 1700, from: [1700], serialize: (v: unknown) => String(v), parse: (v: string) => Number(v) },
    date: { to: 1082, from: [1082], serialize: (v: unknown) => String(v), parse: (v: string) => v },
    bigint: { to: 20, from: [20], serialize: (v: unknown) => String(v), parse: (v: string) => Number(v) }
  }
});

export type Sql = typeof sql;
/** A composable sql`` fragment, e.g. an extra WHERE condition. */
export type Fragment = postgres.PendingQuery<any>;

/** Postgres unique_violation. */
export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === '23505';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export const iso = (d: Date | string | null | undefined): string | null => (d == null ? null : new Date(d).toISOString());
