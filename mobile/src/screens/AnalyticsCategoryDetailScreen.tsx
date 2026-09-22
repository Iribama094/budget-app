import React, { useMemo } from 'react';
import { useRoute } from '@react-navigation/native';
import { PieChart } from '../icons';

import { AnalyticsBreakdown, byAmount, periodLabel, sumOf, useAnalyticsSummary, type AnalyticsRange } from '../components/Analytics/Breakdown';
import { categoryDotColor } from '../utils/format';

/** Which categories the money went to, biggest first. */
export default function AnalyticsCategoryDetailScreen() {
  const route = useRoute<any>();
  const range = ((route.params ?? {}) as { range?: AnalyticsRange }).range;

  const { data, error, loading, reload } = useAnalyticsSummary(range);

  const rows = useMemo(() => {
    const items = byAmount(data?.spendingByCategory);
    const total = sumOf(items);
    return items.map(({ key, amount }) => ({
      key,
      label: key,
      amount,
      fill: total > 0 ? amount / total : 0,
      color: categoryDotColor(key),
      dot: true,
      caption: `${Math.round(total > 0 ? (amount / total) * 100 : 0)}% of spending`
    }));
  }, [data?.spendingByCategory]);

  const total = sumOf(rows);
  const top = rows[0];

  return (
    <AnalyticsBreakdown
      title="Spending by category"
      subtitle={periodLabel(range)}
      icon={<PieChart color="#E2B65C" size={16} />}
      heroLabel="Total spending"
      heroTotal={total}
      heroLine={top && total > 0 ? `${top.label} carry the biggest share: ${Math.round((top.amount / total) * 100)}% of your spending.` : 'Where your money went this period.'}
      sectionTitle="Categories"
      emptyTitle="Nothing to show yet"
      emptyBody="No spending in this period. Log an expense and your breakdown will show here."
      rows={rows}
      loading={loading}
      loaded={!!data}
      error={error}
      onRefresh={reload}
    />
  );
}
