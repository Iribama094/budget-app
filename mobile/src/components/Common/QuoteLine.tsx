import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { type } from '../../theme/typography';
import type { Quote } from '../../lib/quotes';

/** One quiet quote with its author. Use at most one per screen, and only in encouraging moments. */
export function QuoteLine({ quote, onInk, style }: { quote: Quote; onInk?: boolean; style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  const text = onInk ? theme.colors.inkText : theme.colors.text;
  return (
    <View style={[{ flexDirection: 'row', gap: 10 }, style]} accessible accessibilityLabel={`Quote from ${quote.author}: ${quote.text}`}>
      <View style={{ width: 3, borderRadius: 2, backgroundColor: onInk ? theme.colors.inkText : theme.colors.primary, opacity: 0.4 }} />
      <View style={{ flex: 1 }}>
        <Text style={[type.small, { color: text, opacity: onInk ? 0.85 : 0.8 }]}>“{quote.text}”</Text>
        <Text style={[type.caption, { color: text, opacity: 0.6, marginTop: 4 }]}>{quote.author}</Text>
      </View>
    </View>
  );
}
