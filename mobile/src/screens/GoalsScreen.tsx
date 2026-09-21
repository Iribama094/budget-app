import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, FlatList, Animated, Pressable, StyleSheet } from 'react-native';
import { AlertTriangle, Check, Plus } from '../icons';

import { listGoals, listBudgets, type ApiGoal, type ApiBudget } from '../api/endpoints';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Amount, Card, Chip, EmptyState, InlineError, ProgressBar, Ring, Screen, ScreenHeader, Skeleton, formatAmount } from '../components/Common/ui';
import { currencySymbol, formatShortDate } from '../utils/format';
import { fonts, type } from '../theme/typography';
import { useSpace } from '../contexts/SpaceContext';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SpaceSwitcher } from '../components/Common/SpaceSwitcher';
import { useTour, useTourAnchor } from '../contexts/TourContext';
import { useNudges } from '../contexts/NudgesContext';
import { NudgeTooltip } from '../components/Common/NudgeTooltip';
import { PendingSavingsCard } from '../components/Home/PendingSavingsCard';
import { GuideAnchor } from '../components/Common/GuideAnchor';

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function GoalsScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId, activeSpace } = useSpace();
  const { isTourActive } = useTour();
  const { seen, markSeen } = useNudges();

  const addGoalAnchorRef = useTourAnchor('goals.add');

  const isBusiness = spacesEnabled && activeSpaceId === 'business';
  const savingsBucketLabel = isBusiness ? 'Reserves' : 'Savings';
  const [items, setItems] = useState<ApiGoal[]>([]);
  const [savingsMonthlyBudget, setSavingsMonthlyBudget] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigation();

  const load = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const [goals, budgetsRes] = await Promise.all([
        listGoals(spacesEnabled ? { spaceId: activeSpaceId } : undefined),
        listBudgets({ spaceId: spacesEnabled ? activeSpaceId : undefined })
      ]);
      setItems(goals);

      const currentBudget: ApiBudget | null = budgetsRes.items?.[0] ?? null;
      if (currentBudget) {
        try {
          const s = new Date(currentBudget.startDate);
          const e = currentBudget.endDate ? new Date(currentBudget.endDate) : new Date();
          const months = Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1);
          const savingsCat = (currentBudget.categories || {})['Savings'];
          if (savingsCat && currentBudget.totalBudget > 0) {
            const monthly = savingsCat.budgeted / months;
            setSavingsMonthlyBudget(monthly);
          } else {
            setSavingsMonthlyBudget(null);
          }
        } catch {
          setSavingsMonthlyBudget(null);
        }
      } else {
        setSavingsMonthlyBudget(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [activeSpaceId, spacesEnabled]);

  // If the user switches spaces while staying on this screen, reload immediately
  // (useFocusEffect does not re-run on dependency change by itself).
  useEffect(() => {
    setItems([]);
    setSavingsMonthlyBudget(null);
    setError(null);
    void load();
  }, [activeSpaceId, spacesEnabled, load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const progressAnims = useRef<Record<string, Animated.Value>>({});
  useEffect(() => {
    items.forEach((it) => {
      const p = it.targetAmount > 0 ? Math.min(1, Math.max(0, it.currentAmount / it.targetAmount)) : 0;
      if (!progressAnims.current[it.id]) progressAnims.current[it.id] = new Animated.Value(0);
      Animated.timing(progressAnims.current[it.id], { toValue: p, duration: 700, useNativeDriver: false }).start();
    });
  }, [items]);

  const goalSummary = useMemo(() => {
    if (!items.length) return null;
    let onTrack = 0;
    const now = Date.now();

    items.forEach((g) => {
      if (g.targetAmount <= 0) return;
      const created = new Date(g.createdAt).getTime();
      const target = new Date(g.targetDate).getTime();
      if (!Number.isFinite(created) || !Number.isFinite(target) || target <= created) return;

      const totalSpan = target - created;
      const elapsed = Math.min(Math.max(0, now - created), totalSpan);
      const expectedRatio = totalSpan > 0 ? elapsed / totalSpan : 0;
      const actualRatio = Math.max(0, Math.min(1, g.currentAmount / g.targetAmount));

      if (actualRatio + 0.05 >= expectedRatio) onTrack += 1;
    });

    return {
      active: items.length,
      onTrack,
      behind: Math.max(0, items.length - onTrack)
    };
  }, [items]);

  const glyph = currencySymbol(user?.currency);
  const totalSaved = items.reduce((s, g) => s + (Number(g.currentAmount) || 0), 0);

  const goalPace = (item: ApiGoal) => {
    const msPerDay = 1000 * 60 * 60 * 24;
    const progress = item.targetAmount > 0 ? Math.min(1, Math.max(0, item.currentAmount / item.targetAmount)) : 0;
    const daysRemaining = Math.ceil((new Date(item.targetDate).getTime() - Date.now()) / msPerDay);
    const remaining = Math.max(0, item.targetAmount - item.currentAmount);
    const monthsRemaining = Math.max(1, (new Date(item.targetDate).getTime() - Date.now()) / (msPerDay * 30));
    const suggestedMonthly = remaining > 0 ? remaining / monthsRemaining : 0;
    let behind = false;
    if (progress < 1) {
      const created = new Date(item.createdAt).getTime();
      const target = new Date(item.targetDate).getTime();
      if (Number.isFinite(created) && Number.isFinite(target) && target > created) {
        const totalSpan = target - created;
        const elapsed = Math.min(Math.max(0, Date.now() - created), totalSpan);
        behind = progress + 0.05 < elapsed / totalSpan;
      }
    }
    return { progress, daysRemaining, suggestedMonthly, behind, done: progress >= 1 };
  };

  // One line that speaks to the goal needing attention: the one furthest behind, otherwise the one closest to done.
  const focusLine = useMemo(() => {
    if (!items.length) return null;
    const paced = items.map((g) => ({ g, p: goalPace(g) }));
    if (paced.every((x) => x.p.done)) return 'Every goal reached. Ready for the next one?';
    const behind = paced.filter((x) => x.p.behind && x.p.suggestedMonthly > 0).sort((a, b) => a.p.progress - b.p.progress)[0];
    if (behind) return `${behind.g.emoji || '🎯'} ${behind.g.name} needs ${formatAmount(Math.round(behind.p.suggestedMonthly), glyph)} a month to catch up.`;
    const closest = paced.filter((x) => !x.p.done).sort((a, b) => b.p.progress - a.p.progress)[0];
    const left = Math.max(0, closest.g.targetAmount - closest.g.currentAmount);
    return closest.p.progress > 0
      ? `${closest.g.emoji || '🎯'} ${closest.g.name} is ${Math.round(closest.p.progress * 100)}% there. ${formatAmount(left, glyph)} to go.`
      : `${closest.g.emoji || '🎯'} ${closest.g.name} starts with ${formatAmount(Math.round(closest.p.suggestedMonthly), glyph)} this month.`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, glyph]);

  const quickStarts = isBusiness
    ? [
        { key: 'reserve', label: '🛟 Cash reserve' },
        { key: 'tax', label: '🧾 Tax money' },
        { key: 'equipment', label: '🛠️ Equipment' }
      ]
    : [
        { key: 'emergency', label: '🛟 Emergency fund' },
        { key: 'rent', label: '🏠 Rent' },
        { key: 'school', label: '🎓 School fees' },
        { key: 'travel', label: '✈️ Travel' }
      ];

  return (
    <Screen scrollable={false}>
      <GuideAnchor id="goals.list" style={{ flex: 1 }}>
      <FlatList
        data={items}
        keyExtractor={(g) => g.id}
        onRefresh={load}
        refreshing={isLoading}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 130 }}
        ListHeaderComponent={
          <View>
            <ScreenHeader
              title="Goals"
              right={
                <Pressable
                  ref={addGoalAnchorRef}
                  onPress={() => (nav as any).navigate('CreateGoal')}
                  accessibilityRole="button"
                  accessibilityLabel="New goal"
                  style={({ pressed }) => [styles.newPill, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Plus color={theme.colors.onPrimary} size={16} strokeWidth={2.6} />
                  <Text style={[type.smallStrong, { color: theme.colors.onPrimary }]}>New</Text>
                </Pressable>
              }
            />
            {spacesEnabled ? (
              <View style={{ marginTop: 6 }}>
                <SpaceSwitcher />
              </View>
            ) : null}
            {activeSpaceId === 'personal' ? <PendingSavingsCard onAnswered={() => void load()} /> : null}
            {error ? (
              <View style={{ marginTop: 12 }}>
                <InlineError message={error} />
              </View>
            ) : null}
            {goalSummary ? (
              <Card style={{ marginTop: 12 }}>
                <Text style={[type.smallStrong, { color: theme.colors.textMuted }]}>
                  Saved across {goalSummary.active} goal{goalSummary.active === 1 ? '' : 's'}
                </Text>
                <Amount value={totalSaved} currency={glyph} size="lg" style={{ marginTop: 4 }} />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  {goalSummary.onTrack > 0 ? <Chip tone="positive" label={`${goalSummary.onTrack} on track`} /> : null}
                  {goalSummary.behind > 0 ? <Chip tone="brass" label={`${goalSummary.behind} behind pace`} /> : null}
                </View>
                {focusLine ? <Text style={[type.small, { color: theme.colors.text, marginTop: 12 }]}>{focusLine}</Text> : null}
              </Card>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <Skeleton rows={3} height={120} style={{ marginTop: 12 }} />
          ) : (
            <View style={{ marginTop: 14 }}>
              <EmptyState
                title={isBusiness ? 'Nothing set aside yet' : 'What are you saving for?'}
                body={
                  isBusiness
                    ? 'A cash reserve, tax money or new equipment. Pick one and we’ll work out what to set aside each month.'
                    : 'Pick one to start. We’ll work out what to put aside each month, so you get there without the stress.'
                }
                actionLabel="Something else"
                onAction={() => (nav as any).navigate('CreateGoal', { preset: 'other' })}
              />
              <View style={styles.quickWrap}>
                {quickStarts.map((q) => (
                  <Pressable
                    key={q.key}
                    onPress={() => (nav as any).navigate('CreateGoal', { preset: q.key })}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.quickPill, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, opacity: pressed ? 0.85 : 1 }]}
                  >
                    <Text style={[type.smallStrong, { color: theme.colors.text }]}>{q.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )
        }
        renderItem={({ item }) => {
          const p = goalPace(item);
          const color = p.behind ? theme.colors.brass : p.done ? theme.colors.success : theme.colors.primary;
          const isSavingsGoal = (item.category || '').toLowerCase().includes('saving');
          const lowSavingsBudget = isSavingsGoal && typeof savingsMonthlyBudget === 'number' && savingsMonthlyBudget > 0 && savingsMonthlyBudget < p.suggestedMonthly;
          const openGoal = () => (nav as any).navigate('GoalDetail', { goalId: item.id, goal: item });

          return (
            <Pressable onPress={openGoal} accessibilityRole="button" style={({ pressed }) => ({ marginTop: 12, opacity: pressed ? 0.92 : 1 })}>
              <Card>
                <View style={styles.row}>
                  <View style={[styles.emoji, { backgroundColor: theme.colors.surfaceAlt }]}>
                    <Text style={{ fontSize: 22 }}>{item.emoji || '🎯'}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[type.bodyStrong, { color: theme.colors.text, fontSize: 16 }]}>
                      {item.name}
                    </Text>
                    <Text numberOfLines={1} style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                      {p.done
                        ? 'Goal reached'
                        : p.daysRemaining >= 0
                          ? `By ${formatShortDate(item.targetDate)} · ${p.daysRemaining} day${p.daysRemaining === 1 ? '' : 's'}`
                          : `Target date passed · ${formatShortDate(item.targetDate)}`}
                    </Text>
                  </View>
                  <Ring progress={p.progress} label={`${Math.round(p.progress * 100)}%`} color={color} />
                </View>

                <View style={[styles.row, { alignItems: 'baseline', gap: 6, marginTop: 14 }]}>
                  <Amount value={item.currentAmount} currency={glyph} />
                  <Text style={[type.small, { color: theme.colors.textMuted }]}>of {formatAmount(item.targetAmount, glyph)}</Text>
                </View>
                <View style={{ marginTop: 8 }}>
                  <ProgressBar value={p.progress} color={color} />
                </View>

                <View style={[styles.row, { justifyContent: 'space-between', marginTop: 12 }]}>
                  {p.done ? (
                    <Chip tone="positive" label="Reached" icon={<Check color={theme.colors.success} size={12} strokeWidth={3} />} />
                  ) : p.behind ? (
                    <View style={[styles.row, { gap: 6, flex: 1 }]}>
                      <AlertTriangle color={theme.colors.brass} size={14} />
                      <Text numberOfLines={1} style={[type.caption, { color: theme.colors.warn, fontFamily: fonts.semibold, flex: 1 }]}>
                        Behind · needs {formatAmount(Math.round(p.suggestedMonthly), glyph)}/mo
                      </Text>
                    </View>
                  ) : (
                    <Text numberOfLines={1} style={[type.caption, { color: theme.colors.textMuted, flex: 1 }]}>
                      Save <Text style={{ fontFamily: fonts.semibold, color: theme.colors.text }}>{formatAmount(Math.round(p.suggestedMonthly), glyph)}</Text>/mo to finish on time
                    </Text>
                  )}
                  <Pressable
                    onPress={openGoal}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${item.name}`}
                    hitSlop={6}
                    style={({ pressed }) => [styles.openPill, { backgroundColor: theme.colors.primarySoft, opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Text style={[type.smallStrong, { color: theme.colors.primary }]}>Update</Text>
                  </Pressable>
                </View>

                {lowSavingsBudget ? (
                  <Text style={[type.caption, { color: theme.colors.warn, marginTop: 8 }]}>
                    Your {savingsBucketLabel} budget may be too low to reach this goal on time.
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          );
        }}
      />

      <NudgeTooltip
        visible={!isTourActive && !seen['goals.add'] && !isLoading && !error && items.length === 0}
        targetRef={addGoalAnchorRef}
        title="Quick tip"
        body="Set a goal (savings or payoff). We’ll help you track progress over time."
        onTargetPress={() => (nav as any).navigate('CreateGoal')}
        onDismiss={() => markSeen('goals.add')}
      />
      </GuideAnchor>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  newPill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingLeft: 10, paddingRight: 14, borderRadius: 18 },
  openPill: { height: 32, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quickWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14 },
  quickPill: { borderWidth: 1, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14 }
});
