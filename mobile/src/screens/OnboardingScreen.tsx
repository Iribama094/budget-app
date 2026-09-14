import React, { useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight, Check, ShoppingCart } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Amount, Card, Chip, HeroCard, IconTile, PrimaryButton, ProgressBar, Ring, TextButton } from '../components/Common/ui';
import { type } from '../theme/typography';

type Props = {
  onDone: () => void;
  onContinueToAuth?: (mode: 'login' | 'register') => void;
};

const SLIDES = [
  {
    title: 'Know what’s safe to spend, every day.',
    body: 'Log a purchase in two taps. You’ll see how it moves your budget before you save it.'
  },
  {
    title: 'Budgets that bend with your income.',
    body: 'Split your money into buckets for essentials, savings and fun. A smart preset gets you started.'
  },
  {
    title: 'Watch your goals move.',
    body: 'Every goal shows whether it’s on pace and exactly how much to put in each month.'
  }
] as const;

export function OnboardingScreen({ onDone, onContinueToAuth }: Props) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const isLast = index === SLIDES.length - 1;
  const slideWidth = width;

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * slideWidth, animated: true });
    setIndex(i);
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / slideWidth));
  };

  const toAuth = (mode: 'login' | 'register') => (onContinueToAuth ? onContinueToAuth(mode) : onDone());

  const illustrations = [
    <>
      <HeroCard style={[styles.float, { left: 22, right: 50, top: 36, transform: [{ rotate: '-3deg' }] }]}>
        <Text style={[type.eyebrow, { color: theme.colors.inkText, opacity: 0.72 }]}>Safe to spend today</Text>
        <Amount value={14640} size="lg" color={theme.colors.inkText} style={{ marginVertical: 8 }} />
        <ProgressBar value={0.41} marker={0.43} height={8} color="#8FD6C3" trackColor="rgba(255,255,255,0.14)" markerColor="#FFFFFF" />
      </HeroCard>
      <Chip tone="brass" label="On pace" style={[styles.chipFloat, { transform: [{ rotate: '5deg' }] }]} />
      <Card style={[styles.float, { left: 42, right: 18, bottom: 34, transform: [{ rotate: '1.5deg' }] }]}>
        <View style={styles.row}>
          <IconTile bg={theme.categories.bg[0]} size={36}>
            <ShoppingCart color={theme.categories.fg[0]} size={18} />
          </IconTile>
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Shoprite Lekki</Text>
            <Text style={[type.caption, { color: theme.colors.textMuted }]}>Essential · 65% used</Text>
          </View>
          <Amount value={-18450} size="sm" />
        </View>
        <View style={{ marginTop: 10 }}>
          <ProgressBar value={0.65} color={theme.buckets.Essential} />
        </View>
      </Card>
    </>,
    <Card style={[styles.float, { left: 22, right: 22, top: 34, transform: [{ rotate: '-2deg' }] }]}>
      <Text style={[type.eyebrow, { color: theme.colors.primary }]}>Smart balance</Text>
      <View style={styles.alloc}>
        {[
          [55, theme.buckets.Essential],
          [10, theme.buckets.Savings],
          [20, theme.buckets['Free Spending']],
          [15, theme.buckets.Investments]
        ].map(([flex, color], i) => (
          <View key={i} style={{ flex: flex as number, backgroundColor: color as string, borderRadius: 4 }} />
        ))}
      </View>
      {[
        ['Essential', 'Rent, utilities, groceries', 247500, theme.buckets.Essential],
        ['Savings', 'Emergency fund', 45000, theme.buckets.Savings],
        ['Free spending', 'Eating out, fun', 90000, theme.buckets['Free Spending']]
      ].map(([name, desc, amt, color]) => (
        <View key={name as string} style={[styles.row, { paddingVertical: 8 }]}>
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
      <Card style={[styles.float, { left: 22, right: 40, top: 40, transform: [{ rotate: '-3deg' }] }]}>
        <View style={styles.row}>
          <Ring progress={0.52} label="52%" />
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Emergency fund</Text>
            <Text style={[type.caption, { color: theme.colors.textMuted }]}>Save ₦72,400/mo to finish on time</Text>
          </View>
        </View>
      </Card>
      <Card style={[styles.float, { left: 44, right: 18, bottom: 40, transform: [{ rotate: '2deg' }] }]}>
        <View style={styles.row}>
          <Ring progress={0.45} label="45%" />
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>December trip</Text>
            <Chip tone="positive" label="On track" icon={<Check color={theme.colors.success} size={12} strokeWidth={3} />} style={{ marginTop: 4 }} />
          </View>
        </View>
      </Card>
    </>
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <View style={styles.topBar}>
        <View style={styles.steps} accessibilityLabel={`Step ${index + 1} of ${SLIDES.length}`}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.step, { backgroundColor: i <= index ? theme.colors.primary : theme.colors.border }]} />
          ))}
        </View>
        <Pressable onPress={onDone} hitSlop={12} accessibilityRole="button">
          <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, i) => (
          <View key={slide.title} style={{ width: slideWidth, paddingHorizontal: 20 }}>
            <View
              style={[styles.illo, { backgroundColor: theme.colors.primarySoft }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {illustrations[i]}
            </View>
            <Text style={[type.h1, { color: theme.colors.text, fontSize: 28, lineHeight: 34, marginTop: 26 }]}>{slide.title}</Text>
            <Text style={[type.body, { color: theme.colors.textMuted, fontSize: 16, lineHeight: 24, marginTop: 10 }]}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          title={isLast ? 'Create account' : 'Continue'}
          onPress={() => (isLast ? toAuth('register') : goTo(index + 1))}
          iconRight={isLast ? undefined : <ArrowRight color={theme.colors.onPrimary} size={18} />}
        />
        <TextButton title="I already have an account" onPress={() => toAuth('login')} style={{ marginTop: 6 }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18 },
  steps: { flex: 1, flexDirection: 'row', gap: 6 },
  step: { flex: 1, height: 4, borderRadius: 2 },
  illo: { height: 300, borderRadius: 28, overflow: 'hidden' },
  float: { position: 'absolute' },
  chipFloat: { position: 'absolute', right: 26, top: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  alloc: { flexDirection: 'row', gap: 3, height: 14, marginTop: 10, marginBottom: 6 },
  footer: { paddingHorizontal: 20, paddingBottom: 8 }
});
