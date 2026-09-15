import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Briefcase,
  Eye,
  EyeOff,
  Hourglass,
  Landmark,
  Receipt,
  Settings as SettingsIcon,
  TrendingDown,
  TrendingUp,
  Users
} from 'lucide-react-native';

import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { SPACE_LOOK } from '../../contexts/SpaceContext';
import { useAmountVisibility } from '../../contexts/AmountVisibilityContext';
import { useNotificationBadges } from '../../contexts/NotificationBadgeContext';
import { Amount, Card, EmptyState, IconButton, IconTile, InlineError, ListCard, ListRow, Screen, SectionHeader, formatAmount } from '../Common/ui';
import { SpaceSwitcher } from '../Common/SpaceSwitcher';
import { CategoryIcon } from '../Common/CategoryIcon';
import { InsightCards } from './InsightCards';
import { getAnalyticsSummary, listTransactions, type ApiTransaction } from '../../api/endpoints';
import { currencySymbol, formatRelativeDay, toIsoDate, toIsoDateTime } from '../../utils/format';
import { fonts, type } from '../../theme/typography';

const LOOK = SPACE_LOOK.business;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TAX_KEY = 'bf_business_tax_setaside_v1';
const TAX_RATES = [5, 10, 15, 20, 30];

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Home for the Business space: profit, costs, cash runway, tax set-aside and trends. */
export function BusinessHome() {
  const nav = useNavigation<any>();
  const { user, refreshUser } = useAuth();
  const { theme } = useTheme();
  const { showAmounts, toggleShowAmounts } = useAmountVisibility();
  const { hasUnreadNotifications } = useNotificationBadges();
  const glyph = currencySymbol(user?.currency);
  const hide = !showAmounts;

  const [txs, setTxs] = useState<ApiTransaction[]>([]);
  const [cash, setCash] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taxRate, setTaxRate] = useState(10);

  useEffect(() => {
    AsyncStorage.getItem(TAX_KEY)
      .then((v) => v && setTaxRate(Number(v) || 10))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const all: ApiTransaction[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 10; page++) {
        const res = await listTransactions({ start: toIsoDateTime(start), end: toIsoDateTime(now), limit: 200, cursor, spaceId: 'business' });
        all.push(...(res.items || []));
        if (!res.nextCursor) break;
        cursor = res.nextCursor;
      }
      setTxs(all);
      const summary = await getAnalyticsSummary(toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), toIsoDate(now), { spaceId: 'business' }).catch(() => null);
      setCash(summary ? Number(summary.totalBalance) || 0 : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your business numbers');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const stats = useMemo(() => {
    const now = new Date();
    const keys = Array.from({ length: 6 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)));
    const months = new Map(keys.map((k) => [k, { revenue: 0, costs: 0 }]));
    const costsByCategory = new Map<string, number>();
    const thisKey = keys[5];
    for (const t of txs) {
      const k = monthKey(new Date(t.occurredAt));
      const m = months.get(k);
      if (!m) continue;
      if (t.type === 'income') m.revenue += Number(t.amount);
      else {
        m.costs += Number(t.amount);
        if (k === thisKey) costsByCategory.set(t.category, (costsByCategory.get(t.category) ?? 0) + Number(t.amount));
      }
    }
    const series = keys.map((k) => {
      const m = months.get(k)!;
      return { key: k, label: MONTHS[Number(k.slice(5)) - 1], revenue: m.revenue, costs: m.costs, profit: m.revenue - m.costs };
    });
    const current = series[5];
    const previous = series[4];
    const pastCosts = series.slice(2, 5).map((s) => s.costs).filter((c) => c > 0);
    const avgCosts = pastCosts.length ? pastCosts.reduce((a, b) => a + b, 0) / pastCosts.length : current.costs;
    const margin = current.revenue > 0 ? Math.round((current.profit / current.revenue) * 100) : null;
    const change = previous.profit !== 0 ? Math.round(((current.profit - previous.profit) / Math.abs(previous.profit)) * 100) : null;
    const topCosts = [...costsByCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    return { series, current, avgCosts, margin, change, topCosts };
  }, [txs]);

  const runway = cash != null && stats.avgCosts > 0 ? cash / stats.avgCosts : null;
  const taxSetAside = (Math.max(0, stats.current.profit) * taxRate) / 100;
  const maxBar = Math.max(1, ...stats.series.map((s) => Math.max(s.revenue, s.costs)));
  const payroll = stats.topCosts.find(([c]) => /payroll|salar|staff|wage/i.test(c))?.[1] ?? 0;
  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] || null;

  const cycleTaxRate = () => {
    const next = TAX_RATES[(TAX_RATES.indexOf(taxRate) + 1) % TAX_RATES.length];
    setTaxRate(next);
    AsyncStorage.setItem(TAX_KEY, String(next)).catch(() => undefined);
  };

  return (
    <Screen
      onRefresh={() => {
        void Promise.all([load(), refreshUser()]);
      }}
      refreshing={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => nav.navigate('Profile')} accessibilityRole="button" accessibilityLabel="Profile" style={[styles.avatar, { backgroundColor: LOOK.soft }]}>
          <Briefcase color={LOOK.accent === '#E2B65C' ? theme.colors.brass : LOOK.accent} size={18} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[type.bodyStrong, { color: theme.colors.text, fontSize: 16 }]}>
            {firstName ? `${firstName}’s business` : 'Your business'}
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

      {error ? (
        <View style={{ marginTop: 12 }}>
          <InlineError message={error} />
        </View>
      ) : null}

      <View style={styles.hero}>
        <LinearGradient colors={[LOOK.bg, LOOK.bg2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.rowBetween}>
          <Text style={[type.eyebrow, { color: LOOK.onBg, opacity: 0.72 }]}>{stats.current.profit < 0 ? 'Loss this month' : 'Profit this month'}</Text>
          <Pressable onPress={toggleShowAmounts} hitSlop={12} accessibilityLabel={showAmounts ? 'Hide amounts' : 'Show amounts'}>
            {showAmounts ? <EyeOff color={LOOK.onBg} size={18} opacity={0.75} /> : <Eye color={LOOK.onBg} size={18} opacity={0.75} />}
          </Pressable>
        </View>
        {loading ? (
          <ActivityIndicator color={LOOK.accent} style={{ marginVertical: 22 }} />
        ) : (
          <>
            <Amount value={Math.abs(stats.current.profit)} currency={glyph} size="hero" color={stats.current.profit < 0 ? '#F07565' : LOOK.onBg} hidden={hide} style={{ marginTop: 8 }} />
            <View style={[styles.row, { marginTop: 6, flexWrap: 'wrap' }]}>
              {stats.margin != null ? (
                <View style={[styles.pill, { backgroundColor: LOOK.soft }]}>
                  <Text style={[type.caption, { color: LOOK.accent, fontFamily: fonts.semibold }]}>{stats.margin}% margin</Text>
                </View>
              ) : null}
              {stats.change != null ? (
                <View style={[styles.pill, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                  {stats.change >= 0 ? <TrendingUp color="#8FD6C3" size={13} /> : <TrendingDown color="#F07565" size={13} />}
                  <Text style={[type.caption, { color: LOOK.onBg, fontFamily: fonts.semibold }]}>
                    {stats.change >= 0 ? '+' : ''}
                    {stats.change}% vs last month
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={[styles.split, { borderTopColor: 'rgba(255,255,255,0.12)' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[type.caption, { color: LOOK.onBg, opacity: 0.7 }]}>Revenue</Text>
                <Amount value={stats.current.revenue} currency={glyph} size="sm" color={LOOK.onBg} hidden={hide} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.caption, { color: LOOK.onBg, opacity: 0.7 }]}>Costs</Text>
                <Amount value={stats.current.costs} currency={glyph} size="sm" color={LOOK.onBg} hidden={hide} />
              </View>
            </View>
          </>
        )}
      </View>

      <View style={styles.quick}>
        {[
          { key: 'sale', label: 'Record sale', Icon: ArrowDownLeft, onPress: () => nav.navigate('AddTransaction', { prefill: { type: 'income', category: 'Sales' } }) },
          { key: 'cost', label: 'Add cost', Icon: ArrowUpRight, onPress: () => nav.navigate('AddTransaction', { prefill: { type: 'expense' } }) },
          { key: 'staff', label: 'Pay staff', Icon: Users, onPress: () => nav.navigate('AddTransaction', { prefill: { type: 'expense', category: 'Payroll', description: 'Salaries' } }) },
          { key: 'bank', label: 'Bank import', Icon: Landmark, onPress: () => nav.navigate('BankConnections') }
        ].map(({ key, label, Icon, onPress }) => (
          <Pressable key={key} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.quickItem, { opacity: pressed ? 0.7 : 1 }]}>
            <View style={[styles.quickIcon, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Icon color={theme.colors.brass} size={21} />
            </View>
            <Text style={[type.caption, { color: theme.colors.text }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {!loading && txs.length === 0 ? (
        <View style={{ marginTop: 18 }}>
          <EmptyState
            title="Set up your business space"
            body="Record your first sale and a few costs. You’ll see profit, cash runway and what to set aside for tax straight away."
            actionLabel="Record a sale"
            onAction={() => nav.navigate('AddTransaction', { prefill: { type: 'income', category: 'Sales' } })}
          />
        </View>
      ) : (
        <>
          <View style={styles.tiles}>
            <Card style={{ flex: 1 }}>
              <IconTile bg={theme.colors.brassSoft} size={34}>
                <Hourglass color={theme.colors.brass} size={17} />
              </IconTile>
              <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 10 }]}>Cash runway</Text>
              <Text style={[type.title, { color: runway != null && runway < 2 ? theme.colors.error : theme.colors.text, marginTop: 2 }]}>
                {runway == null ? '—' : runway >= 12 ? '12+ months' : `${runway.toFixed(1)} months`}
              </Text>
              <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                {runway == null ? 'Log a month of costs to see this' : `At about ${formatAmount(Math.round(stats.avgCosts), glyph)} costs a month`}
              </Text>
            </Card>
            <Pressable onPress={cycleTaxRate} style={{ flex: 1 }} accessibilityRole="button" accessibilityHint="Changes the share of profit set aside for tax">
              <Card style={{ flex: 1 }}>
                <IconTile bg={theme.colors.primarySoft} size={34}>
                  <Receipt color={theme.colors.primary} size={17} />
                </IconTile>
                <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 10 }]}>Set aside for tax</Text>
                <Amount value={Math.round(taxSetAside)} currency={glyph} size="sm" hidden={hide} style={{ marginTop: 2 }} />
                <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>{taxRate}% of profit · tap to change</Text>
              </Card>
            </Pressable>
          </View>
          <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 6 }]}>Tax set-aside is a simple estimate. Confirm what you owe with an accountant.</Text>

          <SectionHeader title="Last 6 months" actionLabel="Insights" onAction={() => nav.navigate('Analytics')} />
          <Card>
            <View style={styles.chart}>
              {stats.series.map((s) => (
                <View key={s.key} style={styles.chartCol}>
                  <View style={styles.bars}>
                    <View style={[styles.bar, { height: `${(s.revenue / maxBar) * 100}%`, backgroundColor: theme.colors.success }]} />
                    <View style={[styles.bar, { height: `${(s.costs / maxBar) * 100}%`, backgroundColor: theme.colors.brass }]} />
                  </View>
                  <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 6 }]}>{s.label}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.row, { marginTop: 12, gap: 16 }]}>
              <View style={styles.row}>
                <View style={[styles.legend, { backgroundColor: theme.colors.success }]} />
                <Text style={[type.caption, { color: theme.colors.textMuted }]}>Revenue</Text>
              </View>
              <View style={styles.row}>
                <View style={[styles.legend, { backgroundColor: theme.colors.brass }]} />
                <Text style={[type.caption, { color: theme.colors.textMuted }]}>Costs</Text>
              </View>
            </View>
          </Card>

          {stats.topCosts.length ? (
            <>
              <SectionHeader title="Biggest costs this month" />
              <ListCard>
                {stats.topCosts.map(([category, amount]) => (
                  <ListRow
                    key={category}
                    icon={<CategoryIcon category={category} />}
                    title={category}
                    subtitle={stats.current.costs > 0 ? `${Math.round((amount / stats.current.costs) * 100)}% of costs${category === 'Payroll' && payroll ? ' · staff' : ''}` : undefined}
                    right={<Amount value={amount} currency={glyph} size="sm" hidden={hide} />}
                  />
                ))}
              </ListCard>
            </>
          ) : null}

          <InsightCards spaceId="business" />

          <SectionHeader title="Recent activity" actionLabel="See all" onAction={() => nav.navigate('Transactions')} />
          <ListCard>
            {txs.slice(0, 5).map((t) => (
              <ListRow
                key={t.id}
                icon={<CategoryIcon category={t.category} type={t.type} />}
                title={t.description || t.category}
                subtitle={`${t.category} · ${formatRelativeDay(t.occurredAt)}`}
                onPress={() => nav.navigate('TransactionDetail', { id: String(t.id) })}
                right={
                  <Amount
                    value={t.type === 'expense' ? -t.amount : t.amount}
                    currency={glyph}
                    size="sm"
                    signed={t.type === 'income'}
                    hidden={hide}
                    color={t.type === 'income' ? theme.colors.success : theme.colors.text}
                  />
                }
              />
            ))}
          </ListCard>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hero: { marginTop: 14, borderRadius: 24, padding: 18, overflow: 'hidden' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  split: { flexDirection: 'row', marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  quick: { flexDirection: 'row', marginTop: 18 },
  quickItem: { flex: 1, alignItems: 'center', gap: 7 },
  quickIcon: { width: 54, height: 54, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', gap: 10, marginTop: 18 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 130 },
  chartCol: { flex: 1, alignItems: 'center' },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 3, width: '100%', justifyContent: 'center' },
  bar: { width: 9, borderRadius: 4, minHeight: 2 },
  legend: { width: 10, height: 10, borderRadius: 3 }
});
