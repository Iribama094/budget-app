import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Briefcase, UserRound } from '../icons';
import { fonts } from '../theme/typography';

export type SpaceId = 'personal' | 'business';

export type Space = {
  id: SpaceId;
  name: string;
};

type SpaceState = {
  isHydrated: boolean;
  spacesEnabled: boolean;
  spaces: Space[];
  activeSpaceId: SpaceId;
  setSpacesEnabled: (enabled: boolean) => void;
  /** Switches immediately, without the transition. */
  setActiveSpaceId: (spaceId: SpaceId) => void;
  /** Switches with the full-screen "jump" into the other space. */
  switchSpace: (spaceId: SpaceId) => void;
  activeSpace: Space;
};

const SPACES_ENABLED_KEY = 'bf_spaces_enabled_v1';
const ACTIVE_SPACE_KEY = 'bf_active_space_v1';

const DEFAULT_SPACES: Space[] = [
  { id: 'personal', name: 'Personal' },
  { id: 'business', name: 'Business' }
];

/** Each space has its own look: teal for personal money, slate and brass for business. */
export const SPACE_LOOK = {
  personal: { bg: '#0D2B26', bg2: '#134A41', accent: '#8FD6C3', soft: 'rgba(143,214,195,0.16)', onBg: '#EAF4F1', Icon: UserRound, title: 'Personal space', body: 'Your everyday money, plan and goals' },
  business: { bg: '#1C2638', bg2: '#2C3E5C', accent: '#E2B65C', soft: 'rgba(226,182,92,0.16)', onBg: '#EEF2F8', Icon: Briefcase, title: 'Business space', body: 'Profit, costs, cash and tax for your business' }
} as const;

const SpaceContext = createContext<SpaceState | undefined>(undefined);

export function useSpace() {
  const ctx = useContext(SpaceContext);
  if (!ctx) throw new Error('useSpace must be used within SpaceProvider');
  return ctx;
}

/** Full-screen transition: the new space's badge jumps in, a ring ripples out, then the new interface appears. */
function SpaceTransition({ target, onMidpoint, onDone }: { target: SpaceId; onMidpoint: () => void; onDone: () => void }) {
  const look = SPACE_LOOK[target];
  const enter = useRef(new Animated.Value(0)).current;
  const jump = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(enter, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(jump, { toValue: 1, friction: 4.5, tension: 80, useNativeDriver: true }),
      Animated.timing(ring, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true })
    ]).start();
    const mid = setTimeout(onMidpoint, 380);
    const end = setTimeout(() => {
      Animated.timing(exit, { toValue: 1, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => onDone());
    }, 1000);
    return () => {
      clearTimeout(mid);
      clearTimeout(end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const opacity = Animated.multiply(enter, exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }));
  const badgeScale = Animated.multiply(
    jump.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
    exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] })
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: look.bg, opacity }]} accessibilityLiveRegion="polite" accessibilityLabel={`Switching to ${look.title}`}>
      <Animated.View
        style={[
          styles.ring,
          { borderColor: look.soft, opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.3, 2.2] }) }] }
        ]}
      />
      <Animated.View style={{ alignItems: 'center', transform: [{ translateY: jump.interpolate({ inputRange: [0, 1], outputRange: [90, 0] }) }, { scale: badgeScale }] }}>
        <View style={[styles.badge, { backgroundColor: look.soft, borderColor: look.accent }]}>
          <look.Icon color={look.accent} size={42} />
        </View>
        <Text style={[styles.title, { color: look.onBg }]}>{look.title}</Text>
        <Text style={[styles.body, { color: look.onBg }]}>{look.body}</Text>
      </Animated.View>
    </Animated.View>
  );
}

export function SpaceProvider({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [spacesEnabled, setSpacesEnabledState] = useState(false);
  const [activeSpaceId, setActiveSpaceIdState] = useState<SpaceId>('personal');
  const [transition, setTransition] = useState<SpaceId | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const enabledRaw = await SecureStore.getItemAsync(SPACES_ENABLED_KEY);
        const enabled = enabledRaw === '1';
        const activeRaw = (await SecureStore.getItemAsync(ACTIVE_SPACE_KEY)) as SpaceId | null;
        const active = activeRaw === 'business' ? 'business' : 'personal';

        setSpacesEnabledState(enabled);
        setActiveSpaceIdState(active);
      } catch {
        // ignore; defaults are fine
      } finally {
        setIsHydrated(true);
      }
    })();
  }, []);

  const setSpacesEnabled = useCallback((enabled: boolean) => {
    setSpacesEnabledState(enabled);
    void SecureStore.setItemAsync(SPACES_ENABLED_KEY, enabled ? '1' : '0');

    // When turning spaces off, always fall back to Personal to avoid "missing" data.
    if (!enabled) {
      setActiveSpaceIdState('personal');
      void SecureStore.setItemAsync(ACTIVE_SPACE_KEY, 'personal');
    }
  }, []);

  const setActiveSpaceId = useCallback((spaceId: SpaceId) => {
    setActiveSpaceIdState(spaceId);
    void SecureStore.setItemAsync(ACTIVE_SPACE_KEY, spaceId);
  }, []);

  const switchSpace = useCallback(
    (spaceId: SpaceId) => {
      if (spaceId === activeSpaceId || transition) return;
      setTransition(spaceId);
    },
    [activeSpaceId, transition]
  );

  const activeSpace = useMemo(() => {
    return DEFAULT_SPACES.find((s) => s.id === activeSpaceId) ?? DEFAULT_SPACES[0];
  }, [activeSpaceId]);

  const value = useMemo<SpaceState>(
    () => ({
      isHydrated,
      spacesEnabled,
      spaces: DEFAULT_SPACES,
      activeSpaceId,
      setSpacesEnabled,
      setActiveSpaceId,
      switchSpace,
      activeSpace
    }),
    [isHydrated, spacesEnabled, activeSpaceId, setSpacesEnabled, setActiveSpaceId, switchSpace, activeSpace]
  );

  return (
    <SpaceContext.Provider value={value}>
      {children}
      {transition ? <SpaceTransition key={transition} target={transition} onMidpoint={() => setActiveSpaceId(transition)} onDone={() => setTransition(null)} /> : null}
    </SpaceContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: { zIndex: 1000, elevation: 1000, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 220, height: 220, borderRadius: 110, borderWidth: 18 },
  badge: { width: 104, height: 104, borderRadius: 34, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.display, fontSize: 26, marginTop: 22 },
  body: { fontFamily: fonts.medium, fontSize: 15, opacity: 0.78, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 }
});
