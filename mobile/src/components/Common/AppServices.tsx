import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useNotificationBadges } from '../../contexts/NotificationBadgeContext';
import { useAuth } from '../../contexts/AuthContext';
import { navigate } from '../../navigation/navigationRef';
import { getNotificationPrefs, listNotifications, registerPushToken } from '../../api/features';
import {
  addNotificationTapListener,
  ensureNotificationPermission,
  getExpoPushToken,
  rememberPushToken,
  scheduleWeeklyCheckIn
} from '../../lib/notifications';

const TAB_SCREENS: Record<string, string> = { Dashboard: 'Dashboard', Budget: 'Budget', Budgets: 'Budget', Analytics: 'Analytics', Goals: 'Goals' };

/** Push registration, the on-device weekly check-in, and opening the right screen from a notification. */
export function AppServices() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { setHasUnreadNotifications } = useNotificationBadges();

  // Keep the bell's unread dot in step with the server feed.
  useEffect(() => {
    if (!userId) return;
    const refresh = () =>
      listNotifications()
        .then((r) => setHasUnreadNotifications(r.unread > 0))
        .catch(() => undefined);
    void refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [setHasUnreadNotifications, userId]);

  useEffect(
    () =>
      addNotificationTapListener((data) => {
        const screen = typeof data.screen === 'string' ? data.screen : null;
        if (!screen) return;
        if (TAB_SCREENS[screen]) {
          navigate('Main', { screen: TAB_SCREENS[screen] });
          return;
        }
        navigate(screen, { budgetId: data.budgetId, goalId: data.goalId, recurringId: data.recurringId });
      }),
    []
  );

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const granted = await ensureNotificationPermission(true);
        if (!granted || cancelled) return;
        const prefs = await getNotificationPrefs().catch(() => null);
        await scheduleWeeklyCheckIn(prefs?.weeklyCheckIn ?? true);
        const token = await getExpoPushToken();
        await rememberPushToken(token);
        if (token && !cancelled) await registerPushToken(token, Platform.OS);
      } catch {
        // notifications are optional; the in-app feed still works
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return null;
}
