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
import { formatMoney } from '../utils/format';

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
          <H1 style={{ marginBottom: 0 }}>Weekly overview</H1>
          <P style={{ marginTop: 4 }}>Daily totals for the last 7 days in range.</P>
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
          <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12, marginTop: 10 }}>Total (last 7 days)</Text>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 22, marginTop: 4 }}>
            {showAmounts ? formatMoney(total7, user?.currency ?? '₦') : '••••'}
          </Text>
        </Card>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Daily spending</Text>
          <View style={{ marginTop: 10 }}>
            {daily.length === 0 ? (
              <P>No daily breakdown available yet.</P>
            ) : (
              daily.map((d) => (
                <View
                  key={d.date}
                  style={{
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '800', flex: 1, paddingRight: 12 }} numberOfLines={1}>
                    {d.date || '—'}
                  </Text>
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                    {showAmounts ? formatMoney(d.expenses, user?.currency ?? '₦') : '••••'}
                  </Text>
                </View>
              ))
            )}
          </View>
        </Card>
      </View>
    </Screen>
  );
}
