import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import { Screen, H1, P } from '../components/Common/ui';
import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { useAuth } from '../contexts/AuthContext';
import { listBudgets, listTransactions, type ApiBudget, type ApiTransaction } from '../api/endpoints';
import { formatMoney, toIsoDate } from '../utils/format';

export default function WeeklyCheckInDetailScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const { user } = useAuth();

  const [currentBudget, setCurrentBudget] = useState<ApiBudget | null>(null);
  const [weekIncome, setWeekIncome] = useState(0);
  const [weekExpenses, setWeekExpenses] = useState(0);
  const [budgetExpenses, setBudgetExpenses] = useState(0);
  const [weekExpenseTx, setWeekExpenseTx] = useState<ApiTransaction[]>([]);

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

  const weekInfo = useMemo(() => {
    const now = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    const jsDay = now.getDay(); // 0 (Sun) - 6 (Sat)
    const offsetFromMonday = (jsDay + 6) % 7; // 0 = Mon
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetFromMonday);
    const elapsed = Math.max(1, Math.min(7, Math.floor((now.getTime() - start.getTime()) / msPerDay) + 1));
    const remaining = Math.max(0, 7 - elapsed);
    const pct = (elapsed / 7) * 100;
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end, elapsedDays: elapsed, remainingDays: remaining, progressPct: pct };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const budgetsRes = await listBudgets(spacesEnabled ? { spaceId: activeSpaceId } : undefined);
        const budgets = (budgetsRes?.items ?? []) as ApiBudget[];
        const picked = budgets.find((b) => isBudgetCurrent(b)) ?? budgets[0] ?? null;
        setCurrentBudget(picked);

        const weekStartIso = toIsoDate(weekInfo.start);
        const weekEndIso = toIsoDate(new Date());
        const budgetId = picked ? String(picked.id) : undefined;

        const sumInRange = async (type: 'income' | 'expense') => {
          let cursor: string | undefined;
          let pages = 0;
          let total = 0;
          const collected: ApiTransaction[] = [];
          while (pages < 5) {
            const page = await listTransactions({
              start: weekStartIso,
              end: weekEndIso,
              limit: 200,
              cursor,
              type,
              budgetId,
              spaceId: spacesEnabled ? activeSpaceId : undefined
            });
            for (const t of page.items || []) {
              total += Number(t.amount) || 0;
              if (type === 'expense') collected.push(t);
            }
            if (!page.nextCursor) break;
            cursor = page.nextCursor;
            pages += 1;
          }
          return { total, collected };
        };

        const [incRes, expRes] = await Promise.all([sumInRange('income'), sumInRange('expense')]);
        setWeekIncome(incRes.total);
        setWeekExpenses(expRes.total);
        setWeekExpenseTx(expRes.collected);

        if (!picked) {
          setBudgetExpenses(0);
          return;
        }

        // Remaining should reflect the current running budget: totalBudget - expenses in the budget period.
        const budgetStart = picked.startDate;
        const budgetEnd = budgetEffectiveEndIso(picked);
        let cursor: string | undefined;
        let pages = 0;
        let spent = 0;
        while (pages < 5) {
          const page = await listTransactions({
            start: budgetStart,
            end: budgetEnd,
            limit: 200,
            cursor,
            type: 'expense',
            budgetId: String(picked.id),
            spaceId: spacesEnabled ? activeSpaceId : undefined
          });
          for (const t of page.items || []) spent += Number(t.amount) || 0;
          if (!page.nextCursor) break;
          cursor = page.nextCursor;
          pages += 1;
        }
        setBudgetExpenses(spent);
      } catch {
        // ignore
      }
    })();
  }, [activeSpaceId, spacesEnabled, budgetEffectiveEndIso, isBudgetCurrent, weekInfo.start]);

  const currency = user?.currency ?? '₦';

  const dailySnapshots = useMemo(() => {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const nowLocal = new Date();
    const todayKey = toIsoDate(nowLocal);

    const totalsByDay: Record<string, number> = {};
    for (const t of weekExpenseTx) {
      const d = new Date(t.occurredAt);
      const key = toIsoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0));
      totalsByDay[key] = (totalsByDay[key] ?? 0) + (Number(t.amount) || 0);
    }

    const days: { label: string; amount: number; isToday: boolean }[] = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(weekInfo.start);
      d.setDate(d.getDate() + i);
      const key = toIsoDate(d);
      days.push({ label: labels[i], amount: totalsByDay[key] ?? 0, isToday: key === todayKey });
    }
    return days;
  }, [weekExpenseTx, weekInfo.start]);

  const remainingBudget = useMemo(() => {
    if (!currentBudget) return 0;
    return Number(currentBudget.totalBudget ?? 0) - (Number(budgetExpenses) || 0);
  }, [budgetExpenses, currentBudget]);

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
          <H1 style={{ marginBottom: 0 }}>Weekly check-in</H1>
          <P style={{ marginTop: 4 }}>A quick pulse on your spending this week.</P>
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>Progress</Text>
        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 22, marginTop: 6 }}>
          {weekInfo.elapsedDays} / 7 days
        </Text>
        <View style={{ marginTop: 10, height: 10, backgroundColor: theme.colors.surfaceAlt, borderRadius: 999, overflow: 'hidden' }}>
          <View style={{ height: 10, width: `${Math.round(weekInfo.progressPct)}%`, backgroundColor: theme.colors.primary }} />
        </View>
        <Text style={{ color: theme.colors.textMuted, marginTop: 8 }}>
          {weekInfo.remainingDays > 0 ? `${weekInfo.remainingDays} day${weekInfo.remainingDays === 1 ? '' : 's'} left` : 'Week ending today'}
        </Text>
      </View>

      <View style={{ marginTop: 18 }}>
        <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>This week so far</Text>
        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          {[
            { label: 'Income', value: weekIncome ?? 0 },
            { label: 'Expenses', value: weekExpenses ?? 0 },
            { label: 'Remaining', value: remainingBudget ?? 0 }
          ].map((row) => (
            <View key={row.label} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.colors.text }}>{row.label}</Text>
              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{formatMoney(row.value, currency)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ marginTop: 18 }}>
        <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>Daily snapshot</Text>
        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          {dailySnapshots.map((d) => (
            <View key={d.label} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: d.isToday ? theme.colors.primary : theme.colors.text }}>{d.label}</Text>
              <Text style={{ color: theme.colors.textMuted }}>{formatMoney(d.amount, currency)}</Text>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}
