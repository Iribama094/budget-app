import React, { useMemo } from 'react';
import { useRoute } from '@react-navigation/native';
import { Layers } from '../icons';

import { AnalyticsBreakdown, byAmount, periodLabel, sumOf, useAnalyticsSummary, type AnalyticsRange } from '../components/Analytics/Breakdown';
import { useSpace } from '../contexts/SpaceContext';
import { bucketDisplayName } from '../theme/buckets';

/** Spending split into Needs, Wants and Savings, for the period Analytics was showing. */
export default function AnalyticsBucketDetailScreen() {
  const route = useRoute<any>();
  const { spacesEnabled, activeSpaceId, activeSpace } = useSpace();
  const range = ((route.params ?? {}) as { range?: AnalyticsRange }).range;
  const isBusiness = spacesEnabled && activeSpaceId === 'business';

  const { data, error, loading, reload } = useAnalyticsSummary(range);

  const rows = useMemo(() => {
    const items = byAmount(data?.spendingByBucket);
    const total = sumOf(items);
    return items.map(({ key, amount }) => ({
      key,
      label: bucketDisplayName(key, isBusiness),
      amount,
      fill: total > 0 ? amount / total : 0,
      caption: `${Math.round(total > 0 ? (amount / total) * 100 : 0)}% of spending`
    }));
  }, [data?.spendingByBucket, isBusiness]);

  const period = periodLabel(range);

  return (
    <AnalyticsBreakdown
      title="Spending by bucket"
      subtitle={spacesEnabled ? [activeSpace?.name ?? 'Personal', period].filter(Boolean).join(' · ') : period}
      icon={<Layers color="#E2B65C" size={16} />}
      heroLabel="Total spending"
      heroTotal={sumOf(rows)}
      heroLine="How your spending lines up with your plan."
      sectionTitle="Buckets"
      sectionInfo="Needs are what you must pay (rent, food, transport). Wants make life nicer but can wait. Savings is money you put away first. Each category belongs to one bucket; change it in Settings, Categories."
      emptyTitle="Nothing to show yet"
      emptyBody="No bucket spending in this period. Once you log expenses, we go sort them here."
      rows={rows}
      loading={loading}
      loaded={!!data}
      error={error}
      onRefresh={reload}
    />
  );
}
