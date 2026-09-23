import { sql } from '../lib/db.ts';
import { badRequest, body, json, methodNotAllowed, noContent, notFound, z } from '../lib/http.ts';
import { audit, requireAdmin } from '../lib/admin.ts';
import { QUOTES } from '../lib/quotes.ts';
import type { Ctx } from '../index.ts';

/**
 * The words that change more often than the code does: the money quotes, and the wording of notifications.
 *
 * Quotes live in content_blocks once seeded, and the notification voice reads any override it finds there, so
 * a change here reaches people on the next message rather than the next release.
 */

const QuoteValue = z.object({
  text: z.string().min(8).max(400),
  author: z.string().min(2).max(120),
  source: z.string().min(2).max(200),
  themes: z.array(z.enum(['saving', 'spending', 'planning', 'patience', 'change'])).min(1),
  local: z.boolean().optional()
});

/** Price news for people who buy what it's about, e.g. a fuel price change for anyone who spends on Transport. */
const PriceAlertValue = z.object({
  title: z.string().min(4).max(80),
  body: z.string().min(4).max(240),
  categories: z.array(z.string().min(1).max(60)).max(10),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

/** The app's exchange rate for a currency, in naira. People can set their own over it. */
const FxRateValue = z.object({ currency: z.string().regex(/^[A-Z]{3}$/), rate: z.number().positive().max(1e7) });

const BlockInput = z.object({
  key: z.string().min(2).max(120),
  kind: z.enum(['quote', 'notification', 'guide', 'tip', 'price_alert', 'fx_rate']),
  value: z.unknown(),
  enabled: z.boolean().optional()
});

/** GET /v1/admin/content?kind=quote: everything the console can edit, newest change first. */
export async function adminContent(ctx: Ctx) {
  const key = ctx.parts[2];

  if (ctx.method === 'GET' && !key) {
    await requireAdmin(ctx.req);
    const kind = ctx.query.get('kind');
    const items = kind
      ? await sql`select key, kind, value, enabled, updated_at from public.content_blocks where kind = ${kind} order by key`
      : await sql`select key, kind, value, enabled, updated_at from public.content_blocks order by kind, key`;
    // How many quotes ship in the code, so the console can offer to seed them the first time.
    return json(200, { items, inCode: QUOTES.length });
  }

  if (ctx.method === 'POST' && !key) {
    const admin = await requireAdmin(ctx.req, 'content');
    const input = await body(ctx.req, BlockInput);
    if (input.kind === 'quote') {
      const parsed = QuoteValue.safeParse(input.value);
      if (!parsed.success) badRequest('A quote needs text, an author and a source anyone can check.');
    }
    if (input.kind === 'price_alert' && !PriceAlertValue.safeParse(input.value).success) badRequest('A price alert needs a title, a short message and the categories it is about.');
    if (input.kind === 'fx_rate' && !FxRateValue.safeParse(input.value).success) badRequest('A rate needs a three-letter currency code and a rate in naira.');
    const [row] = await sql`
      insert into public.content_blocks (key, kind, value, enabled, updated_by)
      values (${input.key}, ${input.kind}, ${sql.json(input.value as any)}, ${input.enabled ?? true}, ${admin.id})
      on conflict (key) do update set value = excluded.value, enabled = excluded.enabled, updated_by = excluded.updated_by
      returning key, kind, value, enabled, updated_at
    `;
    await audit(admin, 'content.save', row.key, { kind: row.kind });
    return json(201, { block: row });
  }

  if (ctx.method === 'PATCH' && key) {
    const admin = await requireAdmin(ctx.req, 'content');
    const input = await body(ctx.req, z.object({ value: z.unknown().optional(), enabled: z.boolean().optional() }));
    const [before] = await sql`select key, kind, enabled from public.content_blocks where key = ${key}`;
    if (!before) notFound('No such block');
    const [row] = await sql`
      update public.content_blocks set
        value = coalesce(${input.value === undefined ? null : sql.json(input.value as any)}, value),
        enabled = coalesce(${input.enabled ?? null}, enabled),
        updated_by = ${admin.id}
      where key = ${key}
      returning key, kind, value, enabled, updated_at
    `;
    await audit(admin, 'content.update', key, { enabled: row.enabled });
    return json(200, { block: row });
  }

  if (ctx.method === 'DELETE' && key) {
    const admin = await requireAdmin(ctx.req, 'content');
    const [row] = await sql`delete from public.content_blocks where key = ${key} returning key`;
    if (!row) notFound('No such block');
    await audit(admin, 'content.delete', key);
    return noContent();
  }

  methodNotAllowed(['GET', 'POST', 'PATCH', 'DELETE']);
}

/**
 * POST /v1/admin/content/seed-quotes: copies the quotes that ship in the code into the database, once, so
 * they can be edited without a release. Existing rows are left alone.
 */
export async function adminSeedQuotes(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const admin = await requireAdmin(ctx.req, 'content');
  let added = 0;
  for (const q of QUOTES) {
    const [row] = await sql`
      insert into public.content_blocks (key, kind, value, updated_by)
      values (${`quote.${q.id}`}, 'quote', ${sql.json({ text: q.text, author: q.author, source: q.source, themes: q.themes, local: q.local ?? false })}, ${admin.id})
      on conflict (key) do nothing
      returning key
    `;
    if (row) added++;
  }
  await audit(admin, 'content.seed-quotes', null, { added });
  return json(200, { added, total: QUOTES.length });
}
