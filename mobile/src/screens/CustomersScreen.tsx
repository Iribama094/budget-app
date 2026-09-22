import React, { useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MessageCircle, Plus, UserRound } from '../icons';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { Amount, Card, Chip, formatAmount, HeroCard, IconTile, InlineError, PrimaryButton, Screen, ScreenHeader, SecondaryButton, Spinner, TextField } from '../components/Common/ui';
import { Sheet } from '../components/Business/parts';
import { createCustomer, deleteCustomer, listCustomers, updateCustomer, type Customer } from '../api/business';
import { currencySymbol, formatShortDate } from '../utils/format';
import { type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';
import { errorMessage } from '../lib/errorMessage';
import { confirmDestructive } from '../lib/confirm';
import { useScreenData } from '../hooks/useScreenData';

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';

/** Who the business sells to, and what each of them still owes. Saved once, reused on every invoice. */
export default function CustomersScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const glyph = currencySymbol(user?.currency);

  const [editing, setEditing] = useState<Customer | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const { data, error, loading, reload: load } = useScreenData(listCustomers, [], { fallback: 'Could not load your customers' });
  const items = data ?? [];


  const totals = useMemo(
    () => ({
      owed: items.reduce((s, c) => s + c.owed, 0),
      overdue: items.filter((c) => c.overdue).length
    }),
    [items]
  );

  const open = (c: Customer | null) => {
    setEditing(c);
    setName(c?.name ?? '');
    setPhone(c?.phone ?? '');
    setEmail(c?.email ?? '');
    setSheetOpen(true);
  };

  const save = async () => {
    if (!name.trim()) return toast.show('Give the customer a name', 'error');
    setSaving(true);
    try {
      const patch = { name: name.trim(), phone: phone.trim() || null, email: email.trim() || null };
      if (editing) await updateCustomer(editing.id, patch);
      else await createCustomer(patch);
      setSheetOpen(false);
      toast.show(editing ? 'Customer updated' : `${patch.name} saved`, 'success');
      await load();
    } catch (e) {
      toast.show(errorMessage(e, 'Could not save that customer'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = (c: Customer) => {
    confirmDestructive({
      title: `Remove ${c.name}?`,
      body: 'Their invoices stay exactly as they are. Only the saved contact goes.',
      action: 'Remove',
      onConfirm: async () => {
        try {
          await deleteCustomer(c.id);
          toast.show(`${c.name} removed`, 'success');
          await load();
        } catch (e) {
          toast.show(errorMessage(e, 'Could not remove that customer'), 'error');
        }
      }
    });
  };

  return (
    <Screen scrollable={false}>
      <ScreenHeader
        title="Customers"
        onBack={() => goBackOrHome(nav)}
        right={
          <Pressable onPress={() => open(null)} accessibilityRole="button" accessibilityLabel="Add a customer" style={({ pressed }) => [styles.add, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 }]}>
            <Plus color={theme.colors.onPrimary} size={16} strokeWidth={2.6} />
            <Text style={[type.smallStrong, { color: theme.colors.onPrimary }]}>New</Text>
          </Pressable>
        }
      />

      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        onRefresh={load}
        refreshing={loading}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          items.length ? (
            <HeroCard style={{ marginTop: 8, marginBottom: 12 }}>
              <Text style={[type.eyebrow, { color: theme.colors.inkText, opacity: 0.72 }]}>Owed to you</Text>
              <Amount value={totals.owed} currency={glyph} size="hero" color={theme.colors.inkText} style={{ marginTop: 6 }} />
              <Text style={[type.small, { color: theme.colors.inkText, opacity: 0.75, marginTop: 4 }]}>
                Across {items.length} customer{items.length === 1 ? '' : 's'}
                {totals.overdue ? `, ${totals.overdue} overdue` : ''}
              </Text>
            </HeroCard>
          ) : error ? (
            <InlineError message={error} />
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <Spinner style={{ marginTop: 40 }} />
          ) : (
            <View style={{ alignItems: 'center', paddingTop: 30 }}>
              <IconTile bg={theme.colors.primarySoft} size={58}>
                <UserRound color={theme.colors.primary} size={26} />
              </IconTile>
              <Text style={[type.h2, { color: theme.colors.text, marginTop: 14 }]}>No customers yet</Text>
              <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 8, textAlign: 'center' }]}>
                Anyone you invoice is saved here automatically, so you never type their details twice.
              </Text>
              <PrimaryButton title="Add a customer" onPress={() => open(null)} style={{ marginTop: 20, alignSelf: 'stretch' }} />
            </View>
          )
        }
        renderItem={({ item }) => (
          <Card style={{ marginBottom: 10 }}>
            <Pressable onPress={() => open(item)} accessibilityRole="button" style={({ pressed }) => [styles.row, { opacity: pressed ? 0.9 : 1 }]}>
              <View style={[styles.avatar, { backgroundColor: item.overdue ? theme.colors.brassSoft : theme.colors.primarySoft }]}>
                <Text style={[type.smallStrong, { color: item.overdue ? theme.colors.brass : theme.colors.primary }]}>{initials(item.name)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[type.bodyStrong, { color: theme.colors.text }]}>
                  {item.name}
                </Text>
                <Text numberOfLines={1} style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                  {item.invoiceCount
                    ? `${item.invoiceCount} invoice${item.invoiceCount === 1 ? '' : 's'}${item.lastInvoiceAt ? ` · last ${formatShortDate(item.lastInvoiceAt)}` : ''}`
                    : 'No invoices yet'}
                </Text>
              </View>
              {item.owed > 0 ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[type.smallStrong, { color: item.overdue ? theme.colors.brass : theme.colors.text }]}>{formatAmount(item.owed, glyph)}</Text>
                  {item.overdue ? <Chip tone="brass" label="Overdue" style={{ marginTop: 4 }} /> : null}
                </View>
              ) : (
                <Chip tone="positive" label="Settled" />
              )}
            </Pressable>

            <View style={[styles.row, { marginTop: 12, gap: 8 }]}>
              {item.phone ? (
                <Pressable
                  onPress={() => void Linking.openURL(`https://wa.me/${item.phone!.replace(/[^\d]/g, '')}`)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.action, { backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.85 : 1 }]}
                >
                  <MessageCircle color={theme.colors.text} size={14} />
                  <Text style={[type.caption, { color: theme.colors.text, fontWeight: '700' }]}>WhatsApp</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => nav.navigate('InvoiceEdit', { customer: item })}
                accessibilityRole="button"
                style={({ pressed }) => [styles.action, { backgroundColor: theme.colors.primarySoft, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={[type.caption, { color: theme.colors.primary, fontWeight: '700' }]}>New invoice</Text>
              </Pressable>
              <Pressable onPress={() => remove(item)} accessibilityRole="button" hitSlop={8} style={({ pressed }) => ({ marginLeft: 'auto', opacity: pressed ? 0.7 : 1 })}>
                <Text style={[type.caption, { color: theme.colors.error, fontWeight: '700' }]}>Remove</Text>
              </Pressable>
            </View>
          </Card>
        )}
      />

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title={editing ? 'Edit customer' : 'New customer'} subtitle={editing ? editing.name : 'Saved for every invoice after this'}>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Kemi Stores" maxLength={120} />
        <TextField label="WhatsApp or phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="0803 000 0000" />
        <TextField label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="name@example.com" />
        <PrimaryButton title={editing ? 'Save changes' : 'Save customer'} onPress={save} loading={saving} />
        <SecondaryButton title="Cancel" onPress={() => setSheetOpen(false)} style={{ marginTop: 10 }} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingLeft: 10, paddingRight: 14, borderRadius: 18 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10 }
});
