import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Switch, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Briefcase, Check, Globe, House, Receipt } from 'lucide-react-native';

import { Card, HeroCard, IconTile, InfoTip, ListCard, ListRow, PrimaryButton, Screen, ScreenHeader, SectionHeader, SegmentedControl, TextField } from '../components/Common/ui';
import { Sheet } from '../components/Business/parts';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { calcTax, getTaxRules, patchMe } from '../api/endpoints';
import { COUNTRIES } from '../utils/countries';
import { formatMoney, formatNumberInput, parseNumberInput } from '../utils/format';
import { type } from '../theme/typography';

/** Nigeria Tax Act 2025: rent relief is 20% of annual rent, capped at ₦500,000. */
const RENT_RELIEF_RATE = 0.2;
const RENT_RELIEF_CAP = 500000;

const moneyText = (n?: number) => (typeof n === 'number' && n > 0 ? formatNumberInput(String(n)) : '');
const moneyValue = (s: string) => {
  const n = parseNumberInput(s.trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export default function TaxSettingsScreen() {
  const nav = useNavigation<any>();
  const { user, refreshUser } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const inkText = theme.colors.inkText;
  const tp = user?.taxProfile;

  const [country, setCountry] = useState(tp?.country ?? 'NG');
  const [withheldByEmployer, setWithheldByEmployer] = useState<boolean>(tp?.withheldByEmployer ?? false);
  const [netMonthlyIncomeTax, setNetMonthlyIncomeTax] = useState(tp?.netMonthlyIncome != null ? String(tp.netMonthlyIncome) : '');
  const [grossMonthlyIncomeTax, setGrossMonthlyIncomeTax] = useState(tp?.grossMonthlyIncome != null ? String(tp.grossMonthlyIncome) : '');
  const [incomeType, setIncomeType] = useState<'gross' | 'net'>(tp?.incomeType ?? 'gross');
  const [optInTaxFeature, setOptInTaxFeature] = useState<boolean>(tp?.optInTaxFeature ?? false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [isSavingTax, setIsSavingTax] = useState(false);
  const [mode, setMode] = useState<'current' | 'whatIf'>('current');

  // Reliefs and deductions
  const [annualRent, setAnnualRent] = useState(moneyText(tp?.annualRent));
  const [pensionMonthly, setPensionMonthly] = useState(moneyText(tp?.pensionContribution));
  const [nhfMonthly, setNhfMonthly] = useState(moneyText(tp?.nhfContribution));
  const [nhisMonthly, setNhisMonthly] = useState(moneyText(tp?.nhisContribution));
  const [lifeInsuranceYearly, setLifeInsuranceYearly] = useState(moneyText(tp?.lifeInsurancePremium));
  const [mortgageInterestYearly, setMortgageInterestYearly] = useState(moneyText(tp?.mortgageInterest));

  const currency = user?.currency ?? '₦';
  const isNigeria = country.toUpperCase() === 'NG';

  const sanitizeMoney = (v: string) => formatNumberInput(v);

  const countryLabel = useMemo(() => {
    const found = COUNTRIES.find((c) => c.code === country);
    return found ? `${found.name} (${found.code})` : country;
  }, [country]);

  /** Annual amounts sent to the tax calculator. Keys match the backend rule's deductions. */
  const deductions = useMemo(() => {
    const d: Record<string, number> = {};
    if (!isNigeria) return d;
    const add = (key: string, value: number) => {
      if (value > 0) d[key] = Math.round(value);
    };
    add('annualRent', moneyValue(annualRent));
    add('pension', moneyValue(pensionMonthly) * 12);
    add('nhf', moneyValue(nhfMonthly) * 12);
    add('nhis', moneyValue(nhisMonthly) * 12);
    add('lifeInsurance', moneyValue(lifeInsuranceYearly));
    add('mortgageInterest', moneyValue(mortgageInterestYearly));
    return d;
  }, [annualRent, isNigeria, lifeInsuranceYearly, mortgageInterestYearly, nhfMonthly, nhisMonthly, pensionMonthly]);
  const deductionsKey = JSON.stringify(deductions);
  const rentRelief = Math.min((deductions.annualRent ?? 0) * RENT_RELIEF_RATE, RENT_RELIEF_CAP);

  const effectiveRateInfo = useMemo(() => {
    const gross = Number(grossMonthlyIncomeTax.replace(/,/g, ''));
    const net = Number(netMonthlyIncomeTax.replace(/,/g, ''));
    if (withheldByEmployer) return null;
    if (!optInTaxFeature || !Number.isFinite(gross) || !Number.isFinite(net) || gross <= 0 || net <= 0) return null;
    const rate = Math.max(0, 1 - net / gross);
    const pct = Math.round(rate * 100);
    let bracket: string;
    if (pct < 10) bracket = 'very low';
    else if (pct < 20) bracket = 'moderate';
    else if (pct < 30) bracket = 'high';
    else bracket = 'very high';
    return { pct, bracket };
  }, [grossMonthlyIncomeTax, netMonthlyIncomeTax, optInTaxFeature, withheldByEmployer]);

  const baselineNet = tp?.netMonthlyIncome;
  const scenarioNet = useMemo(() => {
    const n = Number(netMonthlyIncomeTax.replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [netMonthlyIncomeTax]);

  const extraBudgetMonthly = useMemo(() => {
    if (!baselineNet || !scenarioNet || !optInTaxFeature) return null;
    const diff = scenarioNet - baselineNet;
    if (!Number.isFinite(diff) || diff === 0) return null;
    return diff;
  }, [baselineNet, scenarioNet, optInTaxFeature]);

  const grossValue = useMemo(() => {
    const n = parseNumberInput(grossMonthlyIncomeTax.trim());
    return Number.isFinite(n) ? n : NaN;
  }, [grossMonthlyIncomeTax]);

  const netValue = useMemo(() => {
    const trimmed = netMonthlyIncomeTax.trim();
    if (!trimmed) return NaN;
    const n = parseNumberInput(trimmed);
    return Number.isFinite(n) ? n : NaN;
  }, [netMonthlyIncomeTax]);

  const validation = useMemo(() => {
    if (!optInTaxFeature) return { grossError: null as string | null, netError: null as string | null, canSave: true };
    const grossError = withheldByEmployer ? null : !Number.isFinite(grossValue) || grossValue <= 0 ? 'Enter a valid gross monthly income.' : null;
    let netError: string | null = null;

    if (withheldByEmployer) {
      if (!netMonthlyIncomeTax.trim()) netError = 'Enter your net monthly income.';
      else if (!Number.isFinite(netValue) || netValue <= 0) netError = 'Enter a valid net monthly income.';
    }

    if (netMonthlyIncomeTax.trim()) {
      if (!Number.isFinite(netValue) || netValue <= 0) netError = 'Enter a valid net monthly income.';
      else if (Number.isFinite(grossValue) && grossValue > 0 && netValue > grossValue) netError = 'Net income should be less than gross income.';
    }

    const canSave = !grossError && !netError && mode === 'current' && !isSavingTax;
    return { grossError, netError, canSave };
  }, [grossValue, isSavingTax, mode, netMonthlyIncomeTax, netValue, optInTaxFeature, withheldByEmployer]);

  const [taxPreview, setTaxPreview] = useState<{ grossAnnual: number; taxableIncome: number; totalTax: number } | null>(null);
  const [taxPreviewLoading, setTaxPreviewLoading] = useState(false);
  const [taxPreviewError, setTaxPreviewError] = useState<string | null>(null);

  const [rulesMeta, setRulesMeta] = useState<{ country: string; brackets: number; bracketsArr: Array<{ upTo: number | null; rate: number }> } | null>(null);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [showAllRules, setShowAllRules] = useState(false);

  useEffect(() => {
    if (!optInTaxFeature) {
      setRulesMeta(null);
      setRulesError(null);
      setRulesLoading(false);
      setShowAllRules(false);
      return;
    }

    const timer = setTimeout(() => {
      (async () => {
        setRulesError(null);
        setRulesLoading(true);
        try {
          const res = await getTaxRules(country);
          const rule = (res as any)?.rule ?? null;
          const bracketsRaw = Array.isArray(rule?.brackets) ? (rule.brackets as Array<any>) : [];
          const bracketsArr = bracketsRaw
            .map((b) => ({ upTo: b?.to ?? null, rate: Number(b?.rate ?? 0) }))
            .filter((b) => Number.isFinite(b.rate));
          const brackets = bracketsArr.length;
          setRulesMeta({ country: String(rule?.country ?? country), brackets, bracketsArr });
        } catch (e) {
          setRulesMeta(null);
          setRulesError(e instanceof Error ? e.message : 'Could not load tax rules');
        } finally {
          setRulesLoading(false);
        }
      })();
    }, 300);

    return () => clearTimeout(timer);
  }, [country, optInTaxFeature]);

  useEffect(() => {
    setShowAllRules(false);
  }, [country]);

  useEffect(() => {
    if (!optInTaxFeature) {
      setTaxPreview(null);
      setTaxPreviewError(null);
      setTaxPreviewLoading(false);
      return;
    }

    const computePreviewFromGrossAnnual = async (grossAnnual: number) => {
      const res = await calcTax({ country, grossAnnual, deductions });
      const r = (res as any)?.result ?? res;
      return {
        grossAnnual: Number(r?.grossAnnual ?? grossAnnual) || grossAnnual,
        taxableIncome: Number(r?.taxableIncome ?? grossAnnual) || 0,
        totalTax: Number(r?.totalTax ?? 0) || 0,
        netAnnual: Number(r?.netAnnual ?? 0) || 0,
        netMonthly: Number(r?.netMonthly ?? 0) || 0
      };
    };

    const estimateGrossAnnualFromNetMonthly = async (targetNetMonthly: number) => {
      const targetNetAnnual = Math.max(0, targetNetMonthly * 12);
      // gross must be >= net
      let low = Math.max(1, Math.round(targetNetAnnual));
      let high = Math.max(low + 1, Math.round(targetNetAnnual * 2));

      // Expand upper bound until netAnnual >= target, or we hit a reasonable cap.
      for (let i = 0; i < 8; i++) {
        const p = await computePreviewFromGrossAnnual(high);
        if (p.netAnnual >= targetNetAnnual) break;
        high = Math.round(high * 1.6);
        if (high > 5_000_000_000) break;
      }

      // Binary search
      for (let i = 0; i < 12; i++) {
        const mid = Math.round((low + high) / 2);
        const p = await computePreviewFromGrossAnnual(mid);
        if (p.netAnnual < targetNetAnnual) low = mid + 1;
        else high = Math.max(1, mid);
      }
      return Math.max(1, high);
    };

    const timer = setTimeout(() => {
      (async () => {
        setTaxPreviewError(null);
        setTaxPreviewLoading(true);
        try {
          if (withheldByEmployer) {
            if (!Number.isFinite(netValue) || netValue <= 0) {
              setTaxPreview(null);
              setTaxPreviewError(null);
              return;
            }
            const estGrossAnnual = await estimateGrossAnnualFromNetMonthly(netValue);
            const p = await computePreviewFromGrossAnnual(estGrossAnnual);
            setTaxPreview({ grossAnnual: p.grossAnnual, taxableIncome: p.taxableIncome, totalTax: p.totalTax });
          } else {
            if (!Number.isFinite(grossValue) || grossValue <= 0) {
              setTaxPreview(null);
              setTaxPreviewError(null);
              return;
            }
            const grossAnnual = Math.round(grossValue * 12);
            const p = await computePreviewFromGrossAnnual(grossAnnual);
            setTaxPreview({ grossAnnual: p.grossAnnual, taxableIncome: p.taxableIncome, totalTax: p.totalTax });
          }
        } catch (e) {
          setTaxPreview(null);
          setTaxPreviewError(e instanceof Error ? e.message : 'Could not load tax estimate');
        } finally {
          setTaxPreviewLoading(false);
        }
      })();
    }, 450);

    return () => clearTimeout(timer);
    // deductionsKey stands in for the deductions object so typing the same value doesn't refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, grossValue, netValue, optInTaxFeature, withheldByEmployer, deductionsKey]);

  const saveTax = async () => {
    if (!user) return;
    setIsSavingTax(true);
    try {
      const gross = grossMonthlyIncomeTax.trim() ? Number(grossMonthlyIncomeTax.replace(/,/g, '')) : undefined;
      const net = netMonthlyIncomeTax.trim() ? Number(netMonthlyIncomeTax.replace(/,/g, '')) : undefined;
      const optional = (s: string) => moneyValue(s) || undefined;
      await patchMe({
        taxProfile: {
          ...(user.taxProfile ?? {}),
          country,
          withheldByEmployer,
          netMonthlyIncome: typeof net === 'number' && !Number.isNaN(net) ? net : undefined,
          grossMonthlyIncome: !withheldByEmployer && typeof gross === 'number' && !Number.isNaN(gross) ? gross : undefined,
          incomeType: withheldByEmployer ? 'net' : incomeType,
          annualRent: optional(annualRent),
          pensionContribution: optional(pensionMonthly),
          nhfContribution: optional(nhfMonthly),
          nhisContribution: optional(nhisMonthly),
          lifeInsurancePremium: optional(lifeInsuranceYearly),
          mortgageInterest: optional(mortgageInterestYearly),
          optInTaxFeature
        }
      });
      await refreshUser();
      toast.show('Tax settings saved ✅', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Failed to save tax settings', 'error');
    } finally {
      setIsSavingTax(false);
    }
  };

  const switchColors = { trackColor: { true: theme.colors.primary, false: theme.colors.border }, thumbColor: '#FFFFFF' };
  const muted = !optInTaxFeature ? { opacity: 0.5 } : null;
  const totalReliefs = taxPreview ? Math.max(0, taxPreview.grossAnnual - taxPreview.taxableIncome) : 0;

  const moneyField = (label: string, value: string, onChange: (v: string) => void, hint?: string) => (
    <TextField label={label} value={value} onChangeText={(v) => onChange(sanitizeMoney(v))} placeholder="0" keyboardType="decimal-pad" hint={hint} />
  );

  return (
    <Screen bottomInset={48}>
      <ScreenHeader title="Tax settings" subtitle="Fine-tune how we estimate your tax" onBack={() => nav.goBack()} />

      {optInTaxFeature && (taxPreview || taxPreviewLoading) ? (
        <HeroCard style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Receipt color="#E2B65C" size={16} />
            <Text style={[type.eyebrow, { color: inkText, opacity: 0.72 }]}>Estimated tax</Text>
          </View>
          {taxPreviewLoading || !taxPreview ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <ActivityIndicator color={inkText} />
              <Text style={[type.small, { color: inkText, opacity: 0.78 }]}>Calculating estimate…</Text>
            </View>
          ) : (
            <>
              <Text style={[type.hero, { color: inkText, marginTop: 8 }]} numberOfLines={1}>
                {formatMoney(taxPreview.totalTax / 12, currency)}
              </Text>
              <Text style={[type.small, { color: inkText, opacity: 0.78 }]}>
                a month · {formatMoney(taxPreview.totalTax, currency)} a year on {formatMoney(taxPreview.taxableIncome, currency)} taxable
              </Text>
              {totalReliefs > 0 ? (
                <Text style={[type.caption, { color: inkText, opacity: 0.7, marginTop: 8 }]}>
                  {formatMoney(totalReliefs, currency)} of reliefs taken off first{rentRelief > 0 ? `, including ${formatMoney(rentRelief, currency)} rent relief` : ''} 🏠
                </Text>
              ) : null}
              {effectiveRateInfo ? (
                <Text style={[type.caption, { color: inkText, opacity: 0.7, marginTop: 8 }]}>
                  Approx. effective rate {effectiveRateInfo.pct}% ({effectiveRateInfo.bracket}), based on the gross and net you entered.
                </Text>
              ) : null}
            </>
          )}
        </HeroCard>
      ) : null}

      <SectionHeader title="Tax profile" />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Enable tax features</Text>
            <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>Optional. Adds tax estimates to budgets and analytics. Your budgets stay based on take-home pay.</Text>
          </View>
          <Switch value={optInTaxFeature} onValueChange={setOptInTaxFeature} {...switchColors} />
        </View>

        <SegmentedControl
          style={{ marginTop: 14 }}
          options={[
            { key: 'current', label: 'Current profile' },
            { key: 'whatIf', label: 'What-if scenario' }
          ]}
          value={mode}
          onChange={setMode}
        />
        {mode === 'whatIf' ? <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 8 }]}>What-if mode doesn’t save. Play with the numbers and compare freely.</Text> : null}
      </Card>

      <ListCard style={{ marginTop: 10 }}>
        <ListRow
          icon={
            <IconTile bg={theme.colors.primarySoft} size={34}>
              <Globe color={theme.colors.primary} size={17} />
            </IconTile>
          }
          title="Country"
          subtitle={
            !optInTaxFeature
              ? countryLabel
              : rulesLoading
                ? `${countryLabel} · loading rules…`
                : rulesError
                  ? `${countryLabel} · rules not confirmed`
                  : rulesMeta
                    ? `${countryLabel} · ${rulesMeta.brackets} bracket${rulesMeta.brackets === 1 ? '' : 's'}`
                    : countryLabel
          }
          onPress={() => setShowCountryPicker(true)}
          chevron
        />
        <ListRow
          icon={
            <IconTile bg={theme.colors.brassSoft} size={34}>
              <Briefcase color={theme.colors.brass} size={17} />
            </IconTile>
          }
          title="Business tax"
          subtitle="VAT, PAYE for staff and money to set aside"
          onPress={() => nav.navigate('BusinessTax')}
          chevron
        />
      </ListCard>
      {optInTaxFeature && rulesError ? <Text style={[type.caption, { color: theme.colors.error, marginTop: 6 }]}>Tax rules not confirmed: {rulesError}</Text> : null}

      {optInTaxFeature && rulesMeta?.bracketsArr.length ? (
        <>
          <SectionHeader
            title={`${String(rulesMeta.country).toUpperCase()} tax brackets`}
            actionLabel={rulesMeta.bracketsArr.length > 3 ? (showAllRules ? 'Hide' : 'View all') : undefined}
            onAction={() => setShowAllRules((v) => !v)}
          />
          <ListCard>
            {(showAllRules ? rulesMeta.bracketsArr : rulesMeta.bracketsArr.slice(0, 3)).map((b, idx) => (
              <ListRow
                key={`${String(b.upTo)}-${idx}`}
                title={b.upTo == null ? 'Above' : `Up to ${Number(b.upTo).toLocaleString()}`}
                subtitle="Annual income"
                right={<Text style={[type.bodyStrong, { color: theme.colors.text }]}>{b.rate === 0 ? 'Tax-free' : `${Math.round((b.rate ?? 0) * 100)}%`}</Text>}
              />
            ))}
          </ListCard>
          <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 6 }]}>
            {isNigeria ? 'Nigeria Tax Act 2025, in force from 1 January 2026. Reliefs you add below come off before these rates apply.' : 'These are the brackets we loaded. Final tax can still vary with deductions and allowances.'}
          </Text>
        </>
      ) : null}

      <SectionHeader title="Your income" />
      <Card>
        <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }, muted]}>
          <Text style={[type.bodyStrong, { color: theme.colors.text, flex: 1 }]}>Tax withheld by employer</Text>
          <Switch value={withheldByEmployer} onValueChange={setWithheldByEmployer} disabled={!optInTaxFeature} {...switchColors} />
        </View>

        <View style={muted} pointerEvents={optInTaxFeature ? 'auto' : 'none'}>
          <SegmentedControl
            style={{ marginBottom: 14 }}
            options={[
              { key: 'gross', label: 'Gross salary' },
              { key: 'net', label: 'Take-home pay' }
            ]}
            value={incomeType}
            onChange={setIncomeType}
          />
        </View>

        {optInTaxFeature && !withheldByEmployer ? (
          <TextField
            label="Gross monthly income (before tax)"
            value={grossMonthlyIncomeTax}
            onChangeText={(v) => setGrossMonthlyIncomeTax(sanitizeMoney(v))}
            placeholder="0"
            keyboardType="decimal-pad"
            editable={optInTaxFeature}
            error={validation.grossError}
          />
        ) : null}

        <TextField
          label="Net monthly (take-home, optional)"
          value={netMonthlyIncomeTax}
          onChangeText={(v) => setNetMonthlyIncomeTax(sanitizeMoney(v))}
          placeholder="0"
          keyboardType="decimal-pad"
          editable={optInTaxFeature && (withheldByEmployer || mode === 'whatIf')}
          error={optInTaxFeature ? validation.netError : null}
          hint={optInTaxFeature && !withheldByEmployer && mode === 'current' ? 'If your employer withholds tax, turn on “withheld by employer” to enter take-home.' : undefined}
        />
      </Card>

      {optInTaxFeature && isNigeria ? (
        <>
          <SectionHeader
            title="Reliefs that lower your tax"
            info={`Paying rent? 20% of your yearly rent, up to ${formatMoney(RENT_RELIEF_CAP, currency)}, comes off your taxable income. Keep your tenancy agreement or receipts as proof. Pension, NHF, health insurance, life insurance and mortgage interest come off too.`}
          />
          <Card>
            {moneyField(
              'Yearly rent',
              annualRent,
              setAnnualRent,
              rentRelief > 0 ? `Rent relief: ${formatMoney(rentRelief, currency)}${rentRelief >= RENT_RELIEF_CAP ? ' (the maximum)' : ''}` : 'Rent for the home you live in'
            )}
            <Text style={[type.smallStrong, { color: theme.colors.text, marginTop: 4, marginBottom: 8 }]}>Taken from your pay each month</Text>
            {moneyField('Pension contribution', pensionMonthly, setPensionMonthly, 'Your share, usually 8% of pay')}
            {moneyField('National Housing Fund (NHF)', nhfMonthly, setNhfMonthly, 'Usually 2.5% of basic salary')}
            {moneyField('Health insurance (NHIS)', nhisMonthly, setNhisMonthly)}
            <Text style={[type.smallStrong, { color: theme.colors.text, marginTop: 4, marginBottom: 8 }]}>Paid each year</Text>
            {moneyField('Life insurance premium', lifeInsuranceYearly, setLifeInsuranceYearly)}
            {moneyField('Mortgage interest on your home', mortgageInterestYearly, setMortgageInterestYearly)}
            <InfoTip text="If your employer already applies these on your payslip, your take-home should match what we estimate. Amounts you enter are only used for your estimate.">
              Already on your payslip?
            </InfoTip>
          </Card>
        </>
      ) : null}

      <PrimaryButton title="Save tax settings" disabled={!validation.canSave} loading={isSavingTax} onPress={saveTax} style={{ marginTop: 14 }} />

      {optInTaxFeature && taxPreviewError ? (
        <Card style={{ marginTop: 10 }}>
          <Text style={[type.bodyStrong, { color: theme.colors.error }]}>Tax estimate unavailable</Text>
          <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 4 }]}>{taxPreviewError}</Text>
        </Card>
      ) : null}

      {mode === 'whatIf' && extraBudgetMonthly != null ? (
        <Card style={{ marginTop: 10 }}>
          <Text style={[type.caption, { color: theme.colors.textMuted }]}>What-if impact</Text>
          <Text style={[type.bodyStrong, { color: extraBudgetMonthly > 0 ? theme.colors.success : theme.colors.warn, marginTop: 4 }]}>
            {extraBudgetMonthly > 0
              ? `You’d have about ${formatMoney(Math.round(extraBudgetMonthly), currency)} more to budget each month 🎉`
              : `You’d have about ${formatMoney(Math.abs(Math.round(extraBudgetMonthly)), currency)} less to budget each month.`}
          </Text>
        </Card>
      ) : null}

      {mode === 'whatIf' && optInTaxFeature && baselineNet == null ? (
        <Card style={{ marginTop: 10 }}>
          <Text style={[type.caption, { color: theme.colors.textMuted }]}>Tip</Text>
          <Text style={[type.bodyStrong, { color: theme.colors.text, marginTop: 4 }]}>Save your “Current profile” once, then compare scenarios here.</Text>
        </Card>
      ) : null}

      <Sheet visible={showCountryPicker} onClose={() => setShowCountryPicker(false)} title="Select country" subtitle="We use this country’s tax rules">
        <ListCard>
          {COUNTRIES.map((c) => (
            <ListRow
              key={c.code}
              title={c.name}
              subtitle={c.code}
              onPress={() => {
                setCountry(c.code);
                setShowCountryPicker(false);
              }}
              right={c.code === country ? <Check color={theme.colors.primary} size={18} /> : undefined}
            />
          ))}
        </ListCard>
      </Sheet>
    </Screen>
  );
}
