import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertTriangle, CalendarClock, Check, CircleCheck, Sparkles } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Amount, Card, Chip, HeroCard, IconTile, PrimaryButton, ProgressBar, SecondaryButton } from '../components/Common/ui';
import { bucketColors } from '../theme/tokens';
import { fonts, type } from '../theme/typography';

type Props = {
  onDone: () => void;
  onContinueToAuth?: (mode: 'login' | 'register') => void;
};

const SLIDES = [
  { title: 'Money that lasts until payday', body: 'See what’s safe to spend each day, so the end of the month isn’t a struggle.' },
  { title: 'A simple plan: needs, wants, savings', body: 'Tell us what you earn and what you must pay. We’ll split the rest in plain numbers.' },
  { title: 'Gets smarter as you go', body: 'BudgetFriendly learns how you spend, spots leaks and warns you before money runs out.' },
  { title: 'Let’s get you started', body: 'Create a free account to build your plan, or sign in to pick up where you left off.' }
] as const;

const INK = '#0D2B26';
const INK_2 = '#134A41';
const ON_INK = '#EAF4F1';

/**
 * First screens after the splash. The full-bleed brand backdrop, sweeping curve, animated copy and
 * pill-shaped dots come from the original intro; the floating cards use the current design system.
 */
export function OnboardingScreen({ onDone, onContinueToAuth }: Props) {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const textAnim = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const isLast = index === SLIDES.length - 1;
  const illoHeight = Math.min(360, Math.max(250, height * 0.42));
  const light = bucketColors.light;

  useEffect(() => {
    textAnim.setValue(0);
    Animated.timing(textAnim, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [index, textAnim]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.07, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * width, animated: true });
    setIndex(i);
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  const toAuth = (mode: 'login' | 'register') => (onContinueToAuth ? onContinueToAuth(mode) : onDone());

  const illustrations = [
    <>
      <HeroCard style={[styles.float, { left: 26, right: 52, top: 30, transform: [{ rotate: '-3deg' }] }]}>
        <Text style={[type.eyebrow, { color: ON_INK, opacity: 0.72 }]}>Safe to spend today</Text>
        <Amount value={6450} size="lg" color={ON_INK} style={{ marginVertical: 8 }} />
        <ProgressBar value={0.44} marker={0.47} height={8} color="#8FD6C3" trackColor="rgba(255,255,255,0.14)" markerColor="#FFFFFF" />
      </HeroCard>
      <Card style={[styles.float, { left: 60, right: 24, bottom: 34, transform: [{ rotate: '2deg' }] }]}>
        <View style={styles.row}>
          <IconTile bg={theme.colors.brassSoft} size={36}>
            <CalendarClock color={theme.colors.brass} size={18} />
          </IconTile>
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>12 days to payday</Text>
            <Text style={[type.caption, { color: theme.colors.textMuted }]}>You’re on track</Text>
          </View>
          <Check color={theme.colors.success} size={18} strokeWidth={3} />
        </View>
      </Card>
    </>,
    <Card style={[styles.float, { left: 24, right: 24, top: 34, transform: [{ rotate: '-2deg' }] }]}>
      <Text style={[type.eyebrow, { color: theme.colors.primary }]}>Your plan</Text>
      <View style={styles.alloc}>
        <View style={{ flex: 50, backgroundColor: light.Needs, borderRadius: 4 }} />
        <View style={{ flex: 30, backgroundColor: light.Wants, borderRadius: 4 }} />
        <View style={{ flex: 20, backgroundColor: light.Savings, borderRadius: 4 }} />
      </View>
      {[
        ['Needs', 'Rent, food, transport, tithe', 150000, light.Needs],
        ['Wants', 'Eating out, fun', 90000, light.Wants],
        ['Savings', 'Emergency fund', 60000, light.Savings]
      ].map(([name, desc, amt, color]) => (
        <View key={name as string} style={[styles.row, { paddingVertical: 7 }]}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color as string }} />
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{name}</Text>
            <Text style={[type.caption, { color: theme.colors.textMuted }]}>{desc}</Text>
          </View>
          <Amount value={amt as number} size="sm" />
        </View>
      ))}
    </Card>,
    <>
      <Card style={[styles.float, { left: 24, right: 46, top: 36, transform: [{ rotate: '-3deg' }] }]}>
        <View style={styles.row}>
          <IconTile bg={theme.colors.brassSoft} size={36}>
            <AlertTriangle color={theme.colors.brass} size={18} />
          </IconTile>
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Transport is up 32%</Text>
            <Text style={[type.caption, { color: theme.colors.textMuted }]}>₦18,200 vs ₦13,800 usually</Text>
          </View>
        </View>
      </Card>
      <Card style={[styles.float, { left: 52, right: 20, bottom: 40, transform: [{ rotate: '2deg' }] }]}>
        <View style={styles.row}>
          <IconTile bg={theme.colors.successSoft} size={36}>
            <CircleCheck color={theme.colors.success} size={18} />
          </IconTile>
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>You kept 12% this month</Text>
            <Chip tone="positive" label="Move it to a goal" icon={<Sparkles color={theme.colors.success} size={11} />} style={{ marginTop: 4 }} />
          </View>
        </View>
      </Card>
    </>,
    <View style={styles.logoWrap}>
      <Animated.View style={[styles.logoHalo, { transform: [{ scale: pulse }] }]}>
        <View style={styles.logoInner}>
          <Image source={require('../../assets/logo.png')} style={{ width: 84, height: 84 }} resizeMode="contain" />
        </View>
      </Animated.View>
    </View>
  ];

  return (
    <View style={styles.fill}>
      <LinearGradient colors={[INK, INK_2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* The sweeping curve from the original intro, behind the copy. */}
      <View pointerEvents="none" style={styles.swooshWrap}>
        <LinearGradient
          colors={['rgba(63,163,143,0.0)', 'rgba(63,163,143,0.22)', 'rgba(8,17,15,0.55)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.swoosh}
        />
      </View>

      <SafeAreaView style={styles.fill}>
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <Image source={require('../../assets/logo.png')} style={{ width: 24, height: 24 }} resizeMode="contain" />
            <Text style={{ fontFamily: fonts.display, fontSize: 16, color: ON_INK }}>BudgetFriendly</Text>
          </View>
          {!isLast ? (
            <Pressable onPress={() => goTo(SLIDES.length - 1)} hitSlop={12} accessibilityRole="button">
              <Text style={[type.smallStrong, { color: ON_INK, opacity: 0.8 }]}>Skip for now</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          style={{ flexGrow: 0 }}
        >
          {SLIDES.map((slide, i) => (
            <View key={slide.title} style={{ width, paddingHorizontal: 20 }}>
              <View style={[styles.illo, { height: illoHeight }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {illustrations[i]}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.copy}>
          <Animated.View style={{ opacity: textAnim, transform: [{ translateY: textAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
            <Text style={[type.h1, styles.title]}>{SLIDES[index].title}</Text>
            <Text style={[type.body, styles.subtitle]}>{SLIDES[index].body}</Text>
          </Animated.View>
        </View>

        <View style={styles.footer}>
          <View style={styles.dots} accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}`}>
            {SLIDES.map((_, i) => (
              <Pressable key={i} onPress={() => goTo(i)} hitSlop={8} accessibilityLabel={`Go to slide ${i + 1}`}>
                <View style={[styles.dot, { width: i === index ? 24 : 10, backgroundColor: i === index ? '#8FD6C3' : 'rgba(234,244,241,0.28)' }]} />
              </Pressable>
            ))}
          </View>

          {isLast ? (
            <View style={styles.authRow}>
              <SecondaryButton title="Sign in" onPress={() => toAuth('login')} style={{ flex: 1 }} />
              <PrimaryButton title="Create account" onPress={() => toAuth('register')} style={{ flex: 1.3 }} />
            </View>
          ) : (
            <PrimaryButton title="Next" onPress={() => goTo(index + 1)} />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  swooshWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  swoosh: {
    position: 'absolute',
    left: -90,
    right: -90,
    bottom: -150,
    height: '62%',
    borderTopLeftRadius: 240,
    borderTopRightRadius: 340,
    transform: [{ rotate: '-4deg' }]
  },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  illo: { borderRadius: 28, overflow: 'visible' },
  float: { position: 'absolute' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  alloc: { flexDirection: 'row', gap: 3, height: 14, marginTop: 10, marginBottom: 6 },
  logoWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoHalo: { width: 176, height: 176, borderRadius: 88, backgroundColor: 'rgba(143,214,195,0.12)', alignItems: 'center', justifyContent: 'center' },
  logoInner: { width: 128, height: 128, borderRadius: 64, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  title: { color: ON_INK, textAlign: 'center', fontSize: 28, lineHeight: 34 },
  subtitle: { color: 'rgba(234,244,241,0.82)', textAlign: 'center', fontSize: 16, lineHeight: 24, marginTop: 10 },
  footer: { paddingHorizontal: 20, paddingBottom: 12 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 18 },
  dot: { height: 10, borderRadius: 999 },
  authRow: { flexDirection: 'row', gap: 10 }
});
