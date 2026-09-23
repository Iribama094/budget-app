import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CalendarDays } from '../icons';

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

export default function AnalyticsWeeklyDetailScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { showAmounts } = useAmountVisibility();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const glyph = currencySymbol(user?.currency);
  const inkText = theme.colors.inkText;

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

  const daily = useMemo(() => {
    const arr = (data?.dailySpendingByCategory ?? []) as any[];
    return arr
      .map((d) => ({
        date: String(d.date ?? ''),
        expenses: Number(d.expenses ?? 0) || 0
      }))
      .slice(Math.max(0, arr.length - 7));
  }, [data?.dailySpendingByCategory]);

  const total7 = useMemo(() => daily.reduce((s, d) => s + d.expenses, 0), [daily]);
  const peak = useMemo(() => daily.reduce((m, d) => Math.max(m, d.expenses), 0), [daily]);
  const average = daily.length ? total7 / daily.length : 0;

  return (
    <Screen bottomInset={48} onRefresh={load} refreshing={isLoading}>
      <ScreenHeader title="Weekly overview" subtitle={range ? `${formatShortDate(range.start)} – ${formatShortDate(range.end)}` : undefined} onBack={() => goBackOrHome(nav)} />

      {error ? <InlineError message={error} /> : null}

      <HeroCard style={{ marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CalendarDays color="#E2B65C" size={16} />
          <Text style={[type.eyebrow, { color: inkText, opacity: 0.72 }]}>Last 7 days in range</Text>
        </View>
        <Amount value={total7} currency={glyph} size="hero" color={inkText} hidden={!showAmounts} style={{ marginTop: 8 }} />
        <Text style={[type.small, { color: inkText, opacity: 0.78 }]}>
          {daily.length ? `About ${showAmounts ? `${glyph}${Math.round(average).toLocaleString()}` : '••••'} a day on average.` : 'Your day-by-day spending.'}
        </Text>
      </HeroCard>

      <SectionHeader title="Daily spending" />
      {isLoading && !data ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : daily.length === 0 ? (
        <EmptyState title="No daily breakdown yet" body="Log a few expenses this week and your days will show here." />
      ) : (
        <ListCard>
          {daily.map((d) => {
            const isPeak = peak > 0 && d.expenses === peak;
            return (
              <View key={d.date} style={{ paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text numberOfLines={1} style={[type.bodyStrong, { color: theme.colors.text, flex: 1 }]}>
                    {d.date ? formatShortDate(d.date) : 'No date'}
                    {isPeak ? '  🔥' : ''}
                  </Text>
                  <Amount value={d.expenses} currency={glyph} size="sm" hidden={!showAmounts} />
                </View>
                <View style={{ marginTop: 8 }}>
                  <ProgressBar value={peak > 0 ? d.expenses / peak : 0} color={isPeak ? theme.colors.brass : theme.colors.primary} />
                </View>
              </View>
            );
          })}
        </ListCard>
      )}
    </Screen>
  );
}
