import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Building2, CalendarClock, Check, UserRound } from '../icons';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { Amount, Card, Chip, HeroCard, IconTile, InfoTip, InlineError, ListCard, ListRow, PrimaryButton, Screen, ScreenHeader, SectionHeader, TextField, formatAmount } from '../components/Common/ui';
import { ChoiceChip } from '../components/Plan/ChoiceChip';
import { getBusinessSummary, setTaxFiling, updateBusinessSettings, type BusinessSettings, type BusinessSummary } from '../api/business';
import { currencySymbol, formatShortDate } from '../utils/format';
import { type } from '../theme/typography';
import { GuideAnchor } from '../components/Common/GuideAnchor';
import { goBackOrHome } from '../navigation/goBack';

const SET_ASIDE = [5, 10, 15, 20, 25, 30];
const BUFFERS = [1, 2, 3, 6];

/**
 * What the business owes the tax office, in one place: VAT after what it paid on costs, PAYE for the team, and
 * company income tax for the year. Settings sit behind a button so the figures are not buried in switches.
 */
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
  const [whtRate, setWhtRate] = useState('5');
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filing, setFiling] = useState<string | null>(null);

  const apply = (s: BusinessSummary) => {
    setSummary(s);
    setVatRate(String(s.settings.vatRate));
    setWhtRate(String(s.settings.whtRate));
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      apply(await getBusinessSummary());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your tax figures');
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

  const saveRates = async () => {
    const vat = Number(vatRate);
    const wht = Number(whtRate);
    if (!Number.isFinite(vat) || vat < 0 || vat > 50) return toast.show('Enter a VAT rate between 0 and 50', 'error');
    if (!Number.isFinite(wht) || wht < 0 || wht > 30) return toast.show('Enter a withholding rate between 0 and 30', 'error');
    setSaving(true);
    await change({ vatRate: vat, whtRate: wht }, 'Rates saved');
    setSaving(false);
  };

  // Marking a return filed stops its deadline asking, and can be undone when it turns out it was not sent.
  const toggleFiled = async (kind: 'vat' | 'paye' | 'cit', period: string, amount: number, filed: boolean) => {
    const key = `${kind}:${period}`;
    setFiling(key);
    try {
      await setTaxFiling({ kind, period, amount, filed: !filed });
      apply(await getBusinessSummary());
      toast.show(filed ? 'Marked as not filed' : 'Marked as filed. We will stop reminding you.', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not update that', 'error');
    } finally {
      setFiling(null);
    }
  };

  if (!summary) {
    return (
      <Screen bottomInset={48}>
        <ScreenHeader title="Tax" onBack={() => goBackOrHome(nav)} />
        {error ? <InlineError message={error} /> : <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />}
      </Screen>
    );
  }

  const s = summary.settings;
  const tax = summary.tax;
  const cit = tax.companyTax;
  const month = summary.month;
  const year = month.slice(0, 4);
  const isFiled = (kind: 'vat' | 'paye' | 'cit', period: string) => tax.filings.some((f) => f.kind === kind && f.period === period);
  const switchColors = { trackColor: { true: theme.colors.primary, false: theme.colors.border }, thumbColor: '#FFFFFF' };
  // What to keep back this month: VAT owed plus PAYE, or the profit share when neither applies.
  const setAsideTotal = Math.max(tax.setAside, tax.vatToRemit + tax.payeOwed);

  const filedChip = (kind: 'vat' | 'paye' | 'cit', period: string, amount: number) => {
    const filed = isFiled(kind, period);
    return (
      <Pressable
        onPress={() => void toggleFiled(kind, period, amount, filed)}
        disabled={filing === `${kind}:${period}`}
        accessibilityRole="button"
        hitSlop={6}
        style={({ pressed }) => [styles.filed, { backgroundColor: filed ? theme.colors.successSoft : theme.colors.surfaceAlt, opacity: pressed ? 0.8 : 1 }]}
      >
        {filed ? <Check color={theme.colors.success} size={12} strokeWidth={3} /> : null}
        <Text style={[type.caption, { color: filed ? theme.colors.success : theme.colors.textMuted, fontWeight: '700' }]}>{filed ? 'Filed' : 'Mark as filed'}</Text>
      </Pressable>
    );
  };

  return (
    <Screen bottomInset={48} onRefresh={load} refreshing={false}>
      <ScreenHeader title="Tax" subtitle={s.businessName ?? undefined} onBack={() => goBackOrHome(nav)} />

      <GuideAnchor id="businesstax.hero">
        <HeroCard style={{ marginTop: 8 }}>
          <Text style={[type.eyebrow, { color: inkText, opacity: 0.72 }]}>Set aside this month</Text>
          <Amount value={setAsideTotal} currency={glyph} size="hero" color={inkText} style={{ marginTop: 8 }} />
          <Text style={[type.small, { color: inkText, opacity: 0.78 }]}>
            {setAsideTotal > 0
              ? 'Keep this in a separate account and tax time stays calm.'
              : 'Nothing to set aside yet this month.'}
          </Text>
        </HeroCard>
      </GuideAnchor>

      {s.vatRegistered ? (
        <Card style={{ marginTop: 12 }}>
          <View style={styles.row}>
            <Text style={[type.bodyStrong, { color: theme.colors.text, flex: 1 }]}>VAT</Text>
            {tax.deadlines.find((d) => d.kind === 'vat') ? (
              <Chip tone={isFiled('vat', month) ? 'positive' : 'brass'} label={`Due ${formatShortDate(tax.deadlines.find((d) => d.kind === 'vat')!.dueDate)}`} />
            ) : null}
          </View>
          <View style={[styles.row, { marginTop: 12 }]}>
            <Text style={[type.small, { color: theme.colors.textMuted, flex: 1 }]}>Collected on sales</Text>
            <Text style={[type.smallStrong, { color: theme.colors.text }]}>{formatAmount(tax.vatCollectedThisMonth, glyph)}</Text>
          </View>
          <View style={[styles.row, { marginTop: 8 }]}>
            <Text style={[type.small, { color: theme.colors.textMuted, flex: 1 }]}>Paid on costs</Text>
            <Text style={[type.smallStrong, { color: theme.colors.success }]}>−{formatAmount(tax.vatPaidThisMonth, glyph)}</Text>
          </View>
          <View style={[styles.row, { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border }]}>
            <Text style={[type.bodyStrong, { color: theme.colors.text, flex: 1 }]}>To remit</Text>
            <Amount value={tax.vatToRemit} currency={glyph} size="sm" />
          </View>
          <View style={[styles.row, { marginTop: 12 }]}>
            <Text style={[type.caption, { color: theme.colors.textMuted, flex: 1 }]}>Tick it off once you have filed</Text>
            {filedChip('vat', month, tax.vatToRemit)}
          </View>
        </Card>
      ) : null}

      {summary.staffCount > 0 || tax.payeOwed > 0 ? (
        <Card style={{ marginTop: 10 }}>
          <View style={styles.row}>
            <Text style={[type.bodyStrong, { color: theme.colors.text, flex: 1 }]}>PAYE for your team</Text>
            {tax.deadlines.find((d) => d.kind === 'paye') ? (
              <Chip tone={isFiled('paye', month) ? 'positive' : 'brass'} label={`Due ${formatShortDate(tax.deadlines.find((d) => d.kind === 'paye')!.dueDate)}`} />
            ) : null}
          </View>
          <View style={[styles.row, { marginTop: 12 }]}>
            <Text style={[type.small, { color: theme.colors.textMuted, flex: 1 }]}>Deducted from pay, waiting to be remitted</Text>
            <Amount value={tax.payeOwed} currency={glyph} size="sm" />
          </View>
          <View style={[styles.row, { marginTop: 12 }]}>
            <Pressable onPress={() => nav.navigate('Bills')} hitSlop={6} accessibilityRole="button" style={{ flex: 1 }}>
              <Text style={[type.caption, { color: theme.colors.primary, fontWeight: '700' }]}>See it in Bills</Text>
            </Pressable>
            {filedChip('paye', month, tax.payeOwed)}
          </View>
        </Card>
      ) : null}

      {cit ? (
        <Card style={{ marginTop: 10 }}>
          <View style={styles.row}>
            <Text style={[type.bodyStrong, { color: theme.colors.text, flex: 1 }]}>Company income tax</Text>
            <Chip tone={cit.exempt ? 'positive' : 'brass'} label={cit.exempt ? 'Nothing to pay' : `${year} estimate`} />
          </View>
          {cit.exempt ? (
            <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 10 }]}>
              Turnover is {formatAmount(cit.turnover, glyph)} this year. Businesses turning over {formatAmount(cit.threshold, glyph)} or less pay none.
            </Text>
          ) : (
            <>
              <View style={[styles.row, { marginTop: 12 }]}>
                <Text style={[type.small, { color: theme.colors.textMuted, flex: 1 }]}>Estimated on {formatAmount(cit.profit, glyph)} profit</Text>
                <Text style={[type.smallStrong, { color: theme.colors.text }]}>{formatAmount(cit.estimated, glyph)}</Text>
              </View>
              {tax.whtCreditsThisYear > 0 ? (
                <View style={[styles.row, { marginTop: 8 }]}>
                  <Text style={[type.small, { color: theme.colors.textMuted, flex: 1 }]}>Already withheld by customers</Text>
                  <Text style={[type.smallStrong, { color: theme.colors.success }]}>−{formatAmount(tax.whtCreditsThisYear, glyph)}</Text>
                </View>
              ) : null}
              <View style={[styles.row, { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border }]}>
                <Text style={[type.bodyStrong, { color: theme.colors.text, flex: 1 }]}>Left to pay</Text>
                <Amount value={cit.afterCredits} currency={glyph} size="sm" />
              </View>
              <View style={[styles.row, { marginTop: 12 }]}>
                <Text style={[type.caption, { color: theme.colors.textMuted, flex: 1 }]}>Filed your annual return?</Text>
                {filedChip('cit', year, cit.afterCredits)}
              </View>
            </>
          )}
          <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 10 }]}>{cit.note}</Text>
        </Card>
      ) : null}

      {tax.whtCreditsThisYear > 0 && cit?.exempt ? (
        <Card style={{ marginTop: 10 }}>
          <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Tax your customers withheld</Text>
          <Amount value={tax.whtCreditsThisYear} currency={glyph} size="sm" style={{ marginTop: 6 }} />
          <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 6 }]}>
            Paid to the tax office on your behalf this year. Keep the receipts: you can claim it back or set it against a future bill.
          </Text>
        </Card>
      ) : null}

      <SectionHeader title="Coming up" info="Usual Nigerian filing dates for VAT and PAYE. We remind you before each one. Always confirm with your accountant or the tax office." />
      {tax.deadlines.length ? (
        <ListCard>
          {tax.deadlines.map((d) => (
            <ListRow
              key={d.kind}
              icon={
                <IconTile bg={isFiled(d.kind as 'vat' | 'paye', month) ? theme.colors.successSoft : theme.colors.surfaceAlt} size={40}>
                  <CalendarClock color={isFiled(d.kind as 'vat' | 'paye', month) ? theme.colors.success : theme.colors.text} size={19} />
                </IconTile>
              }
              title={d.title}
              subtitle={isFiled(d.kind as 'vat' | 'paye', month) ? 'Filed. Nothing more to do.' : `By ${formatShortDate(d.dueDate)} · ${d.note}`}
            />
          ))}
        </ListCard>
      ) : (
        <Text style={[type.small, { color: theme.colors.textMuted }]}>No filing dates yet. Turn on VAT in settings or add staff to see them here.</Text>
      )}

      <PrimaryButton title={showSettings ? 'Hide tax settings' : 'Tax settings'} onPress={() => setShowSettings((v) => !v)} style={{ marginTop: 16 }} />

      {showSettings ? (
        <View style={{ marginTop: 12 }}>
          <ListCard>
            <ListRow title="VAT registered" subtitle="Adds VAT to new invoices and tracks what you collect" right={<Switch value={s.vatRegistered} onValueChange={(v) => void change({ vatRegistered: v })} {...switchColors} />} />
            <ListRow title="Filing reminders" subtitle="A nudge before VAT and PAYE dates" right={<Switch value={s.filingReminders} onValueChange={(v) => void change({ filingReminders: v })} {...switchColors} />} />
          </ListCard>

          <Card style={{ marginTop: 10 }}>
            {s.vatRegistered ? (
              <TextField label="VAT rate (%)" value={vatRate} onChangeText={(v) => setVatRate(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" hint="7.5% is the standard rate in Nigeria" />
            ) : null}
            <TextField
              label="Withholding rate (%)"
              value={whtRate}
              onChangeText={(v) => setWhtRate(v.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              hint="What customers usually deduct from your invoices. Often 5% on services. You can change it on any payment."
            />
            <PrimaryButton title="Save rates" onPress={saveRates} loading={saving} />
          </Card>

          <Card style={{ marginTop: 10 }}>
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Profit to set aside</Text>
            <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 4 }]}>Used when you have no VAT or PAYE to pay, so something is still kept back.</Text>
            <View style={[styles.wrap, { marginTop: 10 }]}>
              {SET_ASIDE.map((p) => (
                <ChoiceChip key={p} label={`${p}%`} active={s.taxSetAsidePct === p} onPress={() => void change({ taxSetAsidePct: p })} />
              ))}
            </View>
          </Card>

          <Card style={{ marginTop: 10 }}>
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Cash buffer for paying yourself</Text>
            <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 4 }]}>How many months of costs to keep before we suggest paying yourself.</Text>
            <View style={[styles.wrap, { marginTop: 10 }]}>
              {BUFFERS.map((b) => (
                <ChoiceChip key={b} label={`${b} month${b === 1 ? '' : 's'}`} active={s.runwayBufferMonths === b} onPress={() => void change({ runwayBufferMonths: b })} />
              ))}
            </View>
          </Card>
        </View>
      ) : null}

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

      <InfoTip
        style={{ marginTop: 14 }}
        text="These figures are estimates to help you plan, based on common Nigerian practice: VAT usually by the 21st of the next month, PAYE by the 10th, and no company income tax for small businesses. Rules change, so confirm with your accountant or the tax office."
      >
        Estimates to help you plan, not tax advice.
      </InfoTip>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filed: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999 }
});
