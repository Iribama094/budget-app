import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { formatAmount } from '../Common/ui';

/**
 * The movement in Money Wrapped. Each piece replays when its slide becomes the one on screen, so flicking back
 * to a card plays it again rather than showing a finished, static thing.
 *
 * Everything here drives opacity and transform only, which the animation runs off the main thread, so a slide
 * stays smooth on a cheap phone while the numbers are still loading.
 */

/** Fades and lifts its children into place. `delay` staggers a stack of them, one line after another. */
export function Reveal({
  active,
  delay = 0,
  from = 18,
  children,
  style
}: {
  active: boolean;
  delay?: number;
  from?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      t.setValue(0);
      return;
    }
    const anim = Animated.timing(t, { toValue: 1, duration: 520, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [active, delay, t]);

  return (
    <Animated.View style={[style, { opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Lands with a bounce. For the one thing on the slide that deserves it: an emoji, a persona, a big number. */
export function Pop({ active, delay = 0, children, style }: { active: boolean; delay?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      t.setValue(0);
      return;
    }
    const anim = Animated.spring(t, { toValue: 1, delay, friction: 5, tension: 80, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [active, delay, t]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
          transform: [
            { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
            { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '0deg'] }) }
          ]
        }
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Counts up to an amount. Watching the number climb is most of the drama, so it runs a touch slower than the
 * rest. Hidden amounts skip it: there is nothing to count to.
 */
export function CountUp({
  active,
  value,
  glyph,
  hidden,
  delay = 0,
  style
}: {
  active: boolean;
  value: number;
  glyph: string;
  hidden?: boolean;
  delay?: number;
  style?: StyleProp<TextStyle>;
}) {
  const [shown, setShown] = useState(0);
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || hidden) {
      setShown(value);
      return;
    }
    setShown(0);
    const id = t.addListener(({ value: v }) => setShown(Math.round(value * v)));
    t.setValue(0);
    const anim = Animated.timing(t, { toValue: 1, duration: 1100, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start();
    return () => {
      anim.stop();
      t.removeListener(id);
    };
  }, [active, value, hidden, delay, t]);

  return <Text style={style}>{hidden ? '••••' : formatAmount(shown, glyph)}</Text>;
}

/** A bar that grows from nothing to its share. Used for the categories and the month chart. */
export function GrowBar({
  active,
  percent,
  color,
  delay = 0,
  vertical
}: {
  active: boolean;
  percent: number;
  color: string;
  delay?: number;
  vertical?: boolean;
}) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      t.setValue(0);
      return;
    }
    const anim = Animated.timing(t, { toValue: 1, duration: 820, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [active, delay, t]);

  const size = t.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${Math.max(3, Math.min(100, percent))}%`] });
  return vertical ? (
    <Animated.View style={{ width: '70%', height: size, borderRadius: 4, backgroundColor: color }} />
  ) : (
    <Animated.View style={{ height: 8, width: size, borderRadius: 4, backgroundColor: color }} />
  );
}

const CONFETTI = ['#E2B65C', '#8FD6C3', '#F07565', '#B6D9CE', '#FFFFFF'];

/** A short burst of falling colour for the last slide. Twelve views, no library, stops when it lands. */
export function Confetti({ active, width }: { active: boolean; width: number }) {
  const bits = useRef(
    Array.from({ length: 12 }, (_, i) => ({
      x: 12 + ((i * 37) % Math.max(60, width - 40)),
      delay: (i % 6) * 90,
      color: CONFETTI[i % CONFETTI.length],
      size: 7 + (i % 3) * 3,
      t: new Animated.Value(0)
    }))
  ).current;

  useEffect(() => {
    if (!active) {
      bits.forEach((b) => b.t.setValue(0));
      return;
    }
    const anims = bits.map((b) =>
      Animated.timing(b.t, { toValue: 1, duration: 2200, delay: b.delay, easing: Easing.in(Easing.quad), useNativeDriver: true })
    );
    const all = Animated.parallel(anims);
    all.start();
    return () => all.stop();
  }, [active, bits]);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      {bits.map((b, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: b.x,
            top: -20,
            width: b.size,
            height: b.size * 1.6,
            borderRadius: 2,
            backgroundColor: b.color,
            opacity: b.t.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: b.t.interpolate({ inputRange: [0, 1], outputRange: [0, 520] }) },
              { rotate: b.t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(i % 2 ? 1 : -1) * 420}deg`] }) }
            ]
          }}
        />
      ))}
    </View>
  );
}
