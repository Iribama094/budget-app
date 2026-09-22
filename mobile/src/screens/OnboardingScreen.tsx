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
import { PrimaryButton, SecondaryButton } from '../components/Common/ui';
import { fonts, type } from '../theme/typography';

type Props = {
  onDone: () => void;
  onContinueToAuth?: (mode: 'login' | 'register') => void;
};

// Photos are bundled rather than fetched, so the first thing somebody sees never waits on their data.
const SLIDES = [
  {
    title: 'Money that lasts until payday',
    body: 'See what’s safe to spend each day, so the end of the month isn’t a struggle.',
    photo: require('../../assets/onboarding/payday.jpg')
  },
  {
    title: 'A simple plan: needs, wants, savings',
    body: 'Tell us what you earn and what you must pay. We’ll split the rest in plain numbers.',
    photo: require('../../assets/onboarding/plan.jpg')
  },
  {
    title: 'Gets smarter as you go',
    body: 'BudgetFriendly learns how you spend, spots leaks and warns you before money runs out.',
    photo: require('../../assets/onboarding/goals.jpg')
  },
  {
    title: 'Let’s get you started',
    body: 'Create a free account to build your plan, or sign in to pick up where you left off.',
    photo: require('../../assets/onboarding/start.jpg')
  }
] as const;

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

const INK = '#0D2B26';
const INK_2 = '#134A41';
const ON_INK = '#EAF4F1';

// How far down the screen the picture reaches. The green has taken it over well before this line, so the
// number is where the photo stops being drawn, not where the eye sees it end.
const PHOTO = 0.62;

/**
 * First screens after the splash. Each slide's photo is the whole screen behind the words, and the green the
 * rest of the screen is painted in climbs into it, so there is no edge, no corner and nothing floating on top.
 */
export function OnboardingScreen({ onDone, onContinueToAuth }: Props) {
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const textAnim = useRef(new Animated.Value(1)).current;
  const isLast = index === SLIDES.length - 1;
  const photoH = Math.round(height * PHOTO);

  useEffect(() => {
    textAnim.setValue(0);
    Animated.timing(textAnim, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [index, textAnim]);

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * width, animated: true });
    setIndex(i);
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  const toAuth = (mode: 'login' | 'register') => (onContinueToAuth ? onContinueToAuth(mode) : onDone());

  return (
    <View style={styles.fill}>
      {/* The green the whole screen is painted in. It is still flat INK where the photo fades out, so the two
          meet on the same colour and there is no seam to find. */}
      <LinearGradient colors={[INK, INK, INK_2]} locations={[0, PHOTO, 1]} style={StyleSheet.absoluteFill} />

      <View pointerEvents="none" style={[styles.backdrop, { height: photoH }]}>
        {/* One photo per slide, cross fading with the swipe rather than sliding with it, so the backdrop feels
            like one thing changing instead of four pages going by. */}
        {SLIDES.map((slide, i) => (
          <Animated.Image
            key={slide.title}
            source={slide.photo}
            resizeMode="cover"
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: scrollX.interpolate({
                  inputRange: [(i - 1) * width, i * width, (i + 1) * width],
                  outputRange: [0, 1, 0],
                  extrapolate: 'clamp'
                })
              }
            ]}
          />
        ))}
        {/* A light pull toward the brand green, so four photos shot in four different lights feel like one set. */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(19,74,65,0.16)' }]} />
        {/* The blend. Clear at the top, brand green by the bottom of the picture. */}
        <LinearGradient
          colors={['rgba(13,43,38,0)', 'rgba(13,43,38,0.06)', 'rgba(13,43,38,0.30)', 'rgba(13,43,38,0.62)', 'rgba(13,43,38,0.90)', INK]}
          locations={[0, 0.34, 0.54, 0.7, 0.85, 1]}
          style={StyleSheet.absoluteFill}
        />
        {/* Two of the photos are nearly white at the top, where the logo and Skip for now sit. */}
        <LinearGradient colors={['rgba(8,17,15,0.62)', 'rgba(8,17,15,0)']} style={[styles.scrim, { height: Math.round(photoH * 0.2) }]} />
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

        {/* The picture itself is what you swipe. The pages are empty because the photos live behind everything. */}
        <AnimatedScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
          onMomentumScrollEnd={onMomentumEnd}
          style={styles.fill}
        >
          {SLIDES.map((slide) => (
            <View key={slide.title} style={{ width, height: '100%' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          ))}
        </AnimatedScrollView>

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
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  copy: { paddingHorizontal: 28, paddingTop: 6 },
  title: { color: ON_INK, textAlign: 'center', fontSize: 30, lineHeight: 37 },
  subtitle: { color: 'rgba(234,244,241,0.82)', textAlign: 'center', fontSize: 16, lineHeight: 24, marginTop: 12 },
  footer: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 12 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 18 },
  dot: { height: 10, borderRadius: 999 },
  authRow: { flexDirection: 'row', gap: 10 }
});
