import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bucketDisplayName } from '../theme/buckets';
import { View, Text, Pressable, ActivityIndicator, Animated } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Amount as UiAmount, Card, Chip, HeroCard, PrimaryButton, ProgressBar, SectionHeader, TextButton } from '../components/Common/ui';
import { type } from '../theme/typography';
import { currencySymbol } from '../utils/format';
import { CalendarPlus, ChevronLeft } from '../icons';

import { calcTax, deleteBudget, deleteBudgetInSpace, getBudget, getBudgetInSpace, listTransactions, patchMe, startNextBudget, type ApiBudget, type ApiTransaction } from '../api/endpoints';
import { listBudgetMembers, type ApiBudgetMember } from '../api/features';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { useAmountVisibility } from '../contexts/AmountVisibilityContext';
import { useToast } from '../components/Common/Toast';
import { Screen, SecondaryButton } from '../components/Common/ui';
import { formatMoney, toIsoDate, toIsoDateTime } from '../utils/format';
import { tokens } from '../theme/tokens';
import { GuideAnchor } from '../components/Common/GuideAnchor';
import { goBackOrHome } from '../navigation/goBack';
import { MoveMoneySheet } from '../components/Budget/MoveMoneySheet';
import { errorMessage } from '../lib/errorMessage';
import { confirmDestructive } from '../lib/confirm';

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

  const { user, refreshUser } = useAuth();
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
  const [people, setPeople] = useState<ApiBudgetMember[]>([]);
  const [spentByPerson, setSpentByPerson] = useState<Record<string, number>>({});
  const [startingNext, setStartingNext] = useState(false);

  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  const [isEstimating, setIsEstimating] = useState(false);
  const [lastTaxEstimate, setLastTaxEstimate] = useState<number | null>(null);
  const [lastTaxLabel, setLastTaxLabel] = useState<string | null>(null);

  const isBusiness = spacesEnabled && activeSpaceId === 'business';
  const [moveFor, setMoveFor] = useState<{ to?: string } | null>(null);
  const bucketLabel = useCallback(
    (key: string) => {
      return bucketDisplayName(key, isBusiness);
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
          // Filtering by budget returns every member's transactions when the budget is shared.
          budgetId,
          spaceId: spacesEnabled ? activeSpaceId : undefined
        });
        all.push(...(res.items || []));
        cursor = res.nextCursor ?? null;
      } while (cursor);

      const summary = { income: 0, expenses: 0, spentByCategory: {} as Record<string, number> };
      const byPerson: Record<string, number> = {};
      for (const t of all) {
        if (String(t.budgetId ?? '') !== String(budgetId)) continue;

        if (t.type === 'income') {
          summary.income += t.amount;
          continue;
        }

        summary.expenses += t.amount;
        const who = String((t as { userId?: string }).userId ?? '');
        if (who) byPerson[who] = (byPerson[who] ?? 0) + t.amount;
        const key = (t.budgetCategory || (t as any).category || '').trim();
        if (key) summary.spentByCategory[key] = (summary.spentByCategory[key] ?? 0) + t.amount;
      }

      setTxSummary(summary);
      setSpentByPerson(byPerson);
      setPeople(b.isShared ? (await listBudgetMembers(budgetId).catch(() => ({ items: [] as ApiBudgetMember[] }))).items : []);
    } catch (e) {
      setError(errorMessage(e, 'Failed to load budget'));
    } finally {
      setIsLoading(false);
    }
  }, [activeSpaceId, budgetId, spacesEnabled]);

  const confirmDelete = useCallback(() => {
    if (!budget) return;
    confirmDestructive({
      title: 'Delete budget?',
      body: 'This cannot be undone.',
      action: 'Delete',
      onConfirm: async () => {
        try {
          if (spacesEnabled) await deleteBudgetInSpace(budget.id, activeSpaceId);
          else await deleteBudget(budget.id);
          toast.show('Budget deleted');
          goBackOrHome(nav);
        } catch (e) {
          toast.show(errorMessage(e, 'Failed to delete budget'));
        }
      }
    });
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
  const remaining = effectiveTotal - used;
  const progress = effectiveTotal > 0 ? Math.min(1, Math.max(0, used / effectiveTotal)) : 0;

  const isSharedBudget = !!budget && (!!budget.isShared || budget.purpose === 'household');
  const isOwnPlan = !!budget && budget.role !== 'member' && (budget.purpose ?? 'personal') === 'personal';
  const canMoveMoney = !!budget && budget.role !== 'member' && Object.keys(budget.categories || {}).length > 1;
  const isCurrent = !!budgetRange && Date.now() >= budgetRange.start.getTime() && Date.now() <= budgetRange.end.getTime() + 86400000;
  const homeBudget = user?.homeBudget ?? 'own';
  // Offer to put this budget on Home when it's running and Home shows the other kind.
  const showOnHome = isCurrent && ((isSharedBudget && homeBudget !== 'shared') || (isOwnPlan && homeBudget === 'shared'));
  const daysLeft = budgetRange ? Math.ceil((budgetRange.end.getTime() - Date.now()) / 86400000) : 99;
  const canStartNext = !!budget && budget.role !== 'member' && budget.purpose !== 'event' && daysLeft <= 5;

  const putOnHome = async () => {
    try {
      await patchMe({ homeBudget: isSharedBudget ? 'shared' : 'own' });
      await refreshUser();
      toast.show('Home now shows this budget 🏠', 'success');
    } catch (e) {
      toast.show(errorMessage(e, 'Could not change Home'), 'error');
    }
  };

  const startNext = async () => {
    if (!budget) return;
    setStartingNext(true);
    try {
      const r = await startNextBudget(budget.id);
      const glyph = currencySymbol(currency);
      toast.show(
        r.existed
          ? 'The next one is already set up'
          : r.keptUp
            ? `Next period started. Needs went up to ${formatMoney(r.keptUp.to, glyph)} to match what things cost now, and wants gave way.`
            : isSharedBudget
              ? 'Next period started. Everyone’s in 🎉'
              : 'Next period started 🎉',
        'success',
        r.keptUp ? 6000 : undefined
      );
      nav.replace('BudgetDetail', { budgetId: r.budget.id });
    } catch (e) {
      toast.show(errorMessage(e, 'Could not start the next budget'), 'error');
    } finally {
      setStartingNext(false);
    }
  };

  // Who spent what in a shared budget, and the fewest transfers to even it out if everyone pays an equal share.
  const split = (() => {
    if (!isSharedBudget || people.length < 2) return null;
    const rows = people.map((p) => ({
      id: p.userId,
      name: (p.name ?? '').trim().split(/\s+/)[0] || p.email.split('@')[0],
      spent: spentByPerson[p.userId] ?? 0,
      me: p.userId === user?.id
    }));
    const total = rows.reduce((s, r) => s + r.spent, 0);
    const share = total / rows.length;
    const debtors = rows.map((r) => ({ ...r, bal: r.spent - share })).filter((r) => r.bal < -1).sort((a, c) => a.bal - c.bal);
    const creditors = rows.map((r) => ({ ...r, bal: r.spent - share })).filter((r) => r.bal > 1).sort((a, c) => c.bal - a.bal);
    const transfers: Array<{ from: string; to: string; amount: number; fromMe: boolean }> = [];
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amount = Math.min(-debtors[i].bal, creditors[j].bal);
      transfers.push({ from: debtors[i].me ? 'You' : debtors[i].name, to: creditors[j].me ? 'you' : creditors[j].name, amount: Math.round(amount), fromMe: debtors[i].me });
      debtors[i].bal += amount;
      creditors[j].bal -= amount;
      if (debtors[i].bal >= -1) i++;
      if (creditors[j].bal <= 1) j++;
    }
    return { rows, total, share, transfers };
  })();

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const title = useMemo(() => {
    if (!budgetRange || !budget) return budget?.name ?? 'Budget';
    if (!/^My Budget \(/.test(budget.name)) return budget.name;
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
          onPress={() => goBackOrHome(nav)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.8 : 1 })}
        >
          <ChevronLeft color={theme.colors.text} size={20} />
          <Text style={{ color: theme.colors.text, fontFamily: 'Figtree_700Bold', marginLeft: 6 }}>Back</Text>
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
                <Text style={{ color: theme.colors.text, fontFamily: 'Figtree_700Bold' }}>Edit</Text>
              </View>
            </Pressable>

            {isBusiness ? null : (
            <Pressable
              onPress={() => nav.navigate('ShareBudget', { budgetId: budget.id, budgetName: budget.name })}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={budget.isShared ? 'See who shares this budget' : 'Share this budget'}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.colors.primarySoft }}>
                <Text style={{ color: theme.colors.primary, fontFamily: 'Figtree_700Bold' }}>{budget.isShared ? 'Shared' : 'Share'}</Text>
              </View>
            </Pressable>
            )}

            <Pressable
              onPress={confirmDelete}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.colors.surfaceAlt }}>
                <Text style={{ color: theme.colors.error, fontFamily: 'Figtree_700Bold' }}>Delete</Text>
              </View>
            </Pressable>
          </View>
        ) : null}
      </View>

      {error ? (
        <View style={{ marginTop: 12 }}>
          <Text style={[type.smallStrong, { color: theme.colors.error }]}>{error}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <View style={{ marginTop: 12 }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : null}

      {budget ? (
        <View style={{ marginTop: 12 }}>
          <GuideAnchor id="budgetdetail.buckets">
          <HeroCard>
            <Text style={[type.eyebrow, { color: theme.colors.inkText, opacity: 0.72 }]} numberOfLines={1}>
              {title.replace(/^My Budget ((.*))$/, '$1')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 10 }}>
              {remaining < 0 ? <Text style={[type.bodyStrong, { color: '#F4A79C' }]}>Over by</Text> : null}
              <UiAmount value={Math.abs(remaining)} currency={currencySymbol(currency)} size="lg" hidden={!showAmounts} color={theme.colors.inkText} />
              {remaining >= 0 ? <Text style={[type.small, { color: theme.colors.inkText, opacity: 0.75 }]}>left</Text> : null}
            </View>
            <Text style={[type.small, { color: theme.colors.inkText, opacity: 0.75, marginTop: 2 }]}>
              {showAmounts ? `${formatMoney(used, currency)} spent of ${formatMoney(effectiveTotal, currency)}` : 'Spent of total budget'}
            </Text>
            {txSummary.income > 0 ? (
              <Text style={[type.caption, { color: theme.colors.inkText, opacity: 0.7, marginTop: 2 }]}>
                Includes income added: {showAmounts ? formatMoney(txSummary.income, currency) : '••••'}
              </Text>
            ) : null}
            <View style={{ marginTop: 14 }}>
              <ProgressBar value={progress} height={8} color={remaining < 0 ? '#F07565' : '#8FD6C3'} trackColor="rgba(255,255,255,0.14)" />
            </View>
          </HeroCard>
          </GuideAnchor>

          {budget.purpose === 'event' || isSharedBudget ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {budget.purpose === 'event' ? <Chip tone="brass" label="One-off" /> : null}
              {isSharedBudget ? <Chip tone="primary" label={budget.role === 'member' ? 'Shared with you' : `Shared with ${budget.members?.length ?? 0}`} /> : null}
            </View>
          ) : null}

          {canStartNext || showOnHome ? (
            <Card style={{ marginTop: 12 }}>
              {canStartNext ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <CalendarPlus color={theme.colors.primary} size={18} />
                    <Text style={[type.bodyStrong, { color: theme.colors.text, flex: 1 }]}>
                      {daysLeft < 0 ? 'This budget has ended' : `${Math.max(0, daysLeft)} day${daysLeft === 1 ? '' : 's'} left in this budget`}
                    </Text>
                  </View>
                  <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 4 }]}>
                    {isSharedBudget ? 'Start the next one with the same plan. Everyone sharing it comes along.' : 'Start the next one with the same plan and fresh numbers.'}
                  </Text>
                  <GuideAnchor id="budgetdetail.next">
                    <PrimaryButton title="Start next period" onPress={startNext} loading={startingNext} style={{ marginTop: 10 }} />
                  </GuideAnchor>
                </>
              ) : null}
              {showOnHome ? <TextButton title="Show this budget on Home" onPress={() => void putOnHome()} style={{ alignItems: 'flex-start', marginTop: canStartNext ? 6 : 0 }} /> : null}
            </Card>
          ) : null}

          {split ? (
            <>
              <SectionHeader title="Who spent what" />
              <Card>
                {split.rows.map((r) => (
                  <View key={r.id} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{r.me ? 'You' : r.name}</Text>
                      <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{showAmounts ? formatMoney(r.spent, currency) : '••••'}</Text>
                    </View>
                    <View style={{ marginTop: 6 }}>
                      <ProgressBar value={split.total > 0 ? r.spent / split.total : 0} color={theme.colors.primary} />
                    </View>
                  </View>
                ))}
                <Text style={[type.caption, { color: theme.colors.textMuted }]}>
                  {split.transfers.length
                    ? `To split it equally (${showAmounts ? formatMoney(Math.round(split.share), currency) : '••••'} each): ${split.transfers
                        .map((t) => `${t.from} send${t.fromMe ? '' : 's'} ${t.to} ${showAmounts ? formatMoney(t.amount, currency) : '••••'}`)
                        .join('; ')}.`
                    : 'Everyone has spent about the same so far. Nothing to settle.'}
                </Text>
              </Card>
            </>
          ) : null}

          {/* Monthly overview when budget spans multiple months */}
          {budgetRange && budgetRange.months > 1 ? (
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: theme.colors.text, fontSize: 16, fontFamily: 'Figtree_700Bold' }}>Monthly overview</Text>
              <View style={{ marginTop: 10 }}>
                {Array.from({ length: budgetRange.months }).map((_, i) => {
                  const d = new Date(budgetRange.start.getFullYear(), budgetRange.start.getMonth() + i, 1);
                  const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
                  const amount = Math.round(effectiveTotal / budgetRange.months);
                  return (
                    <View key={`${d.getFullYear()}-${d.getMonth()}`} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: theme.colors.border }}>
                      <Text style={{ color: theme.colors.textMuted, fontFamily: 'Figtree_600SemiBold' }}>{label}</Text>
                      <Text style={{ color: theme.colors.text, fontFamily: 'Figtree_700Bold', marginTop: 6, fontSize: 15 }}>{formatMoney(amount, currency)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Categories */}
          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.colors.text, fontSize: 18, fontFamily: 'Figtree_700Bold' }}>Categories</Text>

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
                        <Text style={{ color: active ? tokens.colors.white : theme.colors.text, fontFamily: 'Figtree_600SemiBold' }}>{k.charAt(0).toUpperCase() + k.slice(1)}</Text>
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
                      <Text style={{ color: theme.colors.text, fontFamily: 'Figtree_700Bold' }}>{bucketLabel(cat)}</Text>
                      <Pressable
                        onPress={() => nav.navigate('MiniBudgets', { budgetId: budget.id, category: cat })}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                      >
                        <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: theme.colors.surfaceAlt }}>
                          <Text style={{ color: theme.colors.textMuted, fontFamily: 'Figtree_700Bold', fontSize: 11 }}>Mini budgets</Text>
                        </View>
                      </Pressable>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                      <Text style={{ color: theme.colors.textMuted, fontFamily: 'Figtree_600SemiBold' }}>Budgeted</Text>
                      <Text style={{ color: theme.colors.text, fontFamily: 'Figtree_600SemiBold' }}>{formatMoney(c.budgeted, currency)}</Text>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                      <Text style={{ color: theme.colors.textMuted, fontFamily: 'Figtree_600SemiBold' }}>Suggested ({timeframe})</Text>
                      <Text style={{ color: theme.colors.text, fontFamily: 'Figtree_600SemiBold' }}>{formatMoney(suggested, currency)}</Text>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                      <Text style={{ color: theme.colors.textMuted, fontFamily: 'Figtree_600SemiBold' }}>Spent</Text>
                      <Text style={{ color: theme.colors.text, fontFamily: 'Figtree_600SemiBold' }}>{formatMoney(spent, currency)}</Text>
                    </View>

                    {spent > c.budgeted && c.budgeted > 0 ? (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                        <Text style={{ color: theme.colors.error, fontFamily: 'Figtree_700Bold' }}>Over by {formatMoney(spent - c.budgeted, currency)}</Text>
                        {canMoveMoney ? (
                          <Pressable onPress={() => setMoveFor({ to: cat })} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Cover ${bucketLabel(cat)} from another bucket`}>
                            <Text style={{ color: theme.colors.primary, fontFamily: 'Figtree_700Bold' }}>Cover it</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}

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
            {canMoveMoney ? <TextButton title="Move money between buckets" onPress={() => setMoveFor({})} style={{ alignItems: 'flex-start', marginTop: 8 }} /> : null}
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
                <Text style={{ color: theme.colors.textMuted, fontFamily: 'Figtree_600SemiBold', fontSize: 12 }}>Burn rate</Text>
                <Text style={{ color: theme.colors.text, fontFamily: 'Figtree_700Bold', marginTop: 6 }}>
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
                    const msg = errorMessage(e, 'Estimate failed');
                    toast.show(msg, 'error');
                  } finally {
                    setIsEstimating(false);
                  }
                }}
              />

              {lastTaxEstimate != null && lastTaxLabel ? (
                <Text style={{ color: theme.colors.textMuted, fontFamily: 'Figtree_600SemiBold', marginTop: 8 }}>
                  Last estimate for {lastTaxLabel}: {lastTaxEstimate.toLocaleString()}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
      {budget ? (
        <MoveMoneySheet
          visible={!!moveFor}
          onClose={() => setMoveFor(null)}
          budget={budget}
          spent={txSummary.spentByCategory}
          to={moveFor?.to}
          glyph={currencySymbol(currency)}
          isBusiness={isBusiness}
          onMoved={() => void load()}
        />
      ) : null}
    </Screen>
  );
}
