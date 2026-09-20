import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Share2, X } from 'lucide-react-native';

import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { useAmountVisibility } from '../contexts/AmountVisibilityContext';
import { useToast } from '../components/Common/Toast';
import { Amount, EmptyState, IconButton, Screen, SegmentedControl, formatAmount } from '../components/Common/ui';
import { ChoiceChip } from '../components/Plan/ChoiceChip';
import { getWrapped, type Wrapped } from '../api/business';
import { Confetti, CountUp, GrowBar, Pop, Reveal } from '../components/Wrapped/motion';
import { haptic } from '../lib/haptics';
import { currencySymbol } from '../utils/format';
import { fonts, type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';

const EMOJI: Record<string, string> = { stacker: '🐿️', planner: '📋', tracker: '🧾', enjoyer: '🎉', hustler: '💪', builder: '🏗️', grinder: '💼', survivor: '🙏' };
const WHITE = '#FFFFFF';
const SOFT = 'rgba(255,255,255,0.72)';

/** Each slide gets the active flag so its own movement replays when it comes round. */
type Slide = { key: string; colors: [string, string]; body: (active: boolean) => React.ReactNode };

/** How long a slide holds before moving on by itself, like a story. Holding a finger down pauses it. */
const SLIDE_MS = 7000;

function defaultPeriod(): { kind: 'h1' | 'year'; year: number } {
  const now = new Date();
  const m = now.getMonth();
  if (m >= 6 && m <= 10) return { kind: 'h1', year: now.getFullYear() };
  if (m === 11) return { kind: 'year', year: now.getFullYear() };
  return { kind: 'year', year: now.getFullYear() - 1 };
}

/** Money Wrapped: a story-style look back at the first half or the whole year. */
export default function WrappedScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const { showAmounts, toggleShowAmounts } = useAmountVisibility();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const cardW = width - 40;
  const hide = !showAmounts;

  const initial = useMemo(defaultPeriod, []);
  const thisYear = new Date().getFullYear();
  const [kind, setKind] = useState<'h1' | 'year'>(route.params?.kind ?? initial.kind);
  const [year, setYear] = useState<number>(Number(route.params?.year ?? initial.year));
  const [space, setSpace] = useState<'personal' | 'business'>(route.params?.spaceId ?? (spacesEnabled ? activeSpaceId : 'personal'));
  const [data, setData] = useState<Wrapped | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const slideRefs = useRef<Array<View | null>>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getWrapped(kind, year, space)
      .then((w) => {
        if (cancelled) return;
        setData(w);
        setIndex(0);
        scrollRef.current?.scrollTo({ x: 0, animated: false });
      })
      .catch((e) => {
        if (cancelled) return;
        setData(null);
        setError(e instanceof Error ? e.message : 'Could not load your Wrapped');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [kind, year, space]);

  const glyph = currencySymbol(data?.currency);
  const money = (n: number) => (hide ? '••••' : formatAmount(n, glyph));

  const slides: Slide[] = useMemo(() => {
    if (!data?.hasData) return [];
    const out: Slide[] = [];
    const big = [styles.big, { color: WHITE }];
    const label = [type.eyebrow, { color: SOFT }];

    out.push({
      key: 'intro',
      colors: ['#0F3D35', '#1B6B5C'],
      body: (active) => (
        <>
          <Reveal active={active}>
            <Text style={label}>Money Wrapped</Text>
          </Reveal>
          <Pop active={active} delay={180}>
            <Text style={{ fontSize: 64, marginTop: 18 }}>🎁</Text>
          </Pop>
          <Reveal active={active} delay={420}>
            <Text style={[big, { marginTop: 12 }]}>{data.period.label}</Text>
            <Text style={[styles.line, { color: SOFT }]}>
              {data.space === 'business' ? 'Business' : 'Personal'} · {data.period.complete ? 'the full story' : 'the story so far'}
            </Text>
          </Reveal>
          <Reveal active={active} delay={760}>
            <Text style={[styles.line, { color: WHITE, marginTop: 28 }]}>Oya, make we see how your money waka 👀</Text>
            <Text style={[type.caption, { color: SOFT, marginTop: 8 }]}>It moves on its own. Tap to skip ahead, hold to pause.</Text>
          </Reveal>
        </>
      )
    });

    const saved = data.totals.net;
    out.push({
      key: 'money',
      colors: ['#1C2638', '#34445F'],
      body: (active) => (
        <>
          <Reveal active={active}>
            <Text style={label}>{data.space === 'business' ? 'Money through the business' : 'Money in and out'}</Text>
          </Reveal>
          <Reveal active={active} delay={220}>
            <Text style={[styles.metricLabel, { color: SOFT, marginTop: 22 }]}>Came in</Text>
            <CountUp active={active} value={data.totals.income} glyph={glyph} hidden={hide} delay={260} style={[styles.count, { color: WHITE }]} />
          </Reveal>
          <Reveal active={active} delay={520}>
            <Text style={[styles.metricLabel, { color: SOFT, marginTop: 16 }]}>Went out</Text>
            <CountUp active={active} value={data.totals.spending} glyph={glyph} hidden={hide} delay={560} style={[styles.count, { color: WHITE }]} />
          </Reveal>
          <Reveal active={active} delay={860}>
            <Text style={[styles.metricLabel, { color: SOFT, marginTop: 16 }]}>{saved >= 0 ? 'You kept' : 'Spent more than came in by'}</Text>
            <CountUp
              active={active}
              value={Math.abs(saved)}
              glyph={glyph}
              hidden={hide}
              delay={900}
              style={[styles.count, { color: saved >= 0 ? '#8FD6C3' : '#F07565' }]}
            />
          </Reveal>
          <Reveal active={active} delay={1400}>
            {data.totals.savingsRate != null && data.totals.savingsRate > 0 ? (
              <Text style={[styles.line, { color: WHITE, marginTop: 18 }]}>{data.totals.savingsRate}% of everything that came in, you kept. No be small thing 💪</Text>
            ) : null}
            {data.change.spending != null ? (
              <Text style={[styles.line, { color: SOFT, marginTop: 8 }]}>
                Spending {data.change.spending >= 0 ? 'went up' : 'went down'} {Math.abs(data.change.spending)}% on the same time last year.
              </Text>
            ) : null}
          </Reveal>
        </>
      )
    });

    if (data.topCategories.length) {
      const top = data.topCategories[0];
      out.push({
        key: 'categories',
        colors: ['#3A2A12', '#7A5A1E'],
        body: (active) => (
          <>
            <Reveal active={active}>
              <Text style={label}>Where the money went</Text>
            </Reveal>
            <Pop active={active} delay={260}>
              <Text style={[big, { marginTop: 14 }]}>{top.category}</Text>
            </Pop>
            <Reveal active={active} delay={560}>
              <Text style={[styles.line, { color: SOFT }]}>
                chopped {top.share}% of your spending{hide ? '' : `, ${formatAmount(top.amount, glyph)}`}.
              </Text>
            </Reveal>
            <View style={{ marginTop: 22, gap: 12 }}>
              {data.topCategories.map((c, i) => (
                <Reveal key={c.category} active={active} delay={760 + i * 120}>
                  <View style={styles.rowBetween}>
                    <Text style={[type.bodyStrong, { color: WHITE }]} numberOfLines={1}>
                      {c.category}
                    </Text>
                    <Text style={[type.smallStrong, { color: SOFT }]}>{c.share}%</Text>
                  </View>
                  <View style={styles.track}>
                    <GrowBar active={active} percent={c.share} color="#E2B65C" delay={820 + i * 120} />
                  </View>
                </Reveal>
              ))}
            </View>
          </>
        )
      });
    }

    if (data.biggestMonth) {
      const maxSpend = Math.max(1, ...data.months.map((mm) => mm.spending));
      out.push({
        key: 'months',
        colors: ['#2B1B3D', '#5B3A7A'],
        body: (active) => (
          <>
            <Reveal active={active}>
              <Text style={label}>Month by month</Text>
            </Reveal>
            <Pop active={active} delay={240}>
              <Text style={[big, { marginTop: 14 }]}>{data.biggestMonth!.month}</Text>
            </Pop>
            <Reveal active={active} delay={540}>
              <Text style={[styles.line, { color: SOFT }]}>
                na that month money waka pass{hide ? '' : `, ${formatAmount(data.biggestMonth!.amount, glyph)}`}.
              </Text>
            </Reveal>
            <View style={styles.chart}>
              {data.months.map((mm, i) => (
                <View key={mm.month} style={styles.chartCol}>
                  <GrowBar
                    active={active}
                    vertical
                    percent={(mm.spending / maxSpend) * 100}
                    color={mm.month === data.biggestMonth!.month.slice(0, 3) ? '#E2B65C' : 'rgba(255,255,255,0.35)'}
                    delay={700 + i * 70}
                  />
                  <Text style={[type.caption, { color: SOFT, marginTop: 6, fontSize: 10 }]}>{mm.month.slice(0, 1)}</Text>
                </View>
              ))}
            </View>
            <Reveal active={active} delay={1500}>
              {data.calmestMonth ? <Text style={[styles.line, { color: WHITE, marginTop: 14 }]}>Calmest month: {data.calmestMonth.month} 😌</Text> : null}
              {data.bestSavingMonth ? (
                <Text style={[styles.line, { color: WHITE, marginTop: 6 }]}>
                  Best month for keeping money: {data.bestSavingMonth.month}
                  {hide ? '' : ` (${formatAmount(data.bestSavingMonth.amount, glyph)})`}
                </Text>
              ) : null}
            </Reveal>
          </>
        )
      });
    }

    if (data.topMerchant || data.busiestDay) {
      out.push({
        key: 'spot',
        colors: ['#12343B', '#1F6F7A'],
        body: (active) => (
          <>
            <Reveal active={active}>
              <Text style={label}>Your spots</Text>
            </Reveal>
            {data.topMerchant ? (
              <>
                <Pop active={active} delay={260}>
                  <Text style={[big, { marginTop: 14 }]} numberOfLines={2}>
                    {data.topMerchant.name}
                  </Text>
                </Pop>
                <Reveal active={active} delay={600}>
                  <Text style={[styles.line, { color: SOFT }]}>
                    {data.topMerchant.visits} visit{data.topMerchant.visits === 1 ? '' : 's'}
                    {hide ? '' : ` · ${formatAmount(data.topMerchant.amount, glyph)}`}. Na your spot be that 😄
                  </Text>
                </Reveal>
              </>
            ) : null}
            {data.busiestDay ? (
              <Reveal active={active} delay={900}>
                <Text style={[styles.metricLabel, { color: SOFT, marginTop: 28 }]}>Big spending day</Text>
                <Text style={[big, { fontSize: 34, lineHeight: 40 }]}>{data.busiestDay}s</Text>
                <Text style={[styles.line, { color: SOFT }]}>Plan those days ahead and the week go calm.</Text>
              </Reveal>
            ) : null}
          </>
        )
      });
    }

    const h = data.habits;
    out.push({
      key: 'habits',
      colors: ['#16302A', '#2F6B57'],
      body: (active) => (
        <>
          <Reveal active={active}>
            <Text style={label}>Your habits</Text>
          </Reveal>
          <Pop active={active} delay={240}>
            <Text style={[big, { marginTop: 14 }]}>{h.daysLogged} days</Text>
          </Pop>
          <Reveal active={active} delay={540}>
            <Text style={[styles.line, { color: SOFT }]}>you logged your money, out of {h.trackedDays} since you started. Consistency na the real flex.</Text>
          </Reveal>
          <View style={{ marginTop: 24, gap: 14 }}>
            {[
              `🧾 ${h.transactions} transactions recorded`,
              `🙌 ${h.noSpendDays} no-spend days`,
              data.goals.saved > 0 ? `🌱 ${money(data.goals.saved)} put toward ${data.goals.goalsFunded} goal${data.goals.goalsFunded === 1 ? '' : 's'}` : null,
              data.budgets.ended > 0 ? `🎯 ${data.budgets.onBudget} of ${data.budgets.ended} budgets finished on plan` : null
            ]
              .filter(Boolean)
              .map((lineText, i) => (
                <Reveal key={String(lineText)} active={active} delay={820 + i * 160}>
                  <Text style={[styles.line, { color: WHITE }]}>{lineText}</Text>
                </Reveal>
              ))}
          </View>
        </>
      )
    });

    const b = data.business;
    if (b) {
      out.push({
        key: 'business',
        colors: ['#1C2638', '#2A3A55'],
        body: (active) => (
          <>
            <Reveal active={active}>
              <Text style={label}>The business</Text>
            </Reveal>
            <Reveal active={active} delay={220}>
              <Text style={[styles.metricLabel, { color: SOFT, marginTop: 18 }]}>{b.profit >= 0 ? 'Profit' : 'Loss'}</Text>
              <CountUp
                active={active}
                value={Math.abs(b.profit)}
                glyph={glyph}
                hidden={hide}
                delay={280}
                style={[styles.count, { color: b.profit >= 0 ? '#E2B65C' : '#F07565' }]}
              />
              {b.margin != null ? <Text style={[styles.line, { color: SOFT }]}>{b.margin}% margin on {money(b.revenue)} revenue</Text> : null}
            </Reveal>
            <View style={{ marginTop: 22, gap: 12 }}>
              {b.topCustomer ? <Text style={[styles.line, { color: WHITE }]}>🤝 Top customer: {b.topCustomer.name}{hide ? '' : ` (${formatAmount(b.topCustomer.amount, glyph)})`}</Text> : null}
              {b.bestMonth ? <Text style={[styles.line, { color: WHITE }]}>📈 Best month: {b.bestMonth.month}</Text> : null}
              {b.invoicesIssued ? <Text style={[styles.line, { color: WHITE }]}>🧾 {b.invoicesIssued} invoices sent, {b.invoicesPaid} paid</Text> : null}
              {b.payroll ? <Text style={[styles.line, { color: WHITE }]}>👥 {money(b.payroll)} paid to your team</Text> : null}
              {b.ownerPay ? <Text style={[styles.line, { color: WHITE }]}>😎 {money(b.ownerPay)} paid to yourself</Text> : null}
            </View>
          </>
        )
      });
    }

    out.push({
      key: 'persona',
      colors: ['#1B1030', '#7A2E5C'],
      body: (active) => (
        <>
          <Reveal active={active}>
            <Text style={label}>Your money personality</Text>
          </Reveal>
          <Reveal active={active} delay={300}>
            <Text style={[styles.line, { color: SOFT, marginTop: 10 }]}>Drumroll...</Text>
          </Reveal>
          <Pop active={active} delay={900}>
            <Text style={{ fontSize: 72, marginTop: 14 }}>{EMOJI[data.persona.key] ?? '✨'}</Text>
          </Pop>
          <Pop active={active} delay={1150}>
            <Text style={[big, { marginTop: 8 }]}>{data.persona.title}</Text>
          </Pop>
          <Reveal active={active} delay={1500}>
            <Text style={[styles.line, { color: WHITE, marginTop: 10 }]}>{data.persona.line}</Text>
            <Text style={[type.caption, { color: SOFT, marginTop: 30 }]}>{data.period.label} · BudgetFriendly</Text>
          </Reveal>
        </>
      )
    });
    return out;
  }, [data, glyph, hide]);

  const go = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(slides.length - 1, i));
      scrollRef.current?.scrollTo({ x: next * cardW, animated: true });
      setIndex(next);
    },
    [cardW, slides.length]
  );

  /**
   * The story clock. Each slide holds for a few seconds and then moves on by itself, and the bar across the
   * top shows how long is left. A finger held on the card pauses it, which is how anybody reads a long slide
   * or takes a screenshot. It stops on the last card rather than looping.
   */
  const progress = useRef(new Animated.Value(0)).current;
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    progress.setValue(0);
    if (!slides.length || paused || index >= slides.length - 1) return;
    const anim = Animated.timing(progress, { toValue: 1, duration: SLIDE_MS, easing: Easing.linear, useNativeDriver: false });
    anim.start(({ finished }) => {
      if (finished) go(index + 1);
    });
    return () => anim.stop();
  }, [index, paused, slides.length, progress, go]);

  // A small knock when the personality lands, since that is the moment people wait for.
  useEffect(() => {
    if (slides.length && index === slides.length - 1) haptic.success();
  }, [index, slides.length]);

  const share = async () => {
    const node = slideRefs.current[index];
    if (!node) return;
    try {
      const uri = await captureRef(node, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your Money Wrapped' });
    } catch {
      toast.show('Couldn’t make the image. Try again.', 'error');
    }
  };

  return (
    <Screen scrollable={false}>
      <View style={styles.header}>
        <IconButton round accessibilityLabel="Close" onPress={() => goBackOrHome(nav)}>
          <X color={theme.colors.text} size={19} />
        </IconButton>
        <SegmentedControl
          style={{ flex: 1 }}
          options={[
            { key: 'h1', label: 'First half' },
            { key: 'year', label: 'Full year' }
          ]}
          value={kind}
          onChange={setKind}
        />
        <IconButton round accessibilityLabel={showAmounts ? 'Hide amounts' : 'Show amounts'} onPress={toggleShowAmounts}>
          {showAmounts ? <EyeOff color={theme.colors.text} size={18} /> : <Eye color={theme.colors.text} size={18} />}
        </IconButton>
      </View>
      <View style={styles.chips}>
        {[thisYear, thisYear - 1].map((y) => (
          <ChoiceChip key={y} label={String(y)} active={year === y} onPress={() => setYear(y)} />
        ))}
        {spacesEnabled ? (
          <>
            <ChoiceChip label="Personal" active={space === 'personal'} onPress={() => setSpace('personal')} />
            <ChoiceChip label="Business" active={space === 'business'} onPress={() => setSpace('business')} />
          </>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 60 }} />
      ) : error ? (
        <View style={{ marginTop: 16 }}>
          <EmptyState title="Not ready yet" body={/start|future|not started/i.test(error) ? 'That period hasn’t started. Pick another one.' : error} />
        </View>
      ) : !slides.length ? (
        <View style={{ marginTop: 16 }}>
          <EmptyState
            title="Not enough to wrap yet"
            body={`Log your spending and income through ${data?.period.label ?? 'the year'} and your Money Wrapped will be ready.`}
            actionLabel="Add a transaction"
            onAction={() => nav.navigate('AddTransaction')}
          />
        </View>
      ) : (
        <>
          <View style={styles.dots}>
            {slides.map((s, i) => (
              <View key={s.key} style={[styles.dot, { backgroundColor: theme.colors.border }]}>
                <Animated.View
                  style={{
                    height: 3,
                    borderRadius: 2,
                    backgroundColor: theme.colors.primary,
                    width: i < index ? '100%' : i === index ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) : '0%'
                  }}
                />
              </View>
            ))}
          </View>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1, width: cardW }}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / cardW))}
          >
            {slides.map((s, i) => (
              <Pressable
                key={s.key}
                onPress={(e) => (e.nativeEvent.locationX < cardW / 3 ? go(index - 1) : go(index + 1))}
                onLongPress={() => setPaused(true)}
                delayLongPress={220}
                onPressOut={() => setPaused(false)}
                style={{ width: cardW }}
              >
                <View
                  ref={(r) => {
                    slideRefs.current[i] = r;
                  }}
                  collapsable={false}
                  style={styles.slide}
                >
                  <LinearGradient colors={s.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  {s.body(i === index)}
                  {s.key === 'persona' ? <Confetti active={i === index} width={cardW} /> : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.controls}>
            <IconButton round accessibilityLabel="Previous" onPress={() => go(index - 1)}>
              <ChevronLeft color={index === 0 ? theme.colors.textMuted : theme.colors.text} size={20} />
            </IconButton>
            <Pressable onPress={share} accessibilityRole="button" style={({ pressed }) => [styles.share, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 }]}>
              <Share2 color={theme.colors.onPrimary} size={17} />
              <Text style={[type.bodyStrong, { color: theme.colors.onPrimary }]}>Share this</Text>
            </Pressable>
            <IconButton round accessibilityLabel="Next" onPress={() => go(index + 1)}>
              <ChevronRight color={index === slides.length - 1 ? theme.colors.textMuted : theme.colors.text} size={20} />
            </IconButton>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  dots: { flexDirection: 'row', gap: 4, marginTop: 14, marginBottom: 10 },
  dot: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  slide: { flex: 1, borderRadius: 28, overflow: 'hidden', padding: 24, paddingTop: 30 },
  big: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46, letterSpacing: -1.2, color: WHITE },
  count: { fontFamily: fonts.display, fontSize: 34, lineHeight: 42, letterSpacing: -1 },
  line: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 23 },
  metricLabel: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 6, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 130, marginTop: 22, gap: 4 },
  chartCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  bar: { width: '70%', borderRadius: 4 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  share: { flex: 1, height: 48, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }
});
