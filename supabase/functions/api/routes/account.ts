import { iso, isUuid, sql } from '../lib/db.ts';
import { adminAuth, requireAuth, updateOwnPassword } from '../lib/auth.ts';
import { body, HttpError, json, methodNotAllowed, noContent, notFound, z } from '../lib/http.ts';
import { DEFAULT_NOTIFICATION_PREFS, getNotificationPrefs, notifyUser } from '../lib/notify.ts';
import { enforceRateLimit } from '../lib/rateLimit.ts';
import { sendEmail } from '../lib/email.ts';
import type { Ctx } from '../index.ts';

export function toApiUser(p: any, _opts: { withTax?: boolean } = {}) {
  return {
    id: p.id,
    email: p.email,
    name: p.name ?? null,
    currency: p.currency ?? null,
    locale: p.locale ?? null,
    monthlyIncome: p.monthlyIncome == null ? null : Number(p.monthlyIncome),
    taxProfile: p.taxProfile ?? null,
    onboarding: {
      completedAt: iso(p.onboardingCompletedAt),
      skippedAt: iso(p.onboardingSkippedAt),
      painPoints: p.painPoints ?? []
    },
    budgetPeriod: p.budgetPeriod ?? 'payday',
    budgetMode: p.budgetMode ?? 'solo',
    homeBudget: p.homeBudget ?? 'own',
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt)
  };
}

export async function loadProfile(userId: string, email: string | null) {
  let [p] = await sql`select * from public.profiles where id = ${userId}`;
  if (!p) {
    // Safety net for accounts created before the signup trigger existed.
    [p] = await sql`
      insert into public.profiles (id, email) values (${userId}, ${email ?? ''})
      on conflict (id) do update set email = public.profiles.email
      returning *
    `;
  }
  return p;
}

/** GET /v1/auth/me */
export async function authMe(ctx: Ctx) {
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const auth = await requireAuth(ctx.req);
  return json(200, { user: toApiUser(await loadProfile(auth.userId, auth.email)) });
}

const TaxProfileSchema = z
  .object({
    country: z.string().min(2).max(8).optional(),
    withheldByEmployer: z.boolean().optional(),
    netMonthlyIncome: z.number().finite().nonnegative().optional(),
    grossMonthlyIncome: z.number().finite().nonnegative().optional(),
    incomeType: z.enum(['gross', 'net']).optional(),
    residentType: z.string().max(50).optional(),
    dependents: z.number().int().nonnegative().optional(),
    // Monthly amounts
    pensionContribution: z.number().finite().nonnegative().optional(),
    nhfContribution: z.number().finite().nonnegative().optional(),
    nhisContribution: z.number().finite().nonnegative().optional(),
    // Yearly amounts
    annualRent: z.number().finite().nonnegative().optional(),
    lifeInsurancePremium: z.number().finite().nonnegative().optional(),
    mortgageInterest: z.number().finite().nonnegative().optional(),
    optInTaxFeature: z.boolean().optional()
  })
  .strict()
  .optional();

const PatchMeSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    currency: z.string().min(1).max(10).optional(),
    locale: z.string().min(2).max(20).optional(),
    monthlyIncome: z.number().finite().nonnegative().optional(),
    taxProfile: TaxProfileSchema,
    budgetPeriod: z.enum(['payday', 'monthly']).optional(),
    painPoints: z.array(z.enum(['runs_out', 'no_idea', 'cant_save', 'debt', 'irregular'])).max(5).optional(),
    budgetMode: z.enum(['solo', 'shared', 'both']).optional(),
    homeBudget: z.enum(['own', 'shared']).optional()
  })
  .strict();

/** GET/PATCH /v1/users/me */
export async function usersMe(ctx: Ctx) {
  if (ctx.method !== 'GET' && ctx.method !== 'PATCH') methodNotAllowed(['GET', 'PATCH']);
  const auth = await requireAuth(ctx.req);
  const current = await loadProfile(auth.userId, auth.email);
  if (ctx.method === 'GET') return json(200, { user: toApiUser(current, { withTax: true }) });

  const patch = await body(ctx.req, PatchMeSchema);
  const [p] = await sql`
    update public.profiles set
      name = ${patch.name !== undefined ? patch.name : current.name},
      currency = ${patch.currency !== undefined ? patch.currency : current.currency},
      locale = ${patch.locale !== undefined ? patch.locale : current.locale},
      monthly_income = ${patch.monthlyIncome !== undefined ? patch.monthlyIncome : current.monthlyIncome},
      tax_profile = ${patch.taxProfile !== undefined ? sql.json(patch.taxProfile as any) : current.taxProfile ? sql.json(current.taxProfile) : null},
      budget_period = ${patch.budgetPeriod ?? current.budgetPeriod},
      budget_mode = ${patch.budgetMode ?? current.budgetMode ?? 'solo'},
      home_budget = ${patch.homeBudget ?? current.homeBudget ?? 'own'},
      pain_points = ${patch.painPoints ?? current.painPoints}
    where id = ${auth.userId}
    returning *
  `;
  return json(200, { user: toApiUser(p, { withTax: true }) });
}

const ForgotSchema = z.object({ email: z.string().email() });

/**
 * POST /v1/auth/forgot-password — emails a 6-digit reset code. The app confirms it with Supabase Auth
 * (verifyOtp, type "recovery") and then sets the new password. Always answers the same way, so it
 * can't be used to discover accounts.
 */
export async function forgotPassword(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { email: raw } = await body(ctx.req, ForgotSchema, 'Enter a valid email address');
  const email = raw.trim().toLowerCase();
  const ip = (ctx.req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  await enforceRateLimit({ key: `forgot:ip:${ip}`, limit: 20, windowSec: 60 * 60 });
  await enforceRateLimit({ key: `forgot:email:${email}`, limit: 5, windowSec: 60 * 60 });

  const okBody: Record<string, unknown> = { ok: true };
  const { data, error } = await adminAuth().generateLink({ type: 'recovery', email });
  const code = data?.properties?.email_otp;
  if (error || !code) return json(200, okBody);

  await sendEmail({
    to: email,
    subject: `${code} is your BudgetFriendly reset code`,
    text: `Use this code to reset your BudgetFriendly password: ${code}\n\nIt expires in 15 minutes. If you didn't ask for a reset, you can ignore this email; your password hasn't changed.`,
    html: `<p>Use this code to reset your BudgetFriendly password:</p><p style="font-size:28px;font-weight:600;letter-spacing:6px">${code}</p><p>It expires in 15 minutes. If you didn't ask for a reset, you can ignore this email; your password hasn't changed.</p>`
  });

  // Opt-in only, for test projects without email delivery: returns the code to the app.
  if (Deno.env.get('AUTH_DEV_EXPOSE_RESET_CODE') === '1') okBody.devCode = code;
  return json(200, okBody);
}

const ChangePasswordSchema = z.object({ oldPassword: z.string().min(1), newPassword: z.string().min(8) });

/** POST /v1/auth/change-password — checks the current password before setting a new one. */
export async function changePassword(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const auth = await requireAuth(ctx.req);
  const input = await body(ctx.req, ChangePasswordSchema, 'New password must be at least 8 characters');

  const [row] = await sql`
    select coalesce(encrypted_password = extensions.crypt(${input.oldPassword}, encrypted_password), false) as ok
    from auth.users where id = ${auth.userId}
  `;
  if (!row?.ok) throw new HttpError(400, 'INVALID_PASSWORD', 'Your current password is incorrect');

  const updated = await updateOwnPassword(auth.token, input.newPassword);
  if (!updated.ok) {
    if (updated.code === 'same_password') throw new HttpError(400, 'VALIDATION_ERROR', 'Choose a password you haven’t used for this account.');
    if (updated.code === 'weak_password') throw new HttpError(400, 'VALIDATION_ERROR', 'Choose a stronger password with at least 8 characters.');
    throw new HttpError(400, 'VALIDATION_ERROR', updated.message);
  }

  await notifyUser(auth.userId, {
    kind: 'security',
    title: 'Password changed',
    body: 'Your BudgetFriendly password was just changed. If this was not you, reset it now from the sign-in screen.'
  }).catch(() => undefined);
  return noContent();
}

/**
 * GET    /v1/auth/sessions                 signed-in devices
 * POST   /v1/auth/sessions/revoke-others   sign out every other device
 * DELETE /v1/auth/sessions/:id             sign out one device
 */
export async function sessions(ctx: Ctx) {
  const auth = await requireAuth(ctx.req);
  const id = ctx.parts[2] ?? null;

  if (ctx.method === 'GET' && !id) {
    const rows = await sql`
      select s.id, s.created_at, s.user_agent, d.device_name, d.platform,
             greatest(s.created_at, coalesce(s.refreshed_at, s.created_at), coalesce(d.last_seen_at, s.created_at)) as last_used_at
      from auth.sessions s
      left join public.device_sessions d on d.session_id = s.id
      where s.user_id = ${auth.userId} and (s.not_after is null or s.not_after > now())
      order by last_used_at desc
    `;
    return json(200, {
      items: rows.map((s) => ({
        id: s.id,
        deviceName: s.deviceName ?? null,
        startedAt: iso(s.createdAt),
        lastUsedAt: iso(s.lastUsedAt),
        current: s.id === auth.sessionId
      }))
    });
  }

  if (ctx.method === 'POST' && id === 'revoke-others') {
    if (!auth.sessionId) throw new HttpError(400, 'SESSION_UNKNOWN', 'Sign out and back in on this phone first, then try again.');
    const removed = await sql`delete from auth.sessions where user_id = ${auth.userId} and id <> ${auth.sessionId} returning id`;
    return json(200, { revoked: removed.length });
  }

  if (ctx.method === 'DELETE' && id) {
    if (id === auth.sessionId) throw new HttpError(400, 'CURRENT_SESSION', 'To sign out this phone, use Log out.');
    if (!isUuid(id)) notFound('Device not found');
    const removed = await sql`delete from auth.sessions where id = ${id} and user_id = ${auth.userId} returning id`;
    if (!removed.length) notFound('Device not found');
    return json(200, { ok: true });
  }

  methodNotAllowed(['GET', 'POST', 'DELETE']);
}

const TokenSchema = z.object({
  token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[.+\]$/, 'Not an Expo push token'),
  platform: z.string().max(20).optional()
});

/** POST registers this device for push; DELETE removes it (e.g. on log out). */
export async function pushTokens(ctx: Ctx) {
  if (ctx.method !== 'POST' && ctx.method !== 'DELETE') methodNotAllowed(['POST', 'DELETE']);
  const auth = await requireAuth(ctx.req);
  const input = await body(ctx.req, TokenSchema);
  if (ctx.method === 'DELETE') {
    await sql`delete from public.push_tokens where token = ${input.token} and user_id = ${auth.userId}`;
    return json(200, { ok: true });
  }
  // A device belongs to whoever signed in last on it.
  await sql`
    insert into public.push_tokens (token, user_id, platform) values (${input.token}, ${auth.userId}, ${input.platform ?? 'unknown'})
    on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform
  `;
  return json(200, { ok: true });
}

const PrefsSchema = z
  .object({
    paceAlerts: z.boolean().optional(),
    billReminders: z.boolean().optional(),
    weeklyCheckIn: z.boolean().optional(),
    autoSave: z.boolean().optional(),
    invoiceReminders: z.boolean().optional(),
    sharedActivity: z.boolean().optional()
  })
  .strict();
const SpaceSchema = z.enum(['personal', 'business']);
const ReadSchema = z.object({ ids: z.array(z.string().max(80)).max(200).optional(), spaceId: SpaceSchema.optional() });

/** Notifications for one space, plus account-wide ones (space_id null) that belong in both. */
function inSpace(space: string | null) {
  return space === 'personal' || space === 'business' ? sql`and (space_id = ${space} or space_id is null)` : sql``;
}

/**
 * GET   /v1/notifications            feed (newest first) + unread count
 * POST  /v1/notifications/read       mark some (ids) or all as read
 * GET   /v1/notifications/prefs      delivery preferences
 * PATCH /v1/notifications/prefs
 */
export async function notifications(ctx: Ctx) {
  const auth = await requireAuth(ctx.req);
  const action = ctx.parts[1] ?? null;

  if (action === 'prefs') {
    if (ctx.method === 'GET') return json(200, { prefs: await getNotificationPrefs(auth.userId) });
    if (ctx.method !== 'PATCH') methodNotAllowed(['GET', 'PATCH']);
    const patch = await body(ctx.req, PrefsSchema);
    const next = { ...DEFAULT_NOTIFICATION_PREFS, ...(await getNotificationPrefs(auth.userId)), ...patch };
    await sql`update public.profiles set notification_prefs = ${sql.json(next)} where id = ${auth.userId}`;
    return json(200, { prefs: next });
  }

  if (action === 'read') {
    if (ctx.method !== 'POST') methodNotAllowed(['POST']);
    const input = await body(ctx.req, ReadSchema);
    const ids = (input.ids ?? []).filter(isUuid);
    if (input.ids?.length && !ids.length) return json(200, { updated: 0 });
    const updated = await sql`
      update public.notifications set read_at = now()
      where user_id = ${auth.userId} and read_at is null ${ids.length ? sql`and id in ${sql(ids)}` : inSpace(input.spaceId ?? null)}
      returning id
    `;
    return json(200, { updated: updated.length });
  }

  if (action) notFound('Route not found');
  if (ctx.method !== 'GET') methodNotAllowed(['GET']);
  const beforeRaw = ctx.query.get('before');
  const before = beforeRaw ? new Date(beforeRaw) : null;
  const validBefore = before && !Number.isNaN(before.getTime()) ? before : null;
  const space = ctx.query.get('spaceId');

  const [items, [{ unread }]] = await Promise.all([
    sql`
      select * from public.notifications
      where user_id = ${auth.userId} ${inSpace(space)} ${validBefore ? sql`and created_at < ${validBefore}` : sql``}
      order by created_at desc limit 50
    `,
    sql`select count(*)::int as unread from public.notifications where user_id = ${auth.userId} and read_at is null ${inSpace(space)}`
  ]);
  return json(200, {
    unread,
    items: items.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      data: n.data ?? null,
      spaceId: n.spaceId ?? null,
      read: !!n.readAt,
      createdAt: iso(n.createdAt)
    }))
  });
}
