import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Animated, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ArrowDownLeft, ArrowUpRight, Bell, CalendarCheck, Check, ChevronRight, Eye, EyeOff, Flame, Gift, Landmark, PartyPopper, Settings as SettingsIcon, Sparkles, Users, WifiOff } from '../icons';
import { useSync } from '../contexts/SyncContext';
import { publishWidgetSnapshot } from '../lib/widgetData';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  getAnalyticsSummary,
  getBudgetPace,
  listTransactions,
  listBudgets,
  listBankLinks,
  type AnalyticsSummary,
  type ApiBudgetPace,
  type ApiTransaction,
  type ApiBudget
} from '../api/endpoints';
import {
  Amount,
  Card,
  Chip,
  EmptyState,
  HeroCard,
  IconButton,
  IconTile,
  InlineError,
  ListCard,
  ListRow,
  PrimaryButton,
  ProgressBar,
  Screen,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  formatAmount
} from '../components/Common/ui';
import { CategoryIcon } from '../components/Common/CategoryIcon';
import { currencySymbol, formatLongToday, formatMoney, formatRelativeDay, toIsoDate, toIsoDateTime } from '../utils/format';
import { fonts, type } from '../theme/typography';
import { useAmountVisibility } from '../contexts/AmountVisibilityContext';
import { useNotificationBadges } from '../contexts/NotificationBadgeContext';
import { useSpace } from '../contexts/SpaceContext';
import { SpaceSwitcher } from '../components/Common/SpaceSwitcher';
import { useTour, useTourAnchor } from '../contexts/TourContext';
import { useNudges } from '../contexts/NudgesContext';
import { FirstWeekChecklist } from '../components/Home/FirstWeekChecklist';
import { InsightCards } from '../components/Home/InsightCards';
import { BusinessHome } from '../components/Home/BusinessHome';
import { TeamHome } from '../components/Home/TeamHome';
import { useTeam } from '../contexts/TeamContext';
import { PendingSavingsCard } from '../components/Home/PendingSavingsCard';
import { ShortfallCard } from '../components/Home/ShortfallCard';
import { usePlan } from '../lib/usePlan';
import { useConfig } from '../contexts/ConfigContext';
import { readCache, writeCache } from '../lib/localCache';
import { useHiddenIds } from '../lib/undoDelete';

type HomeSnapshot = {
  data: AnalyticsSummary;
  recent: ApiTransaction[];
  currentBudget: ApiBudget | null;
  alsoRunning: ApiBudget[];
  currentBudgetSpent: number;
  currentBudgetTopSpend: { category: string; amount: number } | null;
};

export function DashboardScreen() {
  const nav = useNavigation<any>();
  const { user, refreshUser } = useAuth();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId, activeSpace } = useSpace();
  const { role: teamRole } = useTeam();
  const { isTourActive } = useTour();
  const { seen, markSeen } = useNudges();
  const [summaryRangeKey, setSummaryRangeKey] = useState<'today' | 'week' | 'month'>('month');
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [recentAll, setRecent] = useState<ApiTransaction[]>([]);
  const hiddenIds = useHiddenIds();
  const recent = useMemo(() => recentAll.filter((t) => !hiddenIds.has(String(t.id))), [recentAll, hiddenIds]);
  const [currentBudget, setCurrentBudget] = useState<ApiBudget | null>(null);
  // Other budgets running now (a shared one, an event), shown as one-tap links under the main card.
  const [alsoRunning, setAlsoRunning] = useState<ApiBudget[]>([]);
  // Read inside load without making it reload on every profile refresh; Home reloads on focus anyway.
  const homeBudgetRef = useRef(user?.homeBudget);
  homeBudgetRef.current = user?.homeBudget;
  const [currentBudgetSpent, setCurrentBudgetSpent] = useState(0);
  const [currentBudgetTopSpend, setCurrentBudgetTopSpend] = useState<{ category: string; amount: number } | null>(null);
  const [bankSummary, setBankSummary] = useState<{ banks: number; accounts: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const introAnim = useRef(new Animated.Value(0)).current;
  const didMountRef = useRef(false);
  const { showAmounts, toggleShowAmounts } = useAmountVisibility();
  const { isOnline, queued } = useSync();
  const notifAnim = useRef(new Animated.Value(0)).current;
  const { hasUnreadNotifications } = useNotificationBadges();
  // The plan tells us when regular bills are bigger than income, which changes how Home talks about "over budget".
  const plan = usePlan(!(spacesEnabled && activeSpaceId === 'business'));
  const planShort = plan?.status === 'short' && plan.shortfall > 0;

  const addTxAnchorRef = useTourAnchor('dashboard.addTx');
  const heroAnchorRef = useTourAnchor('dashboard.hero');
  const spaceSwitcherAnchorRef = useTourAnchor('space.switcher');

  const showAddTxNudge = !isTourActive && !seen['dashboard.addTx'] && !isLoading && !error && recent.length === 0;
  const showSpaceNudge = !isTourActive && !seen['space.switcher'] && spacesEnabled && !isLoading && !error && !showAddTxNudge;

  const hasTransactions = recent.length > 0;
  const hasBudget = !!currentBudget;
  const showGettingStarted = !isLoading && !error && !hasTransactions && !hasBudget;
  const showConnectBank = !isLoading && !error && (bankSummary?.banks ?? 0) === 0 && !!(user as any)?.premium;
  /**
   * Wrapped shows only when the staff console says so: a period that has been certified, inside its window.
   * Off season there is no card here at all, and the calendar alone never brings it back.
   */
  const wrapped = useConfig().wrappedFor(spacesEnabled && activeSpaceId === 'business' ? 'business' : 'personal');
  const wrappedPromo = useMemo(() => {
    if (!wrapped.available) return null;
    const { kind, year, quarter } = wrapped;
    if (kind === 'quarter') {
      return { kind, year, title: `Q${quarter} ${year} don wrap 🎁`, line: 'How the business did last quarter, in one story.' };
    }
    if (kind === 'h1') return { kind, year, title: `Your ${year} half-year is ready 🎁`, line: 'See how January to June went. Tap to open am!' };
    return { kind, year, title: `${year} don wrap 🎁`, line: 'The whole year in one story. Who you be with money?' };
  }, [wrapped]);
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
      // Home shows one budget: your own plan, or the shared one if that's what you chose.
      const running = budgets.filter((b) => isBudgetCurrent(b));
      const own = running.filter((b) => b.role !== 'member' && (b.purpose ?? 'personal') === 'personal');
      const shared = running.filter((b) => b.purpose === 'household' || b.isShared);
      const preferred = homeBudgetRef.current === 'shared' ? shared[0] ?? own[0] : own[0] ?? shared[0];
      const picked = preferred ?? running.find((b) => b.purpose !== 'event') ?? running[0] ?? budgets[0] ?? null;
      setCurrentBudget(picked);
      setAlsoRunning(running.filter((b) => b.id !== picked?.id));

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

  // Home opens on the last numbers this phone saw, then quietly updates, instead of starting on a spinner.
  const cacheKey = user?.id ? `home:${user.id}:${spacesEnabled ? activeSpaceId : 'personal'}:${summaryRangeKey}` : null;
  useEffect(() => {
    if (!cacheKey) return;
    let cancelled = false;
    readCache<HomeSnapshot>(cacheKey).then((s) => {
      if (cancelled || !s) return;
      setData((d) => d ?? s.data);
      setRecent((r) => (r.length ? r : s.recent));
      setCurrentBudget((b) => b ?? s.currentBudget);
      setAlsoRunning((a) => (a.length ? a : s.alsoRunning));
      setCurrentBudgetSpent((v) => v || s.currentBudgetSpent);
      setCurrentBudgetTopSpend((v) => v ?? s.currentBudgetTopSpend);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);
  const wasLoading = useRef(false);
  useEffect(() => {
    const finished = wasLoading.current && !isLoading;
    wasLoading.current = isLoading;
    if (!finished || error || !data || !cacheKey) return;
    const snapshot: HomeSnapshot = { data, recent: recentAll, currentBudget, alsoRunning, currentBudgetSpent, currentBudgetTopSpend };
    writeCache(cacheKey, snapshot);
    // Only when a load finishes; the values are read as they are at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

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
    return currentBudget.totalBudget - budgetUsed;
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
    if (entries.length === 0) return 'No spending yet. Add a transaction to unlock insights.';
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

  const glyph = currencySymbol(currency);
  const hide = !showAmounts;
  const nameParts = (user?.name ?? '').trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? null;
  const avatarInitials = ((nameParts[0]?.[0] ?? user?.email?.[0] ?? 'U') + (nameParts[1]?.[0] ?? '')).toUpperCase();
  const hour = new Date().getHours();
  const greetingWord = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Safe to spend comes from the server, which holds back unsaved Savings and bills still due this period.
  // Refetched whenever spending changes; until it arrives (or offline) the simpler local figure is used.
  const [serverPace, setServerPace] = useState<(ApiBudgetPace & { budgetId: string }) | null>(null);
  useEffect(() => {
    const id = currentBudget?.id;
    if (!id) return;
    let cancelled = false;
    getBudgetPace(String(id))
      .then((p) => !cancelled && setServerPace({ ...p, budgetId: String(id) }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [currentBudget?.id, budgetUsed]);

  // Budget pace: share of the budget spent against share of its time that has passed. A starter budget (joined
  // mid-period) only holds what was left on the day they joined, so its time is measured from that day.
  const pace = useMemo(() => {
    if (!currentBudget) return null;
    const start = parseIsoDateLocal(currentBudget.trackingStart ?? currentBudget.startDate);
    const end = parseIsoDateLocal(budgetEffectiveEndIso(currentBudget));
    if (!start || !end) return null;
    const msPerDay = 1000 * 60 * 60 * 24;
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / msPerDay) + 1);
    const elapsedDays = Math.min(totalDays, Math.max(1, Math.floor((today.getTime() - start.getTime()) / msPerDay) + 1));
    const daysLeft = Math.max(1, totalDays - elapsedDays + 1);
    const left = currentBudget.totalBudget - budgetUsed;
    const spentRatio = currentBudget.totalBudget > 0 ? budgetUsed / currentBudget.totalBudget : 0;
    const timeRatio = elapsedDays / totalDays;
    const status: 'over' | 'hot' | 'onPace' = left < 0 ? 'over' : spentRatio > timeRatio + 0.05 ? 'hot' : 'onPace';
    const server = serverPace && serverPace.budgetId === String(currentBudget.id) ? serverPace : null;
    const safePerDay = server ? server.safePerDay : left > 0 ? left / daysLeft : 0;
    const heldBack = server ? server.savingsLeft + server.billsTotal : 0;
    return { left, daysLeft, spentRatio, timeRatio, safePerDay, heldBack, status };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBudget, budgetUsed, budgetEffectiveEndIso, serverPace]);

  const inkText = theme.colors.inkText;
  const paceLabel = pace?.status === 'over' ? 'Over budget' : pace?.status === 'hot' ? 'Spending fast' : 'On pace';

  // Keep the home-screen widget in step with what Home shows (respecting hidden amounts).
  useEffect(() => {
    if (isLoading) return;
    const mask = (s: string) => (showAmounts ? s : '••••');
    void publishWidgetSnapshot(
      currentBudget && pace
        ? {
            status: pace.status,
            safeToday: mask(formatAmount(pace.status === 'over' ? Math.abs(pace.left) : Math.round(pace.safePerDay), glyph)),
            left: mask(formatAmount(Math.max(0, pace.left), glyph)),
            daysLeft: pace.daysLeft,
            label: currentBudget.name.replace(/^My Budget \((.*)\)$/, '$1'),
            updatedAt: new Date().toISOString()
          }
        : { status: 'none', safeToday: '', left: '', daysLeft: 0, label: '', updatedAt: new Date().toISOString() }
    ).catch(() => undefined);
  }, [currentBudget, glyph, isLoading, pace, showAmounts]);

  // The Business space has its own home: profit, costs, cash runway and tax set-aside.
  if (spacesEnabled && activeSpaceId === 'business') {
    // Sales, Purchases and HR on someone else's team get a Home that is just their job.
    return teamRole === 'sales' || teamRole === 'purchases' || teamRole === 'hr' ? <TeamHome /> : <BusinessHome />;
  }

  return (
    <Screen onRefresh={handleRefresh} refreshing={isLoading}>
      <View style={styles.header}>
        <Pressable
          onPress={() => nav.navigate('Profile')}
          accessibilityRole="button"
          accessibilityLabel="Account"
          style={[styles.avatar, { backgroundColor: theme.colors.primarySoft }]}
        >
          <Text style={{ fontFamily: fonts.display, fontSize: 14, color: theme.colors.primary }}>{avatarInitials}</Text>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[type.bodyStrong, { color: theme.colors.text, fontSize: 16 }]}>
            {firstName ? `${greetingWord}, ${firstName}` : greetingWord}
          </Text>
          {spacesEnabled ? (
            <View ref={spaceSwitcherAnchorRef} style={{ marginTop: 4 }}>
              <SpaceSwitcher compact />
            </View>
          ) : (
            <Text style={[type.caption, { color: theme.colors.textMuted }]}>{formatLongToday()}</Text>
          )}
        </View>
        <IconButton round accessibilityLabel="Notifications" badge={hasUnreadNotifications} onPress={() => nav.navigate('Notifications')}>
          <Bell color={theme.colors.text} size={19} />
        </IconButton>
        <IconButton round accessibilityLabel="Settings" onPress={() => nav.navigate('Settings')}>
          <SettingsIcon color={theme.colors.text} size={19} />
        </IconButton>
      </View>

      {!isOnline || queued.length ? (
        <Pressable onPress={() => nav.navigate('Transactions')} accessibilityRole="button" style={[styles.offline, { backgroundColor: theme.colors.brassSoft }]}>
          <WifiOff color={theme.colors.warn} size={16} />
          <Text style={[type.smallStrong, { color: theme.colors.warn, flex: 1 }]}>
            {!isOnline
              ? queued.length
                ? `You’re offline · ${queued.length} waiting to sync`
                : 'You’re offline. New transactions will sync later.'
              : `${queued.length} transaction${queued.length === 1 ? '' : 's'} waiting to sync`}
          </Text>
        </Pressable>
      ) : null}

      {error ? (
        <View style={{ marginTop: 14 }}>
          <InlineError message={error} />
        </View>
      ) : null}

      {currentBudget && pace ? (
        <Pressable
          ref={heroAnchorRef}
          onPress={() => nav.navigate('BudgetDetail', { budgetId: String(currentBudget.id) })}
          accessibilityRole="button"
          accessibilityLabel="Open current budget"
          style={{ marginTop: 14 }}
        >
          <HeroCard>
            <View style={styles.rowBetween}>
              <Text style={[type.eyebrow, { color: inkText, opacity: 0.72 }]}>{pace.status === 'over' ? (planShort ? 'Bills have used up this budget' : 'Over budget by') : 'Safe to spend today'}</Text>
              <Pressable onPress={toggleShowAmounts} hitSlop={12} accessibilityLabel={showAmounts ? 'Hide amounts' : 'Show amounts'}>
                {showAmounts ? <EyeOff color={inkText} size={18} opacity={0.75} /> : <Eye color={inkText} size={18} opacity={0.75} />}
              </Pressable>
            </View>
            <Amount
              value={pace.status === 'over' ? Math.abs(pace.left) : Math.round(pace.safePerDay)}
              currency={glyph}
              size="hero"
              color={inkText}
              hidden={hide}
              style={{ marginTop: 10, marginBottom: 4 }}
            />
            <Text style={[type.small, { color: inkText, opacity: 0.75 }]}>
              {hide
                ? `${pace.daysLeft} day${pace.daysLeft === 1 ? '' : 's'} to go`
                : pace.status === 'over'
                  ? `Spent ${formatAmount(budgetUsed, glyph)} of ${formatAmount(currentBudget.totalBudget, glyph)}`
                  : `${formatAmount(pace.left, glyph)} left of ${formatAmount(currentBudget.totalBudget, glyph)} · ${pace.daysLeft} day${pace.daysLeft === 1 ? '' : 's'} to go`}
            </Text>
            {!hide && pace.status !== 'over' && pace.heldBack > 0 ? (
              <Text style={[type.caption, { color: inkText, opacity: 0.62, marginTop: 2 }]}>
                {formatAmount(pace.heldBack, glyph)} kept aside for savings and bills due soon
              </Text>
            ) : null}
            <View style={{ marginTop: 16 }}>
              <ProgressBar
                value={pace.spentRatio}
                marker={pace.timeRatio}
                height={8}
                color={pace.status === 'onPace' ? '#8FD6C3' : '#E2B65C'}
                trackColor="rgba(255,255,255,0.14)"
                markerColor="#FFFFFF"
              />
            </View>
            <View style={[styles.rowBetween, { marginTop: 10 }]}>
              <Text style={[type.caption, { color: inkText, opacity: 0.75 }]}>
                {Math.round(pace.spentRatio * 100)}% spent · {Math.round(pace.timeRatio * 100)}% of period gone
              </Text>
              <Chip
                tone={pace.status === 'onPace' ? 'onInk' : 'brass'}
                label={paceLabel}
                icon={pace.status === 'onPace' ? <Check color="#8FD6C3" size={12} strokeWidth={3} /> : undefined}
              />
            </View>
          </HeroCard>
        </Pressable>
      ) : isLoading && !data ? (
        <HeroCard style={{ marginTop: 14, height: 190 }}>
          <Skeleton rows={1} height={14} color="rgba(255,255,255,0.14)" style={{ width: '45%' }} />
          <Skeleton rows={1} height={40} color="rgba(255,255,255,0.14)" style={{ width: '70%', marginTop: 14 }} />
          <Skeleton rows={1} height={8} color="rgba(255,255,255,0.14)" style={{ marginTop: 'auto' }} />
        </HeroCard>
      ) : (
        <HeroCard style={{ marginTop: 14 }}>
          <Text style={[type.eyebrow, { color: inkText, opacity: 0.72 }]}>Start here</Text>
          <Text style={[type.h2, { color: inkText, marginTop: 8 }]}>Set a budget to see what’s safe to spend each day.</Text>
          <PrimaryButton title="Create a budget" onPress={() => nav.navigate('Budget', { startNew: true })} style={{ marginTop: 16 }} />
        </HeroCard>
      )}

      {planShort && plan ? <ShortfallCard plan={plan} /> : null}

      {currentBudget && alsoRunning.length ? (
        <View style={{ marginTop: 10, gap: 8 }}>
          {alsoRunning.slice(0, 2).map((b) => (
            <Pressable
              key={String(b.id)}
              onPress={() => nav.navigate('BudgetDetail', { budgetId: String(b.id) })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.alsoRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, opacity: pressed ? 0.85 : 1 }]}
            >
              {b.purpose === 'event' ? <PartyPopper color={theme.colors.brass} size={16} /> : <Users color={theme.colors.primary} size={16} />}
              <Text numberOfLines={1} style={[type.smallStrong, { color: theme.colors.text, flex: 1 }]}>
                {b.purpose === 'event' ? 'Also running: ' : b.role === 'member' ? 'Shared with you: ' : 'Shared budget: '}
                {b.name.replace(/^My Budget \((.*)\)$/, '$1')}
              </Text>
              <ChevronRight color={theme.colors.textMuted} size={16} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <FirstWeekChecklist hasTransactions={hasTransactions} hasBudget={hasBudget} loading={isLoading && !data} />

      <View style={styles.quick}>
        {[
          { key: 'expense', label: 'Expense', Icon: ArrowUpRight, onPress: () => nav.navigate('AddTransaction', { type: 'expense' }), anchor: true },
          { key: 'income', label: 'Income', Icon: ArrowDownLeft, onPress: () => nav.navigate('AddTransaction', { type: 'income' }) },
          {
            key: 'import',
            label: 'Bank import',
            Icon: Landmark,
            onPress: () => nav.navigate((bankSummary?.banks ?? 0) > 0 ? 'PendingTransactions' : 'BankConnectTerms')
          },
          { key: 'ai', label: 'Ask AI', Icon: Sparkles, onPress: () => nav.navigate('AssistantModal' as never) }
        ].map(({ key, label, Icon, onPress, anchor }) => (
          <Pressable
            key={key}
            ref={anchor ? addTxAnchorRef : undefined}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => [styles.quickItem, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={[styles.quickIcon, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Icon color={theme.colors.primary} size={21} />
            </View>
            <Text style={[type.caption, { color: theme.colors.text }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <SectionHeader title="Money in and out" actionLabel="Insights" onAction={() => nav.navigate('Analytics')} />
      <Card>
        <SegmentedControl
          options={[
            { key: 'today', label: 'Today' },
            { key: 'week', label: 'This week' },
            { key: 'month', label: 'This month' }
          ]}
          value={summaryRangeKey}
          onChange={setSummaryRangeKey}
        />
        <View style={styles.split}>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={styles.inline}>
              <View style={[styles.arrow, { backgroundColor: theme.colors.successSoft }]}>
                <ArrowDownLeft color={theme.colors.success} size={11} strokeWidth={3} />
              </View>
              <Text style={[type.caption, { color: theme.colors.textMuted }]}>Money in</Text>
            </View>
            <Amount value={data?.income ?? 0} currency={glyph} hidden={hide} />
          </View>
          <View style={[styles.vr, { backgroundColor: theme.colors.border }]} />
          <View style={{ flex: 1, gap: 6, paddingLeft: 16 }}>
            <View style={styles.inline}>
              <View style={[styles.arrow, { backgroundColor: theme.colors.errorSoft }]}>
                <ArrowUpRight color={theme.colors.error} size={11} strokeWidth={3} />
              </View>
              <Text style={[type.caption, { color: theme.colors.textMuted }]}>Money out</Text>
            </View>
            <Amount value={data?.expenses ?? 0} currency={glyph} hidden={hide} />
          </View>
        </View>
      </Card>

      <ListCard style={{ marginTop: 10 }}>
        <ListRow
          icon={
            <IconTile bg={theme.colors.brassSoft}>
              <Flame color={theme.colors.brass} size={19} />
            </IconTile>
          }
          title={budgetStreakDays > 0 ? `${budgetStreakDays} day${budgetStreakDays === 1 ? '' : 's'} on budget` : 'Your streak starts today'}
          subtitle={remainingBudgetForDisplay >= 0 ? 'Keep spending under your plan to grow it' : 'You went over; a fresh plan resets it'}
          onPress={() => nav.navigate('BudgetStreakDetail')}
          chevron
        />
        <ListRow
          icon={
            <IconTile bg={theme.colors.primarySoft}>
              <CalendarCheck color={theme.colors.primary} size={19} />
            </IconTile>
          }
          title="Weekly check-in"
          subtitle={weekInfo.remainingDays > 0 ? `Closes in ${weekInfo.remainingDays} day${weekInfo.remainingDays === 1 ? '' : 's'}` : 'Closes today'}
          onPress={() => nav.navigate('WeeklyCheckInDetail')}
          chevron
        />
        {bankSummary && (bankSummary.banks ?? 0) === 0 ? (
          <ListRow
            icon={
              <IconTile bg={theme.colors.surfaceAlt}>
                <Landmark color={theme.colors.text} size={19} />
              </IconTile>
            }
            title="Connect your bank"
            subtitle="Import transactions automatically"
            onPress={() => (nav as any).navigate('BankConnectTerms')}
            chevron
          />
        ) : null}
      </ListCard>

      {wrappedPromo ? (
        <Pressable
          onPress={() => nav.navigate('Wrapped', { kind: wrappedPromo.kind, year: wrappedPromo.year })}
          accessibilityRole="button"
          style={({ pressed }) => ({ marginTop: 14, opacity: pressed ? 0.92 : 1 })}
        >
          <HeroCard>
            <View style={styles.inline}>
              <Gift color="#E2B65C" size={16} />
              <Text style={[type.eyebrow, { color: theme.colors.inkText, opacity: 0.72 }]}>Money Wrapped</Text>
            </View>
            <Text style={[type.h2, { color: theme.colors.inkText, marginTop: 6 }]}>{wrappedPromo.title}</Text>
            <Text style={[type.small, { color: theme.colors.inkText, opacity: 0.78, marginTop: 2 }]}>{wrappedPromo.line}</Text>
          </HeroCard>
        </Pressable>
      ) : null}

      <InsightCards spaceId={spacesEnabled ? activeSpaceId : 'personal'} />
      {activeSpaceId === 'personal' ? <PendingSavingsCard /> : null}

      {showSpaceNudge ? (
        <Card style={{ marginTop: 10 }}>
          <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Spaces</Text>
          <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 4 }]}>Keep Personal and Business money separate. Switch spaces anytime.</Text>
          <Pressable onPress={() => markSeen('space.switcher')} hitSlop={8} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
            <Text style={[type.smallStrong, { color: theme.colors.textMuted }]}>Dismiss</Text>
          </Pressable>
        </Card>
      ) : null}

      <SectionHeader title="Recent activity" actionLabel={hasTransactions ? 'See all' : undefined} onAction={() => nav.navigate('Transactions')} />
      {recent.length === 0 ? (
        isLoading ? (
          <Skeleton rows={3} />
        ) : (
          <EmptyState
            title={showGettingStarted ? 'Let’s get you started' : 'No transactions yet'}
            body={
              showGettingStarted
                ? 'Start by logging what you spent today. Your first-week checklist shows what to do next.'
                : 'Add your first one and your budget updates automatically.'
            }
            actionLabel="Add transaction"
            onAction={() => {
              if (showAddTxNudge) markSeen('dashboard.addTx');
              nav.navigate('AddTransaction');
            }}
          />
        )
      ) : (
        <ListCard>
          {recent.slice(0, 5).map((t) => (
            <ListRow
              key={t.id}
              icon={<CategoryIcon category={t.category} type={t.type} />}
              title={t.description || t.category || 'Transaction'}
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
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  alsoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quick: { flexDirection: 'row', marginTop: 18 },
  quickItem: { flex: 1, alignItems: 'center', gap: 7 },
  quickIcon: { width: 54, height: 54, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  split: { flexDirection: 'row', marginTop: 14 },
  vr: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  arrow: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }
});
