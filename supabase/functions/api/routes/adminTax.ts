import { sql } from '../lib/db.ts';
import { badRequest, body, json, methodNotAllowed, notFound, z } from '../lib/http.ts';
import { audit, requireAdmin } from '../lib/admin.ts';
import { RULE_SHAPE, forgetTaxRules, loadRuleForCountry, taxRulesSummary } from '../lib/tax.ts';
import { todayIso } from '../lib/dates.ts';
import type { Ctx } from '../index.ts';

/**
 * Editing the tax rules, with the safeguards that make it safe to edit them at all: a draft anyone on the
 * finance side can work on, a pending state nobody can quietly change, and a second person to approve it.
 * The version it replaces is retired rather than deleted, so a past period still reads correctly.
 */

const VersionInput = z.object({
  country: z.string().length(2),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Left out to copy what is in force, which is how the console starts every draft. */
  payload: RULE_SHAPE.optional(),
  note: z.string().max(400).optional()
});

/** GET /v1/admin/tax-rules — what is live, what is waiting, and what the code would fall back to. */
export async function adminTaxRules(ctx: Ctx) {
  if (ctx.method === 'GET' && !ctx.parts[2]) {
    const admin = await requireAdmin(ctx.req);
    const versions = await sql`
      select v.id, v.country, v.effective_from, v.state, v.note, v.payload, v.created_at, v.approved_at,
             c.email as created_by_email, a.email as approved_by_email, v.created_by
      from public.tax_rule_versions v
      left join public.admin_users c on c.id = v.created_by
      left join public.admin_users a on a.id = v.approved_by
      order by v.country, v.effective_from desc
    `;
    return json(200, { editable: true, you: admin.id, inCode: taxRulesSummary(), versions, today: todayIso() });
  }

  if (ctx.method === 'POST' && !ctx.parts[2]) {
    const admin = await requireAdmin(ctx.req, 'taxRules');
    const input = await body(ctx.req, VersionInput);
    const country = input.country.toLowerCase();

    // Copying happens here rather than in the browser. The console only ever saw a summary, so a payload it
    // rebuilt would arrive missing the reliefs, and approving it would quietly raise everybody's estimate.
    let payload: unknown = input.payload;
    if (!payload) {
      const inForce = loadRuleForCountry(country);
      if (!inForce) badRequest('There are no rules for that country to copy from.');
      payload = { ...inForce, effectiveDate: input.effectiveFrom, version: `${inForce.country} ${input.effectiveFrom}` };
    }

    const [existing] = await sql`
      select id, state from public.tax_rule_versions
      where country = ${country} and effective_from = ${input.effectiveFrom}::date
    `;
    if (existing) {
      badRequest(
        existing.state === 'retired'
          ? 'There is already a retired version for that date. Pick another date rather than reusing it, so the history stays readable.'
          : `There is already a ${existing.state} version starting that day. Edit that one, or give this one a different date.`
      );
    }

    const [row] = await sql`
      insert into public.tax_rule_versions (country, effective_from, payload, note, created_by)
      values (${country}, ${input.effectiveFrom}::date, ${sql.json(payload as any)}, ${input.note ?? null}, ${admin.id})
      returning id, country, effective_from, state, payload, note, created_at, created_by
    `;
    await audit(admin, 'tax.draft', `${country} from ${input.effectiveFrom}`);
    return json(201, { version: row });
  }

  methodNotAllowed(['GET', 'POST']);
}

/** PATCH /v1/admin/tax-rules/:id, and POST /v1/admin/tax-rules/:id/:action for submit, approve and retire. */
export async function adminTaxVersion(ctx: Ctx) {
  const id = ctx.parts[2] ?? '';
  const action = ctx.parts[3];

  const [version] = await sql`select * from public.tax_rule_versions where id::text = ${id}`;
  if (!version) notFound('No such version');

  if (ctx.method === 'PATCH' && !action) {
    const admin = await requireAdmin(ctx.req, 'taxRules');
    if (version.state !== 'draft') badRequest('Only a draft can be edited. Make a new version instead.');
    const input = await body(ctx.req, z.object({ payload: RULE_SHAPE.optional(), note: z.string().max(400).optional(), effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }));
    const [row] = await sql`
      update public.tax_rule_versions set
        payload = coalesce(${input.payload ? sql.json(input.payload as any) : null}, payload),
        note = coalesce(${input.note ?? null}, note),
        effective_from = coalesce(${input.effectiveFrom ?? null}::date, effective_from)
      where id::text = ${id}
      returning id, state, effective_from, payload, note
    `;
    await audit(admin, 'tax.edit-draft', `${version.country} from ${row.effectiveFrom}`);
    return json(200, { version: row });
  }

  if (ctx.method !== 'POST') methodNotAllowed(['PATCH', 'POST']);
  const admin = await requireAdmin(ctx.req, 'taxRules');

  if (action === 'submit') {
    if (version.state !== 'draft') badRequest('Only a draft can be sent for approval.');
    // Checked again on the way out of draft: the shape may have tightened since this one was written.
    const check = RULE_SHAPE.safeParse(version.payload);
    if (!check.success) {
      badRequest(`This draft is not ready: ${check.error.issues.map((i) => i.message).join(' ')}`);
    }
    await sql`update public.tax_rule_versions set state = 'pending' where id::text = ${id}`;
    await audit(admin, 'tax.submit', `${version.country} from ${version.effectiveFrom}`);
    return json(200, { state: 'pending', message: 'Sent for approval. Someone else has to approve it before it counts.' });
  }

  if (action === 'approve') {
    if (version.state !== 'pending') badRequest('Only a pending version can be approved.');
    // The rule that matters: never your own change.
    if (String(version.createdBy ?? '') === admin.id) {
      badRequest('You wrote this one. Someone else has to approve it, which is the whole point of the step.');
    }
    await sql`update public.tax_rule_versions set state = 'retired' where country = ${version.country} and state = 'live'`;
    await sql`
      update public.tax_rule_versions set state = 'live', approved_by = ${admin.id}, approved_at = now()
      where id::text = ${id}
    `;
    forgetTaxRules();
    await audit(admin, 'tax.approve', `${version.country} from ${version.effectiveFrom}`, { note: version.note ?? null });
    return json(200, { state: 'live', message: 'Approved and live. The version it replaced is retired, not deleted.' });
  }

  if (action === 'retire') {
    if (version.state !== 'live') badRequest('Only the live version can be retired.');
    await sql`update public.tax_rule_versions set state = 'retired' where id::text = ${id}`;
    forgetTaxRules();
    const back = loadRuleForCountry(version.country as string);
    await audit(admin, 'tax.retire', `${version.country} from ${version.effectiveFrom}`);
    return json(200, {
      state: 'retired',
      message: back ? 'Retired. Estimates fall back to the rules that ship in the app.' : 'Retired.'
    });
  }

  badRequest('Unknown action');
}
