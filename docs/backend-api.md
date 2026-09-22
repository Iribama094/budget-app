> **Historical.** This is the original design note from before the backend moved to Supabase. The live API is the `api` Edge Function in `supabase/functions/api`; see [DEPLOY.md](../DEPLOY.md). Kept for the reasoning behind the data model.

# BudgetFriendly backend (multi-user) – API rundown

This app is currently **frontend-only** and stores data in `localStorage` via `src/utils/dataManager.ts`:
- `Transaction`: `{ id, type, amount, category, description, date, timestamp }`
- `Budget`: `{ id, name, totalBudget, categories{ budgeted, spent }, period, startDate }`
- `Goal`: `{ id, name, targetAmount, currentAmount, targetDate, emoji, color, category }`

For multi-user, the backend should own these entities and the client should fetch/save per authenticated user.

## Core decisions (recommended)

- **Auth**: email + password with **JWT access token** (short TTL) + **refresh token** (long TTL).
- **Multi-device**: refresh token is **per device/session** so you can sign out one device.
- **IDs**: UUIDs for `users`, `transactions`, `budgets`, `goals`.
- **Timestamps**: store `createdAt`, `updatedAt`; keep transaction `occurredAt` (date/time of spending).
- **Pagination**: cursor pagination for transactions (`limit`, `cursor`).
- **Error shape** (consistent):
  ```json
  {"error":{"code":"VALIDATION_ERROR","message":"...","details":{}}}
  ```

## Onboarding requirement (mobile)

You asked: **onboarding should only show for people who just downloaded the app**.

- Client-side: store a local flag (already implemented) so onboarding runs once per install.
- Backend: optional `users.hasCompletedOnboarding` if you want onboarding to sync across devices. If you keep it device-only, you can skip that field.

## Endpoints (REST)

Note on Vercel routing:
- The functions live under `/api/*` (Vercel convention)
- This repo includes a `vercel.json` rewrite so you can call `/v1/*` and it will route to `/api/v1/*`

### Auth
- `POST /v1/auth/register`
  - body: `{ email, password, name? }`
  - returns: `{ user, accessToken, refreshToken }`
- `POST /v1/auth/login`
  - body: `{ email, password, deviceName? }`
  - returns: `{ user, accessToken, refreshToken }`
- `POST /v1/auth/refresh`
  - body: `{ refreshToken }`
  - returns: `{ accessToken, refreshToken }` (rotate refresh tokens)
- `POST /v1/auth/logout`
  - body: `{ refreshToken }` (revoke current session)
- `GET /v1/auth/me`
  - header: `Authorization: Bearer <accessToken>`
  - returns: `{ user }`

### Users / Profile
- `GET /v1/users/me`
- `PATCH /v1/users/me`
  - body (examples): `{ name, currency, locale, monthlyIncome }`
- `PATCH /v1/users/me/preferences`
  - body (examples): `{ theme, assistantEnabled }`

### Transactions
- `GET /v1/transactions?start=YYYY-MM-DD&end=YYYY-MM-DD&limit=50&cursor=...&type=income|expense&category=...`
- `POST /v1/transactions`
  - body: `{ type, amount, category, description, occurredAt }`
- `GET /v1/transactions/:id`
- `PATCH /v1/transactions/:id`
- `DELETE /v1/transactions/:id`

### Budgets
Your UI supports a budget with category buckets. Recommended structure:
- budget period is either a month or a week (you currently have `period: 'monthly' | 'weekly'` + `startDate`).

Endpoints:
- `GET /v1/budgets?start=YYYY-MM-DD&end=YYYY-MM-DD` (or `period=2026-01`)
- `POST /v1/budgets`
  - body: `{ name, period, startDate, totalBudget, categories: { [name]: { budgeted } } }`
- `GET /v1/budgets/:id`
- `PATCH /v1/budgets/:id`
- `DELETE /v1/budgets/:id`

If you want category updates as first-class endpoints:
- `PATCH /v1/budgets/:id/categories` (merge/replace budgeted amounts)

### Goals
- `GET /v1/goals`
- `POST /v1/goals`
  - body: `{ name, targetAmount, currentAmount?, targetDate, emoji?, color?, category? }`
- `GET /v1/goals/:id`
- `PATCH /v1/goals/:id`
- `DELETE /v1/goals/:id`

### Analytics
You can compute analytics either server-side or client-side. Since you already compute summaries locally, a clean server approach is:
- `GET /v1/analytics/summary?start=YYYY-MM-DD&end=YYYY-MM-DD`
  - returns: `{ totalBalance, income, expenses, remainingBudget, spendingByCategory }`
- `GET /v1/analytics/by-category?start=...&end=...`
- `GET /v1/analytics/trends?months=6`

### Quotes (optional)
- `GET /v1/quotes/random`

### Assistant (optional)
Only needed if `SmartAssistant`/`SimpleAssistant` call a backend service.
- `POST /v1/assistant/chat` body: `{ message, context? }`

## Data model (minimum)

### users
- `id`
- `email` (unique)
- `passwordHash`
- `name`
- `currency`, `locale`, `monthlyIncome`
- `createdAt`, `updatedAt`

### sessions (refresh tokens)
- `id`, `userId`
- `refreshTokenHash`
- `deviceName`, `createdAt`, `expiresAt`, `revokedAt?`

### transactions
- `id`, `userId`
- `type`, `amount`, `category`, `description`
- `occurredAt` (date/time)
- `createdAt`, `updatedAt`

### budgets
- `id`, `userId`
- `name`, `period`, `startDate`, `totalBudget`
- `createdAt`, `updatedAt`

### budgetCategories (recommended normalized)
- `id`, `budgetId`
- `name`, `budgetedAmount`

### goals
- `id`, `userId`
- `name`, `targetAmount`, `currentAmount`, `targetDate`
- `emoji`, `color`, `category`

## Mobile considerations
- Prefer refresh-token rotation; store tokens in **secure storage** on device.
- Add `X-App-Version` and `X-Device-Id` headers for support/debugging.
- Enable CORS for dev; lock down in production.

If you want, I can scaffold a backend (Node + Fastify/Express + Prisma/Postgres) matching this spec.
