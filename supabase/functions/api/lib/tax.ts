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
  /** `rate` turns the amount entered into the deduction (e.g. 20% of annual rent); `cap` limits the deduction. */
  deductions?: Record<string, { cap?: number; rate?: number }>;
  minimumTaxRate?: number;
  noTaxIfGrossMonthlyAtOrBelow?: number;
};

// Nigeria Tax Act 2025, in force from 1 January 2026. The old PITA rules (CRA, 7%–24% bands, 1% minimum tax) no longer apply.
const RULES: Record<string, TaxRule> = {
  ng: {
    country: 'NG',
    version: '2026-01-01-nta-2025',
    effectiveDate: '2026-01-01',
    currency: 'NGN',
    notes:
      'Nigeria personal income tax (PAYE) estimate under the Nigeria Tax Act 2025 (annual). The first ₦800,000 is tax-free and the Consolidated Relief Allowance and minimum tax are gone. Rent relief is 20% of annual rent up to ₦500,000; pension, NHF, NHIS, life insurance and mortgage interest are deductible. Minimum wage earners are exempt. This is an estimator, not tax advice.',
    lastReviewed: '2026-09-15',
    sources: [
      'https://taxsummaries.pwc.com/nigeria/individual/significant-developments',
      'https://kpmg.com/xx/en/our-insights/gms-flash-alert/flash-alert-2025-168.html'
    ],
    // ₦70,000 a month is the national minimum wage; earners at or below it pay no income tax.
    noTaxIfGrossMonthlyAtOrBelow: 70000,
    allowances: {},
    deductions: {
      annualRent: { rate: 0.2, cap: 500000 },
      pension: {},
      nhf: {},
      nhis: {},
      lifeInsurance: {},
      mortgageInterest: {}
    },
    brackets: [
      { from: 0, to: 800000, rate: 0 },
      { from: 800000, to: 3000000, rate: 0.15 },
      { from: 3000000, to: 12000000, rate: 0.18 },
      { from: 12000000, to: 25000000, rate: 0.21 },
      { from: 25000000, to: 50000000, rate: 0.23 },
      { from: 50000000, to: null, rate: 0.25 }
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
    const d = rule.deductions?.[k];
    totalDeductions += Math.min(Math.max(0, Number(raw) || 0) * (d?.rate ?? 1), d?.cap ?? Infinity);
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
