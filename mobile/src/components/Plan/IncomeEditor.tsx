import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { SegmentedControl } from '../Common/ui';
import { SelectField, type SelectOption } from '../Common/SelectField';
import { ChoiceChip } from './ChoiceChip';
import { FREQUENCY_WORD, INCOME_FREQUENCIES, INCOME_KINDS, kindLabel, ordinal, WEEKDAYS, type DraftIncome } from '../../lib/planDrafts';
import { formatNumberInput } from '../../utils/format';
import { fonts, type } from '../../theme/typography';

// Every day of the month, so someone paid on the 30th can pick it. 31 means "the last day".
const PAY_DAY_OPTIONS: Array<SelectOption<number | null>> = [
  { value: null, label: 'Not sure' },
  ...Array.from({ length: 30 }, (_, i) => ({ value: i + 1, label: `${ordinal(i + 1)} of the month` })),
  { value: 31, label: 'Last day of the month' }
];

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
        <SelectField
          label="Which day are you usually paid?"
          sheetTitle="Payday"
          value={value.payDay ?? null}
          options={PAY_DAY_OPTIONS}
          onChange={(d) => set({ payDay: d })}
          hint="If it moves around, pick the usual day. Weekends and holidays are fine."
          style={{ marginTop: 16, marginBottom: 0 }}
        />
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
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  label: { marginTop: 16, marginBottom: 8 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 50 },
  inputText: { flex: 1, fontFamily: fonts.medium, fontSize: 16, paddingVertical: 10 }
});
