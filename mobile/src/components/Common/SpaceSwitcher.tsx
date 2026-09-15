import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { Briefcase, UserRound } from 'lucide-react-native';
import { SPACE_LOOK, useSpace, type SpaceId } from '../../contexts/SpaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { type } from '../../theme/typography';

/** Personal / Business toggle with a sliding pill; switching plays the full-screen space transition. */
export function SpaceSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId, switchSpace } = useSpace();
  const width = compact ? 84 : 100;
  const pos = useRef(new Animated.Value(activeSpaceId === 'business' ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(pos, { toValue: activeSpaceId === 'business' ? 1 : 0, friction: 7, tension: 70, useNativeDriver: true }).start();
  }, [activeSpaceId, pos]);

  if (!spacesEnabled) return null;

  const options: Array<{ id: SpaceId; label: string; Icon: typeof Briefcase }> = [
    { id: 'personal', label: 'Personal', Icon: UserRound },
    { id: 'business', label: 'Business', Icon: Briefcase }
  ];
  const business = activeSpaceId === 'business';

  return (
    <View style={{ flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt, alignSelf: 'flex-start' }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 3,
          bottom: 3,
          left: 3,
          width,
          borderRadius: 9,
          backgroundColor: business ? SPACE_LOOK.business.bg : theme.colors.surface,
          transform: [{ translateX: pos.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }]
        }}
      />
      {options.map(({ id, label, Icon }) => {
        const active = activeSpaceId === id;
        const color = active ? (id === 'business' ? SPACE_LOOK.business.accent : theme.colors.primary) : theme.colors.textMuted;
        return (
          <Pressable
            key={id}
            onPress={() => switchSpace(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => ({ width, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: compact ? 5 : 7, opacity: pressed ? 0.8 : 1 })}
          >
            <Icon color={color} size={compact ? 12 : 14} />
            <Text style={[compact ? type.caption : type.smallStrong, { color: active ? (id === 'business' ? SPACE_LOOK.business.onBg : theme.colors.text) : theme.colors.textMuted }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
