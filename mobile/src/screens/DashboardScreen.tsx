import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Animated, ScrollView } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Plus, ChevronRight, Flame, Target, Eye, EyeOff, Bell, Sparkles, Wallet, BarChart3, List, CreditCard, Info } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { getAnalyticsSummary, listTransactions, listBudgets, listBankLinks, type AnalyticsSummary, type ApiTransaction, type ApiBudget } from '../api/endpoints';
import { Card, H1, InlineError, P, PrimaryButton, Screen } from '../components/Common/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { QuoteDisplay } from '../components/Dashboard/QuoteDisplay';
import { formatMoney, toIsoDate, toIsoDateTime } from '../utils/format';
import { tokens } from '../theme/tokens';
import { useAmountVisibility } from '../contexts/AmountVisibilityContext';
import { useNotificationBadges } from '../contexts/NotificationBadgeContext';
import { useSpace } from '../contexts/SpaceContext';
import { SpaceSwitcher } from '../components/Common/SpaceSwitcher';
import { useTour, useTourAnchor } from '../contexts/TourContext';
import { useNudges } from '../contexts/NudgesContext';

export function DashboardScreen() {
  const nav = useNavigation<any>();
  const { user, refreshUser } = useAuth();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId, activeSpace } = useSpace();
  const { isTourActive } = useTour();
  const { seen, markSeen } = useNudges();
  const [summaryRangeKey, setSummaryRangeKey] = useState<'today' | 'week' | 'month'>('month');
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [recent, setRecent] = useState<ApiTransaction[]>([]);
  const [currentBudget, setCurrentBudget] = useState<ApiBudget | null>(null);
  const [currentBudgetSpent, setCurrentBudgetSpent] = useState(0);
  const [currentBudgetTopSpend, setCurrentBudgetTopSpend] = useState<{ category: string; amount: number } | null>(null);
  const [bankSummary, setBankSummary] = useState<{ banks: number; accounts: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const introAnim = useRef(new Animated.Value(0)).current;
  const didMountRef = useRef(false);
  const { showAmounts, toggleShowAmounts } = useAmountVisibility();
  const notifAnim = useRef(new Animated.Value(0)).current;
  const { hasUnreadNotifications, hasAssistantUnread } = useNotificationBadges();

  const addTxAnchorRef = useTourAnchor('dashboard.addTx');
  const spaceSwitcherAnchorRef = useTourAnchor('space.switcher');

  const showAddTxNudge = !isTourActive && !seen['dashboard.addTx'] && !isLoading && !error && recent.length === 0;
  const showSpaceNudge = !isTourActive && !seen['space.switcher'] && spacesEnabled && !isLoading && !error && !showAddTxNudge;

  const hasTransactions = recent.length > 0;
  const hasBudget = !!currentBudget;
  const showGettingStarted = !isLoading && !error && !hasTransactions && !hasBudget;
  const showConnectBank = !isLoading && !error && (bankSummary?.banks ?? 0) === 0 && !!(user as any)?.premium;
  const summaryLabel = summaryRangeKey === 'today' ? 'Today' : summaryRangeKey === 'week' ? 'This week' : 'This month';
  const summaryLabelLower = summaryLabel.toLowerCase();

  const QuickAction = ({
    label,
    icon,
    onPress
  }: {
    label: string;
    icon: React.ReactNode;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          borderRadius: 16,
          paddingVertical: 12,
          paddingHorizontal: 12,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }]
        }
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{label}</Text>
        <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      </View>
    </Pressable>
  );

  const range = useMemo(() => {
    const now = new Date();

    if (summaryRangeKey === 'today') {
      return { start: toIsoDate(now), end: toIsoDate(now) };
    }

    if (summaryRangeKey === 'week') {
      const jsDay = now.getDay(); // 0 (Sun) - 6 (Sat)
      const offsetFromMonday = (jsDay + 6) % 7; // 0 = Mon
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetFromMonday);
      return { start: toIsoDate(start), end: toIsoDate(now) };
    }

    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: toIsoDate(start), end: toIsoDate(now) };
  }, [summaryRangeKey]);

  const parseIsoDateLocal = (value?: string | null) => {
    if (!value) return null;
    const raw = String(value);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
    if (Number.isNaN(d.getTime())) {
      const fallback = new Date(raw);
      if (Number.isNaN(fallback.getTime())) return null;
      return fallback;
    }
    return d;
  };

  const budgetEffectiveEndIso = useCallback(
    (b: ApiBudget): string => {
      if (b.endDate) return b.endDate;
      const start = parseIsoDateLocal(b.startDate);
      if (!start) return toIsoDate(new Date());

      const d = new Date(start);
      if (b.period === 'weekly') {
        d.setDate(d.getDate() + 6);
      } else {
        d.setMonth(d.getMonth() + 1);
        d.setDate(0);
      }
      return toIsoDate(d);
    },
    []
  );

  const isBudgetCurrent = useCallback(
    (b: ApiBudget) => {
      const start = parseIsoDateLocal(b.startDate);
      if (!start) return false;
      const end = parseIsoDateLocal(budgetEffectiveEndIso(b));
      if (!end) return false;

      const nowLocal = new Date();
      const today = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 12, 0, 0, 0);
      return today >= start && today <= end;
    },
    [budgetEffectiveEndIso]
  );

  const load = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const [summary, tx, budgetsRes, bankLinksRes] = await Promise.all([
        getAnalyticsSummary(range.start, range.end, spacesEnabled ? { spaceId: activeSpaceId } : undefined),
        listTransactions({ start: range.start, end: range.end, limit: 5, spaceId: spacesEnabled ? activeSpaceId : undefined }),
        listBudgets(spacesEnabled ? { spaceId: activeSpaceId } : undefined),
        listBankLinks(spacesEnabled ? { spaceId: activeSpaceId } : undefined).catch(() => ({ items: [] }))
      ]);
      setData(summary);
      const recentSorted = [...(tx.items || [])].sort((a, b) => {
        const at = Date.parse(a.occurredAt) || Date.parse((a as any).createdAt) || 0;
        const bt = Date.parse(b.occurredAt) || Date.parse((b as any).createdAt) || 0;
        return bt - at;
      });
      setRecent(recentSorted);
      const rawBudgets = (budgetsRes?.items ?? []) as ApiBudget[];
      const budgets = spacesEnabled
        ? rawBudgets.filter((b) => ((b.spaceId ?? 'personal') as 'personal' | 'business') === activeSpaceId)
        : rawBudgets;
      const picked = budgets.find((b) => isBudgetCurrent(b)) ?? budgets[0] ?? null;
      setCurrentBudget(picked);

      // Compute actual spend for the current budget from transactions.
      if (picked) {
        const startIso = picked.startDate;
        const endIso = budgetEffectiveEndIso(picked);

        // Use explicit local day boundaries converted to ISO datetimes to avoid
        // timezone edge cases when the API is queried with date-only strings.
        const startDate = parseIsoDateLocal(startIso) ?? new Date();
        startDate.setHours(0, 0, 0, 0);
        const endDate = parseIsoDateLocal(endIso) ?? new Date();
        endDate.setHours(23, 59, 59, 999);

        const start = toIsoDateTime(startDate);
        const end = toIsoDateTime(endDate);
        let cursor: string | undefined;
        let pages = 0;
        let spent = 0;
        const spentByCategory: Record<string, number> = {};

        while (pages < 5) {
          const page = await listTransactions({
            start,
            end,
            limit: 200,
            cursor,
            type: 'expense',
            budgetId: String(picked.id),
            spaceId: spacesEnabled ? activeSpaceId : undefined
          });
          for (const t of page.items || []) {
            const amt = Number(t.amount) || 0;
            spent += amt;
            const cat = String((t as any).category ?? '').trim();
            if (cat) spentByCategory[cat] = (spentByCategory[cat] ?? 0) + amt;
          }
          if (!page.nextCursor) break;
          cursor = page.nextCursor;
          pages += 1;
        }

        setCurrentBudgetSpent(spent);

        const entries = Object.entries(spentByCategory)
          .filter(([, v]) => Number(v) > 0)
          .sort((a, b) => Number(b[1]) - Number(a[1]));
        if (entries.length > 0) {
          const [cat, amt] = entries[0];
          setCurrentBudgetTopSpend({ category: cat, amount: Number(amt) || 0 });
        } else {
          setCurrentBudgetTopSpend(null);
        }
      } else {
        setCurrentBudgetSpent(0);
        setCurrentBudgetTopSpend(null);
      }

      const banks = bankLinksRes.items?.length ?? 0;
      const accounts = (bankLinksRes.items || []).reduce((sum, l: any) => sum + (l.accounts?.length ?? 0), 0);
      setBankSummary({ banks, accounts });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [range.end, range.start, spacesEnabled, activeSpaceId, budgetEffectiveEndIso, isBudgetCurrent]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(notifAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(notifAnim, { toValue: 0, duration: 900, useNativeDriver: true })
      ])
    ).start();
  }, [notifAnim]);

  useEffect(() => {
    introAnim.setValue(0);
    Animated.timing(introAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true
    }).start();
  }, [introAnim]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // If the user switches spaces while staying on this screen, reload immediately.
  useEffect(() => {
    void load();
  }, [activeSpaceId, spacesEnabled, load]);

  const displayName = user?.name?.trim() || user?.email || 'there';
  const greeting = `Hello, ${displayName}!`;
  const initials = (displayName || 'U').slice(0, 1).toUpperCase();
  const currency = user?.currency ?? '₦';

  const weekInfo = useMemo(() => {
    const now = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    const jsDay = now.getDay(); // 0 (Sun) - 6 (Sat)
    const offsetFromMonday = (jsDay + 6) % 7; // 0 = Mon
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetFromMonday);
    const totalDays = 7;
    const elapsed = Math.max(1, Math.min(totalDays, Math.floor((now.getTime() - startOfWeek.getTime()) / msPerDay) + 1));
    const remaining = Math.max(0, totalDays - elapsed);
    const pct = (elapsed / totalDays) * 100;
    return { elapsedDays: elapsed, remainingDays: remaining, progressPct: pct };
  }, []);

  const monthInfo = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const msPerDay = 1000 * 60 * 60 * 24;
    const elapsed = Math.max(1, Math.floor((now.getTime() - startOfMonth.getTime()) / msPerDay) + 1);
    const daysInMonth = endOfMonth.getDate();
    const timePct = (elapsed / daysInMonth) * 100;
    return { elapsedDays: elapsed, daysInMonth, timePct };
  }, []);

  const budgetUsed = currentBudgetSpent;

  const budgetStreakDays = useMemo(() => {
    const remaining = currentBudget ? currentBudget.totalBudget - budgetUsed : (data?.remainingBudget ?? 0);
    if (remaining < 0) return 0;
    return monthInfo.elapsedDays;
  }, [currentBudget, budgetUsed, data?.remainingBudget, monthInfo.elapsedDays]);

  const budgetRemaining = useMemo(() => {
    if (!currentBudget) return 0;
    return Math.max(0, currentBudget.totalBudget - budgetUsed);
  }, [currentBudget, budgetUsed]);

  const remainingBudgetForDisplay = useMemo(() => {
    return currentBudget ? currentBudget.totalBudget - budgetUsed : (data?.remainingBudget ?? 0);
  }, [currentBudget, budgetUsed, data?.remainingBudget]);

  const budgetProgress = useMemo(() => {
    if (!currentBudget || currentBudget.totalBudget <= 0) return 0;
    return Math.min(1, Math.max(0, budgetUsed / currentBudget.totalBudget));
  }, [currentBudget, budgetUsed]);

  const budgetBurn = useMemo(() => {
    if (!currentBudget || budgetUsed <= 0 || budgetRemaining <= 0) return null;
    try {
      const now = new Date();
      const start = new Date(currentBudget.startDate);
      const end = currentBudget.endDate ? new Date(currentBudget.endDate) : now;
      const effectiveEnd = now < end ? now : end;
      const msPerDay = 1000 * 60 * 60 * 24;
      if (!(start instanceof Date) || Number.isNaN(start.getTime())) return null;
      const daysElapsed = Math.max(1, Math.floor((effectiveEnd.getTime() - start.getTime()) / msPerDay) + 1);
      const dailyBurn = budgetUsed / daysElapsed;
      if (!Number.isFinite(dailyBurn) || dailyBurn <= 0) return null;
      const daysLeft = Math.floor(budgetRemaining / dailyBurn);
      if (!Number.isFinite(daysLeft) || daysLeft < 0) return null;
      return { daysElapsed, daysLeft };
    } catch {
      return null;
    }
  }, [currentBudget, budgetUsed, budgetRemaining]);

  const insightMessage = useMemo(() => {
    if (currentBudget && currentBudgetTopSpend && currentBudgetTopSpend.amount > 0) {
      return `Biggest spend in your current budget: ${currentBudgetTopSpend.category} (${showAmounts ? formatMoney(currentBudgetTopSpend.amount, currency) : '••••'}).`;
    }

    // Fallback: range-based summary if there's no current budget context.
    const byCat = data?.spendingByCategory ?? null;
    if (!byCat) return null;
    const entries = Object.entries(byCat)
      .filter(([, v]) => Number(v) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]));
    if (entries.length === 0) return 'No spending yet — add a transaction to unlock insights.';
    const [topCat, topAmt] = entries[0];
    return `Biggest spend ${summaryLabelLower}: ${topCat} (${showAmounts ? formatMoney(Number(topAmt) || 0, currency) : '••••'}).`;
  }, [currency, currentBudget, currentBudgetTopSpend, data?.spendingByCategory, showAmounts, summaryLabelLower]);

  const handleRefresh = async () => {
    // refresh main data and user profile
    try {
      await Promise.all([load(), refreshUser()]);
    } catch {
      // ignore
    }
  };

  return (
    <Screen onRefresh={handleRefresh} refreshing={isLoading}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <H1 style={{ fontSize: 20, fontWeight: '900' }}>
            {greeting}
          </H1>
          <P style={{ marginTop: 4, fontSize: 12 }} numberOfLines={1} ellipsizeMode="tail">
            Ready to manage your budget?
          </P>

          {spacesEnabled ? (
            <View style={{ marginTop: 10, alignItems: 'flex-start' }}>
              <Text style={{ color: theme.colors.textMuted, fontWeight: '800', marginBottom: 8 }}>
                Viewing: {activeSpace.name}
              </Text>
              <View ref={spaceSwitcherAnchorRef} style={{ alignSelf: 'flex-start' }}>
                <SpaceSwitcher compact />
              </View>
            </View>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* Notifications icon with red dot when there are unread notifications */}
          <Pressable
            onPress={() => nav.navigate('Notifications')}
            style={({ pressed }) => [{ padding: 6, borderRadius: 999, opacity: pressed ? 0.7 : 1 }]}
          >
            <Animated.View
              style={{
                padding: 6,
                borderRadius: 999,
                backgroundColor: theme.colors.surfaceAlt,
                transform: [
                  {
                    scale: notifAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] })
                  }
                ]
              }}
            >
              <View style={{ position: 'relative' }}>
                <Bell color={theme.colors.primary} size={18} />
                {hasUnreadNotifications && (
                  <View
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -2,
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      backgroundColor: tokens.colors.error[500]
                    }}
                  />
                )}
              </View>
            </Animated.View>
          </Pressable>

          {/* AI assistant icon with red dot when there are pending assistant messages */}
          <Pressable
            onPress={() => nav.navigate('AssistantModal' as never)}
            style={({ pressed }) => [{ padding: 6, borderRadius: 999, opacity: pressed ? 0.7 : 1 }]}
          >
            <View
              style={{
                padding: 6,
                borderRadius: 999,
                backgroundColor: theme.colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
              }}
            >
              <Sparkles color={theme.colors.primary} size={18} />
              {hasAssistantUnread && (
                <View
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: tokens.colors.error[500]
                  }}
                />
              )}
            </View>
          </Pressable>

          {/* Profile avatar */}
          <Pressable
            onPress={() => nav.navigate('Profile')}
            style={({ pressed }) => [
              {
                width: 48,
                height: 48,
                borderRadius: 18,
                backgroundColor: theme.colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.92 : 1
              }
            ]}
          >
            <Text style={{ color: tokens.colors.white, fontWeight: '900', fontSize: 18 }}>{initials}</Text>
          </Pressable>
        </View>
      </View>

      {/* Legacy QUICK TIP overlay removed in favor of Tour coachmarks */}

      <View style={{ marginTop: 6 }}>
        <QuoteDisplay />
      </View>

      {/* Quick Gradient Tiles */}
      <Animated.View
        style={{
          marginTop: 12,
          flexDirection: 'row',
          gap: 10,
          opacity: introAnim,
          transform: [
            {
              translateY: introAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] })
            }
          ]
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={() => nav.navigate('WeeklyCheckInDetail')}>
          <LinearGradient
            colors={[tokens.colors.secondary[500], tokens.colors.accent[400]]}
            style={{ flex: 1, borderRadius: 16, padding: 14 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ color: tokens.colors.white, fontWeight: '900', fontSize: 14 }}>Weekly check-in</Text>
                <Text style={{ color: tokens.colors.white, marginTop: 4, fontWeight: '800' }}>
                  {weekInfo.remainingDays > 0 ? `${weekInfo.remainingDays} day${weekInfo.remainingDays === 1 ? '' : 's'} left` : 'Week ending'}
                </Text>
                <P style={{ marginTop: 4, color: tokens.colors.white }}>
                  {Math.round(weekInfo.progressPct)}% of this week has passed.
                </P>
              </View>
              <View style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.15)', alignItems: 'center', justifyContent: 'center', marginLeft: 6 }}>
                <Target color={tokens.colors.white} size={18} />
              </View>
            </View>
          </LinearGradient>
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => nav.navigate('BudgetStreakDetail')}>
          <LinearGradient
            colors={[tokens.colors.primary[600], tokens.colors.primary[400]]}
            style={{ flex: 1, borderRadius: 16, padding: 14 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ color: tokens.colors.white, fontWeight: '900', fontSize: 14 }}>Budget streak</Text>
                <Text style={{ color: tokens.colors.white, marginTop: 4, fontWeight: '800' }}>
                  {budgetStreakDays > 0 ? `${budgetStreakDays} day${budgetStreakDays === 1 ? '' : 's'}` : 'No streak yet'}
                </Text>
                <P style={{ marginTop: 4, color: tokens.colors.white }}>
                  {remainingBudgetForDisplay >= 0
                    ? `You’ve stayed on budget so far ${summaryLabelLower}.`
                    : `You’ve gone over budget ${summaryLabelLower} — try resetting with a fresh plan.`}
                </P>
              </View>
              <View style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.15)', alignItems: 'center', justifyContent: 'center', marginLeft: 6 }}>
                <Flame color={tokens.colors.white} size={18} />
              </View>
            </View>
          </LinearGradient>
        </Pressable>
      </Animated.View>

      <View style={{ marginTop: 18 }}>
        {error ? <InlineError message={error} /> : null}
        {isLoading ? <ActivityIndicator color={theme.colors.primary} /> : null}
      </View>

      <View style={{ marginTop: 14 }}>
        <Animated.View
          style={{
            opacity: introAnim,
            transform: [
              {
                translateY: introAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] })
              }
            ]
          }}
        >
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>{summaryLabel}</Text>
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

            <View
              style={{
                marginTop: 10,
                flexDirection: 'row',
                backgroundColor: theme.colors.surfaceAlt,
                borderRadius: 999,
                padding: 4,
                borderWidth: 1,
                borderColor: theme.colors.border
              }}
            >
              {([
                { key: 'today' as const, label: 'Today' },
                { key: 'week' as const, label: 'Week' },
                { key: 'month' as const, label: 'Month' }
              ] as const).map((seg) => {
                const selected = summaryRangeKey === seg.key;
                return (
                  <Pressable
                    key={seg.key}
                    onPress={() => setSummaryRangeKey(seg.key)}
                    style={({ pressed }) => [
                      {
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 999,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: selected ? theme.colors.surface : 'transparent',
                        opacity: pressed ? 0.9 : 1
                      }
                    ]}
                  >
                    <Text style={{ color: selected ? theme.colors.text : theme.colors.textMuted, fontWeight: '900', fontSize: 12 }}>
                      {seg.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {!data && isLoading ? (
              <View style={{ marginTop: 12 }}>
                <View style={{ height: 28, borderRadius: 8, backgroundColor: theme.colors.surfaceAlt, width: '60%' }} />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ height: 18, borderRadius: 6, backgroundColor: theme.colors.surfaceAlt, width: '70%' }} />
                    <View style={{ height: 20, borderRadius: 6, backgroundColor: theme.colors.surfaceAlt, width: '80%', marginTop: 6 }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ height: 18, borderRadius: 6, backgroundColor: theme.colors.surfaceAlt, width: '70%' }} />
                    <View style={{ height: 20, borderRadius: 6, backgroundColor: theme.colors.surfaceAlt, width: '80%', marginTop: 6 }} />
                  </View>
                </View>
                <View style={{ marginTop: 16 }}>
                  <View style={{ height: 18, borderRadius: 6, backgroundColor: theme.colors.surfaceAlt, width: '50%' }} />
                  <View style={{ height: 20, borderRadius: 6, backgroundColor: theme.colors.surfaceAlt, width: '60%', marginTop: 6 }} />
                </View>
              </View>
            ) : (
              <>
                <Text style={{ color: theme.colors.text, fontSize: 32, fontWeight: '900', marginTop: 8 }}>
                  {showAmounts ? formatMoney(budgetRemaining, currency) : '••••'}
                </Text>
                <P style={{ marginTop: 6 }}>Remaining budget</P>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>Income</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 4 }}>
                      {showAmounts ? formatMoney(data?.income ?? 0, currency) : '••••'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>Expenses</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 4 }}>
                      {showAmounts ? formatMoney(data?.expenses ?? 0, currency) : '••••'}
                    </Text>
                  </View>
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>Total budget</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 4 }}>
                    {showAmounts ? formatMoney(currentBudget?.totalBudget ?? 0, currency) : '••••'}
                  </Text>
                </View>
              </>
            )}
            {!currentBudget ? (
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>No active budget</Text>
                <Text style={{ color: theme.colors.text, marginTop: 4 }}>
                  Create a budget to track how your spending compares to your plan.
                </Text>
                <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                  <PrimaryButton title="Create a budget" onPress={() => nav.navigate('Budget')} />
                </View>
              </View>
            ) : null}
          </Card>
        </Animated.View>
      </View>

      {bankSummary && (bankSummary.banks ?? 0) === 0 ? (
        <View style={{ marginTop: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Info color={theme.colors.textMuted} size={16} />
            <Text style={{ color: theme.colors.textMuted, fontWeight: '700', flex: 1 }} numberOfLines={2}>
              Tip: connect your bank to import transactions automatically.
            </Text>
          </View>

          <Pressable
            onPress={() => (nav as any).navigate('BankConnectTerms')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => [{ marginTop: 6, alignSelf: 'flex-start', opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Connect bank →</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={{ marginTop: 14 }}>
        <Pressable
          ref={addTxAnchorRef}
          onPress={() => nav.navigate('AddTransaction')}
          style={({ pressed }) => [
            {
              borderRadius: tokens.radius['2xl'],
              backgroundColor: theme.colors.primary,
              paddingVertical: 12,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 10,
              opacity: pressed ? 0.92 : 1,
              shadowColor: '#000',
              shadowOpacity: 0.12,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 }
            }
          ]}
        >
          <Plus color={tokens.colors.white} size={18} />
          <Text style={{ color: tokens.colors.white, fontWeight: '900' }}>Add Transaction</Text>
        </Pressable>
      </View>

      {(showAddTxNudge || showSpaceNudge) && (
        <View style={{ marginTop: 12 }}>
          {showAddTxNudge ? (
            <Card style={{ padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <Info color={theme.colors.textMuted} size={16} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Quick tip</Text>
                  <Text style={{ color: theme.colors.textMuted, marginTop: 4, lineHeight: 18 }}>
                    Start here: add your first transaction. Budgets and insights update automatically.
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    <Pressable
                      onPress={() => {
                        markSeen('dashboard.addTx');
                        nav.navigate('AddTransaction');
                      }}
                      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                    >
                      <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Add transaction →</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => markSeen('dashboard.addTx')}
                      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                    >
                      <Text style={{ color: theme.colors.textMuted, fontWeight: '900' }}>Dismiss</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Card>
          ) : null}

          {showSpaceNudge ? (
            <Card style={{ padding: 12, marginTop: showAddTxNudge ? 10 : 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <Info color={theme.colors.textMuted} size={16} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Spaces</Text>
                  <Text style={{ color: theme.colors.textMuted, marginTop: 4, lineHeight: 18 }}>
                    Keep Personal and Business money separate. Switch spaces anytime.
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    <Pressable
                      onPress={() => markSeen('space.switcher')}
                      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                    >
                      <Text style={{ color: theme.colors.textMuted, fontWeight: '900' }}>Dismiss</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Card>
          ) : null}
        </View>
      )}

      {showGettingStarted ? (
        <View style={{ marginTop: 12 }}>
          <Card>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Getting started</Text>
            <Text style={{ color: theme.colors.textMuted, marginTop: 6 }}>
              Add a transaction first — then set a budget and a goal. You’ll start seeing insights right away.
            </Text>

            <View style={{ marginTop: 12, flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton title="Add transaction" onPress={() => nav.navigate('AddTransaction')} />
              </View>
              <View style={{ flex: 1 }}>
                <Pressable
                  onPress={() => nav.navigate('Budget')}
                  style={({ pressed }) => [
                    {
                      borderRadius: tokens.radius['2xl'],
                      paddingVertical: 14,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceAlt,
                      opacity: pressed ? 0.92 : 1,
                      transform: [{ scale: pressed ? 0.985 : 1 }]
                    }
                  ]}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Create budget</Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={() => nav.navigate('Goals')}
              style={({ pressed }) => [{ marginTop: 10, alignSelf: 'flex-start', opacity: pressed ? 0.9 : 1 }]}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Set a goal →</Text>
            </Pressable>
          </Card>
        </View>
      ) : null}

      {/* Quick actions removed as requested */}

      <View style={{ marginTop: 18 }}>
        {insightMessage && (
          <Card style={{ marginBottom: 10 }}>
            <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>Insight</Text>
            <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 6 }}>{insightMessage}</Text>
          </Card>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Recent Activity</Text>
          <Pressable onPress={() => nav.navigate('Transactions')} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>View All</Text>
            <ChevronRight color={theme.colors.primary} size={18} />
          </Pressable>
        </View>

        <View style={{ marginTop: 10, gap: 10 }}>
          {recent.length === 0 ? (
            <Card>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }}>No transactions yet</Text>
              <Text style={{ color: theme.colors.textMuted, marginTop: 6 }}>
                Add your first transaction to start tracking spending.
              </Text>
            </Card>
          ) : (
            <Card style={{ paddingVertical: 12, paddingHorizontal: 12 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {recent.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => nav.navigate('TransactionDetail', { id: String(t.id) })}
                    style={({ pressed }) => [
                      {
                        width: 220,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surfaceAlt,
                        borderRadius: tokens.radius['2xl'],
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        opacity: pressed ? 0.92 : 1
                      }
                    ]}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: '900' }} numberOfLines={1}>
                      {t.description || 'Transaction'}
                    </Text>
                    <Text style={{ color: theme.colors.textMuted, marginTop: 4, fontWeight: '700' }} numberOfLines={1}>
                      {t.category}
                    </Text>
                    <Text
                      style={{
                        marginTop: 10,
                        fontWeight: '900',
                        color: t.type === 'expense' ? theme.colors.error : theme.colors.success
                      }}
                    >
                      {t.type === 'expense' ? '-' : '+'}
                      {showAmounts ? formatMoney(t.amount, currency) : '••••'}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Card>
          )}
        </View>
      </View>

      {/* Pull-to-refresh enabled on the screen — no explicit buttons needed */}
    </Screen>
  );
}
