import fs from 'fs';
import path from 'path';

export type TaxBracket = {
  from: number | null; // inclusive lower bound
  to: number | null; // inclusive upper bound or null for infinity
  rate: number; // decimal (0.1 = 10%)
};

export type TaxRule = {
  country: string;
  version: string;
  effectiveDate: string;
  currency?: string;
  brackets: TaxBracket[];
  allowances?: {
    [key: string]:
      | number
      | {
          type: 'percentOfGross';
          rate: number;
        }
      | {
          type: 'maxOfFixedOrPercentOfGross';
          fixed: number;
          rate: number;
        }
      | {
          // Nigeria: (20% of gross) + max(₦200,000, 1% of gross)
          type: 'cra';
          fixed: number;
          minRate: number;
          rate: number;
        };
  };
  deductions?: { [key: string]: { cap?: number } };
  minimumTaxRate?: number; // e.g., 0.01 => 1% of total income
  noTaxIfGrossMonthlyAtOrBelow?: number; // e.g., national minimum wage threshold
  notes?: string;
};

export type TaxInput = {
  grossAnnual: number;
  deductions?: { [key: string]: number };
  allowances?: { [key: string]: number };
};

export type TaxByBracket = {
  from: number | null;
  to: number | null;
  rate: number;
  taxable: number;
  tax: number;
};

export type TaxResult = {
  grossAnnual: number;
  taxableIncome: number;
  taxByBracket: TaxByBracket[];
  totalTaxAnnual: number;
  netAnnual: number;
  netMonthly: number;
  ruleVersion?: string;
  minimumTaxApplied?: boolean;
  minimumTaxAnnual?: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function computeTax(rule: TaxRule, input: TaxInput): TaxResult {
  const gross = Math.max(0, input.grossAnnual ?? 0);

  if (
    typeof rule.noTaxIfGrossMonthlyAtOrBelow === 'number' &&
    rule.noTaxIfGrossMonthlyAtOrBelow >= 0 &&
    gross / 12 <= rule.noTaxIfGrossMonthlyAtOrBelow
  ) {
    return {
      grossAnnual: gross,
      taxableIncome: gross,
      taxByBracket: [],
      totalTaxAnnual: 0,
      netAnnual: gross,
      netMonthly: round2(gross / 12),
      ruleVersion: rule.version
    };
  }

  // Sum allowances from rule + input allowances
  let totalAllowances = 0;
  if (rule.allowances) {
    for (const k of Object.keys(rule.allowances)) {
      const val = (rule.allowances as any)[k];
      if (typeof val === 'number') {
        totalAllowances += val;
        continue;
      }
      if (!val || typeof val !== 'object') continue;

      if (val.type === 'percentOfGross') {
        totalAllowances += gross * Number(val.rate ?? 0);
      } else if (val.type === 'maxOfFixedOrPercentOfGross') {
        const fixed = Math.max(0, Number(val.fixed ?? 0));
        const rate = Math.max(0, Number(val.rate ?? 0));
        totalAllowances += Math.max(fixed, gross * rate);
      } else if (val.type === 'cra') {
        const fixed = Math.max(0, Number(val.fixed ?? 0));
        const minRate = Math.max(0, Number(val.minRate ?? 0));
        const rate = Math.max(0, Number(val.rate ?? 0));
        totalAllowances += gross * rate + Math.max(fixed, gross * minRate);
      }
    }
  }
  if (input.allowances) for (const k of Object.keys(input.allowances)) totalAllowances += input.allowances[k];

  // Sum deductions with caps
  let totalDeductions = 0;
  if (input.deductions) {
    for (const k of Object.keys(input.deductions)) {
      const val = Math.max(0, input.deductions[k] ?? 0);
      const cap = rule.deductions?.[k]?.cap ?? Infinity;
      totalDeductions += Math.min(val, cap);
    }
  }

  let taxable = gross - totalAllowances - totalDeductions;
  if (taxable < 0) taxable = 0;

  // Apply brackets
  const brackets = [...(rule.brackets ?? [])].sort((a, b) => (a.from ?? 0) - (b.from ?? 0));
  const byBracket: TaxByBracket[] = [];
  let totalTax = 0;

  for (const b of brackets) {
    const lower = b.from ?? 0;
    const upper = b.to ?? Infinity;
    const amount = Math.max(0, Math.min(taxable, upper) - lower);
    const tax = amount * b.rate;
    if (amount > 0) {
      byBracket.push({ from: lower, to: upper === Infinity ? null : upper, rate: b.rate, taxable: amount, tax });
      totalTax += tax;
    }
  }

  let minimumTaxApplied = false;
  let minimumTaxAnnual: number | undefined = undefined;
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

export function loadRuleForCountry(country: string): TaxRule | null {
  try {
    const file = path.resolve(process.cwd(), 'backend', 'tax_rules', `${country.toLowerCase()}.json`);
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as TaxRule;
  } catch (err) {
    return null;
  }
}
