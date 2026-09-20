import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  AlertTriangle,
  ArrowRightLeft,
  Bell,
  Briefcase,
  CalendarCheck,
  CalendarClock,
  FileText,
  Landmark,
  Lightbulb,
  PiggyBank,
  Receipt,
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
import { getBusinessSettings, updateBusinessSettings } from '../api/business';
import { useTheme } from '../contexts/ThemeContext';
import { SPACE_LOOK, useSpace } from '../contexts/SpaceContext';
import { useNotificationBadges } from '../contexts/NotificationBadgeContext';
import { EmptyState, IconButton, IconTile, InfoTip, InlineError, ListCard, Screen, ScreenHeader, TextButton } from '../components/Common/ui';
import { scheduleWeeklyCheckIn } from '../lib/notifications';
import { formatRelativeDay } from '../utils/format';
import { type } from '../theme/typography';
import { GuideAnchor } from '../components/Common/GuideAnchor';
import { goBackOrHome } from '../navigation/goBack';

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
  rollover: ArrowRightLeft,
  insight: Lightbulb,
  invoice: FileText,
  tax: Receipt,
  household: Users
};

const TAB_SCREENS: Record<string, string> = { Dashboard: 'Dashboard', Budget: 'Budget', Analytics: 'Analytics', Goals: 'Goals' };

/** filingReminders lives in the business settings; the rest are account notification preferences. */
type PrefKey = keyof NotificationPrefs | 'filingReminders';
type PrefRow = { key: PrefKey; title: string; body: string };

const PERSONAL_PREFS: PrefRow[] = [
  { key: 'paceAlerts', title: 'Budget pace alerts', body: 'When part of your budget spends faster than the month or goes over' },
  { key: 'billReminders', title: 'Bills and recurring', body: 'Before bills are due and when payments are recorded' },
  { key: 'autoSave', title: 'Goal savings reminders', body: 'A nudge to move money to your goals when income lands' },
  { key: 'sharedActivity', title: 'Shared budget activity', body: 'A morning summary of what others spent in budgets you share' },
  { key: 'weeklyCheckIn', title: 'Weekly check-in and tips', body: 'Sunday evening, plus the occasional money tip' }
];

const BUSINESS_PREFS: PrefRow[] = [
  { key: 'invoiceReminders', title: 'Customers who owe you', body: 'Before an invoice is due and when it goes overdue' },
  { key: 'billReminders', title: 'Supplier bills and regular costs', body: 'Before a bill is due and when a recurring cost is recorded' },
  { key: 'filingReminders', title: 'VAT and PAYE dates', body: 'A nudge before filing deadlines' },
  { key: 'paceAlerts', title: 'Cost alerts', body: 'When business spending runs ahead of plan or goes over' },
  { key: 'weeklyCheckIn', title: 'Business tips', body: 'Cash, runway and profit insights, at most once a week' }
];

function sameDay(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export default function NotificationsScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const { setHasUnreadNotifications } = useNotificationBadges();
  const isBusiness = spacesEnabled && activeSpaceId === 'business';
  const spaceId = spacesEnabled ? activeSpaceId : undefined;
  const look = SPACE_LOOK.business;

  const [items, setItems] = useState<ApiNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [filing, setFiling] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listNotifications({ spaceId });
      setItems(res.items);
      setUnread(res.unread);
      setHasUnreadNotifications(res.unread > 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, [setHasUnreadNotifications, spaceId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const togglePrefs = async () => {
    const next = !showPrefs;
    setShowPrefs(next);
    if (!next) return;
    if (!prefs) setPrefs(await getNotificationPrefs().catch(() => null));
    if (isBusiness && filing === null) setFiling(await getBusinessSettings().then((s) => s.filingReminders).catch(() => null));
  };

  const setPref = async (key: PrefKey, value: boolean) => {
    if (key === 'filingReminders') {
      const previous = filing;
      setFiling(value);
      try {
        setFiling((await updateBusinessSettings({ filingReminders: value })).filingReminders);
      } catch {
        setFiling(previous);
      }
      return;
    }
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
    await markNotificationsRead(undefined, spaceId).catch(() => undefined);
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
    else nav.navigate(screen, { ...(n.data ?? {}) });
  };

  const rows = isBusiness ? BUSINESS_PREFS : PERSONAL_PREFS;
  const valueFor = (key: PrefKey): boolean | null => (key === 'filingReminders' ? filing : prefs ? prefs[key] : null);

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
              title={isBusiness ? 'Business alerts' : 'Notifications'}
              subtitle={isBusiness ? 'Invoices, bills, tax dates and cost alerts' : spacesEnabled ? 'Your personal money alerts' : undefined}
              onBack={() => goBackOrHome(nav)}
              right={
                <IconButton accessibilityLabel={showPrefs ? 'Hide notification settings' : 'Notification settings'} onPress={() => void togglePrefs()}>
                  <Settings2 color={showPrefs ? theme.colors.primary : theme.colors.text} size={19} />
                </IconButton>
              }
            />

            {isBusiness ? (
              <View style={[styles.banner, { backgroundColor: look.bg }]}>
                <IconTile bg={look.soft} size={34}>
                  <Briefcase color={look.accent} size={17} />
                </IconTile>
                <Text style={[type.small, { color: look.onBg, flex: 1 }]}>Showing alerts for your business. Switch to Personal on Home to see your personal ones.</Text>
              </View>
            ) : null}

            {showPrefs ? (
              <>
                <GuideAnchor id="notifications.prefs">
                <ListCard style={{ marginTop: 12 }}>
                  {prefs ? (
                    rows.map((row) => {
                      const value = valueFor(row.key);
                      return (
                        <View key={row.key} style={styles.prefRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{row.title}</Text>
                            <Text style={[type.caption, { color: theme.colors.textMuted }]}>{row.body}</Text>
                          </View>
                          <Switch
                            value={!!value}
                            disabled={value === null}
                            onValueChange={(v) => void setPref(row.key, v)}
                            trackColor={{ true: isBusiness ? look.accent : theme.colors.primary, false: theme.colors.border }}
                            thumbColor="#FFFFFF"
                          />
                        </View>
                      );
                    })
                  ) : (
                    <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 16 }} />
                  )}
                </ListCard>
                </GuideAnchor>
                {spacesEnabled ? (
                  <InfoTip
                    style={{ marginTop: 6, marginLeft: 4 }}
                    text={
                      isBusiness
                        ? 'Bill reminders, cost alerts and weekly tips use the same switch in both spaces, so turning one off here turns it off for Personal too. Invoice and tax reminders are business-only.'
                        : 'Customer invoice, VAT and PAYE reminders are set in the Business space. Bill reminders, pace alerts and weekly tips are shared between both spaces.'
                    }
                  >
                    {isBusiness ? 'Some switches are shared with Personal' : 'Business alerts are set in the Business space'}
                  </InfoTip>
                ) : null}
              </>
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
          const brass = item.kind === 'pace' || item.kind === 'invoice' || item.kind === 'tax';
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
                  backgroundColor: item.read ? theme.colors.surface : isBusiness ? theme.colors.brassSoft : theme.colors.primarySoft,
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
              <IconTile bg={warn ? theme.colors.errorSoft : brass ? theme.colors.brassSoft : theme.colors.surfaceAlt} size={38}>
                <Icon color={warn ? theme.colors.error : brass ? theme.colors.brass : theme.colors.primary} size={18} />
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
              {!item.read ? <View style={[styles.dot, { backgroundColor: isBusiness ? theme.colors.brass : theme.colors.primary }]} /> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 32 }} />
          ) : (
            <View style={{ marginTop: 18 }}>
              {isBusiness ? (
                <EmptyState title="No business alerts yet" body="Invoice reminders, supplier bills, VAT and PAYE dates and cost alerts will show up here." />
              ) : (
                <EmptyState title="You’re all caught up" body="Budget alerts, bill reminders and goal updates will show up here." />
              )}
            </View>
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, marginTop: 12 },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 }
});
