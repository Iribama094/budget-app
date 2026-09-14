export type TaxBracket = { from: number | null; to: number | null; rate: number };

export type TaxRule = {
  country: string;
  version: string;
  effectiveDate: string;
  currency?: string;
  notes?: string;
  lastReviewed?: string;
  sources?: string[];
  brackets: TaxBracket[];
  allowances?: Record<string, number | { type: string; rate?: number; fixed?: number; minRate?: number }>;
  deductions?: Record<string, { cap?: number }>;
  minimumTaxRate?: number;
  noTaxIfGrossMonthlyAtOrBelow?: number;
};

// Same rules as backend/tax_rules/*.json.
const RULES: Record<string, TaxRule> = {
  ng: {
    country: 'NG',
    version: '2025-09-29-v1',
    effectiveDate: '2024-05-01',
    currency: 'NGN',
    notes:
      'Nigeria PAYE (PIT) estimate rules (annual). Includes Consolidated Relief Allowance (CRA) and minimum tax. Gross income definition and exemptions can vary by taxpayer and state interpretation; this is an estimator.',
    lastReviewed: '2025-09-29',
    sources: ['https://taxsummaries.pwc.com/nigeria/individual/taxes-on-personal-income', 'https://taxsummaries.pwc.com/nigeria/individual/deductions'],
    noTaxIfGrossMonthlyAtOrBelow: 70000,
    minimumTaxRate: 0.01,
    allowances: { consolidatedReliefAllowance: { type: 'cra', fixed: 200000, minRate: 0.01, rate: 0.2 } },
    deductions: {},
    brackets: [
      { from: 0, to: 300000, rate: 0.07 },
      { from: 300000, to: 600000, rate: 0.11 },
      { from: 600000, to: 1100000, rate: 0.15 },
      { from: 1100000, to: 1600000, rate: 0.19 },
      { from: 1600000, to: 3200000, rate: 0.21 },
      { from: 3200000, to: null, rate: 0.24 }
    ]
  }
};

export function loadRuleForCountry(country: string): TaxRule | null {
  return RULES[country.toLowerCase()] ?? null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeTax(rule: TaxRule, input: { grossAnnual: number; deductions?: Record<string, number>; allowances?: Record<string, number> }) {
  const gross = Math.max(0, input.grossAnnual ?? 0);

  if (typeof rule.noTaxIfGrossMonthlyAtOrBelow === 'number' && rule.noTaxIfGrossMonthlyAtOrBelow >= 0 && gross / 12 <= rule.noTaxIfGrossMonthlyAtOrBelow) {
    return { grossAnnual: gross, taxableIncome: gross, taxByBracket: [], totalTaxAnnual: 0, netAnnual: gross, netMonthly: round2(gross / 12), ruleVersion: rule.version };
  }

  let totalAllowances = 0;
  for (const val of Object.values(rule.allowances ?? {})) {
    if (typeof val === 'number') {
      totalAllowances += val;
      continue;
    }
    if (!val || typeof val !== 'object') continue;
    if (val.type === 'percentOfGross') totalAllowances += gross * Number(val.rate ?? 0);
    else if (val.type === 'maxOfFixedOrPercentOfGross') totalAllowances += Math.max(Math.max(0, Number(val.fixed ?? 0)), gross * Math.max(0, Number(val.rate ?? 0)));
    else if (val.type === 'cra') {
      totalAllowances += gross * Math.max(0, Number(val.rate ?? 0)) + Math.max(Math.max(0, Number(val.fixed ?? 0)), gross * Math.max(0, Number(val.minRate ?? 0)));
    }
  }
  for (const v of Object.values(input.allowances ?? {})) totalAllowances += Number(v) || 0;

  let totalDeductions = 0;
  for (const [k, raw] of Object.entries(input.deductions ?? {})) {
    totalDeductions += Math.min(Math.max(0, Number(raw) || 0), rule.deductions?.[k]?.cap ?? Infinity);
  }

  const taxable = Math.max(0, gross - totalAllowances - totalDeductions);
  const brackets = [...(rule.brackets ?? [])].sort((a, b) => (a.from ?? 0) - (b.from ?? 0));
  const byBracket: { from: number; to: number | null; rate: number; taxable: number; tax: number }[] = [];
  let totalTax = 0;
  for (const b of brackets) {
    const lower = b.from ?? 0;
    const upper = b.to ?? Infinity;
    const amount = Math.max(0, Math.min(taxable, upper) - lower);
    if (amount > 0) {
      const tax = amount * b.rate;
      byBracket.push({ from: lower, to: upper === Infinity ? null : upper, rate: b.rate, taxable: amount, tax });
      totalTax += tax;
    }
  }

  let minimumTaxApplied = false;
  let minimumTaxAnnual: number | undefined;
  if (typeof rule.minimumTaxRate === 'number' && rule.minimumTaxRate > 0 && gross > 0) {
    const minTax = gross * rule.minimumTaxRate;
    if (totalTax < minTax) {
      minimumTaxApplied = true;
      minimumTaxAnnual = round2(minTax);
      totalTax = minTax;
    }
  }

  const netAnnual = gross - totalTax;
  return {
    grossAnnual: gross,
    taxableIncome: taxable,
    taxByBracket: byBracket,
    totalTaxAnnual: round2(totalTax),
    netAnnual: round2(netAnnual),
    netMonthly: round2(netAnnual / 12),
    ruleVersion: rule.version,
    minimumTaxApplied: minimumTaxApplied || undefined,
    minimumTaxAnnual
  };
}
