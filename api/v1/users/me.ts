import { z } from 'zod';
import { getDb } from '../../_lib/mongo.js';
import { collections } from '../../_lib/collections.js';
import { methodNotAllowed, readJson, sendError, sendJson } from '../../_lib/http.js';
import { parseWith } from '../../_lib/validate.js';
import { requireUserId } from '../../_lib/user.js';

const TaxProfileSchema = z
  .object({
    country: z.string().min(2).max(8).optional(),
    withheldByEmployer: z.boolean().optional(),
    netMonthlyIncome: z.number().finite().nonnegative().optional(),
    grossMonthlyIncome: z.number().finite().nonnegative().optional(),
    incomeType: z.enum(['gross', 'net']).optional(),
    residentType: z.string().max(50).optional(),
    dependents: z.number().int().nonnegative().optional(),
    pensionContribution: z.number().finite().nonnegative().optional(),
    optInTaxFeature: z.boolean().optional()
  })
  .strict()
  .optional();

const PatchSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    currency: z.string().min(1).max(10).optional(),
    locale: z.string().min(2).max(20).optional(),
    monthlyIncome: z.number().finite().nonnegative().optional(),
    taxProfile: TaxProfileSchema
  })
  .strict();

function toApiUser(user: any) {
  return {
    id: user._id,
    email: user.email,
    name: user.name ?? null,
    currency: user.currency ?? null,
    locale: user.locale ?? null,
    monthlyIncome: user.monthlyIncome ?? null,
    taxProfile: user.taxProfile ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'PATCH') return methodNotAllowed(res, ['GET', 'PATCH']);

  const userId = await requireUserId(req, res);
  if (!userId) return;

  const db = await getDb();
  const { users } = collections(db);

  if (req.method === 'GET') {
    const user = await users.findOne({ _id: userId });
    if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'User no longer exists');
    return sendJson(res, 200, { user: toApiUser(user) });
  }

  try {
    const body = await readJson<unknown>(req);
    const patch = parseWith(PatchSchema, body);

    const now = new Date();

    // Ensure user exists
    const existing = await users.findOne({ _id: userId });
    if (!existing) {
      const newUser = {
        _id: userId,
        email: `test+${userId}@example.com`,
        name: patch.name ?? 'Test User',
        currency: patch.currency ?? 'USD',
        locale: patch.locale ?? 'en-US',
        monthlyIncome: patch.monthlyIncome ?? null,
        taxProfile: patch.taxProfile ?? null,
        passwordHash: '',
        createdAt: now,
        updatedAt: now
      };
      await users.insertOne(newUser);
    } else {
      const update: any = { updatedAt: now };
      if (patch.name !== undefined) update.name = patch.name;
      if (patch.currency !== undefined) update.currency = patch.currency;
      if (patch.locale !== undefined) update.locale = patch.locale;
      if (patch.monthlyIncome !== undefined) update.monthlyIncome = patch.monthlyIncome;
      if (patch.taxProfile !== undefined) update.taxProfile = patch.taxProfile;

      await users.updateOne({ _id: userId }, { $set: update });
    }

    const user = await users.findOne({ _id: userId });
    if (!user) return sendError(res, 500, 'SERVER_ERROR', 'Failed to save user');

    return sendJson(res, 200, { user: toApiUser(user) });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', err.issues);
    }
    return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error');
  }
}
