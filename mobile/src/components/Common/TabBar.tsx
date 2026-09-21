import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Wallet, BarChart3, Target, Plus } from '../../icons';
import { useTheme } from '../../contexts/ThemeContext';
import { fonts } from '../../theme/typography';

const META: Record<string, { label: string; Icon: typeof Home }> = {
  Dashboard: { label: 'Home', Icon: Home },
  Budget: { label: 'Budgets', Icon: Wallet },
  Analytics: { label: 'Insights', Icon: BarChart3 },
  Goals: { label: 'Goals', Icon: Target }
};

/** Four tabs with a raised Add transaction action in the middle, reachable from every tab. */
export function AppTabBar({ state, navigation, descriptors }: BottomTabBarProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const mid = Math.ceil(state.routes.length / 2);

  // Full-screen flows (e.g. budget setup) hide the bar with tabBarStyle: { display: 'none' }.
  const focusedOptions = descriptors[state.routes[state.index].key]?.options;
  if ((focusedOptions?.tabBarStyle as { display?: string } | undefined)?.display === 'none') return null;

  const renderTab = (route: (typeof state.routes)[number], index: number) => {
    const focused = state.index === index;
    const meta = META[route.name] ?? { label: route.name, Icon: Home };
    const color = focused ? theme.colors.primary : theme.colors.textMuted;
    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    };
    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        style={styles.tab}
      >
        <meta.Icon color={color} size={22} strokeWidth={focused ? 2.4 : 2} />
        <Text style={[styles.label, { color, fontFamily: focused ? fonts.semibold : fonts.medium }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {meta.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10), backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
      {state.routes.slice(0, mid).map((r, i) => renderTab(r, i))}
      <View style={styles.tab}>
        <Pressable
          onPress={() => (navigation as any).navigate('AddTransaction')}
          accessibilityRole="button"
          accessibilityLabel="Add transaction"
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: theme.colors.primary, borderColor: theme.colors.background, transform: [{ scale: pressed ? 0.94 : 1 }] }
          ]}
        >
          <Plus color={theme.colors.onPrimary} size={26} strokeWidth={2.4} />
        </Pressable>
      </View>
      {state.routes.slice(mid).map((r, i) => renderTab(r, i + mid))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 48 },
  label: { fontSize: 11 },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 20,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -30,
    shadowColor: '#0D2B26',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8
  }
});
