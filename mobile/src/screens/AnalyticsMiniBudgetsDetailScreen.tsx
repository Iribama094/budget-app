import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Wallet } from '../icons';

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

export default function AnalyticsMiniBudgetsDetailScreen() {
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

  const items = useMemo(() => {
    const byMini = data?.spendingByMiniBudget ?? {};
    return Object.entries(byMini)
      .map(([mini, amount]) => ({ mini, amount: Number(amount) || 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [data?.spendingByMiniBudget]);

  const total = useMemo(() => items.reduce((s, x) => s + x.amount, 0) || 0, [items]);

  return (
    <Screen bottomInset={48} onRefresh={load} refreshing={isLoading}>
      <ScreenHeader title="Mini budget spending" subtitle={range ? `${formatShortDate(range.start)} – ${formatShortDate(range.end)}` : undefined} onBack={() => goBackOrHome(nav)} />

      {error ? <InlineError message={error} /> : null}

      <HeroCard style={{ marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Wallet color="#E2B65C" size={16} />
          <Text style={[type.eyebrow, { color: inkText, opacity: 0.72 }]}>Spent from mini budgets</Text>
        </View>
        <Amount value={total} currency={glyph} size="hero" color={inkText} hidden={!showAmounts} style={{ marginTop: 8 }} />
        <Text style={[type.small, { color: inkText, opacity: 0.78 }]}>
          {items.length ? `Across ${items.length} mini budget${items.length === 1 ? '' : 's'} this period.` : 'Your small pots for specific things.'}
        </Text>
      </HeroCard>

      <SectionHeader title="Mini budgets" />
      {isLoading && !data ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : items.length === 0 ? (
        <EmptyState title="No mini budget spending yet" body="Link an expense to a mini budget and it will show here." />
      ) : (
        <ListCard>
          {items.map(({ mini, amount }) => {
            const share = total > 0 ? amount / total : 0;
            return (
              <View key={mini} style={{ paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text numberOfLines={1} style={[type.bodyStrong, { color: theme.colors.text, flex: 1 }]}>
                    {mini}
                  </Text>
                  <Amount value={amount} currency={glyph} size="sm" hidden={!showAmounts} />
                </View>
                <View style={{ marginTop: 8 }}>
                  <ProgressBar value={share} color={theme.colors.brass} />
                </View>
                <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>{Math.round(share * 100)}% of mini-budget spending</Text>
              </View>
            );
          })}
        </ListCard>
      )}
    </Screen>
  );
}
