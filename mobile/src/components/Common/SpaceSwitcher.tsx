import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSpace, type SpaceId } from '../../contexts/SpaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { tokens } from '../../theme/tokens';

export function SpaceSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId, setActiveSpaceId } = useSpace();

  if (!spacesEnabled) return null;

  const pillPaddingY = compact ? 8 : 10;
  const pillPaddingX = compact ? 12 : 14;

  const Option = ({ id, label }: { id: SpaceId; label: string }) => {
    const active = activeSpaceId === id;
    return (
      <Pressable
        onPress={() => setActiveSpaceId(id)}
        style={({ pressed }) => [
          {
            paddingHorizontal: pillPaddingX,
            paddingVertical: pillPaddingY,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: active ? 'transparent' : theme.colors.border,
            backgroundColor: active ? theme.colors.primary : theme.colors.surface,
            opacity: pressed ? 0.92 : 1,
            transform: [{ scale: pressed ? 0.99 : 1 }]
          }
        ]}
      >
        <Text style={{ color: active ? tokens.colors.white : theme.colors.text, fontWeight: '900' }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'center' }}>
      <Option id="personal" label="Personal" />
      <Option id="business" label="Business" />
    </View>
  );
}
