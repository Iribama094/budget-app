import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { type } from '../../theme/typography';

/**
 * Rows separated by hairlines, straight on the page: no card around them. Lighter than ListCard, for screens
 * that are mostly lists (Your money, Properties, helpers).
 */
export function PlainList({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={style}>
      {items.map((child, i) => (
        <View key={i} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border }}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** A section title with its total on the right, e.g. "Cash and accounts  ₦620,000". */
export function PlainHeader({ title, right, style }: { title: string; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 26, marginBottom: 6 }, style]}>
      <Text style={[type.eyebrow, { color: theme.colors.textMuted }]}>{title}</Text>
      {typeof right === 'string' ? <Text style={[type.smallStrong, { color: theme.colors.text }]}>{right}</Text> : right}
    </View>
  );
}

/** "+ Add something" under a list, quiet until needed. */
export function AddLine({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={6} style={({ pressed }) => ({ paddingVertical: 12, opacity: pressed ? 0.6 : 1, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border })}>
      <Text style={[type.smallStrong, { color: theme.colors.primary }]}>+ {label}</Text>
    </Pressable>
  );
}
