# BudgetFriendly

A money app for people and small businesses in Nigeria. People plan a budget from payday to payday, track what they spend, save towards goals and see what they owe in tax. Businesses send invoices, pay staff, import bank and payment statements and see their business tax. It never holds or moves money.

**Status: not yet launched.** The backend is live and tested; the phone app has never been built for the stores. What is left, and what it costs, is in [docs/READINESS.md](docs/READINESS.md).

## Documentation

| Document | For | What is in it |
| --- | --- | --- |
| [docs/FUNCTIONAL.md](docs/FUNCTIONAL.md) | Anyone | What the app does, screen by screen, and the rules behind it |
| [docs/TECHNICAL.md](docs/TECHNICAL.md) | Engineers | How it is built, how data is protected, how to change and ship it |
| [docs/READINESS.md](docs/READINESS.md) | The owner | What has been verified, what has not, what is needed to launch, and what it costs |
| [DEPLOY.md](DEPLOY.md) | Engineers | Day to day backend commands and the deploy rules |
| [docs/backend-api.md](docs/backend-api.md), [docs/openapi.yaml](docs/openapi.yaml) | Engineers | Every API route |
| [docs/money-for-everyone.md](docs/money-for-everyone.md) | Product | The "Your money" build checklist and progress log |
| [docs/team-access.md](docs/team-access.md) | Engineers | Business team roles and where the permission rules live |

## Where things live

| Folder | What it is | Where it runs |
| --- | --- | --- |
| `mobile/` | The phone app (Expo SDK 57, React Native). This is the product | People's phones. Today, only through Expo Go from a laptop |
| `supabase/` | The backend: the `api` Edge Function, database migrations, deploy and test scripts | Supabase project `budgetfriendly` (eu-west-2) |
| `admin/` | The staff console: flags, Money Wrapped, people, content, tax rules, audit log, staff | Vercel project `budgetfriendly-admin` |
| `waitlist/` | The public waitlist site (static HTML) | Not deployed from this repository yet; any static host works |
| `src/` | The marketing site (Vite) | Vercel project `budget-app` |
| `api/`, `backend/`, `server/` | The old Vercel and MongoDB backend | Nowhere. Kept for reference; nothing uses it |

## Running it

The phone app talks to the live Supabase project out of the box, so no local backend is needed:

```bash
cd mobile
npm install
npx expo start            # add --tunnel if the phone is not on the same Wi-Fi
```

Scan the QR code with Expo Go. Avoid `--clear` unless you hit a transform error: it throws away Metro's cache and makes the next start several times slower.

The staff console:

```bash
cd admin
npm install
npm run dev
```

Backend work (migrations, deploying the API, the end-to-end suite) is in [DEPLOY.md](DEPLOY.md). Always deploy with `node supabase/scripts/deploy.mjs`, never `supabase functions deploy` by hand.

## Launch video

`/brag` (a Claude Code skill) turns this project into a short launch video. In Claude Code, from the repo root, say `/brag`, or steer it with `/brag --tone polished` or `/brag --format vertical`. It writes the plan, share copy and `brag.mp4` into a `brag-output/` folder, which git ignores. It needs Node 22+, FFmpeg and the Hyperframes CLI (`npx hyperframes doctor` checks them).

## Rules that keep this safe

- Every change to the live API goes out through `supabase/scripts/deploy.mjs`, which refuses unless the commit is on GitHub, the tree is clean and its migrations are applied.
- Apply migrations before the code that needs them. Run `node supabase/scripts/e2e.mjs .` after every deploy.
- Nothing secret goes in the repository. Server secrets live in Supabase (`npx supabase secrets list`); the only keys in the apps are the project URL and the publishable key, which are designed to be public.
- More than one person, or AI session, works in this repository. Build in your own `git worktree` off `origin/main` and stage files by name.
