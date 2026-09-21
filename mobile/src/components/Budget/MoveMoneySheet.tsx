import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRightLeft } from '../../icons';
import { patchBudgetInSpace, type ApiBudget } from '../../api/endpoints';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../Common/Toast';
import { formatAmount, PrimaryButton, SecondaryButton, TextField } from '../Common/ui';
import { bucketDisplayName, normalizeBucket } from '../../theme/buckets';
import { bucketColor } from '../../theme/theme';
import { fonts, type } from '../../theme/typography';

type Props = {
  visible: boolean;
  onClose: () => void;
  budget: ApiBudget;
  /** Spent so far in each bucket of this budget, keyed like budget.categories. */
  spent: Record<string, number>;
  /** Opened from a bucket that is over: move money into it, starting with the overspend. */
  to?: string;
  amount?: number;
  glyph: string;
  isBusiness?: boolean;
  onMoved: (budget: ApiBudget) => void;
};

/**
 * Moves budgeted money from one bucket to another inside the same budget. The total stays the same, so a
 * price rise on a need is paid for by choosing what gives way, not by pretending there is more money.
 */
export function MoveMoneySheet({ visible, onClose, budget, spent, to: toProp, amount: amountProp, glyph, isBusiness = false, onMoved }: Props) {
  const { theme } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const keys = useMemo(() => Object.keys(budget.categories || {}), [budget.categories]);
  const budgeted = (k: string) => Number(budget.categories?.[k]?.budgeted) || 0;
  const room = (k: string) => budgeted(k) - (spent[k] ?? 0);
  const label = (k: string) => bucketDisplayName(k, isBusiness);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amountText, setAmountText] = useState('');
  const [saving, setSaving] = useState(false);

  // Each opening starts fresh: into the bucket that is over, out of the one with the most room.
  // Savings gives way last, because taking from it slows every goal.
  useEffect(() => {
    if (!visible) return;
    const target = toProp && keys.includes(toProp) ? toProp : keys.find((k) => room(k) < 0) ?? keys[0] ?? '';
    const others = keys.filter((k) => k !== target);
    const byRoom = [...others].sort((a, b) => {
      const sa = normalizeBucket(a) === 'Savings' ? 1 : 0;
      const sb = normalizeBucket(b) === 'Savings' ? 1 : 0;
      return sa - sb || room(b) - room(a);
    });
    const source = byRoom.find((k) => room(k) > 0) ?? byRoom[0] ?? '';
    setTo(target);
    setFrom(source);
    const need = amountProp ?? Math.max(0, -room(target));
    const suggested = need > 0 && source && room(source) > 0 ? Math.min(need, room(source)) : need;
    setAmountText(suggested > 0 ? String(Math.round(suggested)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const amount = Number(amountText.replace(/[^\d]/g, '')) || 0;
  const tooMuch = !!from && amount > budgeted(from);
  const leavesOver = !!from && !tooMuch && amount > room(from);
  const canMove = !!from && !!to && from !== to && amount > 0 && !tooMuch && !saving;

  const pick = (which: 'from' | 'to', k: string) => {
    if (which === 'from') {
      setFrom(k);
      if (k === to) setTo(keys.find((x) => x !== k) ?? '');
    } else {
      setTo(k);
      if (k === from) setFrom(keys.find((x) => x !== k) ?? '');
    }
  };

  const move = async () => {
    if (!canMove) return;
    setSaving(true);
    try {
      const categories: Record<string, { budgeted: number }> = {};
      for (const k of keys) categories[k] = { budgeted: budgeted(k) };
      categories[from] = { budgeted: budgeted(from) - amount };
      categories[to] = { budgeted: budgeted(to) + amount };
      const updated = (await patchBudgetInSpace(budget.id, { categories }, budget.spaceId)) as ApiBudget;
      toast.show(`Moved ${formatAmount(amount, glyph)} from ${label(from)} to ${label(to)}.`, 'success');
      onMoved(updated);
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not move that money. Try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const Picker = ({ which, value }: { which: 'from' | 'to'; value: string }) => (
    <View style={styles.pills}>
      {keys.map((k) => {
        const on = k === value;
        const color = bucketColor(theme, k);
        return (
          <Pressable
            key={k}
            onPress={() => pick(which, k)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${which === 'from' ? 'Take from' : 'Move to'} ${label(k)}`}
            style={[styles.pill, { borderColor: on ? color : theme.colors.border, backgroundColor: on ? theme.colors.surfaceAlt : 'transparent' }]}
          >
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={[type.smallStrong, { color: theme.colors.text }]}>{label(k)}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const Change = ({ k, delta }: { k: string; delta: number }) => {
    const after = budgeted(k) + delta;
    const leftAfter = after - (spent[k] ?? 0);
    return (
      <View style={styles.change}>
        <View style={[styles.dot, { backgroundColor: bucketColor(theme, k) }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{label(k)}</Text>
          <Text style={[type.caption, { color: leftAfter < 0 ? theme.colors.error : theme.colors.textMuted }]}>
            {leftAfter < 0 ? `Over by ${formatAmount(-leftAfter, glyph)} after` : `${formatAmount(leftAfter, glyph)} left after`}
          </Text>
        </View>
        <Text style={[type.small, { color: theme.colors.textMuted }]}>
          {formatAmount(budgeted(k), glyph)} <Text style={{ fontFamily: fonts.semibold, color: theme.colors.text }}>→ {formatAmount(after, glyph)}</Text>
        </Text>
      </View>
    );
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={onClose}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ArrowRightLeft color={theme.colors.primary} size={20} />
                <Text style={[type.title, { color: theme.colors.text }]}>Move money</Text>
              </View>
              <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 6, marginBottom: 16 }]}>
                Something cost more than planned? Cover it from another bucket. Your total budget stays {formatAmount(Number(budget.totalBudget) || 0, glyph)}.
              </Text>

              <Text style={[type.smallStrong, { color: theme.colors.text, marginBottom: 8 }]}>Move into</Text>
              <Picker which="to" value={to} />
              <Text style={[type.smallStrong, { color: theme.colors.text, marginTop: 14, marginBottom: 8 }]}>Take it from</Text>
              <Picker which="from" value={from} />

              <View style={{ marginTop: 16 }}>
                <TextField
                  label="How much"
                  value={amount ? amount.toLocaleString('en-NG') : ''}
                  onChangeText={(t) => setAmountText(t.replace(/[^\d]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="0"
                  right={<Text style={[type.bodyStrong, { color: theme.colors.textMuted, paddingRight: 12 }]}>{glyph}</Text>}
                  error={tooMuch ? `${label(from)} only has ${formatAmount(budgeted(from), glyph)} to give.` : null}
                  hint={
                    leavesOver
                      ? `${label(from)} has already spent some of this, so it will go over.`
                      : normalizeBucket(from) === 'Savings'
                        ? 'Taking from savings slows your goals. Use it when nothing else can give.'
                        : undefined
                  }
                />
              </View>

              {from && to && from !== to && amount > 0 && !tooMuch ? (
                <View style={[styles.preview, { borderColor: theme.colors.border }]}>
                  <Change k={to} delta={amount} />
                  <View style={[styles.hr, { backgroundColor: theme.colors.border }]} />
                  <Change k={from} delta={-amount} />
                </View>
              ) : null}

              <PrimaryButton title={amount > 0 ? `Move ${formatAmount(amount, glyph)}` : 'Move money'} onPress={move} loading={saving} disabled={!canMove} style={{ marginTop: 18 }} />
              <SecondaryButton title="Cancel" onPress={onClose} style={{ marginTop: 10 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },
  dot: { width: 10, height: 10, borderRadius: 3 },
  preview: { marginTop: 4, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4 },
  change: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  hr: { height: StyleSheet.hairlineWidth }
});
