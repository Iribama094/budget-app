import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSpace, type SpaceId } from '../../contexts/SpaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { type } from '../../theme/typography';

export function SpaceSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId, setActiveSpaceId } = useSpace();

  if (!spacesEnabled) return null;

  const Option = ({ id, label }: { id: SpaceId; label: string }) => {
    const active = activeSpaceId === id;
    return (
      <Pressable
        onPress={() => setActiveSpaceId(id)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        style={({ pressed }) => [
          {
            paddingHorizontal: compact ? 10 : 14,
            paddingVertical: compact ? 5 : 7,
            borderRadius: 9,
            backgroundColor: active ? theme.colors.surface : 'transparent',
            opacity: pressed ? 0.8 : 1
          }
        ]}
      >
        <Text style={[compact ? type.caption : type.smallStrong, { color: active ? theme.colors.text : theme.colors.textMuted }]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt, alignSelf: 'flex-start' }}>
      <Option id="personal" label="Personal" />
      <Option id="business" label="Business" />
    </View>
  );
}
