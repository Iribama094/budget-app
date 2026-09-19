import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { Flame, Search, TrendingDown, Wallet } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import { Amount, Chip, HeroCard, IconTile, ListCard, ListRow, ProgressBar, Screen, ScreenHeader, SectionHeader } from '../components/Common/ui';
import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { useAuth } from '../contexts/AuthContext';
import { listBudgets, listTransactions, type ApiBudget } from '../api/endpoints';
import { currencySymbol, toIsoDate } from '../utils/format';
import { type } from '../theme/typography';

export default function BudgetStreakDetailScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const { user } = useAuth();

  const [currentBudget, setCurrentBudget] = useState<ApiBudget | null>(null);
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [expenseTotal, setExpenseTotal] = useState(0);

  const parseIsoDateLocal = (value?: string | null) => {
    if (!value) return null;
    const d = new Date(`${value}T12:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  };

  const budgetEffectiveEndIso = useCallback((b: ApiBudget): string => {
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
  }, []);

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

  const periodInfo = useMemo(() => {
    const nowLocal = new Date();
    const todayNoon = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 12, 0, 0, 0);

    if (!currentBudget) {
      const startOfMonth = new Date(todayNoon.getFullYear(), todayNoon.getMonth(), 1, 12, 0, 0, 0);
      const endOfMonth = new Date(todayNoon.getFullYear(), todayNoon.getMonth() + 1, 0, 12, 0, 0, 0);
      const msPerDay = 1000 * 60 * 60 * 24;
      const elapsed = Math.max(1, Math.floor((todayNoon.getTime() - startOfMonth.getTime()) / msPerDay) + 1);
      const daysInPeriod = Math.max(1, Math.floor((endOfMonth.getTime() - startOfMonth.getTime()) / msPerDay) + 1);
      return { elapsedDays: elapsed, daysInPeriod };
    }

    const start = parseIsoDateLocal(currentBudget.startDate);
    const end = parseIsoDateLocal(budgetEffectiveEndIso(currentBudget));
    if (!start || !end) return { elapsedDays: 1, daysInPeriod: 1 };
    const msPerDay = 1000 * 60 * 60 * 24;
    const elapsed = Math.max(1, Math.min(Math.floor((todayNoon.getTime() - start.getTime()) / msPerDay) + 1, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1));
    const daysInPeriod = Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1);
    return { elapsedDays: elapsed, daysInPeriod };
  }, [budgetEffectiveEndIso, currentBudget]);

  useEffect(() => {
    (async () => {
      try {
        const budgetsRes = await listBudgets(spacesEnabled ? { spaceId: activeSpaceId } : undefined);
        const budgets = (budgetsRes?.items ?? []) as ApiBudget[];
        const picked = budgets.find((b) => isBudgetCurrent(b)) ?? budgets[0] ?? null;
        setCurrentBudget(picked);

        if (!picked) {
          setIncomeTotal(0);
          setExpenseTotal(0);
          return;
        }

        const start = picked.startDate;
        const end = budgetEffectiveEndIso(picked);

        const sumByType = async (type: 'income' | 'expense') => {
          let cursor: string | undefined;
          let pages = 0;
          let total = 0;
          while (pages < 5) {
            const page = await listTransactions({
              start,
              end,
              limit: 200,
              cursor,
              type,
              budgetId: String(picked.id),
              spaceId: spacesEnabled ? activeSpaceId : undefined
            });
            for (const t of page.items || []) total += Number(t.amount) || 0;
            if (!page.nextCursor) break;
            cursor = page.nextCursor;
            pages += 1;
          }
          return total;
        };

        const [inc, exp] = await Promise.all([sumByType('income'), sumByType('expense')]);
        setIncomeTotal(inc);
        setExpenseTotal(exp);
      } catch {
        // ignore
      }
    })();
  }, [activeSpaceId, spacesEnabled, budgetEffectiveEndIso, isBudgetCurrent]);

  const glyph = currencySymbol(user?.currency);
  const remainingBudget = useMemo(() => {
    if (!currentBudget) return 0;
    return Number(currentBudget.totalBudget ?? 0) - (Number(expenseTotal) || 0);
  }, [currentBudget, expenseTotal]);

  const isOnBudget = remainingBudget >= 0;
  const streakDays = isOnBudget ? periodInfo.elapsedDays : 0;

  const inkText = theme.colors.inkText;
  const tips = [
    { Icon: TrendingDown, text: 'Keep daily spending below your average to maintain the streak.' },
    { Icon: Search, text: 'Check the categories that take the most money and trim where you can.' },
    { Icon: Wallet, text: 'Set mini budgets for things you buy often so nothing sneaks up on you.' }
  ];

  return (
    <Screen bottomInset={48}>
      <ScreenHeader title="Budget streak" onBack={() => nav.goBack()} />

      <HeroCard style={{ marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Flame color="#E2B65C" size={16} />
            <Text style={[type.eyebrow, { color: inkText, opacity: 0.72 }]}>Current streak</Text>
          </View>
          <Chip tone={isOnBudget ? 'onInk' : 'negative'} label={isOnBudget ? 'On track' : 'Over budget'} />
        </View>
        <Text style={[type.hero, { color: inkText, marginTop: 8 }]}>
          {streakDays} day{streakDays === 1 ? '' : 's'}
        </Text>
        <Text style={[type.small, { color: inkText, opacity: 0.78 }]}>
          {!currentBudget
            ? 'Make a budget and your streak go start counting.'
            : isOnBudget
              ? streakDays >= 7
                ? 'You’re doing really well 🔥 Keep it going.'
                : 'Nice start! Stay under your plan and watch it grow 🌱'
              : 'You went over this period. That’s okay, a fresh plan resets it.'}
        </Text>
        <View style={{ marginTop: 14 }}>
          <ProgressBar value={periodInfo.elapsedDays / periodInfo.daysInPeriod} height={8} color="#E2B65C" trackColor="rgba(255,255,255,0.14)" />
        </View>
        <Text style={[type.caption, { color: inkText, opacity: 0.7, marginTop: 6 }]}>
          Day {periodInfo.elapsedDays} of {periodInfo.daysInPeriod}
        </Text>
      </HeroCard>

      <SectionHeader title="This period" />
      <ListCard>
        <ListRow title="Income" right={<Amount value={incomeTotal} currency={glyph} size="sm" color={theme.colors.success} />} />
        <ListRow title="Expenses" right={<Amount value={expenseTotal} currency={glyph} size="sm" />} />
        <ListRow title="Left in your budget" right={<Amount value={remainingBudget} currency={glyph} size="sm" color={isOnBudget ? theme.colors.text : theme.colors.error} />} />
      </ListCard>

      <SectionHeader title="Keep it going" />
      <ListCard>
        {tips.map(({ Icon, text }) => (
          <View key={text} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 }}>
            <IconTile bg={theme.colors.brassSoft} size={32}>
              <Icon color={theme.colors.brass} size={15} />
            </IconTile>
            <Text style={[type.small, { color: theme.colors.textMuted, flex: 1 }]}>{text}</Text>
          </View>
        ))}
      </ListCard>
    </Screen>
  );
}
