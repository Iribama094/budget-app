import React, { useMemo } from 'react';
import { useRoute } from '@react-navigation/native';
import { Wallet } from '../icons';

import { AnalyticsBreakdown, byAmount, periodLabel, sumOf, useAnalyticsSummary, type AnalyticsRange } from '../components/Analytics/Breakdown';
import { useTheme } from '../contexts/ThemeContext';

/** What came out of the small pots set aside for particular things. */
export default function AnalyticsMiniBudgetsDetailScreen() {
  const route = useRoute<any>();
  const { theme } = useTheme();
  const range = ((route.params ?? {}) as { range?: AnalyticsRange }).range;

  const { data, error, loading, reload } = useAnalyticsSummary(range);

  const rows = useMemo(() => {
    const items = byAmount(data?.spendingByMiniBudget);
    const total = sumOf(items);
    return items.map(({ key, amount }) => ({
      key,
      label: key,
      amount,
      fill: total > 0 ? amount / total : 0,
      color: theme.colors.brass,
      caption: `${Math.round(total > 0 ? (amount / total) * 100 : 0)}% of mini-budget spending`
    }));
  }, [data?.spendingByMiniBudget, theme.colors.brass]);

  return (
    <AnalyticsBreakdown
      title="Mini budget spending"
      subtitle={periodLabel(range)}
      icon={<Wallet color="#E2B65C" size={16} />}
      heroLabel="Spent from mini budgets"
      heroTotal={sumOf(rows)}
      heroLine={rows.length ? `Across ${rows.length} mini budget${rows.length === 1 ? '' : 's'} this period.` : 'Your small pots for specific things.'}
      sectionTitle="Mini budgets"
      emptyTitle="No mini budget spending yet"
      emptyBody="Link an expense to a mini budget and it will show here."
      rows={rows}
      loading={loading}
      loaded={!!data}
      error={error}
      onRefresh={reload}
    />
  );
}
