import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Plus } from 'lucide-react-native';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAmountVisibility } from '../contexts/AmountVisibilityContext';
import { Amount, EmptyState, HeroCard, InlineError, ListCard, ListRow, Screen, ScreenHeader, SegmentedControl, formatAmount } from '../components/Common/ui';
import { StatusChip } from '../components/Business/parts';
import { listInvoices, type Invoice } from '../api/business';
import { currencySymbol, formatShortDate } from '../utils/format';
import { fonts, type } from '../theme/typography';

type Filter = 'open' | 'paid' | 'all';

/** Who owes the business: invoices you've issued and what's still outstanding. */
export default function InvoicesScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { showAmounts } = useAmountVisibility();
  const glyph = currencySymbol(user?.currency);
  const hide = !showAmounts;
  const inkText = theme.colors.inkText;

  const [filter, setFilter] = useState<Filter>('open');
  const [items, setItems] = useState<Invoice[]>([]);
  const [totals, setTotals] = useState({ owed: 0, overdue: 0, overdueCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await listInvoices('all');
      setItems(res.items);
      setTotals(res.totals);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const shown = items.filter((i) => (filter === 'all' ? true : filter === 'paid' ? i.status === 'paid' : ['unpaid', 'part_paid', 'draft'].includes(i.status)));
  const newInvoice = () => nav.navigate('InvoiceEdit');

  return (
    <Screen bottomInset={48} onRefresh={load} refreshing={false}>
      <ScreenHeader
        title="Invoices"
        onBack={() => nav.goBack()}
        right={
          <Pressable onPress={newInvoice} accessibilityRole="button" accessibilityLabel="New invoice" style={({ pressed }) => [styles.newPill, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 }]}>
            <Plus color={theme.colors.onPrimary} size={16} strokeWidth={2.6} />
            <Text style={[type.smallStrong, { color: theme.colors.onPrimary }]}>New</Text>
          </Pressable>
        }
      />
      {error ? <InlineError message={error} /> : null}

      <HeroCard style={{ marginTop: 8 }}>
        <Text style={[type.eyebrow, { color: inkText, opacity: 0.72 }]}>Customers owe you</Text>
        <Amount value={totals.owed} currency={glyph} size="hero" color={inkText} hidden={hide} style={{ marginTop: 8 }} />
        <Text style={[type.small, { color: inkText, opacity: 0.78 }]}>
          {totals.overdueCount
            ? `${hide ? '••••' : formatAmount(totals.overdue, glyph)} is overdue on ${totals.overdueCount} invoice${totals.overdueCount === 1 ? '' : 's'}. A friendly nudge usually does it.`
            : totals.owed > 0
              ? 'Nothing overdue. Nice work 👌'
              : 'All settled. Nobody owes you right now 🙌'}
        </Text>
      </HeroCard>

      <SegmentedControl
        style={{ marginTop: 16 }}
        options={[
          { key: 'open', label: 'Open' },
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
            {shown.map((i) => (
              <ListRow
                key={i.id}
                icon={
                  <View style={[styles.avatar, { backgroundColor: theme.colors.brassSoft }]}>
                    <Text style={{ fontFamily: fonts.display, fontSize: 15, color: theme.colors.brass }}>{i.customerName.slice(0, 1).toUpperCase()}</Text>
                  </View>
                }
                title={i.customerName}
                subtitle={
                  i.status === 'paid'
                    ? `${i.number} · paid`
                    : i.status === 'void'
                      ? `${i.number} · voided`
                      : i.overdue
                        ? `${i.number} · ${i.daysOverdue} day${i.daysOverdue === 1 ? '' : 's'} overdue`
                        : `${i.number} · due ${formatShortDate(i.dueDate)}`
                }
                right={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Amount value={i.status === 'paid' || i.status === 'void' ? i.total : i.balance} currency={glyph} size="sm" hidden={hide} />
                    <StatusChip status={i.status} overdue={i.overdue} />
                  </View>
                }
                onPress={() => nav.navigate('InvoiceDetail', { id: i.id })}
              />
            ))}
          </ListCard>
        ) : (
          <EmptyState
            title={filter === 'paid' ? 'No paid invoices yet' : 'Nobody owes you yet'}
            body="Create an invoice, share it on WhatsApp or as a PDF, then tap Record payment when the money lands. Your sales update automatically."
            actionLabel="Create an invoice"
            onAction={newInvoice}
          />
        )}
      </View>

      <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 14 }]}>
        BudgetFriendly doesn’t collect payments. It keeps track of what you’ve invoiced and what’s been paid.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  newPill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingLeft: 10, paddingRight: 14, borderRadius: 18 },
  avatar: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }
});
