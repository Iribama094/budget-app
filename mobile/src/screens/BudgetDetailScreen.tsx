import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Animated, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';

import { calcTax, deleteBudget, deleteBudgetInSpace, getBudget, getBudgetInSpace, listTransactions, type ApiBudget, type ApiTransaction } from '../api/endpoints';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { useAmountVisibility } from '../contexts/AmountVisibilityContext';
import { useToast } from '../components/Common/Toast';
import { Screen, SecondaryButton } from '../components/Common/ui';
import { formatMoney, toIsoDate, toIsoDateTime } from '../utils/format';
import { tokens } from '../theme/tokens';

function parseIsoDateLocal(value?: string | null) {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function getBudgetRange(b: ApiBudget) {
  const start = parseIsoDateLocal(b.startDate) ?? new Date();
  let end = parseIsoDateLocal(b.endDate ?? null);
  if (!end) {
    if (b.period === 'weekly') {
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    } else {
      end = new Date(start);
      end.setMonth(start.getMonth() + 1);
      end.setDate(0);
    }
  }
  const msPerDay = 1000 * 60 * 60 * 24;
  const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1);
  const weeks = Math.max(1, Math.ceil(days / 7));
  const months = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1);

  return {
    start,
    end,
    startIso: toIsoDate(start),
    endIso: toIsoDate(end),
    days,
    weeks,
    months
  };
}

export default function BudgetDetailScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const budgetId = String(route.params?.budgetId ?? '');

  const { user } = useAuth();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const { showAmounts } = useAmountVisibility();
  const toast = useToast();

  const [budget, setBudget] = useState<ApiBudget | null>(null);
  const [txSummary, setTxSummary] = useState<{ income: number; expenses: number; spentByCategory: Record<string, number> }>({
    income: 0,
    expenses: 0,
    spentByCategory: {}
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  const [isEstimating, setIsEstimating] = useState(false);
  const [lastTaxEstimate, setLastTaxEstimate] = useState<number | null>(null);
  const [lastTaxLabel, setLastTaxLabel] = useState<string | null>(null);

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

  const budgetRange = useMemo(() => {
    if (!budget) return null;
    return getBudgetRange(budget);
  }, [budget?.id, budget?.startDate, budget?.endDate, budget?.period]);

  useEffect(() => {
    if (!budgetRange) return;
    if (budgetRange.months > 1 && timeframe !== 'monthly') setTimeframe('monthly');
    if (budgetRange.months <= 1 && timeframe === 'monthly') setTimeframe('weekly');
  }, [budgetRange?.months]);

  const progressBarsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progressBarsAnim.setValue(0);
    Animated.timing(progressBarsAnim, {
      toValue: 1,
      duration: 450,
      useNativeDriver: false
    }).start();
  }, [budget?.id, txSummary.income, txSummary.expenses, progressBarsAnim]);

  const load = useCallback(async () => {
    if (!budgetId) return;
    setError(null);
    setIsLoading(true);
    try {
      const b = spacesEnabled ? await getBudgetInSpace(budgetId, activeSpaceId) : await getBudget(budgetId);

      // Safety net: if spaces are enabled, ignore mismatched space docs.
      if (spacesEnabled) {
        const docSpace = (b.spaceId ?? 'personal') as 'personal' | 'business';
        if (docSpace !== activeSpaceId) {
          setBudget(null);
          setTxSummary({ income: 0, expenses: 0, spentByCategory: {} });
          setError('Budget not found in this space');
          return;
        }
      }

      setBudget(b);

      const r = getBudgetRange(b);
      const start = new Date(r.start);
      start.setHours(0, 0, 0, 0);
      const end = new Date(r.end);
      end.setHours(23, 59, 59, 999);

      let cursor: string | null = null;
      const all: ApiTransaction[] = [];
      do {
        const res = await listTransactions({
          start: toIsoDateTime(start),
          end: toIsoDateTime(end),
          limit: 200,
          cursor: cursor ?? undefined,
          spaceId: spacesEnabled ? activeSpaceId : undefined
        });
        all.push(...(res.items || []));
        cursor = res.nextCursor ?? null;
      } while (cursor);

      const summary = { income: 0, expenses: 0, spentByCategory: {} as Record<string, number> };
      for (const t of all) {
        if (String(t.budgetId ?? '') !== String(budgetId)) continue;

        if (t.type === 'income') {
          summary.income += t.amount;
          continue;
        }

        summary.expenses += t.amount;
        const key = (t.budgetCategory || (t as any).category || '').trim();
        if (key) summary.spentByCategory[key] = (summary.spentByCategory[key] ?? 0) + t.amount;
      }

      setTxSummary(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load budget');
    } finally {
      setIsLoading(false);
    }
  }, [activeSpaceId, budgetId, spacesEnabled]);

  const confirmDelete = useCallback(() => {
    if (!budget) return;
    Alert.alert('Delete budget?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (spacesEnabled) await deleteBudgetInSpace(budget.id, activeSpaceId);
            else await deleteBudget(budget.id);
            toast.show('Budget deleted');
            nav.goBack();
          } catch (e) {
            toast.show(e instanceof Error ? e.message : 'Failed to delete budget');
          }
        }
      }
    ]);
  }, [activeSpaceId, budget, nav, spacesEnabled, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const currency = user?.currency ?? '₦';

  const effectiveTotal = useMemo(() => {
    if (!budget) return 0;
    return Math.max(0, budget.totalBudget ?? 0);
  }, [budget]);

  const used = txSummary.expenses ?? 0;
  const remaining = Math.max(0, effectiveTotal - used);
  const progress = effectiveTotal > 0 ? Math.min(1, Math.max(0, used / effectiveTotal)) : 0;

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const title = useMemo(() => {
    if (!budgetRange || !budget) return budget?.name ?? 'Budget';
    const s = budgetRange.start;
    const e = budgetRange.end;
    const sameYear = s.getFullYear() === e.getFullYear();
    const sameMonth = s.getMonth() === e.getMonth() && sameYear;
    if (sameMonth) return `My Budget (${MONTHS[s.getMonth()]} ${s.getFullYear()})`;
    if (sameYear) return `My Budget (${MONTHS[s.getMonth()]}-${MONTHS[e.getMonth()]} ${s.getFullYear()})`;
    return `My Budget (${MONTHS[s.getMonth()]} ${s.getFullYear()}-${MONTHS[e.getMonth()]} ${e.getFullYear()})`;
  }, [budget, budgetRange]);

  return (
    <Screen scrollable onRefresh={load} refreshing={isLoading}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable
          onPress={() => nav.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.8 : 1 })}
        >
          <ChevronLeft color={theme.colors.text} size={20} />
          <Text style={{ color: theme.colors.text, fontWeight: '900', marginLeft: 6 }}>Back</Text>
        </Pressable>

        {budget ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              onPress={() => {
                nav.navigate('Main', { screen: 'Budget', params: { editBudgetId: budget.id } });
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.colors.surfaceAlt }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Edit</Text>
              </View>
            </Pressable>

            <Pressable
              onPress={confirmDelete}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.colors.surfaceAlt }}>
                <Text style={{ color: theme.colors.error, fontWeight: '900' }}>Delete</Text>
              </View>
            </Pressable>
          </View>
        ) : null}
      </View>

      {error ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: tokens.colors.error[500], fontWeight: '800' }}>{error}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <View style={{ marginTop: 12 }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : null}

      {budget ? (
        <View style={{ marginTop: 12 }}>
          <LinearGradient
            colors={[tokens.colors.secondary[400], tokens.colors.primary[500]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ paddingHorizontal: 16, paddingVertical: 16, borderRadius: 20, overflow: 'hidden' }}
          >
            <Text style={{ color: tokens.colors.white, fontWeight: '900', fontSize: 18 }} numberOfLines={2}>
              {title}
            </Text>

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: tokens.colors.white, fontWeight: '900', fontSize: 24 }}>
                {showAmounts ? formatMoney(effectiveTotal, currency) : '••••'}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 4, fontWeight: '700' }}>Total budget</Text>
              {txSummary.income > 0 ? (
                <Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: 4, fontWeight: '700', fontSize: 12 }}>
                  Includes income added: {formatMoney(txSummary.income, currency)}
                </Text>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: 12 }}>Spent</Text>
                <Text style={{ color: tokens.colors.white, fontWeight: '900', marginTop: 4 }}>
                  {showAmounts ? formatMoney(used, currency) : '••••'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: 12 }}>Remaining</Text>
                <Text style={{ color: tokens.colors.white, fontWeight: '900', marginTop: 4 }}>
                  {showAmounts ? formatMoney(remaining, currency) : '••••'}
                </Text>
              </View>
            </View>

            <View style={{ height: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 999, overflow: 'hidden', marginTop: 12 }}>
              <Animated.View
                style={{
                  width: progressBarsAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${Math.round(progress * 100)}%`] }),
                  height: '100%',
                  backgroundColor: tokens.colors.white
                }}
              />
            </View>
          </LinearGradient>

          {/* Monthly overview when budget spans multiple months */}
          {budgetRange && budgetRange.months > 1 ? (
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>Monthly overview</Text>
              <View style={{ marginTop: 10 }}>
                {Array.from({ length: budgetRange.months }).map((_, i) => {
                  const d = new Date(budgetRange.start.getFullYear(), budgetRange.start.getMonth() + i, 1);
                  const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
                  const amount = Math.round(effectiveTotal / budgetRange.months);
                  return (
                    <View key={`${d.getFullYear()}-${d.getMonth()}`} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: theme.colors.border }}>
                      <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>{label}</Text>
                      <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 6, fontSize: 15 }}>{formatMoney(amount, currency)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Categories */}
          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Categories</Text>

              {budgetRange ? (
                <View style={{ flexDirection: 'row', borderRadius: tokens.radius['3xl'], backgroundColor: theme.colors.surfaceAlt, padding: 4 }}>
                  {(
                    (budgetRange.months > 1
                      ? (['daily', 'weekly', 'monthly'] as Array<'daily' | 'weekly' | 'monthly'>)
                      : (['daily', 'weekly'] as Array<'daily' | 'weekly' | 'monthly'>))
                  ).map((k) => {
                    const active = timeframe === k;
                    return (
                      <Pressable
                        key={k}
                        onPress={() => setTimeframe(k)}
                        style={({ pressed }) => [
                          {
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: tokens.radius['3xl'],
                            backgroundColor: active ? theme.colors.primary : 'transparent',
                            marginHorizontal: 2,
                            opacity: pressed ? 0.9 : 1
                          }
                        ]}
                      >
                        <Text style={{ color: active ? tokens.colors.white : theme.colors.text, fontWeight: '800' }}>{k.charAt(0).toUpperCase() + k.slice(1)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <View style={{ marginTop: 10, gap: 10 }}>
              {Object.entries(budget.categories || {}).map(([cat, c]) => {
                const spent = txSummary.spentByCategory[cat] ?? 0;
                const pct = c.budgeted > 0 ? Math.min(1, Math.max(0, spent / c.budgeted)) : 0;

                const periodDivisor = !budgetRange
                  ? 1
                  : timeframe === 'daily'
                    ? budgetRange.days
                    : timeframe === 'weekly'
                      ? budgetRange.weeks
                      : budgetRange.months;

                const suggested = Math.round(c.budgeted / Math.max(1, periodDivisor));

                return (
                  <View key={cat} style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.colors.border }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{bucketLabel(cat)}</Text>
                      <Pressable
                        onPress={() => nav.navigate('MiniBudgets', { budgetId: budget.id, category: cat })}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                      >
                        <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: theme.colors.surfaceAlt }}>
                          <Text style={{ color: theme.colors.textMuted, fontWeight: '900', fontSize: 11 }}>Mini budgets</Text>
                        </View>
                      </Pressable>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                      <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>Budgeted</Text>
                      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{formatMoney(c.budgeted, currency)}</Text>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                      <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>Suggested ({timeframe})</Text>
                      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{formatMoney(suggested, currency)}</Text>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                      <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>Spent</Text>
                      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{formatMoney(spent, currency)}</Text>
                    </View>

                    <View style={{ height: 10, backgroundColor: theme.colors.surfaceAlt, borderRadius: 999, overflow: 'hidden', marginTop: 10 }}>
                      <Animated.View
                        style={{
                          width: progressBarsAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${Math.round(pct * 100)}%`] }),
                          height: '100%',
                          backgroundColor: theme.colors.primary
                        }}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Burn rate insight */}
          {(() => {
            if (!budgetRange || used <= 0 || remaining <= 0) return null;
            const now = new Date();
            const effectiveEnd = now < budgetRange.end ? now : budgetRange.end;
            if (effectiveEnd <= budgetRange.start) return null;
            const msPerDay = 1000 * 60 * 60 * 24;
            const daysElapsed = Math.max(1, Math.floor((effectiveEnd.getTime() - budgetRange.start.getTime()) / msPerDay) + 1);
            const dailyBurn = used / daysElapsed;
            if (!Number.isFinite(dailyBurn) || dailyBurn <= 0) return null;
            const estDaysLeft = Math.floor(remaining / dailyBurn);
            if (!Number.isFinite(estDaysLeft) || estDaysLeft < 0) return null;

            return (
              <View style={{ marginTop: 14 }}>
                <Text style={{ color: theme.colors.textMuted, fontWeight: '800', fontSize: 12 }}>Burn rate</Text>
                <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 6 }}>
                  At your recent pace, you have ~{estDaysLeft} day{estDaysLeft === 1 ? '' : 's'} of budget left.
                </Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 4 }}>
                  Based on {daysElapsed} day{daysElapsed === 1 ? '' : 's'} of activity in this budget period.
                </Text>
              </View>
            );
          })()}

          {/* Tax estimator button: visible only when user has opted in to tax features */}
          {user?.taxProfile?.optInTaxFeature ? (
            <View style={{ marginTop: 14 }}>
              <SecondaryButton
                title={isEstimating ? 'Estimating…' : lastTaxEstimate != null ? 'Update tax estimate' : 'Estimate tax for this budget'}
                onPress={async () => {
                  if (!user) return toast.show('No user data available', 'error');
                  if (!user.taxProfile?.optInTaxFeature) return toast.show('Enable tax features in Settings', 'error');

                  if (!budgetRange) return toast.show('Budget range unavailable', 'error');

                  setIsEstimating(true);
                  try {
                    let grossMonthly: number | null = null;
                    if (typeof user.taxProfile?.grossMonthlyIncome === 'number') grossMonthly = user.taxProfile.grossMonthlyIncome;
                    if (grossMonthly == null && typeof user.monthlyIncome === 'number') grossMonthly = user.monthlyIncome;
                    if (!grossMonthly) throw new Error('Add your monthly income in Profile settings');

                    const grossAnnual = grossMonthly * 12;
                    const res = await calcTax({ country: (user.taxProfile?.country as string) || 'NG', grossAnnual });
                    const annualTax: number | null = typeof (res as any).totalTax === 'number' ? (res as any).totalTax : null;
                    if (!annualTax) throw new Error('Could not estimate tax with current info');

                    const periodMonths = budgetRange.months;
                    const monthlyTax = annualTax / 12;
                    const periodTax = Math.round(monthlyTax * periodMonths);

                    const label = periodMonths === 1 ? 'this month' : `${periodMonths}-month budget`;
                    setLastTaxEstimate(periodTax);
                    setLastTaxLabel(label);
                    toast.show(`Estimated tax for ${label}: ${periodTax.toLocaleString()}`, 'success');
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : 'Estimate failed';
                    toast.show(msg, 'error');
                  } finally {
                    setIsEstimating(false);
                  }
                }}
              />

              {lastTaxEstimate != null && lastTaxLabel ? (
                <Text style={{ color: theme.colors.textMuted, fontWeight: '700', marginTop: 8 }}>
                  Last estimate for {lastTaxLabel}: {lastTaxEstimate.toLocaleString()}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
