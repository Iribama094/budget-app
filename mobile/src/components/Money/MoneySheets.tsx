import React, { useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { createDebt, createHolding, deleteDebt, deleteHolding, payDebt, setRates, updateDebt, updateHolding, type ApiDebt, type ApiHolding, type HoldingKind } from '../../api/money';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../Common/Toast';
import { PrimaryButton, SecondaryButton, TextField, formatAmount } from '../Common/ui';
import { ChoiceChip } from '../Plan/ChoiceChip';
import { DateChoice, MoneyField, Sheet, moneyText, parseMoney } from '../Business/parts';
import { formatShortDate } from '../../utils/format';
import { type } from '../../theme/typography';
import { errorMessage } from '../../lib/errorMessage';

export const HAVE_KINDS: Array<{ key: HoldingKind; label: string }> = [
  { key: 'cash', label: 'Cash' },
  { key: 'bank', label: 'Bank account' },
  { key: 'wallet', label: 'Wallet (OPay, PalmPay…)' }
];
export const OWN_KINDS: Array<{ key: HoldingKind; label: string }> = [
  { key: 'land', label: 'Land' },
  { key: 'property', label: 'House or flat' },
  { key: 'vehicle', label: 'Car or bike' },
  { key: 'investment', label: 'Shares, T-bills, funds' },
  { key: 'pension', label: 'Pension' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'other', label: 'Something else' }
];
const CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR', 'CAD'];

/** Add or update cash, an account, a wallet or something you own. The balance is just what you say it is now. */
export function HoldingSheet({
  visible,
  onClose,
  group,
  holding,
  home,
  glyph,
  spaceId,
  onSaved
}: {
  visible: boolean;
  onClose: () => void;
  group: 'have' | 'own';
  holding: ApiHolding | null;
  home: string;
  glyph: string;
  spaceId?: 'personal' | 'business';
  onSaved: () => void;
}) {
  const toast = useToast();
  const kinds = group === 'have' ? HAVE_KINDS : OWN_KINDS;
  const [name, setName] = useState('');
  const [kind, setKind] = useState<HoldingKind>(kinds[0].key);
  const [currency, setCurrency] = useState(home);
  const [balance, setBalance] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(holding?.name ?? '');
    setKind(holding?.kind ?? kinds[0].key);
    setCurrency(holding?.currency ?? home);
    setBalance(holding ? moneyText(holding.balance) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const label = kinds.find((k) => k.key === kind)?.label ?? '';
  const save = async () => {
    const amount = parseMoney(balance);
    const finalName = name.trim() || label.replace(/ \(.*\)$/, '');
    setBusy(true);
    try {
      if (holding) await updateHolding(holding.id, { name: finalName, kind, currency, balance: amount });
      else await createHolding({ name: finalName, kind, currency, balance: amount, spaceId });
      onSaved();
      onClose();
    } catch (e) {
      toast.show(errorMessage(e, 'Could not save that'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!holding) return;
    Alert.alert(`Remove ${holding.name}?`, 'It stops counting in your money. Nothing else changes.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteHolding(holding.id).catch(() => undefined);
          onSaved();
          onClose();
        }
      }
    ]);
  };

  const sym = currency === home ? glyph : currency;
  return (
    <Sheet visible={visible} onClose={onClose} title={holding ? `Update ${holding.name}` : group === 'have' ? 'Add cash or an account' : 'Add something you own'} subtitle={holding ? 'Type what it holds or is worth today.' : undefined}>
      {!holding ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {kinds.map((k) => (
            <ChoiceChip key={k.key} label={k.label} active={kind === k.key} onPress={() => setKind(k.key)} />
          ))}
        </View>
      ) : null}
      <TextField label="Name" value={name} onChangeText={setName} placeholder={group === 'have' ? 'e.g. OPay, Cash at home' : 'e.g. Plot in Ibeju-Lekki'} maxLength={60} />
      <MoneyField label={group === 'have' ? 'What it holds now' : 'What it’s worth today'} value={balance} onChange={setBalance} glyph={sym} autoFocus={!!holding} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -4, marginBottom: 14 }}>
        {CURRENCIES.map((c) => (
          <ChoiceChip key={c} label={c} active={currency === c} onPress={() => setCurrency(c)} />
        ))}
      </View>
      <PrimaryButton title="Save" onPress={save} loading={busy} />
      {holding ? <SecondaryButton title="Remove" onPress={remove} style={{ marginTop: 10 }} /> : null}
    </Sheet>
  );
}

/** Someone you owe, or someone who owes you. */
export function DebtSheet({
  visible,
  onClose,
  direction,
  debt,
  openOwe,
  glyph,
  spaceId,
  onSaved
}: {
  visible: boolean;
  onClose: () => void;
  direction: 'owe' | 'owed';
  debt: ApiDebt | null;
  /** How many debts you already owe, for a gentle word before a new loan. */
  openOwe: number;
  glyph: string;
  spaceId?: 'personal' | 'business';
  onSaved: () => void;
}) {
  const { theme } = useTheme();
  const toast = useToast();
  const [person, setPerson] = useState('');
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState('');
  const [rate, setRate] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPerson(debt?.person ?? '');
    setAmount(debt ? moneyText(debt.amount) : '');
    setBalance(debt ? moneyText(debt.balance) : '');
    setRate(debt?.monthlyRate != null ? String(debt.monthlyRate) : '');
    setDue(debt?.dueDate ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const owe = (debt?.direction ?? direction) === 'owe';
  const save = async () => {
    const total = parseMoney(amount);
    if (!person.trim() || !(total > 0)) return toast.show(owe ? 'Add who you owe and how much' : 'Add who owes you and how much', 'error');
    const monthlyRate = rate.trim() ? Number(rate) : null;
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null;
    setBusy(true);
    try {
      if (debt) await updateDebt(debt.id, { person: person.trim(), amount: total, balance: parseMoney(balance), monthlyRate, dueDate });
      else await createDebt({ direction, person: person.trim(), amount: total, monthlyRate: owe ? monthlyRate : null, dueDate, spaceId });
      onSaved();
      onClose();
    } catch (e) {
      toast.show(errorMessage(e, 'Could not save that'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!debt) return;
    Alert.alert(`Remove ${debt.person}?`, 'Only the record goes. Payments already counted as spending stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteDebt(debt.id).catch(() => undefined);
          onSaved();
          onClose();
        }
      }
    ]);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={debt ? debt.person : owe ? 'I owe someone' : 'Someone owes me'}>
      {!debt && owe && openOwe > 0 ? (
        <Text style={[type.small, { color: theme.colors.textMuted, marginBottom: 14 }]}>
          You already owe {openOwe === 1 ? 'one other' : `${openOwe} others`}. If this new loan is to pay an old one, it usually ends up costing more. The list shows which to clear first.
        </Text>
      ) : null}
      <TextField label={owe ? 'Who you owe' : 'Who owes you'} value={person} onChangeText={setPerson} placeholder={owe ? 'e.g. Carbon, Cooperative, Uncle Femi' : 'e.g. Tunde'} maxLength={80} />
      <MoneyField label={debt ? 'How much it was' : 'How much'} value={amount} onChange={setAmount} glyph={glyph} />
      {debt ? <MoneyField label="Still to pay" value={balance} onChange={setBalance} glyph={glyph} /> : null}
      {owe ? (
        <TextField
          label="Interest per month, % (optional)"
          value={rate}
          onChangeText={(v) => setRate(v.replace(/[^\d.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="e.g. 15"
          hint="Loan apps usually say it per month. We use it only to say which to clear first."
        />
      ) : null}
      <DateChoice
        label={owe ? 'When it’s due (optional)' : 'When they said they’d pay (optional)'}
        value={due}
        onChange={setDue}
        presets={[
          { label: 'In a week', days: 7 },
          { label: 'In 2 weeks', days: 14 },
          { label: 'In a month', days: 30 }
        ]}
      />
      <PrimaryButton title="Save" onPress={save} loading={busy} />
      {debt ? <SecondaryButton title="Remove" onPress={remove} style={{ marginTop: 10 }} /> : null}
    </Sheet>
  );
}

/** A repayment: lowers what's left, and for money you owe, counts it as spending unless told not to. */
export function PayDebtSheet({ visible, onClose, debt, glyph, onSaved, onEdit }: { visible: boolean; onClose: () => void; debt: ApiDebt | null; glyph: string; onSaved: () => void; onEdit: () => void }) {
  const { theme } = useTheme();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [record, setRecord] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible && debt) {
      setAmount(moneyText(debt.balance));
      setRecord(debt.direction === 'owe');
    }
  }, [visible, debt]);

  if (!debt) return null;
  const owe = debt.direction === 'owe';
  const pay = async () => {
    const n = parseMoney(amount);
    if (!(n > 0)) return;
    setBusy(true);
    try {
      const updated = await payDebt(debt.id, { amount: n, record: owe ? record : false });
      toast.show(updated.closedAt ? (owe ? `${debt.person} is cleared 🎉` : `${debt.person} has paid you back in full 🎉`) : `${formatAmount(updated.balance, glyph)} left`, 'success');
      onSaved();
      onClose();
    } catch (e) {
      toast.show(errorMessage(e, 'Could not record that'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={owe ? `Pay ${debt.person}` : `${debt.person} paid you`}
      subtitle={`${formatAmount(debt.balance, glyph)} left${debt.dueDate ? ` · due ${formatShortDate(debt.dueDate)}` : ''}`}
    >
      <MoneyField label="How much" value={amount} onChange={setAmount} glyph={glyph} autoFocus />
      {owe ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Count it as spending</Text>
            <Text style={[type.caption, { color: theme.colors.textMuted }]}>So your budget knows the money has gone</Text>
          </View>
          <Switch value={record} onValueChange={setRecord} trackColor={{ true: theme.colors.primary, false: theme.colors.border }} thumbColor="#FFFFFF" />
        </View>
      ) : null}
      <PrimaryButton title="Record it" onPress={pay} loading={busy} />
      <SecondaryButton title="Edit details" onPress={onEdit} style={{ marginTop: 10 }} />
    </Sheet>
  );
}

/** The rates foreign money is counted at. Blank goes back to the app's rate. */
export function RatesSheet({ visible, onClose, currencies, rates, own, onSaved }: { visible: boolean; onClose: () => void; currencies: string[]; rates: Record<string, number>; own: Record<string, number>; onSaved: () => void }) {
  const toast = useToast();
  const { theme } = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (visible) setValues(Object.fromEntries(currencies.map((c) => [c, own[c] ? String(own[c]) : ''])));
  }, [visible, currencies, own]);

  const save = async () => {
    setBusy(true);
    try {
      await setRates(Object.fromEntries(currencies.map((c) => [c, values[c]?.trim() ? Number(values[c]) : null])));
      onSaved();
      onClose();
    } catch (e) {
      toast.show(errorMessage(e, 'Could not save the rates'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Exchange rates" subtitle="What one of each is worth to you in naira. Leave blank to use ours.">
      {currencies.map((c) => (
        <TextField
          key={c}
          label={`1 ${c}`}
          value={values[c] ?? ''}
          onChangeText={(v) => setValues({ ...values, [c]: v.replace(/[^\d.]/g, '') })}
          keyboardType="decimal-pad"
          placeholder={rates[c] && !own[c] ? String(rates[c]) : 'e.g. 1550'}
          hint={rates[c] && !own[c] ? `Using ours: ₦${rates[c].toLocaleString('en-NG')}` : undefined}
        />
      ))}
      {!currencies.length ? <Text style={[type.small, { color: theme.colors.textMuted, marginBottom: 14 }]}>Nothing here is in another currency yet.</Text> : null}
      <PrimaryButton title="Save" onPress={save} loading={busy} />
    </Sheet>
  );
}
