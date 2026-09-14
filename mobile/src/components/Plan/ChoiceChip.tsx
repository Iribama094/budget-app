import React from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { type } from '../../theme/typography';

/** A selectable pill used in forms and pickers. */
export function ChoiceChip({
  label,
  active,
  onPress,
  icon,
  style
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface,
          borderColor: active ? theme.colors.primary : theme.colors.border,
          opacity: pressed ? 0.8 : 1
        },
        style
      ]}
    >
      {icon}
      <Text style={[type.smallStrong, { color: active ? theme.colors.primary : theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 13, borderRadius: 18, borderWidth: 1 }
});
