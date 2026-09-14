import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { SegmentedControl } from '../Common/ui';
import { ChoiceChip } from './ChoiceChip';
import { FREQUENCY_WORD, INCOME_FREQUENCIES, INCOME_KINDS, kindLabel, ordinal, WEEKDAYS, type DraftIncome } from '../../lib/planDrafts';
import { formatNumberInput } from '../../utils/format';
import { fonts, type } from '../../theme/typography';

const PAY_DAYS = [1, 15, 25, 28];

/** Edits one income source: what kind, how much, how often and when it arrives. */
export function IncomeEditor({
  value,
  onChange,
  glyph,
  onRemove,
  title = 'Income'
}: {
  value: DraftIncome;
  onChange: (next: DraftIncome) => void;
  glyph: string;
  onRemove?: () => void;
  title?: string;
}) {
  const { theme } = useTheme();
  const set = (patch: Partial<DraftIncome>) => onChange({ ...value, ...patch });
  const weekly = value.frequency === 'weekly' || value.frequency === 'biweekly';
  const customDay = value.payDay != null && !PAY_DAYS.includes(value.payDay) && value.payDay !== 31;

  return (
    <View>
      <View style={styles.rowBetween}>
        <Text style={[type.eyebrow, { color: theme.colors.primary }]}>{title}</Text>
        {onRemove ? (
          <Pressable onPress={onRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove this income">
            <X color={theme.colors.textMuted} size={18} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.wrap}>
        {INCOME_KINDS.map((k) => (
          <ChoiceChip
            key={k.key}
            label={k.label}
            active={value.kind === k.key}
            onPress={() => set({ kind: k.key, name: !value.name.trim() || value.name === kindLabel(value.kind) ? kindLabel(k.key) : value.name })}
          />
        ))}
      </View>

      <Text style={[type.smallStrong, styles.label, { color: theme.colors.text }]}>Name</Text>
      <View style={[styles.input, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <TextInput
          value={value.name}
          onChangeText={(t) => set({ name: t })}
          placeholder="e.g. Salary from work"
          placeholderTextColor={theme.colors.textMuted}
          maxLength={60}
          style={[styles.inputText, { color: theme.colors.text }]}
        />
      </View>

      <Text style={[type.smallStrong, styles.label, { color: theme.colors.text }]}>
        {value.frequency === 'irregular' ? 'Roughly how much in a normal month?' : 'How much do you get each time?'}
      </Text>
      <View style={[styles.input, { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface }]}>
        <Text style={{ fontFamily: fonts.medium, fontSize: 18, color: theme.colors.textMuted }}>{glyph}</Text>
        <TextInput
          value={value.amount}
          onChangeText={(t) => set({ amount: formatNumberInput(t.replace(/[^\d.,]/g, '')) })}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Amount"
          style={[styles.inputText, { color: theme.colors.text, fontFamily: fonts.display, fontSize: 20 }]}
        />
      </View>
      <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 6 }]}>A rough number is fine. It’s {FREQUENCY_WORD[value.frequency]}.</Text>

      <Text style={[type.smallStrong, styles.label, { color: theme.colors.text }]}>How often?</Text>
      <SegmentedControl options={INCOME_FREQUENCIES} value={value.frequency} onChange={(k) => set({ frequency: k })} />

      {value.frequency === 'monthly' ? (
        <>
          <Text style={[type.smallStrong, styles.label, { color: theme.colors.text }]}>Which day are you usually paid?</Text>
          <View style={styles.wrap}>
            {PAY_DAYS.map((d) => (
              <ChoiceChip key={d} label={ordinal(d)} active={value.payDay === d} onPress={() => set({ payDay: d })} />
            ))}
            <ChoiceChip label="Last day" active={value.payDay === 31} onPress={() => set({ payDay: 31 })} />
            <ChoiceChip label="Not sure" active={value.payDay == null} onPress={() => set({ payDay: null })} />
          </View>
          <View style={[styles.row, { marginTop: 10 }]}>
            <Text style={[type.caption, { color: theme.colors.textMuted }]}>Another day:</Text>
            <View style={[styles.dayInput, { borderColor: customDay ? theme.colors.primary : theme.colors.border, backgroundColor: theme.colors.surface }]}>
              <TextInput
                value={customDay ? String(value.payDay) : ''}
                onChangeText={(t) => {
                  const n = Number(t.replace(/\D/g, ''));
                  set({ payDay: n >= 1 && n <= 31 ? n : null });
                }}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="1–31"
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.inputText, { color: theme.colors.text, textAlign: 'center' }]}
              />
            </View>
          </View>
        </>
      ) : weekly ? (
        <>
          <Text style={[type.smallStrong, styles.label, { color: theme.colors.text }]}>Which day?</Text>
          <View style={styles.wrap}>
            {WEEKDAYS.map((d, i) => (
              <ChoiceChip key={d} label={d} active={value.payWeekday === i} onPress={() => set({ payWeekday: i })} />
            ))}
          </View>
        </>
      ) : (
        <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 10 }]}>We’ll plan by calendar month and treat this as a safe estimate.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  label: { marginTop: 16, marginBottom: 8 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 50 },
  inputText: { flex: 1, fontFamily: fonts.medium, fontSize: 16, paddingVertical: 10 },
  dayInput: { width: 72, borderWidth: 1, borderRadius: 12, paddingHorizontal: 6, minHeight: 40 }
});
