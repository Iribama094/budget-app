import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { refundTransaction, type ApiTransaction } from '../../api/endpoints';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../Common/Toast';
import { PrimaryButton, TextButton, TextField } from '../Common/ui';
import { formatMoney } from '../../utils/format';
import { type } from '../../theme/typography';

/**
 * "Got money back?" on an expense. A refund makes the expense cost less instead of counting as income;
 * getting all of it back removes the expense.
 */
export function RefundRow({ tx, currency, spaceId, onDone }: { tx: ApiTransaction; currency: string; spaceId?: 'personal' | 'business'; onDone: (updated: ApiTransaction | null) => void }) {
  const { theme } = useTheme();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  if (tx.type !== 'expense') return null;

  const amount = Number(text.replace(/[^\d.]/g, '')) || 0;
  const tooMuch = amount > tx.amount;

  const apply = async () => {
    if (!amount || tooMuch) return;
    setBusy(true);
    try {
      const updated = await refundTransaction(tx.id, amount, spaceId);
      toast.show(updated ? `${formatMoney(amount, currency)} taken off. It now cost ${formatMoney(updated.amount, currency)}.` : 'All of it came back, so it no longer counts as spending.', 'success');
      setOpen(false);
      setText('');
      onDone(updated);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not record that refund', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginTop: 12 }}>
      {tx.refundedAmount ? (
        <Text style={[type.caption, { color: theme.colors.textMuted, marginBottom: 6 }]}>{formatMoney(tx.refundedAmount, currency)} was given back on this.</Text>
      ) : null}
      {open ? (
        <>
          <TextField
            label="How much came back?"
            value={text}
            onChangeText={setText}
            keyboardType="decimal-pad"
            placeholder={String(tx.amount)}
            autoFocus
            error={tooMuch ? `That's more than this cost (${formatMoney(tx.amount, currency)}).` : null}
            hint="It comes off this payment. It doesn't count as income."
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <PrimaryButton title="Take it off" onPress={apply} loading={busy} disabled={!amount || tooMuch} style={{ flex: 1 }} />
            <TextButton title="Cancel" onPress={() => setOpen(false)} />
          </View>
        </>
      ) : (
        <TextButton
          title="Got money back?"
          onPress={() => {
            setText(String(tx.amount));
            setOpen(true);
          }}
          style={{ alignItems: 'flex-start' }}
        />
      )}
    </View>
  );
}
