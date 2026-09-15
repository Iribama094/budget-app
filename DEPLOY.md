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
npx supabase functions deploy api --use-api --no-verify-jwt
npx supabase config diff               # always review this before: npx supabase config push
```

The database password and cron secret live only in the git-ignored `.env.supabase.local`. If you change `CRON_SECRET`, update both the function secret (`npx supabase secrets set`) and the Vault secret `bf_cron_secret`.

The older Vercel + MongoDB backend (`api/`, `backend/`, `server/`) and the notes below are kept for reference; the app no longer uses them.

Temporary deployment options for the mock API

Quick summary
- The mock server file is `dev-mock-server.js` and listens on port `3002`.
- I added a `Dockerfile` and a script `npm run start:mock` to run the server.

Local test
1. Install deps (already done): `npm install`
2. Run locally: `npm run start:mock`

Docker (build and run locally)
```bash
docker build -t budget-mock:latest .
docker run -p 3002:3002 budget-mock:latest
```

Deploy to Cloud Run (Google)
1. Build and push an image (example using gcloud):
```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/budget-mock
gcloud run deploy budget-mock --image gcr.io/PROJECT_ID/budget-mock --platform managed --region REGION --allow-unauthenticated --port 3002
```

Deploy to Render (Docker service)
1. Create a new Web Service on Render and connect your repo.
2. Choose Docker and point to the `Dockerfile` in the repo. Set the port to `3002`.

Render (Infrastructure-as-Code)
- A `render.yaml` manifest has been added to the repo so Render can create the service automatically when you connect the repository.
- The manifest configures a Docker web service named `budget-mock` that uses the `Dockerfile` and exposes port `3002`.

Steps to deploy via Render with this repo:
1. Push the repo to GitHub (if not already):
```bash
git add render.yaml Dockerfile dev-mock-server.js DEPLOY.md
git commit -m "Add mock server and Render manifest"
git push origin main
```
2. In Render dashboard, click **New** → **Web Service** → **Connect a repository** and select the GitHub repo.
3. Render will detect `render.yaml` and propose creating the `budget-mock` service. Confirm and deploy.
4. Once deployed, your public URL will be shown in the Render dashboard. POST to `/v1/tax/calc` on that URL.

Notes:
- If your main branch is named `master` or something else, edit `render.yaml` accordingly or set the branch in Render.
- You can also create the service manually in the Render UI and point the service at the repo and Dockerfile if you prefer.


Deploy to Heroku (container)
```bash
heroku container:login
docker build -t registry.heroku.com/<app-name>/web .
docker push registry.heroku.com/<app-name>/web
heroku container:release web -a <app-name>
```

After deployment
- POST JSON to `/v1/tax/calc` with payload `{ "country": "NG", "grossAnnual": 1200000 }` to get the mocked tax response.

Vercel (recommended for full API)

Free-tier setup (Atlas + Vercel)

This repo’s real backend (MongoDB + JWT auth) lives under `api/` as Vercel Serverless Functions.
For a no-paid-infra path, use:
- MongoDB Atlas M0 (free) for the database
- Vercel Hobby (free) for the API + web

Step 1 — Create MongoDB Atlas (free)

1. Create an Atlas account and create a **FREE M0 cluster**.
2. Create a Database User (Database Access → Add New Database User).
3. Network Access:
   - For easiest setup, allow `0.0.0.0/0` temporarily.
   - Use a strong password. You can tighten this later.
4. Click **Connect** → **Drivers** and copy the connection string:
   - `mongodb+srv://<username>:<password>@<cluster>/<db>?retryWrites=true&w=majority`
   - Replace `<username>`, `<password>`, and set `<db>` to `budgetfriendly` (or any name you prefer).

Step 2 — Deploy to Vercel (free)

1. Connect your GitHub repository to Vercel: https://vercel.com/new
2. Select the project (Budget-Friendly-app) and confirm settings; Vercel will detect the `api/` serverless functions automatically.
3. Add environment variables in the Vercel dashboard (Project Settings → Environment Variables):
	- `MONGODB_URI` (Secret)
	- `MONGODB_DB` (optional; default is `budgetfriendly`)
	- `JWT_ACCESS_SECRET` (Secret)
	- `JWT_REFRESH_SECRET` (Secret)
	- `JWT_ACCESS_TTL_MIN` (e.g., `15`)
	- `JWT_REFRESH_TTL_DAYS` (e.g., `30`)
	- `NODE_ENV` = `production`
4. Optionally add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` as GitHub repository secrets so the GitHub Action `/.github/workflows/vercel-deploy.yml` can deploy automatically on pushes to `main`.
	- Create a Personal Token in Vercel (Account → Tokens) and copy the token to `VERCEL_TOKEN` in GitHub Secrets.
	- Get `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` from the Vercel project settings and add them to GitHub Secrets.
5. Push to `main` (or merge a PR) — the GitHub Action will run and deploy the project to Vercel.

Quick manual deploy (Vercel CLI)
```bash
npm i -g vercel
vercel login
vercel --prod
```

After Vercel deploy
- Test auth and tax endpoints:
  - `POST https://<your-vercel-url>/v1/auth/register`
  - `POST https://<your-vercel-url>/v1/auth/login`
  - `POST https://<your-vercel-url>/v1/tax/calc`

Step 3 — Point the Expo mobile app at the deployed API

In the Expo app, set the API base to your deployed Vercel URL (HTTPS):

- Edit `mobile/.env`:
	- `EXPO_PUBLIC_API_BASE_URL=https://<your-vercel-url>`

Important:
- Do not include `/api` or `/v1` in the base URL.
- The app calls `/v1/*` and Vercel rewrites `/v1/* → /api/v1/*` via `vercel.json`.

Step 4 — TestFlight prerequisite (iOS)

TestFlight requires the paid Apple Developer Program ($99/year). If you’re not paid yet, you can still:
- Test in Expo Go (dev)
- Build/run on an iOS Simulator (Mac required)
- Use Android internal testing without Apple membership

## Features that need extra setup

Set function secrets with `npx supabase secrets set NAME=value`.

| Feature | Function secret | App / build |
| --- | --- | --- |
| Flux, the AI money coach | `ANTHROPIC_API_KEY` (Claude, used first when set) or `GROQ_API_KEY` (console.groq.com); optional `ASSISTANT_MODEL` / `GROQ_MODEL` | — |
| Password reset emails | `RESEND_API_KEY`, `EMAIL_FROM` (a sender on a domain verified in Resend) | — |
| Reset codes shown in the app (test projects only, never with real users) | `AUTH_DEV_EXPOSE_RESET_CODE=1` | — |
| Daily job: recurring transactions, bill reminders, bank sync | `CRON_SECRET` (already set), `APP_TZ_OFFSET_MINUTES` (default 60) | — |
| Push notifications (pace alerts, bills, auto-save, security) | `EXPO_ACCESS_TOKEN` only if Expo enhanced push security is on | An EAS project id (`npx eas init`) and a development or store build |
| Live bank connections (Mono) | `MONO_SECRET_KEY` | `EXPO_PUBLIC_MONO_PUBLIC_KEY` |
| Face ID, home-screen widgets | — | A development or store build. Widgets run `npx expo prebuild`; iOS needs `ios.appleTeamId` and the App Group `group.com.budgetfriendly.app` enabled for the app id |

Without these, the app still works (Flux explains that it isn’t switched on yet): the in-app notification feed fills without push, the demo bank flow stays available, and bill reminders are scheduled on the phone.

Email confirmation on sign-up is off, because Supabase's built-in email only reaches members of the project's team. Turn it back on (`enable_confirmations` in `supabase/config.toml`) after adding custom SMTP.
