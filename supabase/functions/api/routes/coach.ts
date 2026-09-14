import { sql } from '../lib/db.ts';
import { requireAuth } from '../lib/auth.ts';
import { badRequest, body, json, methodNotAllowed, spaceParam, z } from '../lib/http.ts';
import { computeInsights } from '../lib/insights.ts';
import { assistantReply } from '../lib/assistant.ts';
import { enforceRateLimit } from '../lib/rateLimit.ts';
import type { Ctx } from '../index.ts';

/** GET /v1/insights?spaceId= — personal suggestions learned from the person's own data. */
export async function insightsIndex(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const { userId } = await requireAuth(ctx.req);
  const items = await computeInsights(userId, spaceParam(ctx.query.get('spaceId')) ?? 'personal');
  return json(200, { items, generatedAt: new Date().toISOString() });
}

/** POST /v1/insights/:key/dismiss — hides that suggestion for two weeks. */
export async function insightDismiss(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { userId } = await requireAuth(ctx.req);
  const key = ctx.parts[1] ?? '';
  if (!key || key.length > 200) badRequest('Unknown insight');
  await sql`
    insert into public.insight_dismissals (user_id, key) values (${userId}, ${key})
    on conflict (user_id, key) do update set dismissed_at = now()
  `;
  return json(200, { ok: true });
}

const ChatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) }))
    .max(20)
    .default([])
});

/** POST /v1/assistant/chat — ask Flux, the AI money coach. */
export async function assistantChat(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { userId } = await requireAuth(ctx.req);
  const input = await body(ctx.req, ChatSchema, 'Type a question for Flux');
  await enforceRateLimit({ key: `assistant:${userId}`, limit: 40, windowSec: 60 * 60 });
  return json(200, { reply: await assistantReply(userId, input.message, input.history) });
}
