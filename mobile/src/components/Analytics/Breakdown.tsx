import React from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { getAnalyticsSummary, type AnalyticsSummary } from '../../api/endpoints';
import { useAmountVisibility } from '../../contexts/AmountVisibilityContext';
import { useAuth } from '../../contexts/AuthContext';
import { useSpace } from '../../contexts/SpaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useScreenData } from '../../hooks/useScreenData';
import { goBackOrHome } from '../../navigation/goBack';
import { type } from '../../theme/typography';
import { currencySymbol, formatShortDate } from '../../utils/format';
import { Amount, EmptyState, HeroCard, InlineError, ListCard, ProgressBar, Screen, ScreenHeader, SectionHeader, Spinner } from '../Common/ui';

/** What every analytics detail screen is opened with: the period the Analytics screen was showing. */
export type AnalyticsRange = { start: string; end: string };

/**
 * One period's numbers, for a screen that breaks them down.
 *
 * It loads on the way in and whenever the space or the period changes, but not on every return to the screen:
 * these screens are read from a fixed range, so a reload on focus would only make the numbers flicker.
 */
export function useAnalyticsSummary(range: AnalyticsRange | undefined) {
  const { spacesEnabled, activeSpaceId } = useSpace();
  return useScreenData<AnalyticsSummary | null>(
    async () => {
      if (!range?.start || !range?.end) return null;
      return getAnalyticsSummary(range.start, range.end, spacesEnabled ? { spaceId: activeSpaceId } : undefined);
    },
    [range?.start, range?.end, activeSpaceId, spacesEnabled],
    { fallback: 'Failed to load analytics', onFocus: false }
  );
}

/** One line of the breakdown: what it is, what it cost, and how much of the bar it fills. */
export type BreakdownRow = {
  key: string;
  label: string;
  amount: number;
  /** 0 to 1. Usually this row's share of the total, but Weekly measures each day against the busiest one. */
  fill: number;
  /** A dot before the label, and the colour of its bar. */
  color?: string;
  dot?: boolean;
  caption?: string;
};

/**
 * The shape all four analytics breakdowns share: a total at the top, then a list of rows with a bar each.
 * What differs between them is only the words, the icon and how the rows are worked out, so that stays in the
 * screens and everything else lives here.
 */
export function AnalyticsBreakdown(props: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  heroLabel: string;
  heroTotal: number;
  heroLine: string;
  sectionTitle: string;
  sectionInfo?: string;
  emptyTitle: string;
  emptyBody: string;
  rows: BreakdownRow[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { showAmounts } = useAmountVisibility();
  const glyph = currencySymbol(user?.currency);
  const inkText = theme.colors.inkText;

  return (
    <Screen bottomInset={48} onRefresh={props.onRefresh} refreshing={props.loading}>
      <ScreenHeader title={props.title} subtitle={props.subtitle} onBack={() => goBackOrHome(nav)} />

      {props.error ? <InlineError message={props.error} /> : null}

      <HeroCard style={{ marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {props.icon}
          <Text style={[type.eyebrow, { color: inkText, opacity: 0.72 }]}>{props.heroLabel}</Text>
        </View>
        <Amount value={props.heroTotal} currency={glyph} size="hero" color={inkText} hidden={!showAmounts} style={{ marginTop: 8 }} />
        <Text style={[type.small, { color: inkText, opacity: 0.78 }]}>{props.heroLine}</Text>
      </HeroCard>

      <SectionHeader title={props.sectionTitle} info={props.sectionInfo} />
      {props.loading && !props.loaded ? (
        <Spinner />
      ) : props.rows.length === 0 ? (
        <EmptyState title={props.emptyTitle} body={props.emptyBody} />
      ) : (
        <ListCard>
          {props.rows.map((row) => (
            <View key={row.key} style={{ paddingVertical: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {row.dot ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: row.color }} /> : null}
                <Text numberOfLines={1} style={[type.bodyStrong, { color: theme.colors.text, flex: 1 }]}>
                  {row.label}
                </Text>
                <Amount value={row.amount} currency={glyph} size="sm" hidden={!showAmounts} />
              </View>
              <View style={{ marginTop: 8 }}>
                <ProgressBar value={row.fill} color={row.color} />
              </View>
              {row.caption ? <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>{row.caption}</Text> : null}
            </View>
          ))}
        </ListCard>
      )}
    </Screen>
  );
}

/** "12 Mar – 25 Mar", the period every one of these screens shows under its title. */
export const periodLabel = (range: AnalyticsRange | undefined) =>
  range ? `${formatShortDate(range.start)} – ${formatShortDate(range.end)}` : undefined;

/** Adds up a breakdown, for the total in the hero. */
export const sumOf = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);

/** The same sort every breakdown uses: biggest spending first. */
export const byAmount = (entries: Record<string, unknown> | undefined) =>
  Object.entries(entries ?? {})
    .map(([key, amount]) => ({ key, amount: Number(amount) || 0 }))
    .sort((a, b) => b.amount - a.amount);
