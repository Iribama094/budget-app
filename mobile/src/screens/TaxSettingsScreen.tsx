import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Switch, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { Screen, H1, P, Card, TextField, PrimaryButton } from '../components/Common/ui';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { calcTax, getTaxRules, patchMe } from '../api/endpoints';
import { COUNTRIES } from '../utils/countries';
import { tokens } from '../theme/tokens';
import { ArrowLeft } from 'lucide-react-native';
import { formatMoney, formatNumberInput, parseNumberInput } from '../utils/format';

export default function TaxSettingsScreen() {
  const nav = useNavigation<any>();
  const { user, refreshUser } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();

  const [country, setCountry] = useState(user?.taxProfile?.country ?? 'NG');
  const [withheldByEmployer, setWithheldByEmployer] = useState<boolean>(user?.taxProfile?.withheldByEmployer ?? false);
  const [netMonthlyIncomeTax, setNetMonthlyIncomeTax] = useState(user?.taxProfile?.netMonthlyIncome != null ? String(user.taxProfile.netMonthlyIncome) : '');
  const [grossMonthlyIncomeTax, setGrossMonthlyIncomeTax] = useState(user?.taxProfile?.grossMonthlyIncome != null ? String(user.taxProfile.grossMonthlyIncome) : '');
  const [incomeType, setIncomeType] = useState<'gross' | 'net'>(user?.taxProfile?.incomeType ?? 'gross');
  const [optInTaxFeature, setOptInTaxFeature] = useState<boolean>(user?.taxProfile?.optInTaxFeature ?? false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [isSavingTax, setIsSavingTax] = useState(false);
  const [mode, setMode] = useState<'current' | 'whatIf'>('current');

  const currency = user?.currency ?? '₦';

  const sanitizeMoney = (v: string) => formatNumberInput(v);

  const countryLabel = useMemo(() => {
    const found = COUNTRIES.find((c) => c.code === country);
    return found ? `${found.name} (${found.code})` : country;
  }, [country]);

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
  }, [grossMonthlyIncomeTax, netMonthlyIncomeTax, optInTaxFeature]);

  const baselineNet = user?.taxProfile?.netMonthlyIncome;
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
  }, [grossValue, isSavingTax, mode, netMonthlyIncomeTax, netValue, optInTaxFeature]);

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
      const res = await calcTax({ country, grossAnnual });
      const r = (res as any)?.result ?? res;
      return {
        grossAnnual: Number(r?.grossAnnual ?? grossAnnual) || grossAnnual,
        taxableIncome: Number(r?.taxableIncome ?? grossAnnual) || grossAnnual,
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
  }, [country, grossValue, netValue, optInTaxFeature, withheldByEmployer]);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={() => nav.goBack()}
          style={({ pressed }) => [
            {
              width: 44,
              height: 44,
              borderRadius: 18,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.92 : 1
            }
          ]}
        >
          <ArrowLeft color={theme.colors.text} size={20} />
        </Pressable>
        <View style={{ marginLeft: 12, flex: 1 }}>
          <H1 style={{ marginBottom: 0 }}>Tax settings</H1>
          <P style={{ marginTop: 4 }}>Fine-tune how we estimate your tax.</P>
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Tax profile</Text>
          <P style={{ marginTop: 8 }}>
            We use this to estimate tax for your budget period. Your budgets stay based on your take-home income.
          </P>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Enable tax features</Text>
              <Text style={{ color: theme.colors.textMuted, marginTop: 4, fontSize: 12 }}>
                Optional — adds tax estimates in budgets and analytics.
              </Text>
            </View>
            <Switch value={optInTaxFeature} onValueChange={setOptInTaxFeature} />
          </View>

          <View style={{ marginTop: 10, flexDirection: 'row', borderRadius: 999, backgroundColor: theme.colors.surfaceAlt, padding: 4 }}>
            {([
              { key: 'current', label: 'Current profile' },
              { key: 'whatIf', label: 'What-if scenario' }
            ] as const).map((opt) => {
              const active = mode === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setMode(opt.key)}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 999,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: active ? theme.colors.primary : 'transparent',
                      opacity: pressed ? 0.92 : 1
                    }
                  ]}
                >
                  <Text style={{ color: active ? tokens.colors.white : theme.colors.text, fontWeight: '800', fontSize: 13 }}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={() => setShowCountryPicker(true)} style={({ pressed }) => [{ paddingVertical: 12, opacity: pressed ? 0.9 : 1 }]}>
            <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Country</Text>
            <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: theme.colors.textMuted, marginTop: 6 }}>{countryLabel}</Text>
          </Pressable>

          {optInTaxFeature ? (
            <View style={{ marginTop: 2 }}>
              {rulesLoading ? (
                <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>Loading tax rules…</Text>
              ) : rulesError ? (
                <Text style={{ color: theme.colors.error, fontSize: 12 }}>Tax rules not confirmed: {rulesError}</Text>
              ) : rulesMeta ? (
                <>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                    Using {String(rulesMeta.country).toUpperCase()} rules ({rulesMeta.brackets} bracket{rulesMeta.brackets === 1 ? '' : 's'})
                  </Text>

                  {rulesMeta.bracketsArr.length ? (
                    <View style={{ marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}>Rules preview</Text>
                        {rulesMeta.bracketsArr.length > 3 ? (
                          <Pressable
                            onPress={() => setShowAllRules((v) => !v)}
                            style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
                          >
                            <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 12 }}>
                              {showAllRules ? 'Hide' : 'View all'}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>

                      {(showAllRules ? rulesMeta.bracketsArr : rulesMeta.bracketsArr.slice(0, 3)).map((b, idx) => {
                        const upToLabel = b.upTo == null ? 'Above' : `Up to ${Number(b.upTo).toLocaleString()}`;
                        const pct = Math.round((b.rate ?? 0) * 100);
                        return (
                          <View key={`${String(b.upTo)}-${idx}`} style={{ marginTop: idx === 0 ? 10 : 8 }}>
                            <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{upToLabel} (annual)</Text>
                            <Text style={{ color: theme.colors.textMuted, marginTop: 2, fontWeight: '800', fontSize: 12 }}>{pct}% rate</Text>
                          </View>
                        );
                      })}

                      <Text style={{ color: theme.colors.textMuted, marginTop: 10, fontSize: 11 }}>
                        This preview confirms the country-specific brackets we loaded. Final tax can still vary due to deductions and allowances.
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Tax withheld by employer</Text>
            <Switch value={withheldByEmployer} onValueChange={setWithheldByEmployer} disabled={!optInTaxFeature} />
          </View>

          <View style={{ marginTop: 12, flexDirection: 'row', borderRadius: 999, backgroundColor: theme.colors.surfaceAlt, padding: 4 }}>
            {([
              { key: 'gross', label: 'Gross salary' },
              { key: 'net', label: 'Take-home pay' }
            ] as const).map((opt) => {
              const active = incomeType === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  disabled={!optInTaxFeature}
                  onPress={() => setIncomeType(opt.key)}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 999,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: active ? theme.colors.primary : 'transparent',
                      opacity: !optInTaxFeature ? 0.5 : pressed ? 0.92 : 1
                    }
                  ]}
                >
                  <Text style={{ color: active ? tokens.colors.white : theme.colors.text, fontWeight: '800', fontSize: 13 }}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {optInTaxFeature && !withheldByEmployer ? (
            <>
              <TextField
                label="Gross monthly income (before tax)"
                value={grossMonthlyIncomeTax}
                onChangeText={(v) => setGrossMonthlyIncomeTax(sanitizeMoney(v))}
                placeholder="0"
                keyboardType="decimal-pad"
                editable={optInTaxFeature}
              />

              {optInTaxFeature && validation.grossError ? (
                <Text style={{ color: theme.colors.error, marginTop: -6, fontSize: 12 }}>{validation.grossError}</Text>
              ) : null}
            </>
          ) : null}

          <TextField
            label="Net monthly (take-home, optional)"
            value={netMonthlyIncomeTax}
            onChangeText={(v) => setNetMonthlyIncomeTax(sanitizeMoney(v))}
            placeholder="0"
            keyboardType="decimal-pad"
            editable={optInTaxFeature && (withheldByEmployer || mode === 'whatIf')}
          />

          {optInTaxFeature && !withheldByEmployer && mode === 'current' ? (
            <Text style={{ color: theme.colors.textMuted, marginTop: -6, fontSize: 12 }}>
              Tip: if your employer withholds tax, turn on “withheld by employer” to enter your take-home amount.
            </Text>
          ) : null}

          {optInTaxFeature && validation.netError ? (
            <Text style={{ color: theme.colors.error, marginTop: 6, fontSize: 12 }}>{validation.netError}</Text>
          ) : null}

          <View style={{ marginTop: 12 }}>
            <PrimaryButton
              title={isSavingTax ? 'Saving tax settings…' : 'Save tax settings'}
              disabled={!validation.canSave}
              onPress={async () => {
                if (!user) return;
                setIsSavingTax(true);
                try {
                  const gross = grossMonthlyIncomeTax.trim() ? Number(grossMonthlyIncomeTax.replace(/,/g, '')) : undefined;
                  const net = netMonthlyIncomeTax.trim() ? Number(netMonthlyIncomeTax.replace(/,/g, '')) : undefined;
                  await patchMe({
                    taxProfile: {
                      ...(user.taxProfile ?? {}),
                      country,
                      withheldByEmployer,
                      netMonthlyIncome: typeof net === 'number' && !Number.isNaN(net) ? net : undefined,
                      grossMonthlyIncome: !withheldByEmployer && typeof gross === 'number' && !Number.isNaN(gross) ? gross : undefined,
                      incomeType: withheldByEmployer ? 'net' : incomeType,
                      optInTaxFeature
                    }
                  });
                  await refreshUser();
                  toast.show('Tax settings updated', 'success');
                } catch (e) {
                  toast.show(e instanceof Error ? e.message : 'Failed to save tax settings', 'error');
                } finally {
                  setIsSavingTax(false);
                }
              }}
            />
          </View>

          {mode === 'whatIf' ? (
            <Text style={{ color: theme.colors.textMuted, marginTop: 8, fontSize: 12 }}>
              What-if mode doesn’t save — use it to compare scenarios.
            </Text>
          ) : null}

          {optInTaxFeature && taxPreviewLoading ? (
            <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={{ color: theme.colors.textMuted }}>Calculating estimate…</Text>
            </View>
          ) : null}

          {optInTaxFeature && taxPreviewError ? (
            <View style={{ marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt }}>
              <Text style={{ color: theme.colors.error, fontWeight: '800' }}>Tax estimate unavailable</Text>
              <Text style={{ color: theme.colors.textMuted, marginTop: 4 }}>{taxPreviewError}</Text>
            </View>
          ) : null}

          {optInTaxFeature && taxPreview && !taxPreviewLoading ? (
            <View style={{ marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt }}>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}>Estimated tax</Text>
              <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 4 }}>
                {formatMoney(taxPreview.totalTax, currency)} / year
              </Text>
              <Text style={{ color: theme.colors.textMuted, marginTop: 4 }}>
                About {formatMoney(taxPreview.totalTax / 12, currency)} / month • Taxable {formatMoney(taxPreview.taxableIncome, currency)} / year
              </Text>
            </View>
          ) : null}

          {effectiveRateInfo && (
            <View style={{ marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt }}>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}>Tax summary</Text>
              <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 4 }}>
                Approx. effective rate {effectiveRateInfo.pct}% ({effectiveRateInfo.bracket})
              </Text>
              <P style={{ marginTop: 4 }}>
                This is based on the gross vs net monthly amounts you entered.
              </P>
            </View>
          )}

          {mode === 'whatIf' && extraBudgetMonthly != null && (
            <View style={{ marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt }}>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}>What-if impact</Text>
              <Text style={{ color: extraBudgetMonthly > 0 ? tokens.colors.success[600] : tokens.colors.warning[600], fontWeight: '900', marginTop: 4 }}>
                {extraBudgetMonthly > 0
                  ? `If this scenario applied, you’d have about ₦${Math.round(extraBudgetMonthly).toLocaleString()} more to budget each month.`
                  : `If this scenario applied, you’d have about ₦${Math.abs(Math.round(extraBudgetMonthly)).toLocaleString()} less to budget each month.`}
              </Text>
            </View>
          )}

          {mode === 'whatIf' && optInTaxFeature && baselineNet == null ? (
            <View style={{ marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt }}>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}>Tip</Text>
              <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 4 }}>
                Save your “Current profile” once, then compare scenarios here.
              </Text>
            </View>
          ) : null}
        </Card>
      </View>

      {showCountryPicker ? (
        <Modal transparent animationType="fade" onRequestClose={() => setShowCountryPicker(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center' }}>
            <View style={{ margin: 20, backgroundColor: theme.colors.background, borderRadius: 16, overflow: 'hidden' }}>
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderColor: theme.colors.border,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Select country</Text>
                <Pressable onPress={() => setShowCountryPicker(false)}>
                  <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Close</Text>
                </Pressable>
              </View>
              <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ padding: 12 }}>
                {COUNTRIES.map((c) => (
                  <Pressable
                    key={c.code}
                    onPress={() => {
                      setCountry(c.code);
                      setShowCountryPicker(false);
                    }}
                    style={({ pressed }) => [
                      {
                        paddingVertical: 12,
                        paddingHorizontal: 8,
                        borderRadius: 8,
                        backgroundColor: pressed || c.code === country ? theme.colors.surfaceAlt : 'transparent'
                      }
                    ]}
                  >
                    <Text style={{ color: theme.colors.text }}>
                      {c.name} ({c.code})
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </Screen>
  );
}
