import { sql } from './db.ts';
import { todayIso } from './dates.ts';
import { z } from './http.ts';

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
  /** Company income tax, owed by a registered business rather than a person. */
  company?: CompanyTaxRule;
};

export type CompanyTaxRule = {
  /** Yearly turnover at or below this pays no company income tax. */
  smallCompanyTurnover: number;
  /** Charged on profit once turnover passes the small company threshold. */
  rate: number;
  note: string;
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
    company: {
      // Kept beside the personal reliefs so a finance act change is a one line edit.
      smallCompanyTurnover: 50000000,
      rate: 0.3,
      note: 'Businesses turning over ₦50m or less a year pay no company income tax. Above that, tax is charged on profit. An estimate for planning, not a filing.'
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

/** The shape a version has to have before it can be saved. Wrong bands are worse than no bands. */
export const RULE_SHAPE = z
  .object({
    country: z.string().min(2).max(60),
    version: z.string().min(1).max(60),
    effectiveDate: z.string().min(4).max(20),
    currency: z.string().max(8).optional(),
    notes: z.string().max(1200).optional(),
    lastReviewed: z.string().max(20).optional(),
    sources: z.array(z.string().max(300)).max(10).optional(),
    brackets: z
      .array(z.object({ from: z.number().min(0), to: z.number().min(0).nullable().optional(), rate: z.number().min(0).max(1) }))
      .min(1)
      .max(12),
    // Allowances come off the gross before the bands. Nigeria's CRA was one of these, so a shape that drops
    // them would quietly overstate what somebody owes.
    allowances: z
      .record(
        z.union([
          z.number().min(0),
          z.object({
            type: z.enum(['percentOfGross', 'maxOfFixedOrPercentOfGross', 'cra']),
            rate: z.number().min(0).max(1).optional(),
            fixed: z.number().min(0).optional(),
            minRate: z.number().min(0).max(1).optional()
          })
        ])
      )
      .optional(),
    deductions: z.record(z.object({ cap: z.number().min(0).optional(), rate: z.number().min(0).max(1).optional() })).optional(),
    minimumTaxRate: z.number().min(0).max(1).optional(),
    noTaxIfGrossMonthlyAtOrBelow: z.number().min(0).optional(),
    company: z
      .object({ smallCompanyTurnover: z.number().min(0), rate: z.number().min(0).max(1), note: z.string().max(400) })
      .optional()
  })
  // Bands that overlap or leave a hole do not fail loudly, they just tax the wrong amount, so they are refused
  // here rather than discovered by somebody's payslip.
  .superRefine((rule, ctx) => {
    const bands = [...rule.brackets].sort((a, b) => a.from - b.from);
    const bad = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['brackets'], message });
    if (bands[0].from !== 0) bad('The first band has to start at 0.');
    bands.forEach((b, i) => {
      const last = i === bands.length - 1;
      if (!last && (b.to == null || b.to <= b.from)) {
        bad(`Band ${i + 1} has to end above where it starts, and only the top band can be open ended.`);
        return;
      }
      if (last && b.to != null) bad('The top band has to be open ended, or the highest earners fall outside every band.');
      const next = bands[i + 1];
      if (next && b.to !== next.from) bad(`Band ${i + 2} has to start exactly where band ${i + 1} ends, with no gap and no overlap.`);
    });
  });

/**
 * Approved versions from the staff console, held for five minutes. Empty means nothing has been approved, and
 * the rules that ship in the code apply, which is how the app behaves today.
 */
let approved: Record<string, TaxRule> = {};
let approvedAt = 0;

/** Called after an approval or a retirement, so the next request sees the change rather than waiting it out. */
export function forgetTaxRules(): void {
  approvedAt = 0;
}

/** Loads the approved versions if the cache is cold. Cheap, and it never throws: the code rules are the floor. */
export async function ensureTaxRules(): Promise<void> {
  if (Date.now() - approvedAt < 5 * 60_000) return;
  try {
    const rows = await sql<{ country: string; payload: TaxRule }[]>`
      select country, payload from public.tax_rule_versions
      where state = 'live' and effective_from <= ${todayIso()}::date
    `;
    const next: Record<string, TaxRule> = {};
    for (const r of rows) next[r.country] = r.payload;
    approved = next;
  } catch {
    // A database hiccup must never change what somebody is told they owe: fall back to the code.
    approved = {};
  }
  approvedAt = Date.now();
}

/** The rules in force: an approved version if there is one, otherwise the ones that ship in the app. */
export function loadRuleForCountry(country: string): TaxRule | null {
  const key = country.toLowerCase();
  return approved[key] ?? RULES[key] ?? null;
}

/** Whether a country is running on an approved version rather than the code. Shown in the console. */
export function ruleSource(country: string): 'approved' | 'code' {
  return approved[country.toLowerCase()] ? 'approved' : 'code';
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


/**
 * What the console shows on its Tax rules screen: the bands and thresholds in force, in the shape a person
 * reads rather than the shape the calculator uses. Read only on purpose, since a wrong band changes what
 * somebody believes they owe.
 */
/**
 * What is in force per country, for the console: the approved version if there is one, otherwise the code.
 *
 * The whole rule goes out, not a summary of it, because the console copies this to start a new version. A
 * summary that dropped reliefs would produce a draft that quietly removes them on approval.
 */
export function taxRulesSummary() {
  return Object.keys(RULES).map((code) => {
    const rule = loadRuleForCountry(code) as TaxRule;
    return {
      code,
      country: rule.country,
      version: rule.version ?? null,
      source: ruleSource(code),
      effectiveDate: rule.effectiveDate ?? null,
      notes: rule.notes ?? null,
      brackets: rule.brackets.map((b) => ({ from: b.from ?? 0, to: b.to ?? null, rate: b.rate })),
      deductions: rule.deductions ?? {},
      allowances: rule.allowances ?? {},
      noTaxIfGrossMonthlyAtOrBelow: rule.noTaxIfGrossMonthlyAtOrBelow ?? null,
      minimumTaxRate: rule.minimumTaxRate ?? null,
      company: rule.company ?? null,
      rule
    };
  });
}
