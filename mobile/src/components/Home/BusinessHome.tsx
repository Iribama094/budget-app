import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Briefcase,
  CalendarClock,
  Check,
  ChartColumn,
  Eye,
  EyeOff,
  FilePlus,
  FileText,
  Gift,
  Hourglass,
  Landmark,
  MoreHorizontal,
  Receipt,
  Settings as SettingsIcon,
  TrendingDown,
  TrendingUp,
  Upload,
  Users,
  Wallet
} from 'lucide-react-native';

import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { SPACE_LOOK } from '../../contexts/SpaceContext';
import { useAmountVisibility } from '../../contexts/AmountVisibilityContext';
import { useNotificationBadges } from '../../contexts/NotificationBadgeContext';
import { Amount, Card, EmptyState, IconButton, IconTile, InfoTip, InlineError, ListCard, ListRow, Screen, SectionHeader, formatAmount } from '../Common/ui';
import { SpaceSwitcher } from '../Common/SpaceSwitcher';
import { CategoryIcon } from '../Common/CategoryIcon';
import { StatCard, ToolTile } from '../Business/parts';
import { InsightCards } from './InsightCards';
import { listTransactions, type ApiTransaction } from '../../api/endpoints';
import { getBusinessSummary, type BusinessSummary } from '../../api/business';
import { currencySymbol, formatRelativeDay, formatShortDate, toIsoDateTime } from '../../utils/format';
import { fonts, type } from '../../theme/typography';
import { GuideAnchor } from '../Common/GuideAnchor';
import { useConfig } from '../../contexts/ConfigContext';

const LOOK = SPACE_LOOK.business;

/** Home for the Business space: profit, money owed both ways, safe owner pay, tax and the business tools. */
export function BusinessHome() {
  const nav = useNavigation<any>();
  const { user, refreshUser } = useAuth();
  const { theme } = useTheme();
  const wrapped = useConfig().wrappedFor('business');
  const { showAmounts, toggleShowAmounts } = useAmountVisibility();
  const { hasUnreadNotifications } = useNotificationBadges();
  const glyph = currencySymbol(user?.currency);
  const hide = !showAmounts;

  const [s, setS] = useState<BusinessSummary | null>(null);
  const [recent, setRecent] = useState<ApiTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllTools, setShowAllTools] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const now = new Date();
      const [summary, tx] = await Promise.all([
        getBusinessSummary(),
        listTransactions({ start: toIsoDateTime(new Date(now.getFullYear(), now.getMonth() - 5, 1)), end: toIsoDateTime(now), limit: 5, spaceId: 'business' })
      ]);
      setS(summary);
      setRecent(tx.items || []);
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

  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] || null;
  const title = s?.settings.businessName || (firstName ? `${firstName}’s business` : 'Your business');
  const current = s?.current ?? { revenue: 0, costs: 0, profit: 0 };
  const maxBar = Math.max(1, ...(s?.series ?? []).map((m) => Math.max(m.revenue, m.costs)));
  const hasActivity = !!s && (s.series.some((m) => m.revenue > 0 || m.costs > 0) || s.receivables.openCount > 0 || s.payables.openCount > 0);
  const nextDeadline = s?.tax.deadlines[0] ?? null;

  const allTools = [
    { label: 'Invoices', Icon: FileText, screen: 'Invoices', badge: s?.receivables.overdueCount },
    { label: 'Customers', Icon: Users, screen: 'Customers' },
    { label: 'Bills', Icon: Receipt, screen: 'Bills', badge: s?.payables.dueSoonCount },
    { label: 'Staff & pay', Icon: Users, screen: 'Payroll' },
    { label: 'Tax', Icon: Landmark, screen: 'BusinessTax' },
    { label: 'Reports', Icon: ChartColumn, screen: 'BusinessReports' },
    { label: 'Upload', Icon: Upload, screen: 'StatementImport' },
    { label: 'Pay yourself', Icon: Wallet, screen: 'PayYourself' },
    // Wrapped joins the tools only in season, once a period has been certified in the staff console.
    ...(wrapped.available ? ([{ label: 'Wrapped', Icon: Gift, screen: 'Wrapped' }] as const) : [])
  ] as const;

  // A business finding its feet does not need eight tools on day one. Everything is still one tap away under
  // "All tools", and the full grid takes over for good once they are actually trading.
  const settledIn = hasActivity || showAllTools;
  const tools = settledIn ? allTools : allTools.filter((t) => t.label === 'Invoices' || t.label === 'Bills' || t.label === 'Reports');

  // What is worth doing first, in the order that makes the rest work.
  const setupSteps = s
    ? [
        { key: 'name', label: 'Add your business name', done: !!s.settings.businessName, go: () => nav.navigate('BusinessDetails') },
        { key: 'sale', label: 'Record your first sale', done: s.series.some((m) => m.revenue > 0), go: () => nav.navigate('AddTransaction', { prefill: { type: 'income', category: 'Sales' } }) },
        { key: 'cost', label: 'Add a running cost', done: s.series.some((m) => m.costs > 0), go: () => nav.navigate('AddTransaction', { prefill: { type: 'expense' } }) },
        { key: 'invoice', label: 'Send your first invoice', done: s.receivables.openCount > 0 || s.series.some((m) => m.revenue > 0), go: () => nav.navigate('InvoiceEdit') }
      ]
    : [];
  const stepsLeft = setupSteps.filter((x) => !x.done);

  return (
    <Screen
      onRefresh={() => {
        void Promise.all([load(), refreshUser()]);
      }}
      refreshing={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => nav.navigate('Profile')} accessibilityRole="button" accessibilityLabel="Profile" style={[styles.avatar, { backgroundColor: LOOK.soft }]}>
          <Briefcase color={theme.colors.brass} size={18} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[type.bodyStrong, { color: theme.colors.text, fontSize: 16 }]}>
            {title}
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

      <GuideAnchor id="business.hero">
      <Pressable onPress={() => nav.navigate('BusinessReports')} accessibilityRole="button" accessibilityLabel="Open reports" style={styles.hero}>
        <LinearGradient colors={[LOOK.bg, LOOK.bg2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.rowBetween}>
          <Text style={[type.eyebrow, { color: LOOK.onBg, opacity: 0.72 }]}>{current.profit < 0 ? 'Loss this month' : 'Profit this month'}</Text>
          <Pressable onPress={toggleShowAmounts} hitSlop={12} accessibilityLabel={showAmounts ? 'Hide amounts' : 'Show amounts'}>
            {showAmounts ? <EyeOff color={LOOK.onBg} size={18} opacity={0.75} /> : <Eye color={LOOK.onBg} size={18} opacity={0.75} />}
          </Pressable>
        </View>
        {loading && !s ? (
          <ActivityIndicator color={LOOK.accent} style={{ marginVertical: 22 }} />
        ) : (
          <>
            <Amount value={Math.abs(current.profit)} currency={glyph} size="hero" color={current.profit < 0 ? '#F07565' : LOOK.onBg} hidden={hide} style={{ marginTop: 8 }} />
            <View style={[styles.row, { marginTop: 6, flexWrap: 'wrap' }]}>
              {s?.margin != null ? (
                <View style={[styles.pill, { backgroundColor: LOOK.soft }]}>
                  <Text style={[type.caption, { color: LOOK.accent, fontFamily: fonts.semibold }]}>{s.margin}% margin</Text>
                </View>
              ) : null}
              {s?.changeVsLastMonth != null ? (
                <View style={[styles.pill, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                  {s.changeVsLastMonth >= 0 ? <TrendingUp color="#8FD6C3" size={13} /> : <TrendingDown color="#F07565" size={13} />}
                  <Text style={[type.caption, { color: LOOK.onBg, fontFamily: fonts.semibold }]}>
                    {s.changeVsLastMonth >= 0 ? '+' : ''}
                    {s.changeVsLastMonth}% vs last month
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={[styles.split, { borderTopColor: 'rgba(255,255,255,0.12)' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[type.caption, { color: LOOK.onBg, opacity: 0.7 }]}>Revenue</Text>
                <Amount value={current.revenue} currency={glyph} size="sm" color={LOOK.onBg} hidden={hide} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.caption, { color: LOOK.onBg, opacity: 0.7 }]}>Costs</Text>
                <Amount value={current.costs} currency={glyph} size="sm" color={LOOK.onBg} hidden={hide} />
              </View>
            </View>
          </>
        )}
      </Pressable>
      </GuideAnchor>

      <View style={styles.quick}>
        {[
          { key: 'sale', label: 'Record sale', Icon: ArrowDownLeft, onPress: () => nav.navigate('AddTransaction', { prefill: { type: 'income', category: 'Sales' } }) },
          { key: 'cost', label: 'Add cost', Icon: ArrowUpRight, onPress: () => nav.navigate('AddTransaction', { prefill: { type: 'expense' } }) },
          { key: 'invoice', label: 'New invoice', Icon: FilePlus, onPress: () => nav.navigate('InvoiceEdit') },
          { key: 'upload', label: 'Upload CSV', Icon: Upload, onPress: () => nav.navigate('StatementImport', { spaceId: 'business' }) }
        ].map(({ key, label, Icon, onPress }) => (
          <Pressable key={key} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.quickItem, { opacity: pressed ? 0.7 : 1 }]}>
            <View style={[styles.quickIcon, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Icon color={theme.colors.brass} size={21} />
            </View>
            <Text style={[type.caption, { color: theme.colors.text }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {s ? (
        <>
          <View style={styles.tiles}>
            <StatCard label="Customers owe you" onPress={() => nav.navigate('Customers')}>
              <Amount value={s.receivables.openTotal} currency={glyph} size="md" hidden={hide} />
              <Text style={[type.caption, { color: s.receivables.overdueCount ? theme.colors.error : theme.colors.textMuted, marginTop: 2 }]}>
                {s.receivables.overdueCount ? `${s.receivables.overdueCount} overdue` : s.receivables.openCount ? `${s.receivables.openCount} open invoice${s.receivables.openCount === 1 ? '' : 's'}` : 'Nothing outstanding'}
              </Text>
            </StatCard>
            <StatCard label="You owe" onPress={() => nav.navigate('Bills')}>
              <Amount value={s.payables.openTotal} currency={glyph} size="md" hidden={hide} />
              <Text style={[type.caption, { color: s.payables.dueSoonCount ? theme.colors.warn : theme.colors.textMuted, marginTop: 2 }]}>
                {s.payables.dueSoonCount ? `${hide ? '••••' : formatAmount(s.payables.dueSoonTotal, glyph)} due this week` : s.payables.openCount ? 'Nothing due this week' : 'No open bills'}
              </Text>
            </StatCard>
          </View>

          <Pressable onPress={() => nav.navigate('PayYourself')} accessibilityRole="button" style={({ pressed }) => ({ marginTop: 10, opacity: pressed ? 0.9 : 1 })}>
            <Card>
              <View style={[styles.row, { gap: 12 }]}>
                <IconTile bg={theme.colors.brassSoft} size={40}>
                  <Wallet color={theme.colors.brass} size={19} />
                </IconTile>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.caption, { color: theme.colors.textMuted }]}>Safe to pay yourself this month</Text>
                  <Amount value={s.payYourself.suggested} currency={glyph} size="md" hidden={hide} />
                  <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                    After tax set-aside, bills and a {s.payYourself.bufferMonths}-month cash buffer
                  </Text>
                </View>
              </View>
            </Card>
          </Pressable>

          <View style={styles.tiles}>
            <StatCard
              label="Cash runway"
              icon={
                <IconTile bg={theme.colors.brassSoft} size={34}>
                  <Hourglass color={theme.colors.brass} size={17} />
                </IconTile>
              }
            >
              <Text style={[type.title, { color: s.runwayMonths != null && s.runwayMonths < 2 ? theme.colors.error : theme.colors.text }]}>
                {s.runwayMonths == null ? '—' : s.runwayMonths >= 12 ? '12+ months' : `${Math.max(0, s.runwayMonths).toFixed(1)} months`}
              </Text>
              <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                {s.runwayMonths == null ? 'Log a month of costs to see this' : `At about ${hide ? '••••' : formatAmount(s.avgMonthlyCosts, glyph)} costs a month`}
              </Text>
            </StatCard>
            <StatCard
              label="Set aside for tax"
              onPress={() => nav.navigate('BusinessTax')}
              icon={
                <IconTile bg={theme.colors.primarySoft} size={34}>
                  <Landmark color={theme.colors.primary} size={17} />
                </IconTile>
              }
            >
              <Amount value={s.tax.setAside} currency={glyph} size="sm" hidden={hide} />
              <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>{s.tax.setAsidePct}% of profit · tap to change</Text>
            </StatCard>
          </View>

          {nextDeadline ? (
            <ListCard style={{ marginTop: 10 }}>
              <ListRow
                icon={
                  <IconTile bg={theme.colors.surfaceAlt} size={40}>
                    <CalendarClock color={theme.colors.text} size={19} />
                  </IconTile>
                }
                title={nextDeadline.title}
                subtitle={`Usually due by ${formatShortDate(nextDeadline.dueDate)}`}
                onPress={() => nav.navigate('BusinessTax')}
                chevron
              />
            </ListCard>
          ) : null}
        </>
      ) : null}

      {stepsLeft.length && setupSteps.length ? (
        <>
          <SectionHeader title="Start here" />
          <Card>
            {setupSteps.map((step) => (
              <Pressable
                key={step.key}
                onPress={step.done ? undefined : step.go}
                disabled={step.done}
                accessibilityRole="button"
                accessibilityState={{ checked: step.done }}
                style={({ pressed }) => [styles.step, { opacity: pressed ? 0.8 : 1 }]}
              >
                <View
                  style={[
                    styles.stepDot,
                    { borderColor: step.done ? theme.colors.success : theme.colors.border, backgroundColor: step.done ? theme.colors.success : 'transparent' }
                  ]}
                >
                  {step.done ? <Check color={theme.colors.onPrimary} size={11} strokeWidth={3.4} /> : null}
                </View>
                <Text style={[type.body, { color: step.done ? theme.colors.textMuted : theme.colors.text, flex: 1, textDecorationLine: step.done ? 'line-through' : 'none' }]}>
                  {step.label}
                </Text>
              </Pressable>
            ))}
            <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 8 }]}>
              {stepsLeft.length} left. Staff, tax and uploads show up once you need them.
            </Text>
          </Card>
        </>
      ) : null}

      <SectionHeader title="Business tools" />
      <GuideAnchor id="business.tools">
      <View style={styles.tools}>
        {tools.map((t) => (
          <ToolTile key={t.label} label={t.label} Icon={t.Icon} badge={'badge' in t ? t.badge : null} onPress={() => nav.navigate(t.screen)} />
        ))}
        {!settledIn ? <ToolTile label="All tools" Icon={MoreHorizontal} badge={null} onPress={() => setShowAllTools(true)} /> : null}
      </View>
      </GuideAnchor>

      {!loading && !hasActivity ? (
        <View style={{ marginTop: 18 }}>
          <EmptyState
            title="Set up your business space"
            body="Record a sale, send your first invoice, or upload a Paystack or Moniepoint export. Profit, runway and tax set-aside show up straight away."
            actionLabel="Create an invoice"
            onAction={() => nav.navigate('InvoiceEdit')}
          />
        </View>
      ) : s ? (
        <>
          <SectionHeader title="Last 6 months" actionLabel="Reports" onAction={() => nav.navigate('BusinessReports')} />
          <Card>
            <View style={styles.chart}>
              {s.series.map((m) => (
                <View key={m.month} style={styles.chartCol}>
                  <View style={styles.bars}>
                    <View style={[styles.bar, { height: `${(m.revenue / maxBar) * 100}%`, backgroundColor: theme.colors.success }]} />
                    <View style={[styles.bar, { height: `${(m.costs / maxBar) * 100}%`, backgroundColor: theme.colors.brass }]} />
                  </View>
                  <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 6 }]}>{m.label}</Text>
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

          {s.topCosts.length ? (
            <>
              <SectionHeader title="Biggest costs this month" />
              <ListCard>
                {s.topCosts.slice(0, 4).map((c) => (
                  <ListRow
                    key={c.category}
                    icon={<CategoryIcon category={c.category} />}
                    title={c.category}
                    subtitle={current.costs > 0 ? `${Math.round((c.amount / current.costs) * 100)}% of costs` : undefined}
                    right={<Amount value={c.amount} currency={glyph} size="sm" hidden={hide} />}
                  />
                ))}
              </ListCard>
            </>
          ) : null}
        </>
      ) : null}

      <InsightCards spaceId="business" />

      {recent.length ? (
        <>
          <SectionHeader title="Recent activity" actionLabel="See all" onAction={() => nav.navigate('Transactions')} />
          <ListCard>
            {recent.map((t) => (
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
      ) : null}

      <InfoTip
        style={{ marginTop: 14 }}
        text="BudgetFriendly records what you’ve earned, spent and owe, and turns it into profit, cash and tax figures. It never moves money, and it isn’t connected to your bank unless you link one. Tax figures are estimates; confirm with an accountant."
      >
        We record and explain your money. We never move it.
      </InfoTip>
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  stepDot: { width: 18, height: 18, borderRadius: 99, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
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
  tiles: { flexDirection: 'row', gap: 10, marginTop: 14 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 130 },
  chartCol: { flex: 1, alignItems: 'center' },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 3, width: '100%', justifyContent: 'center' },
  bar: { width: 9, borderRadius: 4, minHeight: 2 },
  legend: { width: 10, height: 10, borderRadius: 3 }
});
