import { requireAuth } from '../lib/auth.ts';
import { json, methodNotAllowed } from '../lib/http.ts';
import { inRollout, isStaff, listFlags, openWrappedPeriods } from '../lib/admin.ts';
import type { Ctx } from '../index.ts';

/**
 * GET /v1/config: what this person's app should show right now.
 *
 * The phone asks on open and every ten minutes, so switching something off in the console reaches everyone
 * within a minute without an app update. Staff decisions live here; nothing about the person's money does.
 */
export async function appConfig(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const { userId } = await requireAuth(ctx.req);

  const flags = await listFlags();
  const features: Record<string, boolean> = {};
  for (const f of flags) features[f.key] = f.enabled && inRollout(userId, f.key, f.rolloutPercent);

  // Wrapped needs the switch AND a certified period inside its window. Either one missing means the app shows
  // no Wrapped card, no Profile row and sends no notification about it. Personal and business run to their own
  // calendars, so each space answers separately.
  const open = features.money_wrapped ? await openWrappedPeriods() : [];
  const forSpace = (space: 'personal' | 'business') => {
    const p = open.find((x) => x.space === space);
    return p ? { available: true as const, kind: p.kind, quarter: p.quarter, year: p.year, closesOn: p.closesOn } : { available: false as const };
  };

  // Staff can open Wrapped off season to check it before certifying. Nobody else gets the entry point.
  const staff = await isStaff(userId);

  return json(
    200,
    {
      features,
      staff,
      wrapped: { personal: forSpace('personal'), business: forSpace('business') },
      // The app caches this; a short life keeps a switch quick without asking on every screen.
      refreshAfterSeconds: 600
    },
    { 'Cache-Control': 'private, max-age=60' }
  );
}
