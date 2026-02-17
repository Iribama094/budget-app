import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Animated, Easing } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { getAnalyticsSummary, type AnalyticsSummary, listBudgets, listTransactions } from '../api/endpoints';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Card, InlineError, P, PrimaryButton, Screen, H1 } from '../components/Common/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { categoryDotColor, formatMoney, toIsoDate } from '../utils/format';
import { tokens } from '../theme/tokens';
import { useAmountVisibility } from '../contexts/AmountVisibilityContext';
import { Eye, EyeOff } from 'lucide-react-native';
import { useSpace } from '../contexts/SpaceContext';
import { SpaceSwitcher } from '../components/Common/SpaceSwitcher';
import { useTour, useTourAnchor } from '../contexts/TourContext';
import { useNudges } from '../contexts/NudgesContext';
import { NudgeTooltip } from '../components/Common/NudgeTooltip';

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
      if (!isBusiness) return key;
      if (key === 'Essential') return 'Operating Costs';
      if (key === 'Savings') return 'Reserves';
      if (key === 'Free Spending') return 'Discretionary';
      if (key === 'Investments') return 'Growth';
      if (key === 'Miscellaneous') return 'Misc Ops';
      if (key === 'Debt Financing') return 'Loans & Credit';
      return key;
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
  const currentBudgetRemaining = useMemo(() => Math.max(0, currentBudgetTotal - (Number(currentBudgetSpent) || 0)), [currentBudgetSpent, currentBudgetTotal]);

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
  const timeframeLabel = timeframe === 'daily' ? 'Today' : timeframe === 'weekly' ? 'This Week' : 'This Month';

  return (
    <Screen onRefresh={load} refreshing={isLoading}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <H1 style={{ marginBottom: 0 }}>Spending Insights</H1>
        <Pressable
          onPress={toggleShowAmounts}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          {showAmounts ? (
            <EyeOff color={theme.colors.textMuted} size={18} />
          ) : (
            <Eye color={theme.colors.textMuted} size={18} />
          )}
        </Pressable>
      </View>

      {spacesEnabled ? (
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>
            Viewing: {activeSpace?.name ?? 'Personal'}
          </Text>
          <SpaceSwitcher />
        </View>
      ) : null}

      <View style={{ marginTop: 14 }}>
        {error ? <InlineError message={error} /> : null}
        {isLoading ? <ActivityIndicator color={theme.colors.primary} /> : null}
      </View>

      {/* Timeframe filters moved here - just above Spending by Category */}
      <View style={{ marginTop: 12 }}>
        <View ref={timeframeAnchorRef} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', borderRadius: tokens.radius['3xl'], backgroundColor: theme.colors.surfaceAlt, padding: 4 }}>
          {(['daily', 'weekly', ...(spanMonths > 1 ? ['monthly'] : [])] as const).map((k) => {
            const active = timeframe === k;
            return (
              <Pressable key={k} onPress={() => setTimeframe(k as any)} style={({ pressed }) => [{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: tokens.radius['3xl'], backgroundColor: active ? theme.colors.primary : 'transparent', margin: 4, opacity: pressed ? 0.9 : 1 }]}>
                <Text style={{ color: active ? tokens.colors.white : theme.colors.text, fontWeight: '800' }}>{k.charAt(0).toUpperCase() + k.slice(1)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <NudgeTooltip
        visible={!isTourActive && !seen['analytics.timeframe'] && !isLoading && !error && !!data}
        targetRef={timeframeAnchorRef}
        title="Try this"
        body="Switch timeframe to see patterns (daily vs weekly vs monthly)."
        onDismiss={() => markSeen('analytics.timeframe')}
      />

      {/* Top highlight card: remaining budget for the current running budget */}
      <Card
        style={{
          marginTop: 12,
          paddingVertical: 16,
          paddingHorizontal: 14
        }}
      >
        <Text style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '700' }}>Remaining budget</Text>
        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 26, marginTop: 4 }}>
          {showAmounts ? formatMoney(currentBudgetRemaining, user?.currency ?? '₦') : '••••'}
        </Text>
        <Text style={{ color: theme.colors.textMuted, marginTop: 4, fontWeight: '600' }}>Current budget</Text>

        <View style={{ flexDirection: 'row', marginTop: 10, gap: 16 }}>
          <View>
            <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '600' }}>Income</Text>
            <Text style={{ color: theme.colors.text, fontWeight: '800', marginTop: 2, fontSize: 14 }}>
              {showAmounts ? formatMoney(data?.income ?? 0, user?.currency ?? '₦') : '••••'}
            </Text>
          </View>
          <View>
            <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '600' }}>Total budget</Text>
            <Text style={{ color: theme.colors.text, fontWeight: '800', marginTop: 2, fontSize: 14 }}>
              {showAmounts ? formatMoney(currentBudgetTotal, user?.currency ?? '₦') : '••••'}
            </Text>
          </View>
        </View>
      </Card>

      <View style={{ marginTop: 8 }}>
        <Pressable
          onPress={() => nav.navigate('TaxSettings' as never)}
          style={({ pressed }) => [{
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: theme.colors.surfaceAlt,
            opacity: pressed ? 0.85 : 1
          }]}
        >
          <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '600' }}>
            {user?.taxProfile?.optInTaxFeature
              ? 'Estimates assume your Tax Settings'
              : 'Refine estimates with your Tax Settings'}
          </Text>
          <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '800', marginLeft: 6 }}>
            Review
          </Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 14 }}>
        <Pressable
          onPress={() => {
            if (!activeRangeIso) return;
            nav.navigate('AnalyticsCategoryDetail' as never, { range: activeRangeIso, timeframe } as never);
          }}
          disabled={!activeRangeIso}
          style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
        >
        <Card>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Spending by Category</Text>
          <P style={{ marginTop: 6 }}>Where your money went this period.</P>

          <View style={{ marginTop: 10, gap: 10 }}>
            {categories.length === 0 ? (
              <P>No category spending data yet.</P>
            ) : (
              categories.map(({ category, amount }) => {
                const pct = Math.max(0.04, Math.min(1, amount / maxCat));
                const dot = categoryDotColor(category);
                return (
                  <View key={category} style={{ paddingVertical: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: dot, marginRight: 10 }} />
                        <Text style={{ color: theme.colors.text, fontWeight: '900' }} numberOfLines={1}>
                          {category}
                        </Text>
                      </View>
                      <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                        {showAmounts ? formatMoney(amount, user?.currency ?? '₦') : '••••'}
                      </Text>
                    </View>

                    <View
                      style={{
                        height: 10,
                        backgroundColor: theme.colors.surfaceAlt,
                        borderRadius: 999,
                        overflow: 'hidden',
                        marginTop: 8
                      }}
                    >
                      <LinearGradient
                        colors={[theme.colors.primary, tokens.colors.secondary[400]]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ width: `${Math.round(pct * 100)}%`, height: '100%' }}
                      />
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </Card>

        </Pressable>

        {/* Pull-to-refresh enabled on the screen — swipe down to refresh */}

        <Pressable
          onPress={() => {
            if (!activeRangeIso) return;
            nav.navigate('AnalyticsWeeklyDetail' as never, { range: activeRangeIso, timeframe } as never);
          }}
          disabled={!activeRangeIso}
          style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1, marginTop: 18 })}
        >
        <Card style={{ paddingVertical: 14, paddingHorizontal: 12 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18, marginBottom: 8 }}>Weekly overview</Text>

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 10 }}>
            {weekly.segmentsByDay.map((segments, idx) => {
              const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
              return (
                <View key={idx} style={{ flex: 1, alignItems: 'center' }}>
                  <View style={{ width: '60%', height: '100%', justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 999 }}>
                    {segments.reduceRight<React.ReactNode[]>((acc, seg, sIdx) => {
                      const heightPct = seg.value / total; // relative portion
                      const anim = bars[idx].interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, heightPct * 120]
                      });

                      acc.push(
                        <Animated.View
                          key={`${idx}-${sIdx}`}
                          style={{
                            height: anim,
                            backgroundColor: seg.color,
                            width: '100%'
                          }}
                        />
                      );
                      return acc;
                    }, [])}
                  </View>
                  <Text style={{ color: theme.colors.textMuted, marginTop: 6, fontSize: 12 }}>{weekly.labels[idx] ?? ''}</Text>
                </View>
              );
            })}
          </View>
        </Card>

        </Pressable>
      </View>

      <View style={{ marginTop: 14 }}>
        <Pressable
          onPress={() => {
            if (!activeRangeIso) return;
            nav.navigate('AnalyticsBucketDetail' as never, { range: activeRangeIso, timeframe } as never);
          }}
          disabled={!activeRangeIso}
          style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
        >
        <Card>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Spending by Budget Bucket</Text>
          <P style={{ marginTop: 6 }}>How spending maps to your budget buckets.</P>

          <View style={{ marginTop: 10, gap: 10 }}>
            {bucketSpend.length === 0 ? (
              <P>No bucket spending data yet.</P>
            ) : (
              bucketSpend.map(({ bucket, amount }) => {
                const pct = Math.max(0.04, Math.min(1, amount / maxBucket));
                return (
                  <View key={bucket} style={{ paddingVertical: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ color: theme.colors.text, fontWeight: '900', flex: 1, paddingRight: 12 }} numberOfLines={1}>
                        {bucketLabel(bucket)}
                      </Text>
                      <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                        {showAmounts ? formatMoney(amount, user?.currency ?? '₦') : '••••'}
                      </Text>
                    </View>

                    <View style={{ height: 8, backgroundColor: theme.colors.surfaceAlt, borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
                      <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', backgroundColor: theme.colors.primary }} />
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </Card>

        </Pressable>
      </View>

      <View style={{ marginTop: 14 }}>
        <Pressable
          onPress={() => {
            if (!activeRangeIso) return;
            nav.navigate('AnalyticsMiniBudgetsDetail' as never, { range: activeRangeIso, timeframe } as never);
          }}
          disabled={!activeRangeIso}
          style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
        >
        <Card>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Top Mini Budgets</Text>
          <P style={{ marginTop: 6 }}>A quick look at spending inside your mini budgets.</P>

          <View style={{ marginTop: 10, gap: 10 }}>
            {miniSpend.length === 0 ? (
              <P>No mini budget spending yet.</P>
            ) : (
              miniSpend.slice(0, 6).map(({ mini, amount }) => {
                const pct = Math.max(0.04, Math.min(1, amount / maxMini));
                return (
                  <View key={mini} style={{ paddingVertical: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ color: theme.colors.text, fontWeight: '900', flex: 1, paddingRight: 12 }} numberOfLines={1}>
                        {mini}
                      </Text>
                      <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                        {showAmounts ? formatMoney(amount, user?.currency ?? '₦') : '••••'}
                      </Text>
                    </View>

                    <View style={{ height: 8, backgroundColor: theme.colors.surfaceAlt, borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
                      <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', backgroundColor: tokens.colors.secondary[500] }} />
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </Card>

        </Pressable>
      </View>

      {/* Legacy QUICK TIP overlay removed in favor of Tour coachmarks */}
    </Screen>
  );
}
