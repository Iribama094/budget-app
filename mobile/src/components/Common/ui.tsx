import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Animated,
  type TextInputProps,
  type ViewProps,
  type TextProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { tokens } from '../../theme/tokens';
import { fonts, type } from '../../theme/typography';
import { AppBackground } from './AppBackground';

/* ------------------------------------------------------------------ layout */

export function Screen({
  children,
  style,
  scrollable = true,
  onRefresh,
  refreshing,
  bottomInset = 120
}: {
  children: React.ReactNode;
  style?: ViewProps['style'];
  scrollable?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Space kept clear at the bottom of scroll content (tab bar + centre action). */
  bottomInset?: number;
}) {
  const { theme } = useTheme();
  // When a screen contains a VirtualizedList (FlatList/SectionList) we must not wrap it
  // in a plain ScrollView with the same orientation. Allow pages to opt out of ScrollView.
  if (!scrollable) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
        <AppBackground />
        <View style={[styles.screenPadding, { flex: 1 }, style]}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <AppBackground />
      {/* Keeps the field being typed in above the keyboard on every screen, on iOS and Android. */}
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardDismissMode="interactive"
        style={styles.scroll}
        contentContainerStyle={[styles.screenPadding, { flexGrow: 1 }, style]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} /> : undefined}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        {children}
        <View style={{ height: bottomInset }} />
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

export function ScreenHeader({
  title,
  onBack,
  right,
  subtitle
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
  subtitle?: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.header}>
      {onBack ? (
        <IconButton accessibilityLabel="Go back" onPress={onBack}>
          <ChevronLeft color={theme.colors.text} size={20} />
        </IconButton>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[onBack ? type.h2 : type.h1, { color: theme.colors.text }]}>
          {title}
        </Text>
        {subtitle ? <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** A section title. With `info`, an ⓘ reveals the explanation underneath instead of it sitting on screen all the time. */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
  info,
  style
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  info?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const [showInfo, setShowInfo] = useState(false);
  return (
    <View style={style}>
      <View style={styles.sectionHeader}>
        <View style={[styles.row, { gap: 6, flex: 1, minWidth: 0 }]}>
          <Text numberOfLines={1} style={[type.title, { color: theme.colors.text, flexShrink: 1 }]}>
            {title}
          </Text>
          {info ? (
            <Pressable
              onPress={() => setShowInfo((v) => !v)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`About ${title}`}
              accessibilityState={{ expanded: showInfo }}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Info color={showInfo ? theme.colors.primary : theme.colors.textMuted} size={15} />
            </Pressable>
          ) : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={10} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[type.smallStrong, { color: theme.colors.primary }]}>{actionLabel}</Text>
            <ChevronRight color={theme.colors.primary} size={15} />
          </Pressable>
        ) : null}
      </View>
      {info && showInfo ? (
        <View style={[styles.infoBox, { backgroundColor: theme.colors.surfaceAlt }]}>
          <Text style={[type.caption, { color: theme.colors.textMuted }]}>{info}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * A one-line note with an ⓘ that opens the longer explanation. Keeps screens light without hiding the detail.
 * `children` is the short line; leave it out for just the icon.
 */
export function InfoTip({
  text,
  children,
  label,
  tone = 'muted',
  style
}: {
  text: string;
  children?: string;
  label?: string;
  tone?: 'muted' | 'onInk';
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const onInk = tone === 'onInk';
  const color = onInk ? theme.colors.inkText : theme.colors.textMuted;
  return (
    <View style={style}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={label ?? (children ? `${children}. More information` : 'More information')}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.row, { gap: 6, opacity: pressed ? 0.6 : onInk ? 0.85 : 1 }]}
      >
        {children ? (
          <Text style={[type.caption, { color, flex: 1 }]}>{children}</Text>
        ) : null}
        <Info color={open ? theme.colors.primary : color} size={15} />
      </Pressable>
      {open ? (
        <View style={[styles.infoBox, { backgroundColor: onInk ? 'rgba(255,255,255,0.12)' : theme.colors.surfaceAlt, marginTop: 8, marginBottom: 0 }]}>
          <Text style={[type.caption, { color }]}>{text}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------- text */

export function H1(props: TextProps) {
  const { theme } = useTheme();
  return <Text {...props} style={[type.h1, { color: theme.colors.text }, props.style]} />;
}

export function P(props: TextProps) {
  const { theme } = useTheme();
  return <Text {...props} style={[type.body, { color: theme.colors.textMuted }, props.style]} />;
}

function groupDigits(n: number): string {
  const abs = Math.abs(n);
  const hasFraction = Math.round(abs * 100) % 100 !== 0;
  const fixed = hasFraction ? abs.toFixed(2) : String(Math.round(abs));
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

/** Money with the currency glyph set smaller, tabular figures, and an optional sign. */
export function Amount({
  value,
  currency = '₦',
  size = 'md',
  color,
  hidden,
  signed,
  style
}: {
  value: number;
  currency?: string;
  size?: 'hero' | 'lg' | 'md' | 'sm';
  color?: string;
  hidden?: boolean;
  /** Prefix + for positive and − for negative values. */
  signed?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const { theme } = useTheme();
  const base = size === 'hero' ? type.hero : size === 'lg' ? type.amountLg : size === 'md' ? type.amount : type.amountSm;
  const glyphScale = size === 'hero' || size === 'lg' ? 0.56 : 0.86;
  const sign = signed ? (value < 0 ? '−' : '+') : value < 0 ? '−' : '';
  const big = size === 'hero' || size === 'lg';
  return (
    <Text
      style={[base, { color: color ?? theme.colors.text }, style]}
      numberOfLines={1}
      // Big amounts shrink to fit rather than getting cut off when someone uses large text on their phone.
      adjustsFontSizeToFit={big}
      minimumFontScale={0.6}
      accessibilityLabel={hidden ? 'Amount hidden' : `${sign === '−' ? 'minus ' : sign === '+' ? 'plus ' : ''}${currency}${groupDigits(value)}`}
    >
      {sign}
      <Text style={{ fontFamily: fonts.medium, fontSize: base.fontSize * glyphScale }}>{currency}</Text>
      {hidden ? '••••' : groupDigits(value)}
    </Text>
  );
}

export function formatAmount(value: number, currency = '₦'): string {
  return `${value < 0 ? '−' : ''}${currency}${groupDigits(value)}`;
}

/* ---------------------------------------------------------------- surfaces */

export function Card({ children, style }: { children: React.ReactNode; style?: ViewProps['style'] }) {
  const { theme } = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, style]}>{children}</View>;
}

/** The one raised surface: deep ink with a faint engraved ring pattern. */
export function HeroCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  const rings = Array.from({ length: 14 }, (_, i) => 22 + i * 13);
  return (
    <View style={[styles.hero, { backgroundColor: theme.colors.ink }, style]}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
        {rings.map((r) => (
          <Circle key={`a${r}`} cx="104%" cy="-12%" r={r} stroke="rgba(226,182,92,0.13)" strokeWidth={1} fill="none" />
        ))}
        {rings.map((r) => (
          <Circle key={`b${r}`} cx="-18%" cy="118%" r={r + 6} stroke="rgba(255,255,255,0.05)" strokeWidth={1} fill="none" />
        ))}
      </Svg>
      {children}
    </View>
  );
}

/** Groups rows in one card with hairline dividers between them. */
export function ListCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.card, styles.listCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, style]}>
      {items.map((child, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border } : undefined}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  onLongPress,
  chevron,
  titleStyle
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
  titleStyle?: StyleProp<TextStyle>;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      disabled={!onPress && !onLongPress}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.listRow, { opacity: pressed ? 0.7 : 1 }]}
    >
      {icon}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.bodyStrong, { color: theme.colors.text }, titleStyle]}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <ChevronRight color={theme.colors.textMuted} size={17} /> : null}
    </Pressable>
  );
}

export function IconTile({ children, bg, size = 40 }: { children: React.ReactNode; bg: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.32), backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>{children}</View>;
}

export function IconButton({
  children,
  onPress,
  accessibilityLabel,
  badge,
  round
}: {
  children: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  badge?: boolean;
  round?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        { borderRadius: round ? 20 : 12, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.75 : 1 }
      ]}
    >
      {children}
      {badge ? <View style={[styles.badgeDot, { backgroundColor: theme.colors.error, borderColor: theme.colors.surface }]} /> : null}
    </Pressable>
  );
}

/* --------------------------------------------------------------- controls */

export function PrimaryButton({
  title,
  onPress,
  disabled,
  loading,
  iconLeft,
  iconRight,
  style
}: {
  title: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.colors.primary, opacity: disabled ? 0.5 : pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.onPrimary} />
      ) : (
        <View style={styles.buttonInner}>
          {iconLeft}
          <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>{title}</Text>
          {iconRight}
        </View>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  title,
  onPress,
  disabled,
  iconLeft,
  iconRight,
  style
}: {
  title: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style
      ]}
    >
      <View style={styles.buttonInner}>
        {iconLeft}
        <Text style={[styles.buttonText, { color: theme.colors.text }]}>{title}</Text>
        {iconRight}
      </View>
    </Pressable>
  );
}

export function TextButton({ title, onPress, color, style }: { title: string; onPress: () => void; color?: string; style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" style={({ pressed }) => [{ paddingVertical: 10, alignItems: 'center', opacity: pressed ? 0.7 : 1 }, style]}>
      <Text style={[type.bodyStrong, { color: color ?? theme.colors.primary }]}>{title}</Text>
    </Pressable>
  );
}

export function TextField({
  label,
  error,
  inputRef,
  right,
  hint,
  ...props
}: TextInputProps & { label: string; error?: string | null; inputRef?: React.Ref<TextInput>; right?: React.ReactNode; hint?: string }) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? theme.colors.error : focused ? theme.colors.primary : theme.colors.border;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[type.smallStrong, { color: theme.colors.text, marginBottom: 6 }]}>{label}</Text>
      <View style={[styles.inputWrap, { borderColor, backgroundColor: theme.colors.surface }, focused && { borderWidth: 1.5 }]}>
        <TextInput
          {...props}
          ref={inputRef}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { color: theme.colors.text }, props.style]}
        />
        {right}
      </View>
      {error ? (
        <Text style={[type.caption, { color: theme.colors.error, marginTop: 6 }]}>{error}</Text>
      ) : hint ? (
        <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 6 }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function InlineError({ message }: { message: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.errorBox, { backgroundColor: theme.colors.errorSoft }]} accessibilityRole="alert">
      <Text style={[type.smallStrong, { color: theme.colors.error }]}>{message}</Text>
    </View>
  );
}

export function Divider() {
  const { theme } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border }} />;
}

export type ChipTone = 'neutral' | 'primary' | 'positive' | 'negative' | 'brass' | 'onInk';

export function Chip({ label, tone = 'neutral', icon, style }: { label: string; tone?: ChipTone; icon?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const palette: Record<ChipTone, [string, string]> = {
    neutral: [c.surfaceAlt, c.text],
    primary: [c.primarySoft, c.primary],
    positive: [c.successSoft, c.success],
    negative: [c.errorSoft, c.error],
    brass: [c.brassSoft, c.warn],
    onInk: ['rgba(143,214,195,0.16)', '#8FD6C3']
  };
  const [bg, fg] = palette[tone];
  return (
    <View style={[styles.chip, { backgroundColor: bg }, style]}>
      {icon}
      <Text style={[type.caption, { color: fg, fontFamily: fonts.semibold }]}>{label}</Text>
    </View>
  );
}

export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  style
}: {
  options: ReadonlyArray<{ key: K; label: string }>;
  value: K;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: theme.colors.surfaceAlt }, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.segmentItem, active && { backgroundColor: theme.colors.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 }]}
          >
            <Text numberOfLines={1} style={[type.smallStrong, { color: active ? theme.colors.text : theme.colors.textMuted }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------- data */

/** Progress bar with an optional marker (e.g. how much of the period has passed). */
export function ProgressBar({
  value,
  color,
  trackColor,
  height = 6,
  marker,
  markerColor
}: {
  value: number;
  color?: string;
  trackColor?: string;
  height?: number;
  marker?: number;
  markerColor?: string;
}) {
  const { theme } = useTheme();
  const pct = Math.max(0, Math.min(1, value || 0));
  return (
    <View style={{ height: marker != null ? height + 8 : height, justifyContent: 'center' }}>
      <View style={{ height, borderRadius: height, backgroundColor: trackColor ?? theme.colors.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: '100%', borderRadius: height, backgroundColor: color ?? theme.colors.primary }} />
      </View>
      {marker != null ? (
        <View
          style={{
            position: 'absolute',
            left: `${Math.max(0, Math.min(1, marker)) * 100}%`,
            width: 2,
            height: height + 8,
            marginLeft: -1,
            borderRadius: 1,
            backgroundColor: markerColor ?? theme.colors.text
          }}
        />
      ) : null}
    </View>
  );
}

export function Ring({ progress, size = 44, stroke = 5, color, label }: { progress: number; size?: number; stroke?: number; color?: string; label?: string }) {
  const { theme } = useTheme();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress || 0));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.colors.surfaceAlt} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? theme.colors.primary}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {label ? <Text style={[{ position: 'absolute', fontFamily: fonts.display, fontSize: size * 0.23, color: theme.colors.text }]}>{label}</Text> : null}
    </View>
  );
}

/** Grey rows that gently pulse while the first data loads, so the screen keeps its shape instead of showing a spinner. */
export function Skeleton({ rows = 3, height = 56, color, style }: { rows?: number; height?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  const pulse = React.useRef(new Animated.Value(0.55)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={style} accessible accessibilityLabel="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Animated.View
          key={i}
          style={{ height, borderRadius: tokens.radius.lg, backgroundColor: color ?? theme.colors.surfaceAlt, opacity: pulse, marginTop: i ? 8 : 0 }}
        />
      ))}
    </View>
  );
}

export function EmptyState({ title, body, actionLabel, onAction }: { title: string; body: string; actionLabel?: string; onAction?: () => void }) {
  const { theme } = useTheme();
  return (
    <Card style={{ alignItems: 'flex-start', gap: 6, padding: 18 }}>
      <Text style={[type.title, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[type.small, { color: theme.colors.textMuted }]}>{body}</Text>
      {actionLabel && onAction ? <PrimaryButton title={actionLabel} onPress={onAction} style={{ marginTop: 10, alignSelf: 'stretch' }} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  screenPadding: { paddingHorizontal: 20, paddingTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 10 },
  infoBox: { borderRadius: tokens.radius.lg, padding: 12, marginBottom: 10 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius['2xl'],
    padding: 16,
    overflow: 'hidden'
  },
  listCard: { paddingVertical: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  hero: {
    borderRadius: tokens.radius['3xl'],
    padding: 18,
    overflow: 'hidden',
    shadowColor: '#0D2B26',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8
  },
  iconButton: {
    width: 40,
    height: 40,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center'
  },
  badgeDot: { position: 'absolute', top: 8, right: 9, width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
  button: {
    minHeight: 54,
    borderRadius: tokens.radius.xl,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { fontFamily: fonts.semibold, fontSize: 16 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: 14,
    minHeight: 52
  },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 16, paddingVertical: 12 },
  errorBox: { borderRadius: tokens.radius.lg, padding: 12, marginBottom: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, alignSelf: 'flex-start' },
  segment: { flexDirection: 'row', padding: 4, borderRadius: tokens.radius.lg },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 10 }
});
