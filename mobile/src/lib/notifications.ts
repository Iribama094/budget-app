import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PUSH_TOKEN_KEY = 'bf_push_token_v1';
const WEEKLY_ID = 'bf-weekly-checkin';
const BILL_PREFIX = 'bf-bill-';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false
  })
});

export async function ensureNotificationPermission(ask = true): Promise<boolean> {
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
  if (!Device.isDevice) return null;
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
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_ID).catch(() => undefined);
  if (!enabled) return;
  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_ID,
    content: {
      title: 'Your weekly check-in is ready',
      body: 'Two minutes to see how the week went and set up the next one.',
      data: { screen: 'WeeklyCheckInDetail' }
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 1, hour: 18, minute: 0 }
  });
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
        title: `${item.name} is due ${days === 1 ? 'tomorrow' : `in ${days} days`}`,
        body: `${item.amountLabel} is due. Make sure the money is ready.`,
        data: { screen: 'Recurring' }
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when }
    });
    count++;
  }
  return count;
}

export function addNotificationTapListener(onOpen: (data: Record<string, unknown>) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    onOpen((response.notification.request.content.data ?? {}) as Record<string, unknown>);
  });
  return () => sub.remove();
}
