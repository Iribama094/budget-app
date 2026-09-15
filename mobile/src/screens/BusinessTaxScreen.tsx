import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Building2, CalendarClock, Landmark, Receipt, UserRound } from 'lucide-react-native';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { Amount, Card, HeroCard, IconTile, InlineError, ListCard, ListRow, PrimaryButton, Screen, ScreenHeader, SectionHeader, TextField, formatAmount } from '../components/Common/ui';
import { ChoiceChip } from '../components/Plan/ChoiceChip';
import { StatCard } from '../components/Business/parts';
import { getBusinessSummary, updateBusinessSettings, type BusinessSettings, type BusinessSummary } from '../api/business';
import { currencySymbol, formatShortDate } from '../utils/format';
import { type } from '../theme/typography';

const SET_ASIDE = [5, 10, 15, 20, 25, 30];
const BUFFERS = [1, 2, 3, 6];

/** Business tax at a glance: what to set aside, VAT and PAYE, and filing dates. Business name and contacts live in Business details. */
export default function BusinessTaxScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const glyph = currencySymbol(user?.currency);
  const inkText = theme.colors.inkText;

  const [summary, setSummary] = useState<BusinessSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vatRate, setVatRate] = useState('7.5');
  const [saving, setSaving] = useState(false);

  const apply = (s: BusinessSummary) => {
    setSummary(s);
    setVatRate(String(s.settings.vatRate));
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      apply(await getBusinessSummary());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load business tax');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const change = async (patch: Partial<BusinessSettings>, message?: string) => {
    try {
      await updateBusinessSettings(patch);
      apply(await getBusinessSummary());
      if (message) toast.show(message, 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not save that', 'error');
    }
  };

  const saveVatRate = async () => {
    const rate = Number(vatRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 50) {
      toast.show('Enter a VAT rate between 0 and 50', 'error');
      return;
    }
    setSaving(true);
    await change({ vatRate: rate }, 'VAT rate saved');
    setSaving(false);
  };

  if (!summary) {
    return (
      <Screen bottomInset={48}>
        <ScreenHeader title="Tax & VAT" onBack={() => nav.goBack()} />
        {error ? <InlineError message={error} /> : <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />}
      </Screen>
    );
  }

  const s = summary.settings;
  const switchColors = { trackColor: { true: theme.colors.primary, false: theme.colors.border }, thumbColor: '#FFFFFF' };

  return (
    <Screen bottomInset={48} onRefresh={load} refreshing={false}>
      <ScreenHeader title="Tax & VAT" subtitle={s.businessName ?? undefined} onBack={() => nav.goBack()} />

      <HeroCard style={{ marginTop: 8 }}>
        <Text style={[type.eyebrow, { color: inkText, opacity: 0.72 }]}>Set aside for tax this month</Text>
        <Amount value={summary.tax.setAside} currency={glyph} size="hero" color={inkText} style={{ marginTop: 8 }} />
        <Text style={[type.small, { color: inkText, opacity: 0.78 }]}>
          {summary.current.profit > 0 ? `${summary.tax.setAsidePct}% of ${formatAmount(summary.current.profit, glyph)} profit. Keep it in a separate account so tax time no go shock you.` : 'No profit yet this month, so nothing to set aside.'}
        </Text>
        <View style={[styles.wrap, { marginTop: 14 }]}>
          {SET_ASIDE.map((p) => (
            <ChoiceChip key={p} label={`${p}%`} active={s.taxSetAsidePct === p} onPress={() => void change({ taxSetAsidePct: p })} />
          ))}
        </View>
      </HeroCard>

      <View style={styles.tiles}>
        {s.vatRegistered ? (
          <StatCard
            label="VAT collected this month"
            icon={
              <IconTile bg={theme.colors.primarySoft} size={34}>
                <Receipt color={theme.colors.primary} size={17} />
              </IconTile>
            }
          >
            <Amount value={summary.tax.vatCollectedThisMonth} currency={glyph} size="sm" />
          </StatCard>
        ) : null}
        <StatCard
          label="PAYE to remit"
          onPress={() => nav.navigate('Bills')}
          icon={
            <IconTile bg={theme.colors.brassSoft} size={34}>
              <Landmark color={theme.colors.brass} size={17} />
            </IconTile>
          }
        >
          <Amount value={summary.tax.payeOwed} currency={glyph} size="sm" />
        </StatCard>
      </View>

      <SectionHeader title="Coming up" />
      {summary.tax.deadlines.length ? (
        <ListCard>
          {summary.tax.deadlines.map((d) => (
            <ListRow
              key={d.kind}
              icon={
                <IconTile bg={theme.colors.surfaceAlt} size={40}>
                  <CalendarClock color={theme.colors.text} size={19} />
                </IconTile>
              }
              title={d.title}
              subtitle={`By ${formatShortDate(d.dueDate)} · ${d.note}`}
            />
          ))}
        </ListCard>
      ) : (
        <Text style={[type.small, { color: theme.colors.textMuted }]}>No filing dates to track. Turn on VAT below or add staff to see VAT and PAYE dates.</Text>
      )}

      <SectionHeader title="VAT" />
      <ListCard>
        <ListRow title="VAT registered" subtitle="Adds VAT to new invoices and tracks what you collect" right={<Switch value={s.vatRegistered} onValueChange={(v) => void change({ vatRegistered: v })} {...switchColors} />} />
        <ListRow title="Filing reminders" subtitle="A nudge before VAT and PAYE dates" right={<Switch value={s.filingReminders} onValueChange={(v) => void change({ filingReminders: v })} {...switchColors} />} />
      </ListCard>
      {s.vatRegistered ? (
        <Card style={{ marginTop: 10 }}>
          <TextField label="VAT rate (%)" value={vatRate} onChangeText={(v) => setVatRate(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" hint="7.5% is the standard rate in Nigeria" />
          <PrimaryButton title="Save VAT rate" onPress={saveVatRate} loading={saving} disabled={Number(vatRate) === Number(s.vatRate)} />
        </Card>
      ) : null}

      <Card style={{ marginTop: 10 }}>
        <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Cash buffer for paying yourself</Text>
        <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 4 }]}>How many months of costs to keep before we suggest paying yourself.</Text>
        <View style={[styles.wrap, { marginTop: 10 }]}>
          {BUFFERS.map((b) => (
            <ChoiceChip key={b} label={`${b} month${b === 1 ? '' : 's'}`} active={s.runwayBufferMonths === b} onPress={() => void change({ runwayBufferMonths: b })} />
          ))}
        </View>
      </Card>

      <SectionHeader title="Related" />
      <ListCard>
        <ListRow
          icon={
            <IconTile bg={theme.colors.brassSoft} size={34}>
              <Building2 color={theme.colors.brass} size={17} />
            </IconTile>
          }
          title="Business details"
          subtitle="Name, contacts and invoice numbering"
          onPress={() => nav.navigate('BusinessDetails')}
          chevron
        />
        <ListRow
          icon={
            <IconTile bg={theme.colors.primarySoft} size={34}>
              <UserRound color={theme.colors.primary} size={17} />
            </IconTile>
          }
          title="Your personal income tax"
          subtitle="Estimate tax on your own pay and reliefs"
          onPress={() => nav.navigate('TaxSettings')}
          chevron
        />
      </ListCard>

      <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 14 }]}>
        Tax figures here are estimates to help you plan, based on common Nigerian practice (VAT usually by the 21st, PAYE by the 10th). Rules change, so confirm with your accountant or the tax office.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tiles: { flexDirection: 'row', gap: 10, marginTop: 14 }
});
