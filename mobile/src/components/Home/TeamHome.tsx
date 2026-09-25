import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Bell, Briefcase, Settings as SettingsIcon } from '../../icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useTeam } from '../../contexts/TeamContext';
import { SPACE_LOOK } from '../../contexts/SpaceContext';
import { useNotificationBadges } from '../../contexts/NotificationBadgeContext';
import { IconButton, InlineError, ListRow, PrimaryButton, Screen, SecondaryButton, formatAmount } from '../Common/ui';
import { PlainHeader, PlainList } from '../Common/PlainList';
import { SpaceSwitcher } from '../Common/SpaceSwitcher';
import { CategoryIcon } from '../Common/CategoryIcon';
import { listTransactions, type ApiTransaction } from '../../api/endpoints';
import { currencySymbol, toIsoDateTime } from '../../utils/format';
import { type } from '../../theme/typography';

const LOOK = SPACE_LOOK.business;

/**
 * Home for someone working in another person's business in a focused role (Sales, Purchases, HR): their job
 * and today's work, nothing else. Managers and accountants get the full business Home instead.
 */
export function TeamHome() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { role, businessName, active } = useTeam();
  const { hasUnreadNotifications } = useNotificationBadges();
  const glyph = currencySymbol(user?.currency);
  const [today, setToday] = useState<ApiTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const kind = role === 'sales' ? 'income' : role === 'purchases' ? 'expense' : null;
  const load = useCallback(async () => {
    if (!kind) return;
    try {
      setError(null);
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const res = await listTransactions({ start: toIsoDateTime(start), end: toIsoDateTime(new Date()), limit: 50, spaceId: 'business', type: kind } as any);
      setToday(res.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load today’s entries');
    }
  }, [kind]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const total = today.reduce((s, t) => s + t.amount, 0);
  const mine = today.filter((t) => t.createdBy === user?.id).length;
  return (
    <Screen onRefresh={load} refreshing={false}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => nav.navigate('Profile')} accessibilityRole="button" accessibilityLabel="Profile" style={[styles.avatar, { backgroundColor: LOOK.soft }]}>
          <Briefcase color={theme.colors.brass} size={18} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[type.bodyStrong, { color: theme.colors.text, fontSize: 16 }]}>
            {businessName} · {active?.roleLabel}
          </Text>
          <View style={{ marginTop: 4 }}>
            <SpaceSwitcher compact />
          </View>
        </View>
        <IconButton round accessibilityLabel="Notifications" badge={hasUnreadNotifications} onPress={() => nav.navigate('Notifications')}>
          <Bell color={theme.colors.text} size={19} />
        </IconButton>
        <IconButton round accessibilityLabel="Settings" onPress={() => nav.navigate('Settings')}>
          <SettingsIcon color={theme.colors.text} size={19} />
        </IconButton>
      </View>

      {error ? <InlineError message={error} /> : null}

      {role === 'sales' ? (
        <>
          <PrimaryButton title="Record a sale" onPress={() => nav.navigate('AddTransaction', { type: 'income' })} style={{ marginTop: 18 }} />
          <SecondaryButton title="Raise an invoice" onPress={() => nav.navigate('InvoiceEdit')} style={{ marginTop: 10 }} />
        </>
      ) : role === 'purchases' ? (
        <>
          <PrimaryButton title="Record a cost" onPress={() => nav.navigate('AddTransaction', { type: 'expense' })} style={{ marginTop: 18 }} />
          <SecondaryButton title="Add a supplier bill" onPress={() => nav.navigate('Bills')} style={{ marginTop: 10 }} />
        </>
      ) : (
        <PrimaryButton title="Staff and pay" onPress={() => nav.navigate('Payroll')} style={{ marginTop: 18 }} />
      )}

      {kind ? (
        <>
          <PlainHeader title={kind === 'income' ? 'Sales today' : 'Costs today'} right={formatAmount(total, glyph)} />
          <PlainList>
            {today.map((t) => (
              <ListRow
                key={t.id}
                icon={<CategoryIcon category={t.category} type={t.type} />}
                title={t.description || t.category}
                subtitle={t.createdBy === user?.id ? 'You' : t.recordedBy ?? 'Owner'}
                right={<Text style={[type.bodyStrong, { color: theme.colors.text }]}>{formatAmount(t.amount, glyph)}</Text>}
                onPress={() => nav.navigate('TransactionDetail', { id: t.id })}
              />
            ))}
          </PlainList>
          <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 10 }]}>
            {today.length ? `${mine} of these ${mine === 1 ? 'was' : 'were'} recorded by you.` : 'Nothing recorded yet today.'}
          </Text>
          <PlainList style={{ marginTop: 18 }}>
            {kind === 'income' ? (
              <ListRow title="Customers" subtitle="Who buys, and who still owes" onPress={() => nav.navigate('Customers')} chevron />
            ) : (
              <ListRow title="Supplier bills" subtitle="What the business owes suppliers" onPress={() => nav.navigate('Bills')} chevron />
            )}
          </PlainList>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }
});
