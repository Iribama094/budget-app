import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Modal } from '../Common/AppModal';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, type LucideIcon } from '../../icons';

import { useTheme } from '../../contexts/ThemeContext';
import { Card, Chip, TextField } from '../Common/ui';
import { ChoiceChip } from '../Plan/ChoiceChip';
import { formatNumberInput, formatShortDate, parseNumberInput, toIsoDate } from '../../utils/format';
import { fonts, type } from '../../theme/typography';

export const todayIso = () => toIsoDate(new Date());

/** Local calendar date `days` from today (negative for the past). */
export function addDaysIso(days: number, from: Date = new Date()): string {
  return toIsoDate(new Date(from.getFullYear(), from.getMonth(), from.getDate() + days, 12));
}

export function parseMoney(raw: string): number {
  const n = parseNumberInput(raw);
  return Number.isFinite(n) ? n : 0;
}

/** A number as the grouped text shown in money inputs. */
export const moneyText = (n: number) => (n > 0 ? formatNumberInput(String(Math.round(n * 100) / 100)) : '');

export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Bottom sheet used for quick forms. */
export function Sheet({ visible, onClose, title, subtitle, children }: { visible: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={onClose}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.h2, { color: theme.colors.text }]}>{title}</Text>
                {subtitle ? <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 2 }]}>{subtitle}</Text> : null}
              </View>
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <X color={theme.colors.textMuted} size={20} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function MoneyField({ label, value, onChange, glyph, hint, autoFocus }: { label: string; value: string; onChange: (v: string) => void; glyph: string; hint?: string; autoFocus?: boolean }) {
  return <TextField label={label} value={value} onChangeText={(v) => onChange(formatNumberInput(v))} placeholder={`${glyph}0`} keyboardType="decimal-pad" hint={hint} autoFocus={autoFocus} />;
}

/** Quick date presets with a typed fallback. */
export function DateChoice({ label, value, onChange, presets }: { label: string; value: string; onChange: (iso: string) => void; presets: Array<{ label: string; days: number }> }) {
  const { theme } = useTheme();
  const presetValues = presets.map((p) => addDaysIso(p.days));
  const [custom, setCustom] = useState(!presetValues.includes(value));
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[type.smallStrong, { color: theme.colors.text, marginBottom: 8 }]}>{label}</Text>
      <View style={styles.wrap}>
        {presets.map((p, i) => (
          <ChoiceChip
            key={p.label}
            label={p.label}
            active={!custom && value === presetValues[i]}
            onPress={() => {
              setCustom(false);
              onChange(presetValues[i]);
            }}
          />
        ))}
        <ChoiceChip label="Pick a date" active={custom} onPress={() => setCustom(true)} />
      </View>
      {custom ? (
        <View style={{ marginTop: 10 }}>
          <TextField label="Date (YYYY-MM-DD)" value={value} onChangeText={(v) => onChange(v.trim())} placeholder={todayIso()} autoCapitalize="none" />
        </View>
      ) : null}
      <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: custom ? -6 : 8 }]}>{isIsoDate(value) ? formatShortDate(value) : 'Use the format YYYY-MM-DD'}</Text>
    </View>
  );
}

export function StatusChip({ status, overdue, dueInDays }: { status: string; overdue?: boolean; dueInDays?: number }) {
  if (status === 'paid') return <Chip tone="positive" label="Paid" />;
  if (status === 'void') return <Chip label="Voided" />;
  if (status === 'draft') return <Chip label="Draft" />;
  if (overdue) return <Chip tone="negative" label="Overdue" />;
  if (status === 'part_paid') return <Chip tone="brass" label="Part paid" />;
  if (dueInDays === 0) return <Chip tone="brass" label="Due today" />;
  return <Chip tone="primary" label="Unpaid" />;
}

/** "due in 3 days", "due today", "5 days overdue". */
export function dueText(days: number): string {
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
}

export function StatCard({ label, icon, onPress, children, style }: { label: string; icon?: React.ReactNode; onPress?: () => void; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  const body = (
    <Card style={[{ flex: 1 }, style]}>
      {icon}
      <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: icon ? 10 : 0, marginBottom: 2 }]}>{label}</Text>
      {children}
    </Card>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.85 : 1 })}>
      {body}
    </Pressable>
  );
}

export function ToolTile({ label, Icon, onPress, badge }: { label: string; Icon: LucideIcon; onPress: () => void; badge?: number | null }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tool, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={[styles.toolIcon, { backgroundColor: theme.colors.brassSoft }]}>
        <Icon color={theme.colors.brass} size={19} />
      </View>
      <Text numberOfLines={1} style={[type.caption, { color: theme.colors.text, fontFamily: fonts.semibold }]}>
        {label}
      </Text>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: theme.colors.error }]}>
          <Text style={{ color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 10 }}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** A label and value on one line, for breakdowns. */
export function LineItem({ label, value, strong, color }: { label: string; value: React.ReactNode; strong?: boolean; color?: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.line}>
      <Text style={[strong ? type.bodyStrong : type.body, { color: theme.colors.textMuted, flex: 1 }, strong && { color: theme.colors.text }]}>{label}</Text>
      {typeof value === 'string' ? <Text style={[strong ? type.bodyStrong : type.body, { color: color ?? theme.colors.text }]}>{value}</Text> : value}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tool: { width: '23%', flexGrow: 1, alignItems: 'center', gap: 7, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  toolIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 6, right: 8, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }
});
