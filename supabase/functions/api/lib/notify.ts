import { sql } from './db.ts';

export type NotificationKind =
  | 'pace'
  | 'over'
  | 'bill'
  | 'recurring'
  | 'autosave'
  | 'weekly'
  | 'shared'
  | 'security'
  | 'bank'
  | 'rollover'
  | 'insight'
  | 'invoice'
  | 'tax'
  | 'household';

/** Which space a notification belongs to. null means the whole account (for example security) and shows in both. */
export type NotificationSpace = 'personal' | 'business';

export type NotificationPrefs = {
  paceAlerts: boolean;
  billReminders: boolean;
  weeklyCheckIn: boolean;
  autoSave: boolean;
  invoiceReminders: boolean;
  /** The daily summary of what others spent in budgets you share. */
  sharedActivity: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  paceAlerts: true,
  billReminders: true,
  weeklyCheckIn: true,
  autoSave: true,
  invoiceReminders: true,
  sharedActivity: true
};

// VAT and PAYE ('tax') reminders are switched on and off in the business settings, so they have no preference here.
const PREF_FOR_KIND: Partial<Record<NotificationKind, keyof NotificationPrefs>> = {
  pace: 'paceAlerts',
  over: 'paceAlerts',
  bill: 'billReminders',
  recurring: 'billReminders',
  autosave: 'autoSave',
  weekly: 'weeklyCheckIn',
  insight: 'weeklyCheckIn',
  invoice: 'invoiceReminders'
};

const BUSINESS_SCREENS = new Set(['InvoiceDetail', 'Invoices', 'InvoiceEdit', 'Bills', 'BusinessTax', 'BusinessDetails', 'PayYourself', 'BusinessReports', 'Payroll', 'StatementImport']);

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const SYMBOLS: Record<string, string> = { NGN: '₦', USD: '$', EUR: '€', GBP: '£', GHS: 'GH₵', KES: 'KSh', ZAR: 'R', CAD: '$', INR: '₹' };

/** "₦18,450" for notification copy. Currency may be an ISO code or a symbol. */
export function formatMoney(amount: number, currency?: string | null): string {
  const c = String(currency ?? '').trim();
  const symbol = SYMBOLS[c.toUpperCase()] ?? (c || '₦');
  const n = Math.round(Math.abs(amount));
  return `${amount < 0 ? '−' : ''}${symbol}${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export async function currencyFor(userId: string): Promise<string | null> {
  const [p] = await sql`select currency from public.profiles where id = ${userId}`;
  return p?.currency ?? null;
}

export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const [p] = await sql`select notification_prefs from public.profiles where id = ${userId}`;
  return { ...DEFAULT_NOTIFICATION_PREFS, ...((p?.notificationPrefs as Partial<NotificationPrefs>) ?? {}) };
}

/** Sends through Expo's push service and forgets tokens for uninstalled apps. */
export async function sendPushToUser(userId: string, msg: { title: string; body: string; data?: Record<string, unknown> }): Promise<void> {
  const tokens = await sql<{ token: string }[]>`select token from public.push_tokens where user_id = ${userId}`;
  if (!tokens.length) return;
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(tokens.map((t) => ({ to: t.token, title: msg.title, body: msg.body, data: msg.data ?? {}, sound: 'default' })))
    });
    const out = await res.json().catch(() => null);
    const tickets: any[] = Array.isArray(out?.data) ? out.data : [];
    const dead = tickets
      .map((t, i) => (t?.status === 'error' && t?.details?.error === 'DeviceNotRegistered' ? tokens[i]?.token : null))
      .filter((x): x is string => !!x);
    if (dead.length) await sql`delete from public.push_tokens where token in ${sql(dead)}`;
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
  userId: string,
  n: {
    kind: NotificationKind;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    dedupeKey?: string;
    dedupeTtlSec?: number;
    /** Leave out to infer it from the screen or budget the notification opens. */
    spaceId?: NotificationSpace | null;
  }
): Promise<boolean> {
  if (n.dedupeKey) {
    const ttl = n.dedupeTtlSec ?? 60 * 60 * 24;
    const claimed = await sql`
      insert into public.alert_log (key, user_id, expires_at)
      values (${`${userId}:${n.dedupeKey}`}, ${userId}, now() + make_interval(secs => ${ttl}))
      on conflict (key) do update set created_at = now(), expires_at = excluded.expires_at
        where alert_log.expires_at <= now()
      returning key
    `;
    if (!claimed.length) return false;
  }

  const spaceId = n.spaceId !== undefined ? n.spaceId : await inferSpace(n);

  await sql`
    insert into public.notifications (user_id, space_id, kind, title, body, data)
    values (${userId}, ${spaceId}, ${n.kind}, ${n.title}, ${n.body}, ${n.data ? sql.json(n.data as any) : null})
  `;

  const pref = PREF_FOR_KIND[n.kind];
  if (!pref || (await getNotificationPrefs(userId))[pref]) {
    // spaceId lets the app open the notification in the right space.
    await sendPushToUser(userId, { title: n.title, body: n.body, data: { ...(n.data ?? {}), kind: n.kind, spaceId } });
  }
  return true;
}

/** Security alerts are account-wide; business tools and business budgets are Business; everything else is Personal. */
async function inferSpace(n: { kind: NotificationKind; data?: Record<string, unknown> }): Promise<NotificationSpace | null> {
  if (n.kind === 'security') return null;
  const screen = typeof n.data?.screen === 'string' ? n.data.screen : '';
  if (BUSINESS_SCREENS.has(screen)) return 'business';
  const budgetId = n.data?.budgetId;
  if (typeof budgetId === 'string' && budgetId) {
    const [b] = await sql`select space_id from public.budgets where id::text = ${budgetId}`;
    if (b?.spaceId === 'business') return 'business';
  }
  return 'personal';
}
