import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { PiggyBank } from '../../icons';

import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../Common/Toast';
import { Card, IconTile, formatAmount } from '../Common/ui';
import { confirmSaving, listPendingSavings, skipSaving, type PendingSaving } from '../../api/business';
import { currencySymbol } from '../../utils/format';
import { type } from '../../theme/typography';
import { errorMessage } from '../../lib/errorMessage';

const CHEERS = ['Well done o 💪', 'Your goal is growing 🌱', 'Nice one 🎉'];

/**
 * Auto-save only suggests an amount. Nothing counts until the person says they actually moved the money,
 * and then it lands in the goal and as a Savings entry in the budget.
 */
export function PendingSavingsCard({ goalId, onAnswered }: { goalId?: string; onAnswered?: () => void }) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const glyph = currencySymbol(user?.currency);
  const [items, setItems] = useState<PendingSaving[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listPendingSavings()
        .then((list) => !cancelled && setItems(goalId ? list.filter((i) => i.goal.id === goalId) : list))
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, [goalId])
  );

  if (!items.length) return null;

  const answer = async (item: PendingSaving, action: 'confirm' | 'skip') => {
    setBusy(item.id);
    try {
      if (action === 'confirm') {
        const res = await confirmSaving(item.id);
        toast.show(`${CHEERS[Math.floor(Math.random() * CHEERS.length)]} ${formatAmount(res.amount, glyph)} added to ${item.goal.name}.`, 'success', 3500);
      } else {
        await skipSaving(item.id);
        toast.show('No wahala. We’ll try again next payday 👍', 'info');
      }
      setItems((list) => list.filter((x) => x.id !== item.id));
      onAnswered?.();
    } catch (e) {
      toast.show(errorMessage(e, 'Could not update that'), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ marginTop: 14, gap: 10 }}>
      {items.slice(0, 3).map((item) => (
        <Card key={item.id}>
          <View style={styles.row}>
            <IconTile bg={theme.colors.successSoft} size={38}>
              <PiggyBank color={theme.colors.success} size={19} />
            </IconTile>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[type.bodyStrong, { color: theme.colors.text }]}>
                Did you move {formatAmount(item.amount, glyph)} to {item.goal.emoji ? `${item.goal.emoji} ` : ''}
                {item.goal.name}?
              </Text>
              <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 3 }]}>
                {item.source === 'autosave' ? 'Your auto-save from income. ' : ''}Once it’s in your savings account, tap “I moved it” and it counts toward the goal and your Savings budget.
              </Text>
              <View style={[styles.row, { marginTop: 12, gap: 8 }]}>
                <Pressable
                  disabled={!!busy}
                  onPress={() => void answer(item, 'confirm')}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.pill, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 }]}
                >
                  {busy === item.id ? <ActivityIndicator color={theme.colors.onPrimary} size="small" /> : <Text style={[type.smallStrong, { color: theme.colors.onPrimary }]}>I moved it</Text>}
                </Pressable>
                <Pressable
                  disabled={!!busy}
                  onPress={() => void answer(item, 'skip')}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.pill, { backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={[type.smallStrong, { color: theme.colors.text }]}>Not this time</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  pill: { height: 36, minWidth: 96, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }
});
