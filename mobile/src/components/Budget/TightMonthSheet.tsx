import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { getBudgetPace, patchBudgetInSpace, type ApiBudget, type ApiBudgetPace } from '../../api/endpoints';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../Common/Toast';
import { PrimaryButton, formatAmount } from '../Common/ui';
import { PlainList } from '../Common/PlainList';
import { DateChoice, Sheet } from '../Business/parts';
import { TIER_LABEL, billTier } from '../../lib/billPriority';
import { formatShortDate, toIsoDate } from '../../utils/format';
import { type } from '../../theme/typography';

/**
 * When money is tight: how long it lasts at this pace, what a day can cost to reach the end, which bills come
 * first, and "my pay is late", which moves the end of the budget so the daily amount is honest.
 */
export function TightMonthSheet({
  visible,
  onClose,
  budget,
  spent,
  elapsed,
  glyph,
  onChanged
}: {
  visible: boolean;
  onClose: () => void;
  budget: ApiBudget;
  spent: number;
  elapsed: number;
  glyph: string;
  onChanged: () => void;
}) {
  const { theme } = useTheme();
  const toast = useToast();
  const [pace, setPace] = useState<ApiBudgetPace | null>(null);
  const [late, setLate] = useState(false);
  const [newEnd, setNewEnd] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLate(false);
    setNewEnd('');
    getBudgetPace(budget.id).then(setPace).catch(() => setPace(null));
  }, [visible, budget.id]);

  const left = pace?.left ?? Number(budget.totalBudget) - spent;
  const daysLeft = pace?.daysLeft ?? 0;
  const rate = elapsed > 0 ? spent / elapsed : 0;
  const lasts = rate > 0 ? Math.max(0, Math.floor(left / rate)) : null;
  const perDay = daysLeft > 0 ? Math.max(0, Math.floor((left - (pace?.billsTotal ?? 0)) / daysLeft)) : 0;
  const bills = [...(pace?.bills ?? [])].sort((a, b) => {
    const order = { must: 0, reduce: 1, pause: 2 } as const;
    return order[billTier({ name: a.name, category: a.name })] - order[billTier({ name: b.name, category: b.name })];
  });

  const moveEnd = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newEnd)) return;
    setBusy(true);
    try {
      await patchBudgetInSpace(budget.id, { endDate: newEnd }, budget.spaceId);
      toast.show(`Your budget now runs to ${formatShortDate(newEnd)}. The daily amount has been worked out again.`, 'success', 4000);
      onChanged();
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not move the date', 'error');
    } finally {
      setBusy(false);
    }
  };

  const end = budget.endDate ?? null;
  return (
    <Sheet visible={visible} onClose={onClose} title="Money is tight" subtitle="What to protect, and how to make it last">
      <Text style={[type.body, { color: theme.colors.text }]}>
        {left <= 0
          ? `You’re ${formatAmount(-left, glyph)} over this budget.`
          : lasts != null && lasts < daysLeft
            ? `At this pace, what’s left lasts about ${lasts} day${lasts === 1 ? '' : 's'}. The budget has ${daysLeft} to go.`
            : `${formatAmount(left, glyph)} left for ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`}
      </Text>
      {left > 0 && daysLeft > 0 ? (
        <Text style={[type.bodyStrong, { color: theme.colors.text, marginTop: 8 }]}>
          Keep to about {formatAmount(perDay, glyph)} a day{pace?.billsTotal ? ', after the bills below' : ''}.
        </Text>
      ) : null}

      {bills.length ? (
        <>
          <Text style={[type.eyebrow, { color: theme.colors.textMuted, marginTop: 20, marginBottom: 4 }]}>Bills before the end, in the order to pay</Text>
          <PlainList>
            {bills.map((b) => (
              <View key={`${b.name}${b.dueDate}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[type.bodyStrong, { color: theme.colors.text }]}>{b.name}</Text>
                  <Text style={[type.caption, { color: theme.colors.textMuted }]}>
                    {TIER_LABEL[billTier({ name: b.name, category: b.name })]} · {formatShortDate(b.dueDate)}
                  </Text>
                </View>
                <Text style={[type.smallStrong, { color: theme.colors.text }]}>{formatAmount(b.amount, glyph)}</Text>
              </View>
            ))}
          </PlainList>
        </>
      ) : null}

      <View style={{ marginTop: 20 }}>
        {late ? (
          <>
            <DateChoice
              label="When do you now expect to be paid?"
              value={newEnd}
              onChange={setNewEnd}
              presets={[
                { label: 'In 3 days', days: 3 },
                { label: 'In a week', days: 7 },
                { label: 'In 2 weeks', days: 14 }
              ]}
            />
            <PrimaryButton title="Stretch my budget to then" onPress={moveEnd} loading={busy} disabled={!/^\d{4}-\d{2}-\d{2}$/.test(newEnd) || (!!end && newEnd <= end) || newEnd <= toIsoDate(new Date())} />
          </>
        ) : (
          <PrimaryButton title="My pay is late" onPress={() => setLate(true)} />
        )}
      </View>
    </Sheet>
  );
}
