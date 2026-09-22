import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Landmark, Plus, Receipt } from '../icons';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { useAmountVisibility } from '../contexts/AmountVisibilityContext';
import { Amount, EmptyState, HeroCard, IconTile, InlineError, ListCard, ListRow, PrimaryButton, Screen, ScreenHeader, SecondaryButton, SegmentedControl, TextField, formatAmount } from '../components/Common/ui';
import { SelectField } from '../components/Common/SelectField';
import { DateChoice, LineItem, MoneyField, Sheet, StatusChip, addDaysIso, dueText, isIsoDate, moneyText, parseMoney, todayIso } from '../components/Business/parts';
import { createBill, deleteBill, listBills, payBill, updateBill, type SupplierBill } from '../api/business';
import { currencySymbol, formatShortDate } from '../utils/format';
import { type } from '../theme/typography';
import { GuideAnchor } from '../components/Common/GuideAnchor';
import { goBackOrHome } from '../navigation/goBack';

type Filter = 'open' | 'paid' | 'all';
const CATEGORIES = ['Stock & supplies', 'Rent', 'Utilities', 'Transport & logistics', 'Marketing', 'Equipment', 'Professional fees', 'Other'];

type Draft = { id: string | null; supplierName: string; description: string; category: string; amount: string; dueDate: string; notes: string };
const blank = (): Draft => ({ id: null, supplierName: '', description: '', category: CATEGORIES[0], amount: '', dueDate: addDaysIso(7), notes: '' });

/** What the business owes: supplier bills, and PAYE recorded from payroll. */
export default function BillsScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const { showAmounts } = useAmountVisibility();
  const glyph = currencySymbol(user?.currency);
  const hide = !showAmounts;
  const inkText = theme.colors.inkText;

  const [filter, setFilter] = useState<Filter>('open');
  const [items, setItems] = useState<SupplierBill[]>([]);
  const [totals, setTotals] = useState({ owe: 0, dueThisWeek: 0, overdueCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<SupplierBill | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await listBills('all');
      setItems(res.items);
      setTotals(res.totals);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load bills');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const shown = items.filter((b) => (filter === 'all' ? true : filter === 'paid' ? b.status === 'paid' : b.status === 'unpaid' || b.status === 'part_paid'));

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Something went wrong', 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = () =>
    act(async () => {
      if (!draft) return;
      const amount = parseMoney(draft.amount);
      if (!draft.supplierName.trim()) throw new Error('Who is the bill from?');
      if (amount <= 0) throw new Error('Enter the amount on the bill');
      if (!isIsoDate(draft.dueDate)) throw new Error('Choose when it’s due');
      const payload = { supplierName: draft.supplierName.trim(), description: draft.description.trim(), category: draft.category, amount, dueDate: draft.dueDate, notes: draft.notes.trim() || null };
      if (draft.id) await updateBill(draft.id, payload);
      else await createBill(payload);
      setDraft(null);
      toast.show(draft.id ? 'Bill updated' : `Saved. We’ll remind you before it’s due 📅`, 'success');
      await load();
    });

  const openBill = (b: SupplierBill) => {
    setSelected(b);
    setPayAmount(moneyText(b.balance));
    setPayDate(todayIso());
  };

  const pay = () =>
    act(async () => {
      if (!selected) return;
      const amount = parseMoney(payAmount);
      if (amount <= 0) throw new Error('Enter how much you paid');
      await payBill(selected.id, { amount, paidOn: payDate });
      toast.show(`${formatAmount(amount, glyph)} to ${selected.supplierName} recorded as a cost ✅`, 'success');
      setSelected(null);
      await load();
    });

  const edit = (b: SupplierBill) => {
    setSelected(null);
    setDraft({ id: b.id, supplierName: b.supplierName, description: b.description, category: b.category, amount: moneyText(b.amount), dueDate: b.dueDate, notes: b.notes ?? '' });
  };

  const removeOrVoid = (b: SupplierBill) => {
    const canDelete = b.amountPaid === 0;
    Alert.alert(canDelete ? 'Delete this bill?' : 'Void this bill?', canDelete ? 'It will be removed from what you owe.' : 'Payments already recorded stay in your costs.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: canDelete ? 'Delete' : 'Void',
        style: 'destructive',
        onPress: () =>
          void act(async () => {
            if (canDelete) await deleteBill(b.id);
            else await updateBill(b.id, { status: 'void' });
            setSelected(null);
            await load();
          })
      }
    ]);
  };

  const open = selected && (selected.status === 'unpaid' || selected.status === 'part_paid');

  return (
    <Screen bottomInset={48} onRefresh={load} refreshing={false}>
      <ScreenHeader
        title="Supplier bills"
        subtitle="What you owe the people you buy from"
        onBack={() => goBackOrHome(nav)}
        right={
          <Pressable onPress={() => setDraft(blank())} accessibilityRole="button" accessibilityLabel="Add a bill" style={({ pressed }) => [styles.newPill, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 }]}>
            <Plus color={theme.colors.onPrimary} size={16} strokeWidth={2.6} />
            <Text style={[type.smallStrong, { color: theme.colors.onPrimary }]}>Add</Text>
          </Pressable>
        }
      />
      {error ? <InlineError message={error} /> : null}

      <GuideAnchor id="bills.hero">
      <HeroCard style={{ marginTop: 8 }}>
        <Text style={[type.eyebrow, { color: inkText, opacity: 0.72 }]}>You owe</Text>
        <Amount value={totals.owe} currency={glyph} size="hero" color={inkText} hidden={hide} style={{ marginTop: 8 }} />
        <Text style={[type.small, { color: inkText, opacity: 0.78 }]}>
          {totals.overdueCount
            ? `${totals.overdueCount} bill${totals.overdueCount === 1 ? ' is' : 's are'} past due. Sort it before the supplier starts calling 😅`
            : totals.dueThisWeek > 0
              ? `${hide ? '••••' : formatAmount(totals.dueThisWeek, glyph)} is due in the next 7 days. Make sure the money is ready.`
              : totals.owe > 0
                ? 'Nothing due this week. You’re in control 👌'
                : 'No open bills. Clean slate 🙌'}
        </Text>
      </HeroCard>
      </GuideAnchor>

      <SegmentedControl
        style={{ marginTop: 16 }}
        options={[
          { key: 'open', label: 'To pay' },
          { key: 'paid', label: 'Paid' },
          { key: 'all', label: 'All' }
        ]}
        value={filter}
        onChange={setFilter}
      />

      <View style={{ marginTop: 12 }}>
        {loading ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 20 }} />
        ) : shown.length ? (
          <ListCard>
            {shown.map((b) => {
              const Icon = b.kind === 'paye' || b.kind === 'vat' ? Landmark : Receipt;
              const isOpen = b.status === 'unpaid' || b.status === 'part_paid';
              return (
                <ListRow
                  key={b.id}
                  icon={
                    <IconTile bg={b.overdue ? theme.colors.errorSoft : theme.colors.brassSoft} size={40}>
                      <Icon color={b.overdue ? theme.colors.error : theme.colors.brass} size={19} />
                    </IconTile>
                  }
                  title={b.supplierName}
                  subtitle={[b.description || b.category, isOpen ? dueText(b.dueInDays) : b.status === 'paid' ? 'paid' : 'voided'].filter(Boolean).join(' · ')}
                  right={
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Amount value={isOpen ? b.balance : b.amount} currency={glyph} size="sm" hidden={hide} />
                      <StatusChip status={b.status} overdue={b.overdue} dueInDays={b.dueInDays} />
                    </View>
                  }
                  onPress={() => openBill(b)}
                />
              );
            })}
          </ListCard>
        ) : (
          <EmptyState
            title={filter === 'paid' ? 'No paid bills yet' : 'Nothing to pay'}
            body="Add supplier invoices, rent or any bill you need to pay. We’ll remind you before it’s due, and paying it records the cost."
            actionLabel="Add a bill"
            onAction={() => setDraft(blank())}
          />
        )}
      </View>

      <Sheet visible={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit bill' : 'Add a bill'} subtitle="Record it now, pay it when it’s due">
        {draft ? (
          <>
            <TextField label="From" value={draft.supplierName} onChangeText={(v) => setDraft({ ...draft, supplierName: v })} placeholder="e.g. Golden Flour Mills" />
            <TextField label="What for (optional)" value={draft.description} onChangeText={(v) => setDraft({ ...draft, description: v })} placeholder="e.g. 20 bags of flour" />
            <MoneyField label="Amount" value={draft.amount} onChange={(v) => setDraft({ ...draft, amount: v })} glyph={glyph} />
            <SelectField label="Category" value={draft.category} options={CATEGORIES.map((c) => ({ value: c, label: c }))} onChange={(c) => setDraft({ ...draft, category: c })} />
            <View>
              <DateChoice
                label="Due"
                value={draft.dueDate}
                onChange={(v) => setDraft({ ...draft, dueDate: v })}
                presets={[
                  { label: 'Today', days: 0 },
                  { label: '7 days', days: 7 },
                  { label: '14 days', days: 14 },
                  { label: '30 days', days: 30 }
                ]}
              />
            </View>
            <PrimaryButton title={draft.id ? 'Save changes' : 'Save bill'} onPress={saveDraft} loading={busy} />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.supplierName ?? ''} subtitle={selected ? [selected.description, selected.category].filter(Boolean).join(' · ') : undefined}>
        {selected ? (
          <>
            <LineItem label="Bill amount" value={formatAmount(selected.amount, glyph)} />
            {selected.amountPaid > 0 ? <LineItem label="Paid so far" value={formatAmount(selected.amountPaid, glyph)} color={theme.colors.success} /> : null}
            <LineItem label="Due" value={`${formatShortDate(selected.dueDate)}${open ? ` (${dueText(selected.dueInDays)})` : ''}`} />
            {selected.kind === 'paye' ? (
              <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 6 }]}>PAYE withheld from staff pay. Remit it to the tax office, then record the payment here.</Text>
            ) : null}
            {open ? (
              <View style={{ marginTop: 16 }}>
                <MoneyField label="Amount paid" value={payAmount} onChange={setPayAmount} glyph={glyph} hint={`Balance ${formatAmount(selected.balance, glyph)}`} />
                <DateChoice
                  label="Paid on"
                  value={payDate}
                  onChange={setPayDate}
                  presets={[
                    { label: 'Today', days: 0 },
                    { label: 'Yesterday', days: -1 }
                  ]}
                />
                <PrimaryButton title="Record payment" onPress={pay} loading={busy} />
              </View>
            ) : null}
            <View style={[styles.row, { marginTop: 10 }]}>
              {selected.amountPaid === 0 && selected.status !== 'void' ? <SecondaryButton title="Edit" onPress={() => edit(selected)} style={{ flex: 1 }} /> : null}
              {selected.status !== 'paid' && selected.status !== 'void' ? <SecondaryButton title={selected.amountPaid === 0 ? 'Delete' : 'Void'} onPress={() => removeOrVoid(selected)} style={{ flex: 1 }} /> : null}
            </View>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  newPill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingLeft: 10, paddingRight: 14, borderRadius: 18 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 10 }
});
