import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, type TextInput } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft, ChevronRight, CalendarDays, Check } from 'lucide-react-native';

import { createGoal } from '../api/endpoints';
import { getPlan } from '../api/personal';
import { useAuth } from '../contexts/AuthContext';
import { useSpace } from '../contexts/SpaceContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { Card, InlineError, PrimaryButton, Screen, TextButton, TextField, formatAmount } from '../components/Common/ui';
import { currencySymbol, formatNumberInput, formatShortDate, toIsoDate } from '../utils/format';
import { fonts, type } from '../theme/typography';
import { tokens } from '../theme/tokens';

type Preset = { key: string; emoji: string; label: string; months: number };

// Quick picks, so most people never have to type a name. Each suggests a sensible deadline.
const PERSONAL_PRESETS: Preset[] = [
  { key: 'emergency', emoji: '🛟', label: 'Emergency fund', months: 6 },
  { key: 'rent', emoji: '🏠', label: 'Rent', months: 6 },
  { key: 'school', emoji: '🎓', label: 'School fees', months: 4 },
  { key: 'travel', emoji: '✈️', label: 'Travel', months: 6 },
  { key: 'phone', emoji: '📱', label: 'New phone', months: 3 },
  { key: 'wedding', emoji: '💍', label: 'Wedding', months: 12 },
  { key: 'car', emoji: '🚗', label: 'Car', months: 12 },
  { key: 'other', emoji: '✨', label: 'Something else', months: 6 }
];

const BUSINESS_PRESETS: Preset[] = [
  { key: 'reserve', emoji: '🛟', label: 'Cash reserve', months: 6 },
  { key: 'tax', emoji: '🧾', label: 'Tax money', months: 6 },
  { key: 'equipment', emoji: '🛠️', label: 'Equipment', months: 6 },
  { key: 'stock', emoji: '📦', label: 'Stock', months: 3 },
  { key: 'expansion', emoji: '🏪', label: 'New location', months: 12 },
  { key: 'other', emoji: '✨', label: 'Something else', months: 6 }
];

const WHEN_OPTIONS = [
  { months: 3, label: '3 months' },
  { months: 6, label: '6 months' },
  { months: 12, label: '1 year' }
];

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_MS = 24 * 60 * 60 * 1000;

function monthsFromNow(months: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setMonth(d.getMonth() + months);
  return toIsoDate(d);
}

function monthsUntil(iso: string): number {
  const days = (new Date(`${iso}T12:00:00`).getTime() - Date.now()) / DAY_MS;
  return Math.max(days / (365 / 12), 7 / (365 / 12));
}

const toNumber = (v: string) => {
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

export default function CreateGoalScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const isBusiness = spacesEnabled && activeSpaceId === 'business';
  const presets = isBusiness ? BUSINESS_PRESETS : PERSONAL_PRESETS;
  const glyph = currencySymbol(user?.currency);
  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] || null;

  const initialPreset = presets.find((p) => p.key === route.params?.preset) ?? null;
  const [preset, setPreset] = useState<Preset | null>(initialPreset);
  const [name, setName] = useState(initialPreset && initialPreset.key !== 'other' ? initialPreset.label : '');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [showSaved, setShowSaved] = useState(false);
  const [whenMonths, setWhenMonths] = useState<number | null>(initialPreset?.months ?? 6);
  const [targetDate, setTargetDate] = useState(() => monthsFromNow(initialPreset?.months ?? 6));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ savings: number; needs: number } | null>(null);
  const nameRef = useRef<TextInput>(null);

  // The personal plan says how much goes to savings each month, so a new goal can be checked against it.
  useEffect(() => {
    if (isBusiness) return;
    getPlan()
      .then((p) => p.monthlyIncome > 0 && setPlan({ savings: p.split.Savings, needs: p.split.Needs }))
      .catch(() => undefined);
  }, [isBusiness]);

  const target = toNumber(targetAmount);
  const saved = currentAmount.trim() ? toNumber(currentAmount) : 0;
  const canSave = name.trim().length > 0 && target > 0 && Number.isFinite(saved) && saved >= 0 && !isSaving;

  const pickPreset = (p: Preset) => {
    setPreset(p);
    setName(p.key === 'other' ? '' : p.label);
    setWhenMonths(p.months);
    setTargetDate(monthsFromNow(p.months));
    if (p.key === 'other') setTimeout(() => nameRef.current?.focus(), 50);
  };

  const pickWhen = (months: number) => {
    setWhenMonths(months);
    setTargetDate(monthsFromNow(months));
  };

  // What this goal asks for each month, and whether that fits the plan.
  const pace = useMemo(() => {
    if (!(target > 0)) return null;
    const left = Math.max(0, target - (Number.isFinite(saved) ? saved : 0));
    if (left === 0) return { monthly: 0, weekly: 0, left, fits: true, easierDate: null as string | null };
    const months = monthsUntil(targetDate);
    const monthly = left / months;
    const weekly = monthly / (52 / 12);
    let fits: boolean | null = null;
    let easierDate: string | null = null;
    if (plan && plan.savings > 0) {
      fits = monthly <= plan.savings * 1.02;
      if (!fits) easierDate = monthsFromNow(Math.ceil(left / plan.savings));
    }
    return { monthly, weekly, left, fits, easierDate };
  }, [target, saved, targetDate, plan]);

  const emergencySuggestion = preset?.key === 'emergency' && plan && plan.needs > 0 ? Math.round((plan.needs * 3) / 1000) * 1000 : null;

  const submit = async () => {
    if (!canSave) return;
    setError(null);
    setIsSaving(true);
    try {
      const goal = await createGoal({
        name: name.trim(),
        targetAmount: target,
        currentAmount: saved,
        targetDate,
        emoji: preset?.emoji ?? '🎯',
        category: 'savings',
        ...(spacesEnabled ? { spaceId: activeSpaceId } : {})
      });
      toast.show(
        pace && pace.monthly > 0 ? `${goal.emoji ?? '🎯'} ${goal.name} is on. First step: ${formatAmount(Math.round(pace.monthly), glyph)} this month.` : `${goal.emoji ?? '🎯'} ${goal.name} is on.`,
        'success',
        4000
      );
      nav.replace('GoalDetail', { goalId: goal.id, goal });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create your goal. Check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Screen bottomInset={40}>
      <Pressable onPress={() => nav.goBack()} hitSlop={8} accessibilityRole="button" style={({ pressed }) => [styles.back, { opacity: pressed ? 0.7 : 1 }]}>
        <ChevronLeft color={theme.colors.text} size={20} />
        <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Back</Text>
      </Pressable>

      <Text style={[type.title, { color: theme.colors.text, marginTop: 12 }]}>
        {isBusiness ? 'What is the business saving for?' : `What are you saving for${firstName ? `, ${firstName}` : ''}?`}
      </Text>
      <Text style={[type.body, { color: theme.colors.textMuted, marginTop: 6 }]}>Pick one or name your own. We’ll work out the rest.</Text>

      <View style={styles.presetWrap}>
        {presets.map((p) => {
          const active = preset?.key === p.key;
          return (
            <Pressable
              key={p.key}
              onPress={() => pickPreset(p)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.presetPill,
                { borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface, opacity: pressed ? 0.85 : 1 }
              ]}
            >
              <Text style={{ fontSize: 16 }}>{p.emoji}</Text>
              <Text style={[type.smallStrong, { color: active ? theme.colors.primary : theme.colors.text }]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {preset ? (
        <View style={{ marginTop: 18 }}>
          <TextField inputRef={nameRef} label="Name your goal" value={name} onChangeText={setName} placeholder="e.g. Lagos trip in December" maxLength={80} />

          <TextField
            label="How much do you need?"
            value={targetAmount}
            onChangeText={(v) => setTargetAmount(formatNumberInput(v))}
            placeholder={`${glyph}0`}
            keyboardType="number-pad"
            hint={emergencySuggestion ? undefined : 'A rough number is fine. You can change it later.'}
          />
          {emergencySuggestion ? (
            <Pressable
              onPress={() => setTargetAmount(formatNumberInput(String(emergencySuggestion)))}
              accessibilityRole="button"
              style={({ pressed }) => [styles.suggestion, { backgroundColor: theme.colors.primarySoft, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={[type.small, { color: theme.colors.text, flex: 1 }]}>
                Most people aim for 3 months of needs. For you that’s <Text style={{ fontFamily: fonts.semibold }}>{formatAmount(emergencySuggestion, glyph)}</Text>.
              </Text>
              <Text style={[type.smallStrong, { color: theme.colors.primary }]}>Use it</Text>
            </Pressable>
          ) : null}

          <Text style={[type.smallStrong, { color: theme.colors.text, marginBottom: 8 }]}>By when?</Text>
          <View style={styles.whenRow}>
            {WHEN_OPTIONS.map((o) => {
              const active = whenMonths === o.months;
              return (
                <Pressable
                  key={o.months}
                  onPress={() => pickWhen(o.months)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.whenPill,
                    { borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface, opacity: pressed ? 0.85 : 1 }
                  ]}
                >
                  <Text style={[type.smallStrong, { color: active ? theme.colors.primary : theme.colors.text }]}>{o.label}</Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setShowDatePicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Pick a date"
              style={({ pressed }) => [
                styles.whenPill,
                {
                  borderColor: whenMonths === null ? theme.colors.primary : theme.colors.border,
                  backgroundColor: whenMonths === null ? theme.colors.primarySoft : theme.colors.surface,
                  opacity: pressed ? 0.85 : 1
                }
              ]}
            >
              <CalendarDays color={whenMonths === null ? theme.colors.primary : theme.colors.textMuted} size={16} />
            </Pressable>
          </View>
          <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 8 }]}>By {formatShortDate(targetDate)}</Text>

          {pace && pace.left > 0 ? (
            <Card style={{ marginTop: 16 }}>
              <Text style={[type.body, { color: theme.colors.text }]}>
                That’s <Text style={{ fontFamily: fonts.semibold }}>{formatAmount(Math.round(pace.monthly), glyph)} a month</Text>, about {formatAmount(Math.round(pace.weekly), glyph)} a week.
              </Text>
              {pace.fits === true && plan ? (
                <View style={[styles.fitRow, { marginTop: 8 }]}>
                  <Check color={theme.colors.success} size={16} strokeWidth={3} />
                  <Text style={[type.small, { color: theme.colors.textMuted, flex: 1 }]}>Fits in the {formatAmount(plan.savings, glyph)} your plan saves each month.</Text>
                </View>
              ) : null}
              {pace.fits === false && plan ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={[type.small, { color: theme.colors.textMuted }]}>
                    That’s more than the {formatAmount(plan.savings, glyph)} your plan saves each month.
                  </Text>
                  {pace.easierDate ? (
                    <Pressable
                      onPress={() => {
                        setWhenMonths(null);
                        setTargetDate(pace.easierDate!);
                      }}
                      accessibilityRole="button"
                      hitSlop={6}
                      style={({ pressed }) => [styles.fitRow, { marginTop: 8, opacity: pressed ? 0.7 : 1 }]}
                    >
                      <Text style={[type.smallStrong, { color: theme.colors.primary }]}>Aim for {formatShortDate(pace.easierDate)} instead</Text>
                      <ChevronRight color={theme.colors.primary} size={16} />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </Card>
          ) : null}

          {showSaved ? (
            <View style={{ marginTop: 16 }}>
              <TextField
                label="Already saved"
                value={currentAmount}
                onChangeText={(v) => setCurrentAmount(formatNumberInput(v))}
                placeholder={`${glyph}0`}
                keyboardType="number-pad"
              />
            </View>
          ) : (
            <TextButton title="I’ve already saved some" onPress={() => setShowSaved(true)} style={{ marginTop: 8, alignSelf: 'flex-start' }} />
          )}

          {error ? (
            <View style={{ marginTop: 8 }}>
              <InlineError message={error} />
            </View>
          ) : null}

          <PrimaryButton title="Start my goal" onPress={submit} disabled={!canSave} loading={isSaving} style={{ marginTop: 16 }} />
        </View>
      ) : null}

      <DatePickerModal
        visible={showDatePicker}
        value={targetDate}
        onClose={() => setShowDatePicker(false)}
        onPick={(iso) => {
          setWhenMonths(null);
          setTargetDate(iso);
          setShowDatePicker(false);
        }}
      />
    </Screen>
  );
}

/** Month calendar for the goal deadline. Only future days can be picked. */
function DatePickerModal({ visible, value, onClose, onPick }: { visible: boolean; value: string; onClose: () => void; onPick: (iso: string) => void }) {
  const { theme } = useTheme();
  const [cursor, setCursor] = useState(() => {
    const d = new Date(`${value}T12:00:00`);
    return Number.isNaN(d.getTime()) ? new Date() : new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const todayIso = toIsoDate(new Date());

  const rows = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const cells: Array<number | null> = Array(new Date(y, m, 1).getDay()).fill(null);
    for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d += 1) cells.push(d);
    while (cells.length % 7) cells.push(null);
    const out: Array<Array<number | null>> = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cursor]);

  const shift = (by: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + by, 1));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.colors.background }]} onPress={() => undefined}>
          <View style={styles.calHeader}>
            <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month">
              <ChevronLeft color={theme.colors.primary} size={22} />
            </Pressable>
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </Text>
            <Pressable onPress={() => shift(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next month">
              <ChevronRight color={theme.colors.primary} size={22} />
            </Pressable>
          </View>

          <View style={styles.calRow}>
            {WEEKDAYS.map((d, i) => (
              // The letters repeat (S, T), so the position is the key.
              <Text key={i} style={[type.caption, styles.calCell, { color: theme.colors.textMuted, fontFamily: fonts.semibold }]}>
                {d}
              </Text>
            ))}
          </View>

          {rows.map((row, r) => (
            <View key={r} style={styles.calRow}>
              {row.map((day, c) => {
                if (!day) return <View key={c} style={styles.calCell} />;
                const iso = toIsoDate(new Date(cursor.getFullYear(), cursor.getMonth(), day));
                const selected = iso === value;
                const past = iso <= todayIso;
                return (
                  <Pressable
                    key={c}
                    disabled={past}
                    onPress={() => onPick(iso)}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: past }}
                    style={[styles.calCell, styles.calDay, selected && { backgroundColor: theme.colors.primary }]}
                  >
                    <Text style={[type.small, { color: selected ? tokens.colors.white : past ? theme.colors.textMuted : theme.colors.text, opacity: past ? 0.4 : 1 }]}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}

          <TextButton title="Close" onPress={onClose} style={{ marginTop: 4 }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  presetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  presetPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 12, marginTop: -4, marginBottom: 14 },
  whenRow: { flexDirection: 'row', gap: 8 },
  whenPill: { flex: 1, height: 42, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fitRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 20, padding: 16 },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  calRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  calCell: { width: 38, height: 38, textAlign: 'center', textAlignVertical: 'center' },
  calDay: { borderRadius: 12, alignItems: 'center', justifyContent: 'center' }
});
