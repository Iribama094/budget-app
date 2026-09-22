# Backend: Supabase

The app's backend runs on the Supabase project **budgetfriendly** (ref `uggmyokbpwfdbustnggo`, region eu-west-2).

| Piece | Where |
| --- | --- |
| Sign-up, sign-in, sessions, password recovery | Supabase Auth (the app uses `@supabase/supabase-js`) |
| Every `/v1` API route | Edge Function `api` at `https://uggmyokbpwfdbustnggo.supabase.co/functions/v1/api/v1/...` (code in `supabase/functions/api`) |
| Database | Postgres, schema in `supabase/migrations`. RLS is on for every table and the Data API roles have no grants, so only the `api` function reads and writes data |
| Daily job | pg_cron job `budgetfriendly-daily` (05:00 UTC) calls `/v1/cron/daily` with the secret stored in Vault as `bf_cron_secret` |

## Everyday commands (repo root)

```bash
npx supabase login
npx supabase link --project-ref uggmyokbpwfdbustnggo
npx supabase migration new <name>      # then write the SQL in supabase/migrations
npx supabase db push                   # apply migrations
npx supabase db advisors --linked      # security and performance checks
node supabase/scripts/deploy.mjs           # deploy the api function (see below); add a commit to deploy something other than origin/main
npx --yes deno check supabase/functions/api/index.ts
node supabase/scripts/e2e.mjs .
npx supabase config diff               # always review this before: npx supabase config push
```

## Deploying the API function

Always deploy with `node supabase/scripts/deploy.mjs`, never `supabase functions deploy` by hand. The raw command uploads whatever is sitting in the folder, not what is committed, so one person's half finished work can reach production from someone else's checkout. That happened on 20 September 2026 and took the business endpoints down until the function was redeployed from a clean checkout.

The script refuses to deploy unless:

1. the working tree is clean, so no local edits ride along
2. the commit is already on origin, so what is live can be found again
3. every migration in that commit is already applied, so the code never reads columns that do not exist
4. it builds from a fresh checkout of that exact commit

Apply migrations first (`npx supabase db push`), then deploy, then run the end-to-end suite.

The end-to-end script exercises personal budgeting as well as invoices, bills, payroll, statement imports, confirmable goal savings and Money Wrapped against the linked live project. It creates and removes throwaway users.

The database password and cron secret live only in the git-ignored `.env.supabase.local`. If you change `CRON_SECRET`, update both the function secret (`npx supabase secrets set`) and the Vault secret `bf_cron_secret`.

The older Vercel + MongoDB backend (`api/`, `backend/`, `server/`) and the notes below are kept for reference; the app no longer uses them.

## Web projects on Vercel

Vercel's Git integration builds on every push to `main`; there is no GitHub Actions workflow.

| Vercel project | Root directory | What it serves |
| --- | --- | --- |
| `budgetfriendly-admin` | `admin` | The staff console, https://budgetfriendly-admin.vercel.app |
| `budget-app` | repository root | The marketing site (`src/`) |

A project whose root directory is wrong will quietly build the wrong app; that happened to the console once. Check it under the project's Settings, General.

The old MongoDB API (`api/`) no longer answers there, and `vercel.json` has no `crons` entry, so nothing on Vercel runs the daily job twice.

## Features that need extra setup

Set function secrets with `npx supabase secrets set NAME=value`.

| Feature | Function secret | App / build |
| --- | --- | --- |
| Flux, the AI money coach | `ANTHROPIC_API_KEY` (Claude, used first when set) or `GROQ_API_KEY` (console.groq.com); optional `ASSISTANT_MODEL` / `GROQ_MODEL` | Nothing extra |
| All email (password reset codes, sign-up codes, new sign-in and password alerts, invites, waitlist) | `BREVO_API_KEY` (the v3 API key, starting `xkeysib-`, not the SMTP relay password), `EMAIL_FROM` (a sender verified in Brevo) | Nothing extra |
| Reset codes shown in the app (test projects only, never with real users) | `AUTH_DEV_EXPOSE_RESET_CODE=1` | Nothing extra |
| Daily job: recurring transactions, bill reminders, bank sync | `CRON_SECRET` (already set), `APP_TZ_OFFSET_MINUTES` (default 60) | Nothing extra |
| Push notifications (pace alerts, bills, auto-save, security) | `EXPO_ACCESS_TOKEN` only if Expo enhanced push security is on | An EAS project id (`npx eas init`) and a development or store build |
| Live bank connections (Mono) | `MONO_SECRET_KEY` | `EXPO_PUBLIC_MONO_PUBLIC_KEY` |
| Business statement uploads | Nothing extra | CSV upload works now for Paystack, Moniepoint and bank exports; live provider sync is deliberately not enabled yet |
| Face ID, home-screen widgets | Nothing extra | A development or store build. Widgets run `npx expo prebuild`; iOS needs `ios.appleTeamId` and the App Group `group.com.budgetfriendly.app` enabled for the app id |

Without these, the app still works (Flux explains that it isn’t switched on yet): the in-app notification feed fills without push, the demo bank flow stays available, and bill reminders are scheduled on the phone.

Supabase's own sign-up confirmation stays off: its built-in mailer only reaches the project team. Instead the API confirms addresses with a six-digit code sent through Brevo. That step switches itself on as soon as `BREVO_API_KEY` is set, and stands aside until then so nobody is left waiting for a code that cannot arrive.
