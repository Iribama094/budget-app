import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ArrowLeft, Flame } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import { Screen, H1, P } from '../components/Common/ui';
import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { useAuth } from '../contexts/AuthContext';
import { listBudgets, listTransactions, type ApiBudget } from '../api/endpoints';
import { formatMoney, toIsoDate } from '../utils/format';

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

  const currency = user?.currency ?? '₦';
  const remainingBudget = useMemo(() => {
    if (!currentBudget) return 0;
    return Number(currentBudget.totalBudget ?? 0) - (Number(expenseTotal) || 0);
  }, [currentBudget, expenseTotal]);

  const isOnBudget = remainingBudget >= 0;
  const streakDays = isOnBudget ? periodInfo.elapsedDays : 0;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={() => nav.goBack()}
          style={({ pressed }) => [
            {
              width: 44,
              height: 44,
              borderRadius: 18,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.92 : 1
            }
          ]}
        >
          <ArrowLeft color={theme.colors.text} size={20} />
        </Pressable>
        <View style={{ marginLeft: 12, flex: 1 }}>
          <H1 style={{ marginBottom: 0 }}>Budget streak</H1>
          <P style={{ marginTop: 4 }}>Stay on track and keep the streak alive.</P>
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Flame color={theme.colors.primary} size={20} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>Current streak</Text>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 22 }}>{streakDays} days</Text>
          </View>
          <Text style={{ color: isOnBudget ? theme.colors.success : theme.colors.error, fontWeight: '900' }}>
            {isOnBudget ? 'On track' : 'Over budget'}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 18 }}>
        <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>Month progress</Text>
        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          {[
            { label: 'Days completed', value: `${periodInfo.elapsedDays} / ${periodInfo.daysInPeriod}` },
            { label: 'Income', value: formatMoney(incomeTotal ?? 0, currency) },
            { label: 'Expenses', value: formatMoney(expenseTotal ?? 0, currency) },
            { label: 'Remaining budget', value: formatMoney(remainingBudget ?? 0, currency) }
          ].map((row) => (
            <View key={row.label} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.colors.text }}>{row.label}</Text>
              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{row.value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ marginTop: 18 }}>
        <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>Tips</Text>
        <View style={{ marginTop: 8 }}>
          {[
            'Keep daily spending below your average to maintain the streak.',
            'Review categories with the highest spend and trim where possible.',
            'Set mini-budgets for recurring expenses to stay on track.'
          ].map((tip, idx) => (
            <View key={idx} style={{ paddingVertical: 10, borderBottomWidth: idx === 2 ? 0 : 1, borderBottomColor: theme.colors.border }}>
              <Text style={{ color: theme.colors.textMuted }}>{tip}</Text>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}
