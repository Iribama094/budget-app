import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { bucketDisplayName } from '../theme/buckets';
import { View, Text, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Calculator, Eye, EyeOff, Layers, PieChart, TrendingUp, Wallet } from '../icons';

import { getAnalyticsSummary, type AnalyticsSummary, listBudgets, listTransactions } from '../api/endpoints';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Amount, Card, Chip, IconButton, IconTile, InlineError, ListCard, ListRow, Screen, ScreenHeader, SectionHeader, SegmentedControl, formatAmount } from '../components/Common/ui';
import { DailyBars, compactNumber } from '../components/Charts/DailyBars';
import { categoryDotColor, currencySymbol, toIsoDate } from '../utils/format';
import { fonts, type } from '../theme/typography';
import { useAmountVisibility } from '../contexts/AmountVisibilityContext';
import { useSpace } from '../contexts/SpaceContext';
import { SpaceSwitcher } from '../components/Common/SpaceSwitcher';
import { useTour, useTourAnchor } from '../contexts/TourContext';
import { useNudges } from '../contexts/NudgesContext';
import { NudgeTooltip } from '../components/Common/NudgeTooltip';
import { GuideAnchor } from '../components/Common/GuideAnchor';

export function AnalyticsScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { showAmounts, toggleShowAmounts } = useAmountVisibility();
  const nav = useNavigation<any>();
  const { spacesEnabled, activeSpaceId, activeSpace } = useSpace();
  const { isTourActive } = useTour();
  const { seen, markSeen } = useNudges();

  const timeframeAnchorRef = useTourAnchor('analytics.timeframe');

  const isBusiness = spacesEnabled && activeSpaceId === 'business';
  const bucketLabel = useCallback(
    (key: string) => {
      return bucketDisplayName(key, isBusiness);
    },
    [isBusiness]
  );

  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [bars] = useState(() => Array.from({ length: 7 }, () => new Animated.Value(0)));
  const [spanMonths, setSpanMonths] = useState<number>(1);
  const [currentBudget, setCurrentBudget] = useState<any>(null);
  const [currentBudgetSpent, setCurrentBudgetSpent] = useState<number>(0);
  const [activeRangeIso, setActiveRangeIso] = useState<{ start: string; end: string } | null>(null);

  const range = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = now;
    return { start: toIsoDate(start), end: toIsoDate(end) };
  }, []);

  const parseIsoDateLocal = (value?: string | null) => {
    if (!value) return null;
    const d = new Date(`${value}T12:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  };

  const budgetEffectiveEndIso = (b: any): string => {
    if (b?.endDate) return String(b.endDate);
    const start = parseIsoDateLocal(String(b?.startDate ?? ''));
    if (!start) return toIsoDate(new Date());

    const d = new Date(start);
    if (b?.period === 'weekly') {
      d.setDate(d.getDate() + 6);
    } else {
      d.setMonth(d.getMonth() + 1);
      d.setDate(0);
    }
    return toIsoDate(d);
  };

  const isBudgetCurrent = (b: any) => {
    const start = parseIsoDateLocal(String(b?.startDate ?? ''));
    if (!start) return false;
    const end = parseIsoDateLocal(budgetEffectiveEndIso(b));
    if (!end) return false;

    const nowLocal = new Date();
    const today = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 12, 0, 0, 0);
    return today >= start && today <= end;
  };

  const load = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const budgetsRes = await listBudgets({ spaceId: spacesEnabled ? activeSpaceId : undefined });
      const budgets = budgetsRes.items ?? [];
      const current = budgets.find((b: any) => isBudgetCurrent(b)) ?? budgets[0] ?? null;
      setCurrentBudget(current);
      let budgetStartIso: string | null = null;
      let budgetEndIso: string | null = null;

      let startIso = range.start;
      let endIso = range.end;
      if (current) {
        budgetStartIso = String(current.startDate);
        budgetEndIso = budgetEffectiveEndIso(current);
        try {
          const s = parseIsoDateLocal(String(current.startDate)) ?? new Date();
          const e = parseIsoDateLocal(budgetEndIso) ?? new Date();
          const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
          setSpanMonths(Math.max(1, months));
        } catch {
          setSpanMonths(1);
        }
      } else {
        setSpanMonths(1);
      }

      // Compute range based on timeframe (local days), then clamp to the current budget if present.
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0);
      const toIso = (d: Date) => toIsoDate(d);

      if (timeframe === 'daily') {
        startIso = toIso(todayStart);
        endIso = toIso(todayStart);
      } else if (timeframe === 'weekly') {
        const start = new Date(todayStart);
        start.setDate(start.getDate() - 6);
        startIso = toIso(start);
        endIso = toIso(todayStart);
      } else {
        const start = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1, 12, 0, 0, 0);
        startIso = toIso(start);
        endIso = toIso(todayStart);
      }

      if (budgetStartIso && budgetEndIso) {
        // Clamp to budget boundaries.
        if (startIso < budgetStartIso) startIso = budgetStartIso;
        if (endIso > budgetEndIso) endIso = budgetEndIso;
        if (startIso > endIso) {
          startIso = budgetStartIso;
          endIso = budgetEndIso;
        }
      }

      setActiveRangeIso({ start: startIso, end: endIso });

      const summary = await getAnalyticsSummary(startIso, endIso, spacesEnabled ? { spaceId: activeSpaceId } : undefined);
      setData(summary);

      // Compute actual spend for the current budget from transactions so Remaining budget matches Dashboard.
      if (current) {
        let cursor: string | undefined;
        let pages = 0;
        let spent = 0;

        while (pages < 5) {
          const page = await listTransactions({
            start: String(current.startDate),
            end: budgetEndIso ?? endIso,
            limit: 200,
            cursor,
            type: 'expense',
            budgetId: String(current.id),
            spaceId: spacesEnabled ? activeSpaceId : undefined
          });
          for (const t of page.items || []) spent += Number(t.amount) || 0;
          if (!page.nextCursor) break;
          cursor = page.nextCursor;
          pages += 1;
        }

        setCurrentBudgetSpent(spent);
      } else {
        setCurrentBudgetSpent(0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  }, [activeSpaceId, spacesEnabled, range.end, range.start, timeframe]);

  const currentBudgetTotal = useMemo(() => Number(currentBudget?.totalBudget ?? 0) || 0, [currentBudget?.totalBudget]);
  const currentBudgetRemaining = useMemo(() => currentBudgetTotal - (Number(currentBudgetSpent) || 0), [currentBudgetSpent, currentBudgetTotal]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const categories = useMemo(() => {
    const byCat = data?.spendingByCategory ?? {};
    return Object.entries(byCat)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [data]);

  const bucketSpend = useMemo(() => {
    const byBucket = data?.spendingByBucket ?? {};
    return Object.entries(byBucket)
      .map(([bucket, amount]) => ({ bucket, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [data]);

  const miniSpend = useMemo(() => {
    const byMini = data?.spendingByMiniBudget ?? {};
    return Object.entries(byMini)
      .map(([mini, amount]) => ({ mini, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [data]);

  const maxCat = useMemo(() => {
    return categories.reduce((m, c) => Math.max(m, c.amount), 0) || 1;
  }, [categories]);

  const maxBucket = useMemo(() => {
    return bucketSpend.reduce((m, c) => Math.max(m, c.amount), 0) || 1;
  }, [bucketSpend]);

  const maxMini = useMemo(() => {
    return miniSpend.reduce((m, c) => Math.max(m, c.amount), 0) || 1;
  }, [miniSpend]);

  // For the stacked weekly bars we need per-day category breakdowns.
  // If the API doesn't provide per-day breakdown, synthesize from categories for demo mode.
  const weekly = useMemo(() => {
    const daily = data?.dailySpendingByCategory;
    if (daily && Array.isArray(daily) && daily.length > 0) {
      const last7 = daily.slice(Math.max(0, daily.length - 7));
      const pad = Math.max(0, 7 - last7.length);
      const padded = Array.from({ length: pad }, () => ({ date: '', expenses: 0, spendingByCategory: {} as Record<string, number> })).concat(last7);

      const totalsByCat: Record<string, number> = {};
      for (const d of padded) {
        for (const [cat, amt] of Object.entries(d.spendingByCategory ?? {})) {
          totalsByCat[cat] = (totalsByCat[cat] ?? 0) + (Number(amt) || 0);
        }
      }

      const topCats = Object.entries(totalsByCat)
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        .slice(0, 4)
        .map(([cat]) => cat);

      const segmentsByDay = padded.map((d) => {
        const byCat = d.spendingByCategory ?? {};
        const segments = topCats
          .map((cat) => ({ category: cat, value: Number(byCat[cat] ?? 0) || 0, color: categoryDotColor(cat) }))
          .filter((s) => s.value > 0);

        const topSum = segments.reduce((s, x) => s + x.value, 0);
        const other = Math.max(0, (Number(d.expenses) || 0) - topSum);
        if (other > 0) {
          segments.push({ category: 'Other', value: other, color: theme.colors.textMuted });
        }
        return segments;
      });

      const labels = padded.map((d) => {
        const dt = parseIsoDateLocal(d.date);
        if (!dt) return '';
        const day = dt.getDay();
        return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][day] ?? '';
      });

      return { segmentsByDay, labels };
    }

    // Synthetic fallback
    const top = categories.slice(0, 4);
    const totals = top.map((t) => t.amount || 0);
    const sum = totals.reduce((s, v) => s + v, 0) || 1;
    const segmentsByDay = Array.from({ length: 7 }).map((_, dayIdx) => {
      const jitter = (i: number) => 0.7 + 0.6 * Math.abs(Math.sin((dayIdx + 1) * (i + 1)));
      return top.map((t, i) => ({
        category: t.category,
        value: (totals[i] / sum) * (0.3 + 0.7 * jitter(i)),
        color: categoryDotColor(t.category)
      }));
    });

    return { segmentsByDay, labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] };
  }, [categories, data?.dailySpendingByCategory, theme.colors.textMuted]);

  useEffect(() => {
    // animate bars when data or timeframe changes
    const seq = bars.map((av, i) =>
      Animated.timing(av, {
        toValue: 1,
        duration: 500,
        delay: i * 80,
        useNativeDriver: false,
        easing: Easing.out(Easing.cubic)
      })
    );
    bars.forEach((b) => b.setValue(0));
    Animated.stagger(60, seq).start();
  }, [bars, timeframe, data]);

  const totalSpending = data?.expenses ?? 0;
  const timeframeLabel = timeframe === 'daily' ? 'Today' : timeframe === 'weekly' ? 'Last 7 days' : 'This month';
  const glyph = currencySymbol(user?.currency);
  const hide = !showAmounts;

  // Spending in the equal-length period just before the active one, for a "better or worse" comparison.
  const [prevExpenses, setPrevExpenses] = useState<number | null>(null);
  useEffect(() => {
    if (!activeRangeIso) return;
    const s = parseIsoDateLocal(activeRangeIso.start);
    const e = parseIsoDateLocal(activeRangeIso.end);
    if (!s || !e) return;
    const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
    const prevEnd = new Date(s);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - (days - 1));
    let cancelled = false;
    getAnalyticsSummary(toIsoDate(prevStart), toIsoDate(prevEnd), spacesEnabled ? { spaceId: activeSpaceId } : undefined)
      .then((r) => !cancelled && setPrevExpenses(Number(r?.expenses) || 0))
      .catch(() => !cancelled && setPrevExpenses(null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRangeIso?.start, activeRangeIso?.end, activeSpaceId, spacesEnabled]);

  const dailyBars = useMemo(() => {
    const daily = ((data as any)?.dailySpendingByCategory ?? []) as Array<{ date: string; expenses: number }>;
    return daily.slice(-7).map((d) => {
      const dt = parseIsoDateLocal(d.date);
      return { label: dt ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'][dt.getDay()] : '', value: Number(d.expenses) || 0 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const safePerDay = useMemo(() => {
    if (!currentBudget) return null;
    const end = parseIsoDateLocal(budgetEffectiveEndIso(currentBudget));
    if (!end) return null;
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const daysLeft = Math.max(1, Math.floor((end.getTime() - today.getTime()) / 86400000) + 1);
    return currentBudgetRemaining > 0 ? currentBudgetRemaining / daysLeft : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBudget, currentBudgetRemaining]);

  const delta = prevExpenses != null && prevExpenses > 0 ? (totalSpending - prevExpenses) / prevExpenses : null;
  const overDays = safePerDay ? dailyBars.filter((b) => b.value > safePerDay).length : 0;
  const topCategories = categories.slice(0, 5);
  const otherTotal = categories.slice(5).reduce((s, c) => s + c.amount, 0);
  const categoryRows = otherTotal > 0 ? [...topCategories, { category: 'Other', amount: otherTotal }] : topCategories;
  const categoryTotal = categoryRows.reduce((s, c) => s + c.amount, 0) || 1;

  return (
    <Screen onRefresh={load} refreshing={isLoading}>
      <ScreenHeader
        title="Insights"
        right={
          <IconButton accessibilityLabel={showAmounts ? 'Hide amounts' : 'Show amounts'} onPress={toggleShowAmounts}>
            {showAmounts ? <EyeOff color={theme.colors.text} size={18} /> : <Eye color={theme.colors.text} size={18} />}
          </IconButton>
        }
      />

      {spacesEnabled ? (
        <View style={{ marginTop: 6 }}>
          <SpaceSwitcher />
        </View>
      ) : null}

      <View ref={timeframeAnchorRef} style={{ marginTop: 12 }}>
        <SegmentedControl
          options={[
            { key: 'daily', label: 'Today' },
            { key: 'weekly', label: 'Last 7 days' },
            ...(spanMonths > 1 ? [{ key: 'monthly' as const, label: 'This month' }] : [])
          ]}
          value={timeframe}
          onChange={(k) => setTimeframe(k)}
        />
      </View>

      <NudgeTooltip
        visible={!isTourActive && !seen['analytics.timeframe'] && !isLoading && !error && !!data}
        targetRef={timeframeAnchorRef}
        title="Try this"
        body="Switch timeframe to see patterns (today vs the last 7 days)."
        onDismiss={() => markSeen('analytics.timeframe')}
      />

      {error ? (
        <View style={{ marginTop: 12 }}>
          <InlineError message={error} />
        </View>
      ) : null}

      <Pressable
        onPress={() => activeRangeIso && nav.navigate('AnalyticsWeeklyDetail' as never, { range: activeRangeIso, timeframe } as never)}
        disabled={!activeRangeIso}
        accessibilityRole="button"
        style={({ pressed }) => ({ marginTop: 12, opacity: pressed ? 0.92 : 1 })}
      >
        <Card>
          <View style={styles.rowBetween}>
            <Text style={[type.smallStrong, { color: theme.colors.textMuted }]}>{timeframeLabel}</Text>
            {delta != null && !hide ? (
              <Chip
                tone={delta <= 0 ? 'positive' : 'brass'}
                label={`${Math.abs(Math.round(delta * 100))}% ${delta <= 0 ? 'less' : 'more'} than before`}
              />
            ) : null}
          </View>
          <Amount value={totalSpending} currency={glyph} size="lg" hidden={hide} style={{ marginTop: 6 }} />
          {timeframe !== 'daily' && dailyBars.length > 0 ? (
            <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
              {hide ? 'Spent in this period' : `Averaging ${formatAmount(Math.round(totalSpending / Math.max(1, dailyBars.length)), glyph)} a day`}
            </Text>
          ) : (
            <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>Spent so far</Text>
          )}

          {timeframe !== 'daily' && dailyBars.length > 1 ? (
            <>
              <View style={{ marginTop: 14 }}>
                <DailyBars
                  bars={dailyBars}
                  reference={safePerDay}
                  referenceLabel={safePerDay && !hide ? `${glyph}${compactNumber(safePerDay)} safe to spend / day` : undefined}
                  hidden={hide}
                />
              </View>
              {safePerDay ? (
                <View style={[styles.rowBetween, { marginTop: 8 }]}>
                  <View style={styles.legend}>
                    <View style={[styles.swatch, { backgroundColor: theme.colors.primary }]} />
                    <Text style={[type.caption, { color: theme.colors.textMuted }]}>Under</Text>
                    <View style={[styles.swatch, { backgroundColor: theme.colors.brass, marginLeft: 10 }]} />
                    <Text style={[type.caption, { color: theme.colors.textMuted }]}>Over safe to spend</Text>
                  </View>
                  <Text style={[type.caption, { color: theme.colors.text, fontFamily: fonts.semibold }]}>
                    {overDays} of {dailyBars.length} days over
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </Card>
      </Pressable>

      <SectionHeader
        title="Where it went"
        actionLabel={categories.length ? 'Details' : undefined}
        onAction={() => activeRangeIso && nav.navigate('AnalyticsCategoryDetail' as never, { range: activeRangeIso, timeframe } as never)}
      />
      <Card>
        {categoryRows.length === 0 ? (
          <>
            <Text style={[type.small, { color: theme.colors.textMuted }]}>
              Nothing spent in this period yet. Log what you spend and this shows where your money goes.
            </Text>
            <Pressable onPress={() => nav.navigate('AddTransaction' as never)} accessibilityRole="button" hitSlop={8} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
              <Text style={[type.smallStrong, { color: theme.colors.primary }]}>Log spending</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.stack}>
              {categoryRows.map((c, i) => (
                <View key={c.category} style={{ flex: Math.max(0.02, c.amount / categoryTotal), backgroundColor: theme.categories.fg[i % 6], borderRadius: 3 }} />
              ))}
            </View>
            {categoryRows.map((c, i) => (
              <View key={c.category} style={styles.catRow}>
                <View style={[styles.swatch, { backgroundColor: theme.categories.fg[i % 6] }]} />
                <Text numberOfLines={1} style={[type.body, { color: theme.colors.text, flex: 1 }]}>
                  {c.category}
                </Text>
                <Text style={[type.caption, { color: theme.colors.textMuted, width: 40, textAlign: 'right' }]}>{Math.round((c.amount / categoryTotal) * 100)}%</Text>
                <Amount value={c.amount} currency={glyph} size="sm" hidden={hide} style={{ minWidth: 86, textAlign: 'right' }} />
              </View>
            ))}
          </>
        )}
      </Card>

      <GuideAnchor id="analytics.digdeeper">
      <SectionHeader title="Dig deeper" />
      <ListCard>
        {currentBudget ? (
          <ListRow
            icon={
              <IconTile bg={theme.colors.primarySoft}>
                <Wallet color={theme.colors.primary} size={19} />
              </IconTile>
            }
            title="Current budget"
            subtitle={
              hide
                ? 'Open to see what’s left'
                : currentBudgetRemaining < 0
                  ? `Over by ${formatAmount(Math.abs(currentBudgetRemaining), glyph)}`
                  : `${formatAmount(currentBudgetRemaining, glyph)} left of ${formatAmount(currentBudgetTotal, glyph)}`
            }
            onPress={() => nav.navigate('BudgetDetail', { budgetId: String(currentBudget.id) })}
            chevron
          />
        ) : null}
        <ListRow
          icon={
            <IconTile bg={theme.categories.bg[1]}>
              <PieChart color={theme.categories.fg[1]} size={19} />
            </IconTile>
          }
          title="Budget buckets"
          subtitle={bucketSpend[0] ? `${bucketLabel(bucketSpend[0].bucket)} leads${hide ? '' : ` at ${formatAmount(bucketSpend[0].amount, glyph)}`}` : 'No bucket spending yet'}
          onPress={() => activeRangeIso && nav.navigate('AnalyticsBucketDetail' as never, { range: activeRangeIso, timeframe } as never)}
          chevron
        />
        <ListRow
          icon={
            <IconTile bg={theme.categories.bg[2]}>
              <Layers color={theme.categories.fg[2]} size={19} />
            </IconTile>
          }
          title="Mini budgets"
          subtitle={miniSpend[0] ? `${miniSpend[0].mini} leads${hide ? '' : ` at ${formatAmount(miniSpend[0].amount, glyph)}`}` : 'No mini budget spending yet'}
          onPress={() => activeRangeIso && nav.navigate('AnalyticsMiniBudgetsDetail' as never, { range: activeRangeIso, timeframe } as never)}
          chevron
        />
        <ListRow
          icon={
            <IconTile bg={theme.colors.brassSoft}>
              <TrendingUp color={theme.colors.brass} size={19} />
            </IconTile>
          }
          title="Rising prices"
          subtitle="What your own needs cost now"
          onPress={() => nav.navigate('Prices' as never)}
          chevron
        />
        <ListRow
          icon={
            <IconTile bg={theme.colors.surfaceAlt}>
              <Calculator color={theme.colors.text} size={19} />
            </IconTile>
          }
          title="Tax estimates"
          subtitle={user?.taxProfile?.optInTaxFeature ? 'Using your tax settings' : 'Set up to estimate take-home pay'}
          onPress={() => nav.navigate('TaxSettings' as never)}
          chevron
        />
      </ListCard>
      </GuideAnchor>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  stack: { flexDirection: 'row', gap: 3, height: 10, marginBottom: 8 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }
});
