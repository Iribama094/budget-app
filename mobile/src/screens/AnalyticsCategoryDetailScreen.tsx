import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';

import { Screen, Card, H1, InlineError, P } from '../components/Common/ui';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useAmountVisibility } from '../contexts/AmountVisibilityContext';
import { useSpace } from '../contexts/SpaceContext';
import { getAnalyticsSummary, type AnalyticsSummary } from '../api/endpoints';
import { categoryDotColor, formatMoney } from '../utils/format';

type RouteParams = {
  range: { start: string; end: string };
  timeframe?: 'daily' | 'weekly' | 'monthly';
};

export default function AnalyticsCategoryDetailScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { showAmounts } = useAmountVisibility();
  const { spacesEnabled, activeSpaceId } = useSpace();

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
    const byCat = data?.spendingByCategory ?? {};
    return Object.entries(byCat)
      .map(([category, amount]) => ({ category, amount: Number(amount) || 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [data?.spendingByCategory]);

  const total = useMemo(() => items.reduce((s, x) => s + x.amount, 0) || 0, [items]);

  return (
    <Screen onRefresh={load} refreshing={isLoading}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={() => nav.goBack()}
          style={({ pressed }) => [{
            width: 44,
            height: 44,
            borderRadius: 18,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.92 : 1
          }]}
        >
          <ArrowLeft color={theme.colors.text} size={20} />
        </Pressable>
        <View style={{ marginLeft: 12, flex: 1 }}>
          <H1 style={{ marginBottom: 0 }}>Spending by Category</H1>
          <P style={{ marginTop: 4 }}>Full breakdown for this period.</P>
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        {error ? <InlineError message={error} /> : null}
        {isLoading ? <ActivityIndicator color={theme.colors.primary} /> : null}
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>Period</Text>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 14, marginTop: 4 }}>
            {String(range?.start ?? '')} → {String(range?.end ?? '')}
          </Text>
          <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12, marginTop: 10 }}>Total spending</Text>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 22, marginTop: 4 }}>
            {showAmounts ? formatMoney(total, user?.currency ?? '₦') : '••••'}
          </Text>
        </Card>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Categories</Text>
          <View style={{ marginTop: 10 }}>
            {items.length === 0 ? (
              <P>No category spending data yet.</P>
            ) : (
              items.map(({ category, amount }) => {
                const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
                const dot = categoryDotColor(category);
                return (
                  <View
                    key={category}
                    style={{
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.border
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: dot, marginRight: 10 }} />
                        <Text style={{ color: theme.colors.text, fontWeight: '900', flex: 1 }} numberOfLines={1}>
                          {category}
                        </Text>
                      </View>
                      <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                        {showAmounts ? formatMoney(amount, user?.currency ?? '₦') : '••••'}
                      </Text>
                    </View>
                    <Text style={{ color: theme.colors.textMuted, fontWeight: '700', marginTop: 6, fontSize: 12 }}>
                      {pct}% of spending
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </Card>
      </View>
    </Screen>
  );
}
