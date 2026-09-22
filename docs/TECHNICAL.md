# BudgetFriendly: technical documentation

How the system is built, how data is protected, and how to change and ship it safely. For what it does, see [FUNCTIONAL.md](FUNCTIONAL.md). For day to day commands, see [DEPLOY.md](../DEPLOY.md).

## Architecture

```
 Phone app (Expo)          Staff console (Vite, Vercel)        Marketing / waitlist sites
      |                              |                                   |
      |  Supabase Auth (sign-in, sessions, MFA)                          |
      |------------------------------|-----------------------------------|
      v                              v                                   v
            Edge Function `api`  (Deno, TypeScript)   /functions/v1/api/v1/...
                 |           |              |              |            |
                 v           v              v              v            v
            Postgres     Brevo (email)   Groq (AI)     Mono (banks)   Expo push
          (RLS on, no
          Data API grants)
                 ^
                 |  pg_cron 05:00 UTC -> /v1/cron/daily (secret in Vault)
```

- **Everything goes through the `api` function.** Clients use Supabase directly only for sign-in and sessions. No client reads or writes tables.
- **One Supabase project**, `budgetfriendly` (ref `uggmyokbpwfdbustnggo`, region eu-west-2, London).
- **No servers to run.** Supabase and Vercel host everything; the laptop is only needed today to serve the app to Expo Go during development.

## Components

| Part | Stack | Entry point |
| --- | --- | --- |
| Phone app | Expo SDK 57, React Native 0.86, React Navigation 7, TypeScript strict | `mobile/App.tsx` |
| API | Deno Edge Function, `postgres` (postgres.js), zod validation | `supabase/functions/api/index.ts` (router) |
| Database | Postgres 17.6 on Supabase, 47 tables (22 September 2026), migrations in `supabase/migrations` | `npx supabase migration list --linked` |
| Staff console | Vite, React, TypeScript, supabase-js for auth | `admin/src/App.tsx` |
| Marketing site | Vite, React | `src/` |

### Phone app conventions

- **Sheets and modals**: import `Modal` from `mobile/src/components/Common/AppModal`, never from `react-native`. It keeps screen tips from opening over an open sheet, which can freeze an iPhone.
- **Closing a sheet, then navigating**: use `mobile/src/lib/afterSheetCloses.ts`, so the next screen opens only once the sheet has gone.
- **Icons** come from `mobile/src/icons.ts`, **going back** uses `goBackOrHome`, **passwords** use `lib/passwordRules.ts`, and the **session** is stored through `lib/secureSessionStorage.ts`. See [mobile/README.md](../mobile/README.md).

### API conventions

- Routes live under `/v1/<area>/...` and are dispatched in `index.ts` to handlers in `routes/`. Shared logic is in `lib/`.
- Every handler that touches data starts with `requireAuth(req)` (or `requireAdmin` for staff) and scopes every query by the caller's `user_id`. Updates and deletes by id first confirm ownership.
- Bodies are validated with zod (`body(req, Schema)`); bodies over 8 MB are refused.
- Errors come back as `{ error: { code, message } }`. Unexpected errors are logged server-side and return `SERVER_ERROR` with no detail.
- Responses carry `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.
- Database columns come back camelCased (`postgres.camel`).
- One job, one function: the accept logic lives in `joinBusinessWithCode` (`routes/team.ts`) and `acceptHelperCode` (`routes/people.ts`), called by both the older routes and `/v1/join`, so each kind of code has a single path.
- The full route list is in [backend-api.md](backend-api.md) and [openapi.yaml](openapi.yaml).

## Security model

### Identity and sessions

| Control | Where |
| --- | --- |
| Tokens verified with `getClaims`, then the session is checked against `auth.sessions`, so a signed-out device loses access at once | `lib/auth.ts` `requireAuth` |
| New device sign-in: push to other devices, plus email to a proved address | `lib/auth.ts` `alertNewDevice` |
| Password change: current password checked in the database, 5 tries per 15 minutes, push and email notice | `routes/account.ts` `changePassword` |
| Forgot password: 6-digit code by email, rate limited per IP and email, same answer for unknown emails | `routes/account.ts` `forgotPassword` |
| Email confirmation: 6-digit code, stored hashed, 15 minutes, 5 tries; proof kept in `app_metadata.email_verified_at`, which only the server can write; cleared by trigger if the email changes; stands aside while `BREVO_API_KEY` is unset | `lib/verify.ts`, migration `20260922105206` |
| Helpers (delegates) acting for someone: only reads, or adding transactions for "record"; never admin, auth, sessions, delegation, team, join or account routes, so a helper cannot attach somebody else's account to anything | `lib/auth.ts` `delegateMayDo` |
| Joining with a code: `GET /v1/join?code=` answers `{ found: false }` without saying why, and `POST` gives one `INVALID_CODE` message for used, expired and made-up codes alike, so codes cannot be fished for. Expiry is part of the lookup. Acting inside somebody else's business still joins on your own account (`SELF_PATHS`) | `routes/join.ts`, `lib/team.ts` |
| Staff: matched on `admin_users.user_id` (never email), MFA (TOTP, `aal2`) required on every `/admin` route, role checked per area | `lib/admin.ts` `requireAdmin` |

### Data

- **Row level security** is on for every table, with no policies and **no grants to `anon` or `authenticated`**, so the Data API cannot read or write anything. The `api` function connects as the database owner. Default privileges stop new tables picking up grants.
- `admin_audit` is **append-only**: a trigger rejects update, delete and truncate (except the foreign key's own set-null when a staff member is removed).
- Tax rule versions need a **second person** to approve; enforced by a database constraint, not only the API.
- Secrets live in Supabase function secrets and Vault, never in the repository.

### Phone app

- The session (with its long-lived refresh token) is kept in the **keystore** (`expo-secure-store`, `THIS_DEVICE_ONLY`), chunked, with automatic migration from older plain storage. `mobile/src/lib/secureSessionStorage.ts`.
- Android backup is off (`allowBackup: false`); takes effect in the next native build.
- A privacy cover hides the app in the app switcher. `mobile/src/components/Common/PrivacyCover.tsx`.
- Biometric lock, re-locking after 5 minutes in the background.
- Password rules shared by sign up, change and reset. `mobile/src/lib/passwordRules.ts`.

### Staff console

- Password plus TOTP; the authenticator is set up on first sign-in (`admin/src/screens/TwoFactor.tsx`).
- Hosted with a Content Security Policy, frame denial, HSTS, no-referrer and `noindex` (`admin/vercel.json`).

### Deliberately not done

- **Certificate pinning**: Supabase rotates certificates, and a pinned app can stop working overnight.
- **Screenshot blocking** (Android `FLAG_SECURE`): it would stop people keeping their own figures. The app switcher cover handles the main risk.

## Configuration

### Function secrets (set with `npx supabase secrets set NAME=value`)

| Name | Set? | Needed for |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_DB_URL`, key variables | Yes (platform) | Everything |
| `CRON_SECRET` | Yes | The daily job. Also stored in Vault as `bf_cron_secret`; change both together |
| `GROQ_API_KEY` | Yes | Flux and voice entry |
| `MONO_SECRET_KEY` | Yes | Bank linking (check whether it is a test or live key) |
| `BREVO_API_KEY` | **No** | All email: reset codes, email confirmation, alerts, invites, waitlist |
| `EMAIL_FROM` | **No** | Sender, e.g. `BudgetFriendly <hello@your-domain>`. Must be verified in Brevo |
| `ANTHROPIC_API_KEY`, `ASSISTANT_MODEL` | No | Optional alternative AI provider |
| `EXPO_ACCESS_TOKEN` | No | Only if Expo enhanced push security is turned on |
| `WAITLIST_SITE_URL`, `APP_TZ_OFFSET_MINUTES`, `GROQ_MODEL`, `GROQ_TRANSCRIBE_MODEL`, `MONO_API_BASE` | No | Optional overrides |
| `AUTH_DEV_EXPOSE_RESET_CODE` | Must stay unset in production | Returns reset codes to the app, for test projects only |

### App configuration

`mobile/src/config.ts` points at the live project by default. The publishable key in it is designed to be public. Override with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Push notifications also need `expo.extra.eas.projectId` in `mobile/app.json`, which appears when an EAS project is created.

### Remote configuration

`/v1/config` returns feature flags, Wrapped availability per space and whether the caller is staff. The app polls it on open, on return to the foreground and every 10 minutes, and caches it. Flags are changed in the staff console, not in code.

## Database

- 47 tables. Among them, money: `transactions`, `budgets`, `mini_budgets`, `goals`, `goal_contributions`, `recurring`, `income_sources`, `categories`, `category_rules`. Business: `invoices`, `invoice_payments`, `customers`, `supplier_bills`, `bill_payments`, `staff`, `payroll_runs`, `owner_pay`, `business_settings`, `statement_imports`, `tax_filings`. Your money: `holdings`, `debts`, `debt_payments`, `properties`, `net_worth_snapshots`. Sharing: `budget_members`, `budget_invites`, `delegates`. Banks: `bank_links`, `bank_accounts`, `imported_transactions`. Platform: `profiles`, `device_sessions`, `push_tokens`, `notifications`, `alert_log`, `rate_limits`, `insight_dismissals`, `email_verifications`, `waitlist_signups`. Staff: `admin_users`, `admin_audit`, `feature_flags`, `content_blocks`, `wrapped_periods`, `tax_rule_versions`.
- **Migrations are the only way to change the schema.** Create with `npx supabase migration new <name>`, apply with `npx supabase db push`, before deploying code that needs them.
- **Daily job** (pg_cron, 05:00 UTC): recurring transactions, bill and period reminders, bank sync, insights, weekly summary, Wrapped notices, and clean-up of expired rate limits, alerts, codes, dead device sessions and scheduler history.
- **Backups** depend on the Supabase plan: the Free plan has none, Pro keeps 7 days of daily backups. Check the plan under the organisation's Billing page. See [READINESS.md](READINESS.md).

## Shipping changes

1. Work in a `git worktree` off `origin/main`. Other people and AI sessions share this repository; never deploy someone else's uncommitted work.
2. Type-check: `npx tsc --noEmit` in `mobile/` and `admin/`; `npx --yes deno@2 check --node-modules-dir=none api/index.ts` in `supabase/functions/`.
3. Commit, push to `main`.
4. Migrations: `npx supabase db push`.
5. API: `node supabase/scripts/deploy.mjs` (refuses on a dirty tree, an unpushed commit or unapplied migrations).
6. Test: `node supabase/scripts/e2e.mjs .` (about 259 checks against the live project with throwaway users it deletes; a dropped connection is retried once).
7. Staff console: deploys itself on push (Vercel, `admin/` root).
8. Phone app: needs a new build (see READINESS.md); there is no over-the-air update channel yet.

Before a release that others might collide with, tell the other sessions to hold, and say when you are clear.

## Testing

| Suite | Covers | Run |
| --- | --- | --- |
| `supabase/scripts/e2e.mjs` | The API end to end: personal, business, sharing, bank flows, tax, Wrapped, devices, passwords, recovery, cross-account isolation (10 resource types), email confirmation, response headers | `node supabase/scripts/e2e.mjs .` |
| Type checks | Phone app, console, API | See step 2 above |

There are **no automated UI tests** for the phone app or the console, and no load tests.

## Observability

- Function logs: Supabase dashboard, Edge Functions, `api`, Logs.
- Staff actions: the console's Audit log.
- Security and performance advisors: `npx supabase db advisors --linked`.
- There is **no error tracking or alerting** (for example Sentry). A failure is only noticed when someone looks.

## Legacy code

`api/`, `backend/`, `server/`, `dev-mock-server.js` and the MongoDB settings in `.env.example` belong to the first version and are not used. The old API no longer answers on Vercel. They can be deleted once nobody needs them for reference.
