import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, Animated, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus } from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle as any);

import { listGoals, listBudgets, type ApiGoal, type ApiBudget } from '../api/endpoints';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Card, InlineError, P, Screen, H1 } from '../components/Common/ui';
import { formatMoney } from '../utils/format';
import { tokens } from '../theme/tokens';
import { useSpace } from '../contexts/SpaceContext';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SpaceSwitcher } from '../components/Common/SpaceSwitcher';
import { useTour, useTourAnchor } from '../contexts/TourContext';
import { useNudges } from '../contexts/NudgesContext';
import { NudgeTooltip } from '../components/Common/NudgeTooltip';

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

  return (
    <Screen scrollable={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <H1 style={{ marginBottom: 0 }}>Your Goals</H1>

        <TouchableOpacity
          ref={addGoalAnchorRef}
          onPress={() => {
            (nav as any).navigate('CreateGoal');
          }}
          activeOpacity={0.9}
          style={{ width: 48, height: 48, borderRadius: 999, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12 }}
        >
          <Plus color={tokens.colors.white} size={20} />
        </TouchableOpacity>
      </View>

      <NudgeTooltip
        visible={!isTourActive && !seen['goals.add'] && !isLoading && !error && items.length === 0}
        targetRef={addGoalAnchorRef}
        title="Quick tip"
        body="Set a goal (savings or payoff). We’ll help you track progress over time."
        onTargetPress={() => (nav as any).navigate('CreateGoal')}
        onDismiss={() => markSeen('goals.add')}
      />

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

      {goalSummary && (
        <View style={{ marginTop: 10 }}>
          <Card>
            <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>Goal health</Text>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18, marginTop: 4 }}>
              {goalSummary.active} active goals
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 6 }}>
              <Text style={{ color: tokens.colors.success[600], fontWeight: '800', marginRight: 12 }}>
                {goalSummary.onTrack} on track
              </Text>
              <Text style={{ color: goalSummary.behind > 0 ? tokens.colors.warning[600] : theme.colors.textMuted, fontWeight: '800' }}>
                {goalSummary.behind} behind
              </Text>
            </View>
          </Card>
        </View>
      )}

      {/* Goal creation moved to CreateGoal screen */}

      <View style={{ marginTop: 12, flex: 1 }}>
        <FlatList
          data={items}
          keyExtractor={(g) => g.id}
          contentContainerStyle={items.length ? undefined : { flexGrow: 1, justifyContent: 'center' }}
          ListEmptyComponent={!isLoading ? <P style={{ textAlign: 'center' }}>No goals yet.</P> : null}
          onRefresh={load}
          refreshing={isLoading}
          renderItem={({ item }) => {
            const progress = item.targetAmount > 0 ? Math.min(1, Math.max(0, item.currentAmount / item.targetAmount)) : 0;
            const daysRemaining = Math.ceil((new Date(item.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const remaining = Math.max(0, item.targetAmount - item.currentAmount);
            const monthsRemaining = Math.max(1, (new Date(item.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30));
            const suggestedMonthly = remaining > 0 ? remaining / monthsRemaining : 0;

            let statusLabel = 'On track';
            let statusColor: string = tokens.colors.success[500];
            if (progress < 1) {
              const created = new Date(item.createdAt).getTime();
              const target = new Date(item.targetDate).getTime();
              if (Number.isFinite(created) && Number.isFinite(target) && target > created) {
                const totalSpan = target - created;
                const elapsed = Math.min(Math.max(0, Date.now() - created), totalSpan);
                const expectedRatio = totalSpan > 0 ? elapsed / totalSpan : 0;
                const actualRatio = progress;
                if (actualRatio + 0.05 < expectedRatio) {
                  statusLabel = 'Behind pace';
                  statusColor = tokens.colors.warning[600];
                }
              }
            }

            const isSavingsGoal = (item.category || '').toLowerCase().includes('saving');
            const hasSavingsBudget = typeof savingsMonthlyBudget === 'number' && savingsMonthlyBudget > 0;
            const showSavingsHint = isSavingsGoal && hasSavingsBudget && suggestedMonthly > 0;
            const savingsEnough = showSavingsHint ? savingsMonthlyBudget! >= suggestedMonthly : false;

            return (
              <Pressable
                onPress={() => (nav as any).navigate('GoalDetail', { goalId: item.id, goal: item })}
                style={({ pressed }) => ({ marginBottom: 10, opacity: pressed ? 0.96 : 1 })}
              >
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  <View>
                  <LinearGradient
                    colors={[tokens.colors.secondary[400], tokens.colors.primary[500]]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ padding: 10 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 }}>
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            backgroundColor: 'rgba(255,255,255,0.12)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 10
                          }}
                        >
                          <Text style={{ color: tokens.colors.white, fontSize: 18 }}>{item.emoji || '🏁'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: tokens.colors.white, fontWeight: '900', fontSize: 16 }} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 4, fontWeight: '700' }}>
                            {daysRemaining} days remaining
                          </Text>
                          <Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: 4, fontSize: 12 }}>{item.category}</Text>
                        </View>
                      </View>

                      <View style={{ alignItems: 'center', marginLeft: 8 }}>
                        <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
                          <Svg width={56} height={56} viewBox="0 0 56 56">
                            <Circle cx={28} cy={28} r={22} stroke={'rgba(255,255,255,0.12)'} strokeWidth={4} fill="transparent" />
                            {(() => {
                              const anim = progressAnims.current[item.id] ?? new Animated.Value(progress);
                              const radius = 22;
                              const circumference = 2 * Math.PI * radius;
                              const strokeDashoffset = anim.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] });
                              return (
                                <AnimatedCircle
                                  cx={28}
                                  cy={28}
                                  r={radius}
                                  stroke={tokens.colors.white}
                                  strokeWidth={4}
                                  strokeLinecap="round"
                                  fill="transparent"
                                  strokeDasharray={`${circumference} ${circumference}`}
                                  strokeDashoffset={strokeDashoffset as any}
                                  transform="rotate(-90 28 28)"
                                />
                              );
                            })()}
                          </Svg>
                          <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: tokens.colors.white, fontWeight: '900' }}>{Math.round(progress * 100)}%</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </LinearGradient>

                  <View style={{ padding: 10, backgroundColor: theme.colors.surface }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>Progress</Text>
                      <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                        {formatMoney(item.currentAmount, user?.currency ?? '₦')} / {formatMoney(item.targetAmount, user?.currency ?? '₦')}
                      </Text>
                    </View>

                    <View style={{ height: 8, backgroundColor: theme.colors.surfaceAlt, borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
                      <LinearGradient
                        colors={[theme.colors.primary, tokens.colors.secondary[400]]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ width: `${Math.round(progress * 100)}%`, height: '100%' }}
                      />
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ color: theme.colors.textMuted }}>Target: {formatDate(item.targetDate)}</Text>
                      </View>
                      <Text style={{ color: theme.colors.textMuted }}>
                        {formatMoney(item.targetAmount - item.currentAmount, user?.currency ?? '₦')} to go
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, alignItems: 'center' }}>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                        Suggested monthly: {formatMoney(suggestedMonthly, user?.currency ?? '₦')}
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 999,
                          backgroundColor: statusColor + '20'
                        }}
                      >
                        <Text style={{ color: statusColor, fontWeight: '800', fontSize: 11 }}>{statusLabel}</Text>
                      </View>
                    </View>

                    {showSavingsHint && (
                      <View style={{ marginTop: 4 }}>
                        <Text
                          style={{
                            color: savingsEnough ? tokens.colors.success[600] : tokens.colors.warning[600],
                            fontSize: 11,
                            fontWeight: '600'
                          }}
                        >
                          {savingsEnough
                            ? `Your current ${savingsBucketLabel} budget looks enough to support this goal.`
                            : `Your current ${savingsBucketLabel} budget may be too low to hit this goal on time.`}
                        </Text>
                      </View>
                    )}
                  </View>
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      </View>

      {/* Legacy QUICK TIP overlay removed in favor of Tour coachmarks */}
    </Screen>
  );
}
