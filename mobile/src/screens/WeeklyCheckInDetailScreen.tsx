import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { CalendarCheck } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import { Amount, Chip, HeroCard, ListCard, ListRow, ProgressBar, Screen, ScreenHeader, SectionHeader } from '../components/Common/ui';
import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { useAuth } from '../contexts/AuthContext';
import { listBudgets, listTransactions, type ApiBudget, type ApiTransaction } from '../api/endpoints';
import { currencySymbol, formatShortDate, toIsoDate } from '../utils/format';
import { type } from '../theme/typography';
import { pickQuote } from '../lib/quotes';
import { QuoteLine } from '../components/Common/QuoteLine';
import { GuideAnchor } from '../components/Common/GuideAnchor';

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

  const glyph = currencySymbol(user?.currency);

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

  const peakDay = dailySnapshots.reduce((m, d) => Math.max(m, d.amount), 0);
  const inkText = theme.colors.inkText;

  return (
    <Screen bottomInset={48}>
      <ScreenHeader title="Weekly check-in" subtitle={`${formatShortDate(toIsoDate(weekInfo.start))} – ${formatShortDate(toIsoDate(weekInfo.end))}`} onBack={() => nav.goBack()} />

      <GuideAnchor id="weekly.hero">
      <HeroCard style={{ marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <CalendarCheck color="#E2B65C" size={16} />
            <Text style={[type.eyebrow, { color: inkText, opacity: 0.72 }]}>Spent this week</Text>
          </View>
          <Chip tone="onInk" label={`Day ${weekInfo.elapsedDays} of 7`} />
        </View>
        <Amount value={weekExpenses} currency={glyph} size="hero" color={inkText} style={{ marginTop: 8 }} />
        <Text style={[type.small, { color: inkText, opacity: 0.78 }]}>
          {weekInfo.remainingDays > 0
            ? `${weekInfo.remainingDays} day${weekInfo.remainingDays === 1 ? '' : 's'} left this week 💪`
            : 'Last day of the week. How did it go?'}
        </Text>
        <View style={{ marginTop: 14 }}>
          <ProgressBar value={weekInfo.progressPct / 100} height={8} color="#E2B65C" trackColor="rgba(255,255,255,0.14)" />
        </View>
      </HeroCard>
      </GuideAnchor>

      <SectionHeader title="This week so far" />
      <ListCard>
        <ListRow title="Income" right={<Amount value={weekIncome} currency={glyph} size="sm" color={theme.colors.success} />} />
        <ListRow title="Expenses" right={<Amount value={weekExpenses} currency={glyph} size="sm" />} />
        <ListRow
          title="Left in your budget"
          subtitle={currentBudget ? undefined : 'Make a budget to see what’s left'}
          right={<Amount value={remainingBudget} currency={glyph} size="sm" color={remainingBudget < 0 ? theme.colors.error : theme.colors.text} />}
        />
      </ListCard>

      <SectionHeader title="Daily snapshot" />
      <ListCard>
        {dailySnapshots.map((d) => (
          <View key={d.label} style={{ paddingVertical: 11 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={[type.bodyStrong, { color: d.isToday ? theme.colors.primary : theme.colors.text, width: 44 }]}>{d.label}</Text>
              <View style={{ flex: 1 }}>
                <ProgressBar value={peakDay > 0 ? d.amount / peakDay : 0} color={d.isToday ? theme.colors.primary : theme.colors.textMuted} />
              </View>
              <Amount value={d.amount} currency={glyph} size="sm" color={d.amount > 0 ? theme.colors.text : theme.colors.textMuted} />
            </View>
          </View>
        ))}
      </ListCard>

      {/* One quote a week: the seed changes weekly, so it stays the same for the whole week. */}
      <QuoteLine
        quote={pickQuote(['saving', 'spending', 'patience'], `${user?.id ?? ''}:${Math.floor(Date.now() / (7 * 86400000))}`)}
        style={{ marginTop: 20 }}
      />
    </Screen>
  );
}
