import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PUSH_TOKEN_KEY = 'bf_push_token_v1';
const WEEKLY_ID = 'bf-weekly-checkin';
const BILL_PREFIX = 'bf-bill-';

/**
 * Expo Go on Android dropped remote push in SDK 53, and just loading expo-notifications there throws
 * while modules load, so the whole module is skipped in that one case and every helper becomes a no-op.
 * Development and store builds are unaffected.
 */
export const notificationsSupported = !(Platform.OS === 'android' && isRunningInExpoGo());

const Notifications: typeof import('expo-notifications') | null = notificationsSupported ? require('expo-notifications') : null;

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false
  })
});

export async function ensureNotificationPermission(ask = true): Promise<boolean> {
  if (!Notifications) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Budget alerts',
      importance: Notifications.AndroidImportance.DEFAULT
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!ask || !current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

function easProjectId(): string | null {
  return (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId ?? null;
}

/**
 * Expo push token for this device, or null when push can't work here
 * (simulator, no EAS project id configured, or permission denied).
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (!Notifications || !Device.isDevice) return null;
  const projectId = easProjectId();
  if (!projectId) return null;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

export async function rememberPushToken(token: string | null): Promise<void> {
  if (token) await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  else await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
}

export async function getRememberedPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(PUSH_TOKEN_KEY);
}

/** Sunday 18:00 on this phone's clock. */
export async function scheduleWeeklyCheckIn(enabled: boolean): Promise<void> {
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_ID).catch(() => undefined);
  if (!enabled) return;
  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_ID,
    content: {
      title: 'Your week in money is ready, Boss 📊',
      body: 'Two minutes to see how you did and set up next week.',
      data: { screen: 'WeeklyCheckInDetail' }
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 1, hour: 18, minute: 0 }
  });
}

const DAILY_ID = 'bf-daily-log';
const DAILY_KEY = 'bf_daily_reminder_v1';

export type DailyReminder = { hour: number; minute: number } | null;

export async function getDailyReminder(): Promise<DailyReminder> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_KEY);
    return raw ? (JSON.parse(raw) as DailyReminder) : null;
  } catch {
    return null;
  }
}

// A different nudge for each day of the week (index 0 = Sunday), so the daily reminder never feels stale.
const DAILY_COPY: Array<{ title: string; body: string }> = [
  { title: 'Sunday check-in, Boss 🙌', body: 'How the week go? Log anything you missed before the new week starts.' },
  { title: 'New week, new money moves 💼', body: 'Log today’s spending so your plan stays on point.' },
  { title: 'Boss, quick one 👋', body: 'Wetin you spend today? Two minutes to log am.' },
  { title: 'Midweek check ✨', body: 'Log today’s spending and see what’s still safe to spend.' },
  { title: 'Chief, no forget o', body: 'Log today’s spending before e slip your mind.' },
  { title: 'Na Friday o 🎉', body: 'Enjoy yourself, but log am so weekend no scatter the budget.' },
  { title: 'Saturday vibes 😎', body: 'Spent anything today? Log it quick, then relax.' }
];

/** A daily nudge to log spending, on this phone's clock. Returns false if notifications aren't allowed. */
export async function setDailyReminder(time: DailyReminder): Promise<boolean> {
  if (!Notifications) return false;
  await Promise.all(
    [DAILY_ID, ...DAILY_COPY.map((_, i) => `${DAILY_ID}-${i}`)].map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined))
  );
  if (!time) {
    await AsyncStorage.removeItem(DAILY_KEY);
    return true;
  }
  if (!(await ensureNotificationPermission(true))) return false;
  for (let i = 0; i < DAILY_COPY.length; i++) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${DAILY_ID}-${i}`,
      content: { ...DAILY_COPY[i], data: { screen: 'AddTransaction' } },
      // Expo weekdays run 1 (Sunday) to 7 (Saturday).
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: i + 1, hour: time.hour, minute: time.minute }
    });
  }
  await AsyncStorage.setItem(DAILY_KEY, JSON.stringify(time));
  return true;
}

export type ReminderItem = {
  id: string;
  name: string;
  amountLabel: string;
  nextDueDate: string;
  remindDaysBefore: number;
  paused: boolean;
  type: 'income' | 'expense';
};

/**
 * On-device bill reminders, used when server push isn't available on this phone.
 * Replaces all previously scheduled bill reminders.
 */
export async function scheduleLocalBillReminders(items: ReminderItem[], enabled: boolean): Promise<number> {
  if (!Notifications) return 0;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => n.identifier.startsWith(BILL_PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
  if (!enabled) return 0;

  let count = 0;
  const now = Date.now();
  for (const item of items) {
    if (item.paused || item.type !== 'expense' || item.remindDaysBefore <= 0) continue;
    const [y, m, d] = item.nextDueDate.split('-').map(Number);
    const when = new Date(y, m - 1, d - item.remindDaysBefore, 9, 0, 0);
    if (when.getTime() <= now) continue;
    const days = item.remindDaysBefore;
    await Notifications.scheduleNotificationAsync({
      identifier: `${BILL_PREFIX}${item.id}`,
      content: {
        title: `Heads up, Boss: ${item.name} is due ${days === 1 ? 'tomorrow' : `in ${days} days`}`,
        body: `${item.amountLabel}. Make sure the money dey ground.`,
        data: { screen: 'Recurring' }
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when }
    });
    count++;
  }
  return count;
}

export function addNotificationTapListener(onOpen: (data: Record<string, unknown>) => void): () => void {
  if (!Notifications) return () => undefined;
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    onOpen((response.notification.request.content.data ?? {}) as Record<string, unknown>);
  });
  return () => sub.remove();
}
