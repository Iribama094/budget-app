import React, { useMemo } from 'react';
import { useRoute } from '@react-navigation/native';
import { CalendarDays } from '../icons';

import { AnalyticsBreakdown, periodLabel, useAnalyticsSummary, type AnalyticsRange } from '../components/Analytics/Breakdown';
import { useAmountVisibility } from '../contexts/AmountVisibilityContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { currencySymbol, formatShortDate } from '../utils/format';

/** The last seven days of the period, day by day, with the busiest one marked. */
export default function AnalyticsWeeklyDetailScreen() {
  const route = useRoute<any>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { showAmounts } = useAmountVisibility();
  const glyph = currencySymbol(user?.currency);
  const range = ((route.params ?? {}) as { range?: AnalyticsRange }).range;

  const { data, error, loading, reload } = useAnalyticsSummary(range);

  const days = useMemo(() => {
    const all = (data?.dailySpendingByCategory ?? []) as any[];
    return all.slice(Math.max(0, all.length - 7)).map((d) => ({ date: String(d.date ?? ''), expenses: Number(d.expenses ?? 0) || 0 }));
  }, [data?.dailySpendingByCategory]);

  const total = days.reduce((s, d) => s + d.expenses, 0);
  const peak = days.reduce((m, d) => Math.max(m, d.expenses), 0);
  const average = days.length ? total / days.length : 0;

  // Each day is measured against the busiest one, not against the week, so a quiet day still reads as quiet.
  const rows = days.map((d) => {
    const isPeak = peak > 0 && d.expenses === peak;
    return {
      key: d.date,
      label: `${d.date ? formatShortDate(d.date) : 'No date'}${isPeak ? '  🔥' : ''}`,
      amount: d.expenses,
      fill: peak > 0 ? d.expenses / peak : 0,
      color: isPeak ? theme.colors.brass : theme.colors.primary
    };
  });

  return (
    <AnalyticsBreakdown
      title="Weekly overview"
      subtitle={periodLabel(range)}
      icon={<CalendarDays color="#E2B65C" size={16} />}
      heroLabel="Last 7 days in range"
      heroTotal={total}
      heroLine={days.length ? `About ${showAmounts ? `${glyph}${Math.round(average).toLocaleString()}` : '••••'} a day on average.` : 'Your day-by-day spending.'}
      sectionTitle="Daily spending"
      emptyTitle="No daily breakdown yet"
      emptyBody="Log a few expenses this week and your days will show here."
      rows={rows}
      loading={loading}
      loaded={!!data}
      error={error}
      onRefresh={reload}
    />
  );
}
