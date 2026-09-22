import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { deleteProperty, listProperties, recordRent, saveProperty, type ApiProperty } from '../api/money';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { InlineError, ListRow, PrimaryButton, Screen, ScreenHeader, SecondaryButton, TextField, formatAmount } from '../components/Common/ui';
import { AddLine, PlainHeader, PlainList } from '../components/Common/PlainList';
import { ChoiceChip } from '../components/Plan/ChoiceChip';
import { DateChoice, MoneyField, Sheet, moneyText, parseMoney } from '../components/Business/parts';
import { currencySymbol, formatShortDate } from '../utils/format';
import { type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';
import { errorMessage } from '../lib/errorMessage';
import { confirmDestructive } from '../lib/confirm';

const FREQ = { monthly: 'a month', quarterly: 'a quarter', yearly: 'a year' } as const;

/** For landlords: each property, its tenant, the rent and when it's due. Recording rent adds it as income. */
export default function PropertiesScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const glyph = currencySymbol(user?.currency);
  const [items, setItems] = useState<ApiProperty[]>([]);
  const [rentThisYear, setRentThisYear] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<ApiProperty | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', tenantName: '', tenantPhone: '', rent: '', frequency: 'yearly' as ApiProperty['frequency'], nextDue: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const res = await listProperties();
      setItems(res.items);
      setRentThisYear(res.rentThisYear);
    } catch (e) {
      setError(errorMessage(e, 'Could not load your properties'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const edit = (p: ApiProperty | 'new') => {
    const x = p === 'new' ? null : p;
    setForm({
      name: x?.name ?? '',
      tenantName: x?.tenantName ?? '',
      tenantPhone: x?.tenantPhone ?? '',
      rent: x ? moneyText(x.rentAmount) : '',
      frequency: x?.frequency ?? 'yearly',
      nextDue: x?.nextDue ?? ''
    });
    setOpen(p);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.show('Give the property a name', 'error');
    setBusy(true);
    try {
      await saveProperty(open === 'new' || !open ? null : open.id, {
        name: form.name.trim(),
        tenantName: form.tenantName.trim() || null,
        tenantPhone: form.tenantPhone.trim() || null,
        rentAmount: parseMoney(form.rent),
        frequency: form.frequency,
        nextDue: /^\d{4}-\d{2}-\d{2}$/.test(form.nextDue) ? form.nextDue : null
      });
      setOpen(null);
      await load();
    } catch (e) {
      toast.show(errorMessage(e, 'Could not save'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const paid = async (p: ApiProperty) => {
    setBusy(true);
    try {
      const next = await recordRent(p.id);
      setOpen(null);
      toast.show(`${formatAmount(p.rentAmount, glyph)} recorded.${next.nextDue ? ` Next due ${formatShortDate(next.nextDue)}.` : ''}`, 'success');
      await load();
    } catch (e) {
      toast.show(errorMessage(e, 'Could not record the rent'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const status = (p: ApiProperty) =>
    p.status === 'overdue' ? `Overdue since ${formatShortDate(p.nextDue!)}` : p.status === 'due_soon' ? `Due ${formatShortDate(p.nextDue!)}` : p.nextDue ? `Paid up · next ${formatShortDate(p.nextDue)}` : 'No due date yet';

  const current = open && open !== 'new' ? open : null;
  return (
    <Screen onRefresh={load} refreshing={loading} bottomInset={48}>
      <ScreenHeader title="Properties" subtitle="Rent, tenants and when it’s due" onBack={() => goBackOrHome(nav)} />
      {error ? <InlineError message={error} /> : null}

      {items.length ? (
        <View style={{ marginTop: 16 }}>
          <Text style={[type.eyebrow, { color: theme.colors.textMuted }]}>Rent received this year</Text>
          <Text style={[type.amountLg, { color: theme.colors.text, marginTop: 4 }]}>{formatAmount(rentThisYear, glyph)}</Text>
        </View>
      ) : null}

      <PlainHeader title="Your properties" right={items.filter((p) => p.status === 'overdue').length ? `${items.filter((p) => p.status === 'overdue').length} overdue` : undefined} />
      <PlainList>
        {items.map((p) => (
          <ListRow
            key={p.id}
            title={p.tenantName ? `${p.name} · ${p.tenantName}` : p.name}
            subtitle={status(p)}
            right={
              <Text style={[type.bodyStrong, { color: p.status === 'overdue' ? theme.colors.error : theme.colors.text }]}>
                {formatAmount(p.rentAmount, glyph)}
              </Text>
            }
            onPress={() => edit(p)}
          />
        ))}
      </PlainList>
      <AddLine label="Add a property" onPress={() => edit('new')} />

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={current ? current.name : 'Add a property'} subtitle={current ? status(current) : undefined}>
        {current && current.rentAmount > 0 ? (
          <PrimaryButton title={`Rent received: ${formatAmount(current.rentAmount, glyph)}`} onPress={() => paid(current)} loading={busy} style={{ marginBottom: 16 }} />
        ) : null}
        <TextField label="Property" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="e.g. Flat 2, Yaba" maxLength={80} />
        <TextField label="Tenant (optional)" value={form.tenantName} onChangeText={(v) => setForm({ ...form, tenantName: v })} maxLength={80} />
        <TextField label="Tenant’s phone (optional)" value={form.tenantPhone} onChangeText={(v) => setForm({ ...form, tenantPhone: v })} keyboardType="phone-pad" maxLength={40} />
        <MoneyField label={`Rent, ${FREQ[form.frequency]}`} value={form.rent} onChange={(v) => setForm({ ...form, rent: v })} glyph={glyph} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -4, marginBottom: 14 }}>
          {(['monthly', 'quarterly', 'yearly'] as const).map((f) => (
            <ChoiceChip key={f} label={f[0].toUpperCase() + f.slice(1)} active={form.frequency === f} onPress={() => setForm({ ...form, frequency: f })} />
          ))}
        </View>
        <DateChoice
          label="Next due"
          value={form.nextDue}
          onChange={(v) => setForm({ ...form, nextDue: v })}
          presets={[
            { label: 'In a month', days: 30 },
            { label: 'In 3 months', days: 91 },
            { label: 'In a year', days: 365 }
          ]}
        />
        <PrimaryButton title="Save" onPress={save} loading={busy} />
        {current ? (
          <SecondaryButton
            title="Remove property"
            style={{ marginTop: 10 }}
            onPress={() =>
              confirmDestructive({
                title: `Remove ${current.name}?`,
                body: 'Rent already recorded stays in your income.',
                action: 'Remove',
                onConfirm: () =>
                  void deleteProperty(current.id)
                    .then(() => {
                      setOpen(null);
                      return load();
                    })
                    .catch(() => toast.show('Could not remove it', 'error'))
              })
            }
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}
