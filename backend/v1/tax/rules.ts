import { sendJson, sendError, methodNotAllowed } from '../../_lib/http.js';
import fs from 'fs';
import path from 'path';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const country = String(req.query?.country ?? '').toLowerCase();
  if (!country) return sendError(res, 400, 'VALIDATION_ERROR', 'Missing country');

  try {
    const file = path.resolve(process.cwd(), 'backend', 'tax_rules', `${country}.json`);
    if (!fs.existsSync(file)) return sendError(res, 404, 'NOT_FOUND', 'Tax rules not found');
    const raw = fs.readFileSync(file, 'utf8');
    const json = JSON.parse(raw);
    // Only return metadata + rule summary
    const meta = {
      country: json.country,
      version: json.version,
      effectiveDate: json.effectiveDate,
      notes: json.notes
    };
    return sendJson(res, 200, { meta, rule: json });
  } catch (err: any) {
    console.error('[tax/rules] error', err);
    return sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected error');
  }
}
