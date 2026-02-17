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

