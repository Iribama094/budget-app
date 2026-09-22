# Business teams: who can do what

A business owner can add people who record and manage the business with their own login. Each person has exactly one role. This page is the map for engineers changing it.

## The model in one paragraph

Business data stays where it always was: rows keyed by the owner's `user_id` with `space_id = 'business'`. A team member reaches it by sending `X-Business: <owner id>` with their own session. `public.business_members` says who belongs to whose business and in what role. Nothing is copied or shared at the database level; every request goes through the API, which checks it.

## Where the rules live

| What | Where |
| --- | --- |
| What each role may call | `TEAM_RULES` in `supabase/functions/api/lib/team.ts`. One line per route family, listing the roles per method. Anything not listed is refused. |
| Membership and the check itself | `requireAuth` in `lib/auth.ts`: looks up the membership, then `teamMayDo`. The owner's id becomes `userId`; the member's is `actorId`; the role is `teamRole`. |
| Never the owner's personal money | `inBusinessSpace` in `index.ts` forces `spaceId=business` on every team request (query, and the body of routes whose body picks a space). |
| Routes that are always about the caller | `SELF_PATHS` in `lib/team.ts` (sign-in, own profile, alerts, team membership). `X-Business` is ignored there. |
| Rows filtered inside a route | `routes/transactions.ts`: Sales see and record only income, Purchases only expenses (`teamTransactionType`); Sales and Purchases edit only what they recorded. These are the only row-level filters. |
| Who recorded what | `created_by` on `transactions`, `invoices`, `supplier_bills`. Null means the owner. Names come from `lib/teamRecords.ts`. |
| Invites and joining | `routes/team.ts`. Codes last 14 days, work once, and need a confirmed email on both sides. |
| Owner's daily summary | `lib/teamDigest.ts`, from the daily job. |
| Unusual activity | `lib/insights.ts`, section 13: a cost recorded twice; one person's sales well below their usual. |

## The roles

| Role | Can | Cannot |
| --- | --- | --- |
| Sales | Record sales, raise and send invoices, customers | Costs, profit, pay, bank |
| Purchases | Record costs, supplier bills | Sales, profit, pay, bank |
| HR and payroll | Staff, pay runs, payslips | Sales, costs, profit, bank |
| Manager | Day to day: transactions, invoices, bills, staff, plans, reports | Bank connections, owner pay, adding people |
| Accountant | See everything a manager sees, including reports and tax | Change anything |

Nobody on a team can delete. Only the owner deletes, so there is always a trail.

## Changing a role, or adding a route

1. Add or edit the line in `TEAM_RULES`. A new route is closed to every team member until you do.
2. If the route returns rows that mix what different roles may see, filter them in the route like `routes/transactions.ts` does, and add it to the table above.
3. Add a check to the "Business team" section of `supabase/scripts/e2e.mjs` for the role that should, and one that should not, get in.
4. Update the role table here and the one-line descriptions in `mobile/src/api/team.ts`.

## In the app

- The switcher still says Personal / Business. Which business "Business" means is chosen in Settings, "Your businesses", which only appears when there is more than one (`contexts/TeamContext.tsx`).
- The business's name shows at the top of Home and on the Save button, so nobody records into the wrong one.
- Sales, Purchases and HR get a Home that is just their job (`components/Home/TeamHome.tsx`) and no other tabs. Managers and accountants get the normal business app.

## Known limit

Each person can own one business, because business data is keyed by the owner's id plus `space_id`. Letting one owner run several businesses needs a `business_id` on the business tables. The team model would carry over: `business_members.owner_id` would become the business's id.
