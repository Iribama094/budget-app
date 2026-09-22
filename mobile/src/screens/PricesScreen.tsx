import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { getPrices, type ApiPrices } from '../api/money';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { InlineError, ListRow, Screen, ScreenHeader, formatAmount } from '../components/Common/ui';
import { PlainHeader, PlainList } from '../components/Common/PlainList';
import { currencySymbol, formatShortDate } from '../utils/format';
import { type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';
import { errorMessage } from '../lib/errorMessage';
import { useScreenData } from '../hooks/useScreenData';

const pct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n * 100))}%`;

/**
 * Rising prices, on your own life: what your regular needs cost now against three months ago, which bills went
 * up, and price news that touches what you buy. Only things you paid for in both stretches count, so a new
 * habit doesn't look like inflation.
 */
export default function PricesScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const glyph = currencySymbol(user?.currency);
  const { data, error, reload: load } = useScreenData(() => getPrices(spacesEnabled ? activeSpaceId : undefined), [activeSpaceId, spacesEnabled], {
    fallback: 'Could not work this out'
  });


  const lc = data?.livingCost ?? null;
  return (
    <Screen onRefresh={load} bottomInset={48}>
      <ScreenHeader title="Rising prices" subtitle="What your own life costs now" onBack={() => goBackOrHome(nav)} />
      {error ? <InlineError message={error} /> : null}
      {!data && !error ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 24 }} /> : null}

      {data ? (
        <>
          <View style={{ marginTop: 18 }}>
            {lc ? (
              <>
                <Text style={[type.eyebrow, { color: theme.colors.textMuted }]}>Your needs, last 3 months</Text>
                <Text style={[type.amountLg, { color: lc.change > 0.02 ? theme.colors.error : theme.colors.text, marginTop: 4 }]}>{pct(lc.change)}</Text>
                <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 4 }]}>
                  About {formatAmount(lc.recentMonthly, glyph)} a month, from {formatAmount(lc.beforeMonthly, glyph)} before.
                  {data.incomeChange != null ? ` Your income moved ${pct(data.incomeChange)} over the same time.` : ''}
                </Text>
                {data.yearlyRate ? (
                  <Text style={[type.small, { color: theme.colors.text, marginTop: 10 }]}>
                    If this keeps up, something that costs {formatAmount(100000, glyph)} today would cost about {formatAmount(Math.round(100000 * (1 + data.yearlyRate)), glyph)} in a year. Goals a long way off may need a bit more.
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={[type.body, { color: theme.colors.textMuted }]}>
                We need about six months of your spending on the same needs (food, transport, bills) to measure this. Keep logging and it will show here.
              </Text>
            )}
          </View>

          {lc?.categories.length ? (
            <>
              <PlainHeader title="What changed" />
              <PlainList>
                {lc.categories.map((c) => (
                  <ListRow
                    key={c.category}
                    title={c.category}
                    subtitle={`${formatAmount(c.beforeMonthly, glyph)} → ${formatAmount(c.recentMonthly, glyph)} a month`}
                    right={<Text style={[type.bodyStrong, { color: c.change > 0.05 ? theme.colors.error : theme.colors.textMuted }]}>{pct(c.change)}</Text>}
                  />
                ))}
              </PlainList>
            </>
          ) : null}

          {data.billsUp.length ? (
            <>
              <PlainHeader title="Bills that went up" />
              <PlainList>
                {data.billsUp.map((b) => (
                  <ListRow
                    key={b.recurringId}
                    title={b.name}
                    subtitle={`Set at ${formatAmount(b.from, glyph)}, you paid ${formatAmount(b.to, glyph)}`}
                    right={<Text style={[type.smallStrong, { color: theme.colors.primary }]}>Update</Text>}
                    onPress={() => nav.navigate('Recurring')}
                  />
                ))}
              </PlainList>
            </>
          ) : null}

          {data.alerts.length ? (
            <>
              <PlainHeader title="Heads up" />
              <PlainList>
                {data.alerts.map((a) => (
                  <View key={a.key} style={{ paddingVertical: 12 }}>
                    <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{a.title}</Text>
                    <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 2 }]}>{a.body}</Text>
                  </View>
                ))}
              </PlainList>
            </>
          ) : null}

          {lc ? (
            <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 24 }]}>
              Compares what you paid for the same needs in the last 90 days with the 90 days before, starting {formatShortDate(lc.since)}. Spending more on something can also mean buying more of it.
            </Text>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
