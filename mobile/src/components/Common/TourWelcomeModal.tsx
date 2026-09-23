import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { tokens } from '../../theme/tokens';

export function TourWelcomeModal({
  visible,
  onStart,
  onSkip
}: {
  visible: boolean;
  onStart: () => void;
  onSkip: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  // Nothing at all when it is not showing: an overlay that stays mounted would swallow every tap on the screen.
  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9000, elevation: 9000 }]}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', padding: 16, paddingTop: 16 + insets.top, justifyContent: 'center' }}>
        <View
          style={{
            borderRadius: 22,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: 16,
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 12 },
            elevation: 12
          }}
        >
          <Text style={{ color: theme.colors.textMuted, fontFamily: 'Figtree_700Bold', fontSize: 12 }}>WELCOME</Text>
          <Text style={{ color: theme.colors.text, fontFamily: 'Figtree_700Bold', fontSize: 18, marginTop: 6 }}>Quick setup tour</Text>
          <Text style={{ color: theme.colors.textMuted, marginTop: 8, fontSize: 13, lineHeight: 19 }}>
            We’ll show you the fastest way to start: add a transaction, create a budget, view insights, and set a goal.
          </Text>

          <View style={{ marginTop: 12, gap: 8 }}>
            {[
              'Works for Personal and Business spaces',
              'No pressure — you can skip anytime',
              'Takes about 30 seconds'
            ].map((t) => (
              <View key={t} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: theme.colors.primary, marginRight: 10 }} />
                <Text style={{ color: theme.colors.text, fontFamily: 'Figtree_600SemiBold', fontSize: 13, flex: 1 }}>{t}</Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', marginTop: 16, gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Pressable
                onPress={onSkip}
                style={({ pressed }) => ({
                  paddingVertical: 12,
                  borderRadius: tokens.radius['2xl'],
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceAlt,
                  opacity: pressed ? 0.92 : 1,
                  alignItems: 'center'
                })}
              >
                <Text style={{ color: theme.colors.text, fontFamily: 'Figtree_700Bold' }}>Not now</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1 }}>
              <Pressable
                onPress={onStart}
                style={({ pressed }) => ({
                  paddingVertical: 12,
                  borderRadius: tokens.radius['2xl'],
                  backgroundColor: theme.colors.primary,
                  opacity: pressed ? 0.92 : 1,
                  alignItems: 'center'
                })}
              >
                <Text style={{ color: tokens.colors.white, fontFamily: 'Figtree_700Bold' }}>Start tour</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
