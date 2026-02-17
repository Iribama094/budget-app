import { readJson, sendJson, sendError, methodNotAllowed } from '../../_lib/http.js';
import { loadRuleForCountry, computeTax } from '../../_lib/tax.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const body = await readJson<any>(req);
    const country = String(body.country ?? '');
    const grossAnnual = Number(body.grossAnnual ?? body.gross ?? 0);
    if (!country) return sendError(res, 400, 'VALIDATION_ERROR', 'Missing country');
    if (!grossAnnual || isNaN(grossAnnual)) return sendError(res, 400, 'VALIDATION_ERROR', 'Missing grossAnnual');

    const rule = loadRuleForCountry(country);
    if (!rule) return sendError(res, 404, 'NOT_FOUND', 'Tax rules not found for country');

    const input = {
      grossAnnual,
      deductions: body.deductions ?? {},
      allowances: body.allowances ?? {}
    };

    const computed = computeTax(rule, input);

    // Map internal compute result to a stable public shape
    const result = {
      grossAnnual: computed.grossAnnual,
      taxableIncome: computed.taxableIncome,
      totalTax: computed.totalTaxAnnual,
      netAnnual: computed.netAnnual,
      netMonthly: computed.netMonthly,
      ruleVersion: computed.ruleVersion,
      minimumTaxApplied: computed.minimumTaxApplied,
      minimumTaxAnnual: computed.minimumTaxAnnual,
      bands: (computed.taxByBracket || []).map((b: any) => ({
        from: b.from,
        to: b.to,
        rate: b.rate,
        taxable: b.taxable,
        amount: Math.round((b.tax ?? 0) * 100) / 100
      }))
    };

    return sendJson(res, 200, { result });
  } catch (err: any) {
    console.error('[tax/calc] error', err);
    return sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected error');
  }
}
