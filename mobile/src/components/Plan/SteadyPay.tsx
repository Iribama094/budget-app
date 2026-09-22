import React, { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createGoal, listGoals, type ApiGoal } from '../../api/endpoints';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../Common/Toast';
import { ListRow, PrimaryButton, formatAmount } from '../Common/ui';
import { MoneyField, Sheet, moneyText, parseMoney } from '../Business/parts';
import { toIsoDate } from '../../utils/format';
import { type } from '../../theme/typography';
import { afterSheetCloses } from '../../lib/afterSheetCloses';

/**
 * Steady pay, for income that comes in lumps (freelance work, a harvest, a gratuity, a good month in trade):
 * the lumps go into a buffer, and the buffer pays you the same amount every month. One row, one sheet.
 */
export function SteadyPay({ glyph, suggested }: { glyph: string; suggested: number }) {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const toast = useToast();
  const [buffer, setBuffer] = useState<ApiGoal | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [draw, setDraw] = useState('');
  const [start, setStart] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listGoals({ spaceId: 'personal' })
      .then((goals) => setBuffer(goals.find((g) => g.kind === 'buffer') ?? null))
      .catch(() => setBuffer(null));
  }, []);
  useEffect(load, [load]);

  if (buffer === undefined) return null;

  const create = async () => {
    const monthly = parseMoney(draw);
    if (!(monthly > 0)) return toast.show('Pick what you’d like to pay yourself each month', 'error');
    setBusy(true);
    try {
      const inAYear = new Date();
      inAYear.setFullYear(inAYear.getFullYear() + 1);
      const goal = await createGoal({
        name: 'Income buffer',
        // Three months of pay is a comfortable cushion. It can hold more.
        targetAmount: monthly * 3,
        targetDate: toIsoDate(inAYear),
        currentAmount: parseMoney(start) || 0,
        emoji: '🌊',
        kind: 'buffer',
        monthlyDraw: monthly
      });
      setOpen(false);
      toast.show('Steady pay is on. Put good months in the buffer; pay yourself from it each month.', 'success', 4500);
      afterSheetCloses(() => nav.navigate('GoalDetail', { goalId: goal.id, goal }));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not set that up', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ListRow
        title="Steady pay"
        subtitle={
          buffer
            ? `${formatAmount(buffer.monthlyDraw ?? 0, glyph)} a month · ${formatAmount(buffer.currentAmount, glyph)} in your buffer`
            : 'Smooth out months that are big one time, small the next'
        }
        onPress={() => {
          if (buffer) nav.navigate('GoalDetail', { goalId: buffer.id, goal: buffer });
          else {
            setDraw(suggested > 0 ? moneyText(Math.round(suggested / 1000) * 1000) : '');
            setStart('');
            setOpen(true);
          }
        }}
        chevron
      />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Steady pay" subtitle="The same amount every month, whatever came in">
        <Text style={[type.small, { color: theme.colors.textMuted, marginBottom: 14 }]}>
          Big month: the extra goes into your buffer. Quiet month: you top up from it. Pick a monthly amount you could live on in a quiet month.
        </Text>
        <MoneyField label="Pay myself each month" value={draw} onChange={setDraw} glyph={glyph} autoFocus />
        <MoneyField label="Already set aside (optional)" value={start} onChange={setStart} glyph={glyph} hint="A gratuity, a harvest or savings you want to spread out." />
        <PrimaryButton title="Turn on steady pay" onPress={create} loading={busy} />
      </Sheet>
    </>
  );
}
