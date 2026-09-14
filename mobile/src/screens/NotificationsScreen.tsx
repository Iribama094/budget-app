import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  AlertTriangle,
  ArrowRightLeft,
  Bell,
  CalendarCheck,
  CalendarClock,
  Landmark,
  PiggyBank,
  Repeat,
  Settings2,
  ShieldCheck,
  TrendingUp,
  Users,
  type LucideIcon
} from 'lucide-react-native';

import {
  getNotificationPrefs,
  listNotifications,
  markNotificationsRead,
  updateNotificationPrefs,
  type ApiNotification,
  type NotificationKind,
  type NotificationPrefs
} from '../api/features';
import { useTheme } from '../contexts/ThemeContext';
import { useNotificationBadges } from '../contexts/NotificationBadgeContext';
import { EmptyState, IconButton, IconTile, InlineError, ListCard, Screen, ScreenHeader, TextButton } from '../components/Common/ui';
import { scheduleWeeklyCheckIn } from '../lib/notifications';
import { formatRelativeDay } from '../utils/format';
import { type } from '../theme/typography';

const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  pace: TrendingUp,
  over: AlertTriangle,
  bill: CalendarClock,
  recurring: Repeat,
  autosave: PiggyBank,
  weekly: CalendarCheck,
  shared: Users,
  security: ShieldCheck,
  bank: Landmark,
  rollover: ArrowRightLeft
};

const TAB_SCREENS: Record<string, string> = { Dashboard: 'Dashboard', Budget: 'Budget', Analytics: 'Analytics', Goals: 'Goals' };

const PREF_ROWS: Array<{ key: keyof NotificationPrefs; title: string; body: string }> = [
  { key: 'paceAlerts', title: 'Budget pace alerts', body: 'When a bucket spends faster than the month or goes over' },
  { key: 'billReminders', title: 'Bills and recurring', body: 'Before bills are due and when payments are recorded' },
  { key: 'weeklyCheckIn', title: 'Weekly check-in', body: 'Sunday evening, on this phone' },
  { key: 'autoSave', title: 'Auto-save updates', body: 'When income tops up a goal' }
];

function sameDay(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export default function NotificationsScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { setHasUnreadNotifications } = useNotificationBadges();

  const [items, setItems] = useState<ApiNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listNotifications();
      setItems(res.items);
      setUnread(res.unread);
      setHasUnreadNotifications(res.unread > 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, [setHasUnreadNotifications]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const togglePrefs = async () => {
    const next = !showPrefs;
    setShowPrefs(next);
    if (next && !prefs) setPrefs(await getNotificationPrefs().catch(() => null));
  };

  const setPref = async (key: keyof NotificationPrefs, value: boolean) => {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    try {
      const saved = await updateNotificationPrefs({ [key]: value });
      setPrefs(saved);
      if (key === 'weeklyCheckIn') await scheduleWeeklyCheckIn(value).catch(() => undefined);
    } catch {
      setPrefs(previous);
    }
  };

  const markAll = async () => {
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    setUnread(0);
    setHasUnreadNotifications(false);
    await markNotificationsRead().catch(() => undefined);
  };

  const open = async (n: ApiNotification) => {
    if (!n.read) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      void markNotificationsRead([n.id]).catch(() => undefined);
    }
    const screen = typeof n.data?.screen === 'string' ? n.data.screen : null;
    if (!screen) return;
    if (TAB_SCREENS[screen]) nav.navigate('Main', { screen: TAB_SCREENS[screen] });
    else nav.navigate(screen, { budgetId: n.data?.budgetId, goalId: n.data?.goalId });
  };

  const sections = [
    { title: 'Today', data: items.filter((n) => sameDay(n.createdAt)) },
    { title: 'Earlier', data: items.filter((n) => !sameDay(n.createdAt)) }
  ].filter((s) => s.data.length);

  return (
    <Screen scrollable={false}>
      <SectionList
        sections={sections}
        keyExtractor={(n) => n.id}
        refreshing={loading}
        onRefresh={load}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            <ScreenHeader
              title="Notifications"
              onBack={() => nav.goBack()}
              right={
                <IconButton accessibilityLabel={showPrefs ? 'Hide notification settings' : 'Notification settings'} onPress={() => void togglePrefs()}>
                  <Settings2 color={showPrefs ? theme.colors.primary : theme.colors.text} size={19} />
                </IconButton>
              }
            />
            {showPrefs ? (
              <ListCard style={{ marginTop: 12 }}>
                {prefs ? (
                  PREF_ROWS.map((row) => (
                    <View key={row.key} style={styles.prefRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{row.title}</Text>
                        <Text style={[type.caption, { color: theme.colors.textMuted }]}>{row.body}</Text>
                      </View>
                      <Switch
                        value={prefs[row.key]}
                        onValueChange={(v) => void setPref(row.key, v)}
                        trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                  ))
                ) : (
                  <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 16 }} />
                )}
              </ListCard>
            ) : null}
            {error ? (
              <View style={{ marginTop: 12 }}>
                <InlineError message={error} />
              </View>
            ) : null}
            {unread > 0 ? <TextButton title={`Mark ${unread} as read`} onPress={() => void markAll()} style={{ alignSelf: 'flex-end', marginTop: 4 }} /> : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={[type.eyebrow, { color: theme.colors.textMuted, marginTop: 18, marginBottom: 8, marginLeft: 4 }]}>{section.title}</Text>
        )}
        renderItem={({ item, index, section }) => {
          const Icon = KIND_ICON[item.kind] ?? Bell;
          const warn = item.kind === 'over' || item.kind === 'security';
          const first = index === 0;
          const last = index === section.data.length - 1;
          return (
            <Pressable
              onPress={() => void open(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.read ? '' : 'Unread. '}${item.title}. ${item.body}`}
              style={({ pressed }) => [
                styles.item,
                {
                  backgroundColor: item.read ? theme.colors.surface : theme.colors.primarySoft,
                  borderColor: theme.colors.border,
                  borderTopLeftRadius: first ? 20 : 0,
                  borderTopRightRadius: first ? 20 : 0,
                  borderBottomLeftRadius: last ? 20 : 0,
                  borderBottomRightRadius: last ? 20 : 0,
                  borderTopWidth: first ? StyleSheet.hairlineWidth : 0,
                  opacity: pressed ? 0.8 : 1
                }
              ]}
            >
              <IconTile bg={warn ? theme.colors.errorSoft : item.kind === 'pace' ? theme.colors.brassSoft : theme.colors.surfaceAlt} size={38}>
                <Icon color={warn ? theme.colors.error : item.kind === 'pace' ? theme.colors.brass : theme.colors.primary} size={18} />
              </IconTile>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.titleRow}>
                  <Text style={[type.bodyStrong, { color: theme.colors.text, flex: 1 }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={[type.caption, { color: theme.colors.textMuted }]}>{formatRelativeDay(item.createdAt)}</Text>
                </View>
                <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 2 }]}>{item.body}</Text>
              </View>
              {!item.read ? <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} /> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 32 }} />
          ) : (
            <View style={{ marginTop: 18 }}>
              <EmptyState title="You’re all caught up" body="Budget alerts, bill reminders and goal updates will show up here." />
            </View>
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 }
});
