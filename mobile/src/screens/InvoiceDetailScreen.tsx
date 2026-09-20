import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Banknote, Check, FileText, MessageCircle, MoreHorizontal } from 'lucide-react-native';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { Amount, Card, HeroCard, IconButton, InlineError, ListCard, ListRow, PrimaryButton, ProgressBar, Screen, ScreenHeader, SectionHeader, formatAmount } from '../components/Common/ui';
import { DateChoice, LineItem, MoneyField, Sheet, StatusChip, moneyText, parseMoney, todayIso } from '../components/Business/parts';
import { deleteInvoice, getInvoice, markInvoiceSent, recordInvoicePayment, updateInvoice, type BusinessSettings, type Invoice } from '../api/business';
import { invoiceMessage, sendOnWhatsApp, shareInvoicePdf } from '../lib/documents';
import { currencySymbol, formatShortDate } from '../utils/format';
import { type } from '../theme/typography';
import { GuideAnchor } from '../components/Common/GuideAnchor';
import { goBackOrHome } from '../navigation/goBack';

export default function InvoiceDetailScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const glyph = currencySymbol(user?.currency);
  const inkText = theme.colors.inkText;
  const id = String(route.params?.id ?? route.params?.invoiceId ?? '');

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<Array<{ id: string; amount: number; paidOn: string }>>([]);
  const [business, setBusiness] = useState<BusinessSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [withheld, setWithheld] = useState(false);
  const [whtAmount, setWhtAmount] = useState('');
  const [payDate, setPayDate] = useState(todayIso());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!id) nav.replace('Invoices');
  }, [id, nav]);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const res = await getInvoice(id);
      setInvoice(res.invoice);
      setPayments(res.payments);
      setBusiness(res.business);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this invoice');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!invoice) {
    return (
      <Screen bottomInset={48}>
        <ScreenHeader title="Invoice" onBack={() => goBackOrHome(nav)} />
        {error ? <InlineError message={error} /> : <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />}
      </Screen>
    );
  }

  const businessName = business?.businessName || user?.name || 'My business';
  const isOpen = invoice.status === 'unpaid' || invoice.status === 'part_paid';
  const paidRatio = invoice.total > 0 ? invoice.amountPaid / invoice.total : 0;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Something went wrong', 'error');
    } finally {
      setBusy(null);
    }
  };

  const sharePdf = () => run('pdf', async () => {
    await shareInvoicePdf(invoice, business, businessName, glyph);
    if (!invoice.sentAt) setInvoice(await markInvoiceSent(invoice.id));
  });

  const whatsapp = () => run('wa', async () => {
    await sendOnWhatsApp(invoice.customerPhone, invoiceMessage(invoice, businessName, glyph));
    if (!invoice.sentAt) setInvoice(await markInvoiceSent(invoice.id));
  });

  const openPay = () => {
    setPayAmount(moneyText(invoice.balance));
    setPayDate(todayIso());
    setWithheld(false);
    setWhtAmount('');
    setPayOpen(true);
  };

  // Many Nigerian customers keep back a share of the invoice and pay it to the tax office instead. That part
  // still settles the invoice, so it is recorded rather than left looking unpaid.
  const toggleWithheld = (on: boolean) => {
    setWithheld(on);
    if (!on) {
      setWhtAmount('');
      setPayAmount(moneyText(invoice.balance));
      return;
    }
    const rate = business?.whtRate ?? 5;
    const amount = Math.round((invoice.total * rate) / 100);
    setWhtAmount(moneyText(amount));
    setPayAmount(moneyText(Math.max(0, invoice.balance - amount)));
  };

  const recordPayment = () => run('pay', async () => {
    const amount = parseMoney(payAmount);
    const wht = withheld ? parseMoney(whtAmount) : 0;
    if (amount <= 0 && wht <= 0) {
      toast.show('Enter how much you received', 'error');
      return;
    }
    await recordInvoicePayment(invoice.id, { amount, paidOn: payDate, whtAmount: wht || undefined });
    setPayOpen(false);
    toast.show(
      wht > 0
        ? `Recorded. ${formatAmount(wht, glyph)} withheld counts towards your tax.`
        : `Credit alert 🎉 ${formatAmount(amount, glyph)} from ${invoice.customerName}`,
      'success',
      3500
    );
    await load();
  });

  const more = () => {
    const options: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [];
    if (invoice.amountPaid === 0 && invoice.status !== 'void') options.push({ text: 'Edit invoice', onPress: () => nav.navigate('InvoiceEdit', { id: invoice.id, invoice }) });
    if (isOpen)
      options.push({
        text: 'Void invoice',
        style: 'destructive',
        onPress: () => void run('void', async () => setInvoice(await updateInvoice(invoice.id, { status: 'void' })))
      });
    if (invoice.amountPaid === 0)
      options.push({
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void run('delete', async () => {
            await deleteInvoice(invoice.id);
            toast.show('Invoice deleted');
            goBackOrHome(nav);
          })
      });
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(invoice.number, undefined, options);
  };

  const actions = [
    { key: 'pdf', label: 'Share PDF', Icon: FileText, onPress: sharePdf, show: true },
    { key: 'wa', label: invoice.overdue ? 'Remind' : 'WhatsApp', Icon: MessageCircle, onPress: whatsapp, show: invoice.status !== 'void' },
    { key: 'pay', label: 'Record payment', Icon: Banknote, onPress: openPay, show: isOpen }
  ].filter((a) => a.show);

  return (
    <Screen bottomInset={48} onRefresh={load} refreshing={false}>
      <ScreenHeader
        title={invoice.number}
        subtitle={invoice.customerName}
        onBack={() => goBackOrHome(nav)}
        right={
          <IconButton round accessibilityLabel="More options" onPress={more}>
            <MoreHorizontal color={theme.colors.text} size={19} />
          </IconButton>
        }
      />

      <HeroCard style={{ marginTop: 8 }}>
        <View style={styles.rowBetween}>
          <Text style={[type.eyebrow, { color: inkText, opacity: 0.72 }]}>
            {invoice.status === 'paid' ? 'Paid in full' : invoice.status === 'void' ? 'Voided' : invoice.overdue ? `Overdue · ${invoice.daysOverdue} day${invoice.daysOverdue === 1 ? '' : 's'}` : `Due ${formatShortDate(invoice.dueDate)}`}
          </Text>
          <StatusChip status={invoice.status} overdue={invoice.overdue} />
        </View>
        <Amount value={isOpen ? invoice.balance : invoice.total} currency={glyph} size="hero" color={inkText} style={{ marginTop: 10 }} />
        <Text style={[type.small, { color: inkText, opacity: 0.78 }]}>
          {isOpen ? `still to come of ${formatAmount(invoice.total, glyph)}${invoice.amountPaid > 0 ? ` · ${formatAmount(invoice.amountPaid, glyph)} received` : ''}` : `Issued ${formatShortDate(invoice.issueDate)}`}
        </Text>
        {invoice.status !== 'void' ? (
          <View style={{ marginTop: 14 }}>
            <ProgressBar value={paidRatio} height={8} color="#8FD6C3" trackColor="rgba(255,255,255,0.14)" />
          </View>
        ) : null}
        {invoice.sentAt ? <Text style={[type.caption, { color: inkText, opacity: 0.7, marginTop: 10 }]}>Shared {formatShortDate(invoice.sentAt)}</Text> : null}
      </HeroCard>

      <GuideAnchor id="invoicedetail.actions" style={styles.actions}>
        {actions.map(({ key, label, Icon, onPress }) => (
          <Pressable key={key} onPress={onPress} disabled={!!busy} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}>
            <View style={[styles.actionIcon, { backgroundColor: key === 'pay' ? theme.colors.primary : theme.colors.surface, borderColor: theme.colors.border }]}>
              {busy === key ? <ActivityIndicator color={key === 'pay' ? theme.colors.onPrimary : theme.colors.primary} /> : <Icon color={key === 'pay' ? theme.colors.onPrimary : theme.colors.primary} size={21} />}
            </View>
            <Text style={[type.caption, { color: theme.colors.text }]}>{label}</Text>
          </Pressable>
        ))}
      </GuideAnchor>

      <SectionHeader title="Items" />
      <ListCard>
        {invoice.items.map((i, idx) => (
          <ListRow key={idx} title={i.description} subtitle={`${i.quantity} × ${formatAmount(i.unitPrice, glyph)}`} right={<Amount value={i.quantity * i.unitPrice} currency={glyph} size="sm" />} />
        ))}
      </ListCard>
      <Card style={{ marginTop: 10 }}>
        <LineItem label="Subtotal" value={formatAmount(invoice.subtotal, glyph)} />
        {invoice.vatAmount > 0 ? <LineItem label={`VAT (${invoice.vatRate}%)`} value={formatAmount(invoice.vatAmount, glyph)} /> : null}
        <LineItem label="Total" value={formatAmount(invoice.total, glyph)} strong />
        {invoice.amountPaid > 0 ? <LineItem label="Received" value={formatAmount(invoice.amountPaid, glyph)} color={theme.colors.success} /> : null}
        {invoice.whtAmount > 0 ? (
          <LineItem label={`Withheld by ${invoice.customerName}`} value={formatAmount(invoice.whtAmount, glyph)} color={theme.colors.brass} />
        ) : null}
      </Card>

      {payments.length ? (
        <>
          <SectionHeader title="Payments received" />
          <ListCard>
            {payments.map((p) => (
              <ListRow key={p.id} title="Payment recorded" subtitle={`${formatShortDate(p.paidOn)} · added to Sales`} right={<Amount value={p.amount} currency={glyph} size="sm" signed color={theme.colors.success} />} />
            ))}
          </ListCard>
        </>
      ) : null}

      {invoice.customerPhone || invoice.customerEmail ? (
        <>
          <SectionHeader title="Customer" />
          <ListCard>
            {invoice.customerPhone ? <ListRow title={invoice.customerPhone} subtitle="Call" onPress={() => void Linking.openURL(`tel:${invoice.customerPhone}`)} chevron /> : null}
            {invoice.customerEmail ? <ListRow title={invoice.customerEmail} subtitle="Email" onPress={() => void Linking.openURL(`mailto:${invoice.customerEmail}?subject=${encodeURIComponent(`Invoice ${invoice.number}`)}`)} chevron /> : null}
          </ListCard>
        </>
      ) : null}

      {invoice.notes ? (
        <Card style={{ marginTop: 14 }}>
          <Text style={[type.caption, { color: theme.colors.textMuted }]}>Note</Text>
          <Text style={[type.body, { color: theme.colors.text, marginTop: 4 }]}>{invoice.notes}</Text>
        </Card>
      ) : null}

      <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 14 }]}>
        Recording a payment adds it to your Business sales. No money moves through BudgetFriendly.
      </Text>

      <Sheet visible={payOpen} onClose={() => setPayOpen(false)} title="Record payment" subtitle={`From ${invoice.customerName} for ${invoice.number}`}>
        <MoneyField label="Amount received" value={payAmount} onChange={setPayAmount} glyph={glyph} hint={`Balance is ${formatAmount(invoice.balance, glyph)}`} />

        <Pressable
          onPress={() => toggleWithheld(!withheld)}
          accessibilityRole="switch"
          accessibilityState={{ checked: withheld }}
          style={({ pressed }) => [styles.whtRow, { borderColor: withheld ? theme.colors.primary : theme.colors.border, backgroundColor: withheld ? theme.colors.primarySoft : theme.colors.surface, opacity: pressed ? 0.9 : 1 }]}
        >
          <View style={[styles.whtBox, { borderColor: withheld ? theme.colors.primary : theme.colors.border, backgroundColor: withheld ? theme.colors.primary : 'transparent' }]}>
            {withheld ? <Check color={theme.colors.onPrimary} size={13} strokeWidth={3} /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>The customer deducted tax</Text>
            <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
              Withholding tax they pay to the tax office for you. It still settles the invoice.
            </Text>
          </View>
        </Pressable>

        {withheld ? (
          <MoneyField
            label="Tax withheld"
            value={whtAmount}
            onChange={setWhtAmount}
            glyph={glyph}
            hint={`${business?.whtRate ?? 5}% of ${formatAmount(invoice.total, glyph)}. Change it if they used a different rate.`}
          />
        ) : null}
        <DateChoice
          label="When did it land?"
          value={payDate}
          onChange={setPayDate}
          presets={[
            { label: 'Today', days: 0 },
            { label: 'Yesterday', days: -1 }
          ]}
        />
        <PrimaryButton title="Record payment" onPress={recordPayment} loading={busy === 'pay'} style={{ marginTop: 6 }} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  actions: { flexDirection: 'row', marginTop: 18 },
  action: { flex: 1, alignItems: 'center', gap: 7 },
  whtRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 14 },
  whtBox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  actionIcon: { width: 54, height: 54, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' }
});
