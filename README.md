# BudgetFriendly

A money app for people and small businesses in Nigeria. Personal users budget, track spending, save towards goals and work out their tax. Business users send invoices, run payroll, import bank and payment statements and see their business tax.

## Where things live

| Folder | What it is |
| --- | --- |
| `mobile/` | The phone app (Expo, React Native). This is the product. See [mobile/README.md](mobile/README.md) |
| `supabase/` | The backend: the `api` Edge Function, database migrations and the deploy and end-to-end scripts. See [DEPLOY.md](DEPLOY.md) |
| `admin/` | The staff console for flags, Money Wrapped, the audit log and staff access. See [admin/README.md](admin/README.md) |
| `src/` | The marketing site (Vite), deployed to Vercel on every push to `main` |
| `api/`, `backend/`, `server/` | The old Vercel + MongoDB backend. Kept for reference only; nothing uses it |

## What the app does

**Personal**
- Budgets, mini budgets and categories, with a budget streak and a weekly check-in
- Transactions, recurring payments and bills with reminders
- Goals, with "pay yourself" auto-saving
- Analytics by bucket, category and week, plus a money wellness score
- Live bank connections through Mono, bank alerts and pending transactions to confirm
- Personal tax settings and estimates
- Flux, an AI money coach
- Money Wrapped, a yearly (or quarterly, for businesses) look back
- Shared budgets, data export, push notifications, Face ID and home-screen widgets

**Business**
- Invoices and customers
- Payroll
- Statement imports (CSV from Paystack, Moniepoint and bank exports)
- Business reports and business tax

## Running it

The phone app is already set up to talk to the live Supabase project, so you don't need a local backend:

```bash
cd mobile
npm install
npm run start
```

For everything to do with the backend (migrations, deploying the `api` function, the end-to-end suite and the secrets that switch features on), read [DEPLOY.md](DEPLOY.md). Always deploy with `node supabase/scripts/deploy.mjs`, never `supabase functions deploy` by hand.

To run the marketing site locally:

```bash
npm install
npm run dev
```

## Launch video

`/brag` (a Claude Code skill) turns this project into a short launch video. In Claude Code, from the repo root, say `/brag`, or steer it with `/brag --tone polished` or `/brag --format vertical`. It writes the plan, share copy and `brag.mp4` into a `brag-output/` folder, which git ignores. It needs Node 22+, FFmpeg and the Hyperframes CLI (`npx hyperframes doctor` checks them).
