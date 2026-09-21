import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Plus, Trash2 } from '../icons';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { Card, InlineError, ListCard, ListRow, PrimaryButton, Screen, ScreenHeader, SectionHeader, TextField, formatAmount } from '../components/Common/ui';
import { DateChoice, LineItem, addDaysIso, isIsoDate, moneyText, parseMoney } from '../components/Business/parts';
import { ChoiceChip } from '../components/Plan/ChoiceChip';
import { createInvoice, getBusinessSettings, listCustomers, updateInvoice, type BusinessSettings, type Customer, type Invoice } from '../api/business';
import { currencySymbol, formatNumberInput } from '../utils/format';
import { type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';

type DraftItem = { description: string; quantity: string; unitPrice: string };

const blankItem = (): DraftItem => ({ description: '', quantity: '1', unitPrice: '' });

export default function InvoiceEditScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const glyph = currencySymbol(user?.currency);

  const existing = (route.params?.invoice ?? null) as Invoice | null;
  // Coming from the customers list, their details are already known.
  const preset = (route.params?.customer ?? null) as Customer | null;
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [customerName, setCustomerName] = useState(existing?.customerName ?? preset?.name ?? '');
  const [customerPhone, setCustomerPhone] = useState(existing?.customerPhone ?? preset?.phone ?? '');
  const [customerEmail, setCustomerEmail] = useState(existing?.customerEmail ?? preset?.email ?? '');
  const [customerId, setCustomerId] = useState<string | null>(existing?.customerId ?? preset?.id ?? null);
  const [saved, setSaved] = useState<Customer[]>([]);

  // Saved customers are offered as chips, so a repeat customer is one tap instead of three fields.
  useEffect(() => {
    let cancelled = false;
    listCustomers()
      .then((list) => !cancelled && setSaved(list))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const pickCustomer = (c: Customer) => {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.phone ?? '');
    setCustomerEmail(c.email ?? '');
  };
  const [items, setItems] = useState<DraftItem[]>(
    existing?.items.length ? existing.items.map((i) => ({ description: i.description, quantity: String(i.quantity), unitPrice: moneyText(i.unitPrice) })) : [blankItem()]
  );
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? addDaysIso(7));
  const [applyVat, setApplyVat] = useState(existing ? existing.vatRate > 0 : false);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBusinessSettings()
      .then((s) => {
        setSettings(s);
        if (!existing) setApplyVat(s.vatRegistered);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vatRate = existing && existing.vatRate > 0 ? existing.vatRate : settings?.vatRate ?? 7.5;
  const totals = useMemo(() => {
    const subtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * parseMoney(i.unitPrice), 0);
    const vat = applyVat ? Math.round(subtotal * vatRate) / 100 : 0;
    return { subtotal, vat, total: subtotal + vat };
  }, [applyVat, items, vatRate]);

  const setItem = (idx: number, patch: Partial<DraftItem>) => setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const save = async () => {
    setError(null);
    const cleanItems = items
      .filter((i) => i.description.trim() || parseMoney(i.unitPrice) > 0)
      .map((i) => ({ description: i.description.trim(), quantity: Number(i.quantity) || 1, unitPrice: parseMoney(i.unitPrice) }));
    if (!customerName.trim()) return setError('Who is this invoice for?');
    if (!cleanItems.length || cleanItems.some((i) => !i.description)) return setError('Describe each item you’re charging for.');
    if (totals.total <= 0) return setError('Add a price to at least one item.');
    if (!isIsoDate(dueDate)) return setError('Choose when payment is due.');

    const payload = {
      customerId,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || null,
      customerEmail: customerEmail.trim() || null,
      dueDate,
      items: cleanItems,
      applyVat,
      notes: notes.trim() || null
    };
    setSaving(true);
    try {
      if (existing) {
        await updateInvoice(existing.id, payload);
        toast.show('Invoice updated', 'success');
        goBackOrHome(nav);
      } else {
        const inv = await createInvoice(payload);
        toast.show(`${inv.number} created. Share it with ${inv.customerName} 📤`, 'success', 3500);
        nav.replace('InvoiceDetail', { id: inv.id });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the invoice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen bottomInset={48}>
      <ScreenHeader title={existing ? `Edit ${existing.number}` : 'New invoice'} onBack={() => goBackOrHome(nav)} />
      {error ? <InlineError message={error} /> : null}

      {settings && !settings.businessName ? (
        <ListCard style={{ marginTop: 8 }}>
          <ListRow title="Add your business name" subtitle="It shows at the top of every invoice" onPress={() => nav.navigate('BusinessTax')} chevron />
        </ListCard>
      ) : null}

      <SectionHeader title="Customer" />
      {saved.length && !existing ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {saved.slice(0, 8).map((c) => (
            <ChoiceChip key={c.id} label={c.name} active={customerId === c.id} onPress={() => pickCustomer(c)} />
          ))}
        </View>
      ) : null}
      <TextField
        label="Name"
        value={customerName}
        onChangeText={(v) => {
          setCustomerName(v);
          setCustomerId(null);
        }}
        placeholder="e.g. Mama Put Ltd"
      />
      <TextField label="WhatsApp or phone (optional)" value={customerPhone} onChangeText={setCustomerPhone} placeholder="0803 000 0000" keyboardType="phone-pad" />
      <TextField label="Email (optional)" value={customerEmail} onChangeText={setCustomerEmail} placeholder="accounts@example.com" keyboardType="email-address" autoCapitalize="none" />

      <SectionHeader title="What you’re charging for" />
      <View style={{ gap: 10 }}>
        {items.map((item, idx) => (
          <Card key={idx}>
            <TextField label={`Item ${idx + 1}`} value={item.description} onChangeText={(v) => setItem(idx, { description: v })} placeholder="e.g. Jollof rice trays" />
            <View style={styles.row}>
              <View style={{ width: 90 }}>
                <TextField label="Qty" value={item.quantity} onChangeText={(v) => setItem(idx, { quantity: v.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="Price each" value={item.unitPrice} onChangeText={(v) => setItem(idx, { unitPrice: formatNumberInput(v) })} placeholder={`${glyph}0`} keyboardType="decimal-pad" />
              </View>
            </View>
            <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'center' }]}>
              <Text style={[type.smallStrong, { color: theme.colors.textMuted }]}>{formatAmount((Number(item.quantity) || 0) * parseMoney(item.unitPrice), glyph)}</Text>
              {items.length > 1 ? (
                <Pressable onPress={() => setItems((list) => list.filter((_, i) => i !== idx))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove item" style={styles.row}>
                  <Trash2 color={theme.colors.error} size={15} />
                  <Text style={[type.smallStrong, { color: theme.colors.error }]}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          </Card>
        ))}
      </View>
      <Pressable onPress={() => setItems((list) => [...list, blankItem()])} accessibilityRole="button" style={({ pressed }) => [styles.addItem, { borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 }]}>
        <Plus color={theme.colors.primary} size={16} />
        <Text style={[type.smallStrong, { color: theme.colors.primary }]}>Add another item</Text>
      </Pressable>

      <SectionHeader title="Payment" />
      <DateChoice
        label="Payment due"
        value={dueDate}
        onChange={setDueDate}
        presets={[
          { label: 'On receipt', days: 0 },
          { label: '7 days', days: 7 },
          { label: '14 days', days: 14 },
          { label: '30 days', days: 30 }
        ]}
      />
      <ListCard>
        <ListRow
          title={`Add VAT (${vatRate}%)`}
          subtitle={settings?.vatRegistered ? 'You’re set up as VAT registered' : 'Only if your business is registered for VAT'}
          right={<Switch value={applyVat} onValueChange={setApplyVat} trackColor={{ true: theme.colors.primary, false: theme.colors.border }} thumbColor="#FFFFFF" />}
        />
      </ListCard>
      <View style={{ marginTop: 14 }}>
        <TextField label="Note on the invoice (optional)" value={notes} onChangeText={setNotes} placeholder="Pay to: GTBank · 0123456789 · Ada Foods" multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
      </View>

      <Card>
        <LineItem label="Subtotal" value={formatAmount(totals.subtotal, glyph)} />
        {applyVat ? <LineItem label={`VAT (${vatRate}%)`} value={formatAmount(totals.vat, glyph)} /> : null}
        <LineItem label="Total" value={formatAmount(totals.total, glyph)} strong />
      </Card>

      <PrimaryButton title={existing ? 'Save changes' : 'Create invoice'} onPress={save} loading={saving} style={{ marginTop: 16 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  addItem: { marginTop: 10, height: 46, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }
});
