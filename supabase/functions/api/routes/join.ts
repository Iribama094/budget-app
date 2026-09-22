import { sql } from '../lib/db.ts';
import { requireAuth } from '../lib/auth.ts';
import { badRequest, body, json, methodNotAllowed, z } from '../lib/http.ts';
import { enforceRateLimit } from '../lib/rateLimit.ts';
import { ROLE_LABEL, type TeamRole } from '../lib/team.ts';
import { businessNameOf, findBusinessInvite, joinBusinessWithCode } from './team.ts';
import { acceptHelperCode, findHelperInvite } from './people.ts';
import { joinBudgetWithCode } from './budgets.ts';
import { budgetLabel } from '../lib/budgets.ts';
import type { Ctx } from '../index.ts';

/*
 * One box for any code. A person shouldn't have to know whether the code in their message is for a shared
 * budget, for helping with someone's money, or for a business they work in: they type it and we work it out.
 *
 * GET  /v1/join?code=ABC123   what this code is for, without using it up
 * POST /v1/join { code }      use it
 *
 * The lookup is rate limited, since a code is the only thing standing between a stranger and somebody's money.
 */

const CodeSchema = z.object({ code: z.string().trim().min(4).max(12) });
const clean = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

export type CodeKind = 'business' | 'helper' | 'budget';

async function look(code: string): Promise<{ kind: CodeKind; name: string; detail: string } | null> {
  const business = await findBusinessInvite(code);
  if (business) {
    return {
      kind: 'business',
      name: await businessNameOf(business.ownerId),
      detail: `Work here as ${ROLE_LABEL[business.role as TeamRole]}. Your own money stays private.`
    };
  }

  const helper = await findHelperInvite(code);
  if (helper) {
    const [owner] = await sql`select name, email from public.profiles where id = ${helper.ownerId}`;
    const who = owner?.name || owner?.email || 'Someone';
    return {
      kind: 'helper',
      name: `${who}’s money`,
      detail: helper.role === 'view' ? 'You’ll be able to see it, and change nothing.' : 'You’ll be able to see it and add spending.'
    };
  }

  const [invite] = await sql`
    select b.name, b.id from public.budget_invites i join public.budgets b on b.id = i.budget_id
    where i.code = ${clean(code)} and i.accepted_by is null and i.expires_at > now()
  `;
  if (invite) return { kind: 'budget', name: budgetLabel(invite.name), detail: 'A shared budget. Everyone in it logs what they spend and sees the same numbers.' };

  return null;
}

/** GET/POST /v1/join */
export async function joinRoute(ctx: Ctx) {
  const { userId, email } = await requireAuth(ctx.req);

  if (ctx.method === 'GET') {
    const code = ctx.query.get('code') ?? '';
    if (clean(code).length < 4) badRequest('Enter the code you were sent.');
    await enforceRateLimit({ key: `code-look:${userId}`, limit: 20, windowSec: 15 * 60 });
    const found = await look(code);
    if (!found) return json(200, { found: false });
    return json(200, { found: true, ...found });
  }

  if (ctx.method !== 'POST') methodNotAllowed(['GET', 'POST']);
  const { code } = await body(ctx.req, CodeSchema);
  await enforceRateLimit({ key: `code-use:${userId}`, limit: 10, windowSec: 15 * 60 });
  const found = await look(code);
  if (!found) badRequest('That code has been used, has run out, or doesn’t exist. Ask for a new one.', 'INVALID_CODE');

  if (found.kind === 'business') {
    const res = await joinBusinessWithCode(userId, code);
    return json(200, { kind: 'business', name: res.businessName, ownerId: res.ownerId, role: res.role, roleLabel: res.roleLabel });
  }
  if (found.kind === 'helper') {
    const res = await acceptHelperCode(userId, email, code);
    return json(200, { kind: 'helper', name: `${res.ownerName}’s money`, ownerId: res.ownerId, role: res.role });
  }
  const budget = await joinBudgetWithCode(userId, code);
  return json(200, { kind: 'budget', name: budgetLabel(budget.name), budgetId: budget.id });
}
