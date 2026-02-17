import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../theme/tokens';

const QUOTES = [
  'Small savings grow big.',
  'Track today, thrive tomorrow.',
  'Budget like a boss.',
  'Save a little, gain a lot.',
  'Your money deserves a plan.',
  'Give every naira a job.',
  'Spend with purpose, not pressure.',
  'Progress beats perfection.',
  'If it’s not planned, it’s not paid.',
  'Make a budget, keep your peace.',
  'Needs first. Wants later.',
  'Plan your money before it disappears.',
  'Small cuts, big wins.',
  'A budget is freedom in numbers.',
  'Pay yourself first.',
  'Save before you spend.',
  'Consistency builds wealth.',
  'Your future self will thank you.',
  'Less stress, more control.',
  'Money goals love a timeline.',
  'Track it, then tame it.',
  'Cut waste, keep joy.',
  'Every expense is a choice.',
  'Budgeting is self-care.'
];

export function QuoteDisplay() {
  const { theme } = useTheme();
  const [quote, setQuote] = useState(QUOTES[0]);
  useEffect(() => {
    const id = setInterval(() => {
      setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
    }, 6000);
    return () => clearInterval(id);
  }, []);

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        padding: 10,
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: theme.mode === 'dark' ? 0.06 : 0.03,
        shadowRadius: 12,
        elevation: 4
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <LinearGradient
          colors={[theme.colors.primary, tokens.colors.secondary[400]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ width: 6, height: 44, borderRadius: 6, marginRight: 10, opacity: 0.95 }}
        />
        <Text
          style={{ color: theme.colors.textMuted, fontStyle: 'italic', fontSize: 14, flex: 1, lineHeight: 18 }}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          "{quote}"
        </Text>
      </View>
    </View>
  );
}
