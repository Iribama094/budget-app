import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from './AuthContext';
import { useSpace } from './SpaceContext';
import { useTheme } from './ThemeContext';
import { useTour } from './TourContext';
import { CoachmarkOverlay } from '../components/Common/CoachmarkOverlay';
import { anySheetOpen } from '../components/Common/AppModal';
import { navigationRef } from '../navigation/navigationRef';
import { guideFor, type GuideStep } from '../guides/screenGuides';
import { PrimaryButton, TextButton } from '../components/Common/ui';
import { type } from '../theme/typography';

// Seen guides are remembered per account, so a new account on a shared phone still gets every guide.
const storageKey = (userId: string) => `bf_screen_guides_v1_${userId}`;
// Let the screen settle (and quick taps through it pass) before a guide appears.
const SHOW_DELAY_MS = 700;

type GuideContextValue = {
  /** True while a guide card is on screen, so smaller tips can wait their turn. */
  isGuideOpen: boolean;
  /** Show every guide again, from the next screen opened. */
  resetGuides: () => Promise<void>;
};

const GuideContext = createContext<GuideContextValue>({ isGuideOpen: false, resetGuides: async () => undefined });

export function useGuides() {
  return useContext(GuideContext);
}

/** Watches navigation and shows a screen's guide the first time this account opens it. */
export function GuideProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const { isTourActive } = useTour();
  const userId = user?.id ?? null;

  const [seen, setSeen] = useState<Set<string> | null>(null);
  const [active, setActive] = useState<{ key: string; steps: GuideStep[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSeen(null);
    setActive(null);
    if (!userId) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey(userId))
      .then((raw) => {
        if (cancelled) return;
        let keys: string[] = [];
        try {
          keys = raw ? (JSON.parse(raw) as string[]) : [];
        } catch {
          // A damaged list just means guides show again.
        }
        setSeen(new Set(Array.isArray(keys) ? keys : []));
      })
      .catch(() => !cancelled && setSeen(new Set()));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const check = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!userId || !seen || active || isTourActive || !navigationRef.isReady()) return;
    const route = navigationRef.getCurrentRoute()?.name;
    if (!route) return;
    const guide = guideFor(route, spacesEnabled ? activeSpaceId : 'personal');
    if (!guide || seen.has(guide.key)) return;
    timer.current = setTimeout(() => {
      if (navigationRef.getCurrentRoute()?.name !== route) return;
      // Never on top of an open sheet: two layers opening over each other can freeze an iPhone. Try again shortly.
      if (anySheetOpen()) {
        check();
        return;
      }
      setActive(guide);
    }, SHOW_DELAY_MS);
  }, [userId, seen, active, isTourActive, spacesEnabled, activeSpaceId]);

  useEffect(() => {
    check();
    const unsubscribe = navigationRef.addListener('state', check);
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [check]);

  const markSeen = useCallback(
    (key: string) => {
      setSeen((prev) => {
        const next = new Set(prev ?? []);
        next.add(key);
        if (userId) void AsyncStorage.setItem(storageKey(userId), JSON.stringify([...next])).catch(() => undefined);
        return next;
      });
    },
    [userId]
  );

  const close = useCallback(() => {
    if (active) markSeen(active.key);
    setActive(null);
  }, [active, markSeen]);

  const resetGuides = useCallback(async () => {
    if (!userId) return;
    await AsyncStorage.removeItem(storageKey(userId)).catch(() => undefined);
    setSeen(new Set());
  }, [userId]);

  const value = useMemo(() => ({ isGuideOpen: !!active, resetGuides }), [active, resetGuides]);

  return (
    <GuideContext.Provider value={value}>
      {children}
      {active ? <GuideRunner key={active.key} steps={active.steps} onClose={close} /> : null}
    </GuideContext.Provider>
  );
}

/**
 * Walks through a screen's steps. A step that names an element on screen highlights it, so the guide points at
 * the real thing; a step about the screen as a whole shows a card at the bottom instead.
 */
function GuideRunner({ steps, onClose }: { steps: GuideStep[]; onClose: () => void }) {
  const { getAnchor, anchorTick } = useTour();
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;
  const next = () => (last ? onClose() : setIndex((i) => i + 1));

  // Re-checked on anchorTick so a highlight finds its target once the screen has drawn it.
  const target = useMemo(() => (step.anchor ? getAnchor(step.anchor) : null), [step.anchor, getAnchor, anchorTick]);

  if (target?.current) {
    return (
      <CoachmarkOverlay
        visible
        targetRef={target}
        title={step.title}
        body={step.body}
        stepLabel={steps.length > 1 ? `${index + 1} of ${steps.length}` : undefined}
        primaryLabel={last ? 'Got it' : 'Next'}
        skipLabel="Skip"
        showBack={index > 0}
        onPrimary={next}
        onBack={() => setIndex((i) => Math.max(0, i - 1))}
        onSkip={onClose}
        onRequestClose={onClose}
      />
    );
  }

  return <GuideCard step={step} index={index} count={steps.length} onNext={next} onClose={onClose} />;
}

function GuideCard({ step, index, count, onNext, onClose }: { step: GuideStep; index: number; count: number; onNext: () => void; onClose: () => void }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const rise = useRef(new Animated.Value(0)).current;
  const last = index === count - 1;

  useEffect(() => {
    rise.setValue(0);
    Animated.spring(rise, { toValue: 1, useNativeDriver: true, friction: 8, tension: 70 }).start();
  }, [index, rise]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        {/* Tapping outside the card closes it. Declared first so it sits underneath the card. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close tip" importantForAccessibility="no" />
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, marginBottom: Math.max(insets.bottom, 16) },
            { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }
          ]}
        >
          <View style={[styles.emoji, { backgroundColor: theme.colors.primarySoft }]}>
            <Text style={{ fontSize: 26 }}>{step.emoji}</Text>
          </View>
          <Text style={[type.title, { color: theme.colors.text, marginTop: 14 }]} accessibilityRole="header">
            {step.title}
          </Text>
          <Text style={[type.body, { color: theme.colors.textMuted, marginTop: 6 }]}>{step.body}</Text>

          <View style={styles.footer}>
            {count > 1 ? (
              <View style={styles.dots} accessibilityLabel={`Tip ${index + 1} of ${count}`}>
                {Array.from({ length: count }).map((_, i) => (
                  <View key={i} style={[styles.dot, { backgroundColor: i === index ? theme.colors.primary : theme.colors.border, width: i === index ? 18 : 6 }]} />
                ))}
              </View>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            {!last ? <TextButton title="Skip" onPress={onClose} color={theme.colors.textMuted} style={{ paddingHorizontal: 12 }} /> : null}
            <PrimaryButton title={last ? 'Got it' : 'Next'} onPress={onNext} style={{ minWidth: 110 }} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 16 },
  card: { borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, padding: 20, elevation: 8 },
  emoji: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 20, gap: 4 },
  dots: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { height: 6, borderRadius: 3 }
});
