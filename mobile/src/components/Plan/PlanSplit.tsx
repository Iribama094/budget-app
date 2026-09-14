import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Amount } from '../Common/ui';
import { BUCKETS, bucketDescription, bucketDisplayName, type Bucket } from '../../theme/buckets';
import { bucketColor } from '../../theme/theme';
import { type } from '../../theme/typography';

/** The Needs / Wants / Savings bar with an amount for each bucket. */
export function PlanSplit({
  split,
  percents,
  glyph,
  hidden,
  isBusiness
}: {
  split: Record<Bucket, number>;
  percents: Record<Bucket, number>;
  glyph: string;
  hidden?: boolean;
  isBusiness?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View>
      <View style={[styles.bar, { backgroundColor: theme.colors.surfaceAlt }]}>
        {BUCKETS.filter((b) => percents[b] > 0).map((b) => (
          <View key={b} style={{ flex: percents[b], backgroundColor: bucketColor(theme, b) }} />
        ))}
      </View>
      {BUCKETS.map((b) => (
        <View key={b} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: bucketColor(theme, b) }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>
              {bucketDisplayName(b, isBusiness)} · {percents[b]}%
            </Text>
            <Text numberOfLines={1} style={[type.caption, { color: theme.colors.textMuted }]}>
              {bucketDescription(b, isBusiness)}
            </Text>
          </View>
          <Amount value={split[b]} currency={glyph} size="sm" hidden={hidden} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2, marginTop: 4, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  dot: { width: 10, height: 10, borderRadius: 3 }
});
