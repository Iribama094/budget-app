import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Layers } from '../icons';

import { bucketDisplayName } from '../theme/buckets';
import { Amount, EmptyState, HeroCard, InlineError, ListCard, ProgressBar, Screen, ScreenHeader, SectionHeader } from '../components/Common/ui';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useAmountVisibility } from '../contexts/AmountVisibilityContext';
import { useSpace } from '../contexts/SpaceContext';
import { getAnalyticsSummary, type AnalyticsSummary } from '../api/endpoints';
import { currencySymbol, formatShortDate } from '../utils/format';
import { type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';

type RouteParams = {
  range: { start: string; end: string };
  timeframe?: 'daily' | 'weekly' | 'monthly';
};

export default function AnalyticsBucketDetailScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { showAmounts } = useAmountVisibility();
  const { spacesEnabled, activeSpaceId, activeSpace } = useSpace();
  const glyph = currencySymbol(user?.currency);
  const inkText = theme.colors.inkText;

  const isBusiness = spacesEnabled && activeSpaceId === 'business';
  const bucketLabel = useCallback(
    (key: string) => {
      return bucketDisplayName(key, isBusiness);
    },
    [isBusiness]
  );

  const params = (route.params ?? {}) as RouteParams;
  const range = params.range;

  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!range?.start || !range?.end) return;
    setError(null);
    setIsLoading(true);
    try {
      const summary = await getAnalyticsSummary(range.start, range.end, spacesEnabled ? { spaceId: activeSpaceId } : undefined);
      setData(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  }, [activeSpaceId, range?.end, range?.start, spacesEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => {
    const byBucket = data?.spendingByBucket ?? {};
    return Object.entries(byBucket)
      .map(([bucket, amount]) => ({ bucket, amount: Number(amount) || 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [data?.spendingByBucket]);

  const total = useMemo(() => items.reduce((s, x) => s + x.amount, 0) || 0, [items]);
  const periodLabel = range ? `${formatShortDate(range.start)} – ${formatShortDate(range.end)}` : undefined;

  return (
    <Screen bottomInset={48} onRefresh={load} refreshing={isLoading}>
      <ScreenHeader
        title="Spending by bucket"
        subtitle={spacesEnabled ? [activeSpace?.name ?? 'Personal', periodLabel].filter(Boolean).join(' · ') : periodLabel}
        onBack={() => goBackOrHome(nav)}
      />

      {error ? <InlineError message={error} /> : null}

      <HeroCard style={{ marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Layers color="#E2B65C" size={16} />
          <Text style={[type.eyebrow, { color: inkText, opacity: 0.72 }]}>Total spending</Text>
        </View>
        <Amount value={total} currency={glyph} size="hero" color={inkText} hidden={!showAmounts} style={{ marginTop: 8 }} />
        <Text style={[type.small, { color: inkText, opacity: 0.78 }]}>How your spending lines up with your plan.</Text>
      </HeroCard>

      <SectionHeader title="Buckets" />
      {isLoading && !data ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : items.length === 0 ? (
        <EmptyState title="Nothing to show yet" body="No bucket spending in this period. Once you log expenses, we go sort them here." />
      ) : (
        <ListCard>
          {items.map(({ bucket, amount }) => {
            const share = total > 0 ? amount / total : 0;
            return (
              <View key={bucket} style={{ paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text numberOfLines={1} style={[type.bodyStrong, { color: theme.colors.text, flex: 1 }]}>
                    {bucketLabel(bucket)}
                  </Text>
                  <Amount value={amount} currency={glyph} size="sm" hidden={!showAmounts} />
                </View>
                <View style={{ marginTop: 8 }}>
                  <ProgressBar value={share} />
                </View>
                <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>{Math.round(share * 100)}% of spending</Text>
              </View>
            );
          })}
        </ListCard>
      )}
    </Screen>
  );
}
