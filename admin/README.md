# BudgetFriendly staff console

The small web app the team runs the product from: feature flags, Money Wrapped certification, the audit log and
who has access. Separate from the marketing site and from the phone app.

## Running it locally

```bash
cd admin
npm install
npm run dev        # http://localhost:5180
```

Sign in with a work account that exists in `admin_users`. Signing in is not enough on its own: the API checks
that table before answering anything under `/v1/admin`, so a normal account gets a flat "not found".

## Deploying it

It is its own Vercel project, pointed at this folder, so the marketing site and the console deploy separately
and a mistake in one cannot take down the other.

```bash
npx vercel login                 # once per machine, opens a browser
cd admin
npx vercel link --yes            # creates or links the project
npx vercel --prod                # deploy
```

In the Vercel dashboard, set the project's **Root Directory** to `admin` if it was created from the repo root.
Then add the domain, `admin.budgetfriendly.ng`, under Settings, Domains.

### Environment variables

Both are safe in the browser and both have defaults in `src/api.ts`, so a deploy works without them. Set them
if the project ever moves.

| Variable | What it is |
| --- | --- |
| `VITE_SUPABASE_URL` | the Supabase project url |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the publishable key, the same one the phone app ships |

Nothing secret belongs here. Every route the console calls checks the staff table on the server, so access is
decided there rather than by hiding a key in the page.

## Adding someone to the team

An owner adds them in Staff, then that person makes a normal account with the same email. Roles:

| Role | What they can do |
| --- | --- |
| Owner | Everything, including adding and removing staff |
| Engineer | Flags, Wrapped and content. Cannot see a person's money |
| Support | Find one person and help them |
| Finance | Read only: tax rules, filings, totals |

Every change is written to the audit log with the name of whoever made it, and nobody can edit or remove a line.
