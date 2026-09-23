# Money for everyone: build checklist

The 21 gaps from the use case research, plus rising prices (22). The audience is anyone who wants to take control of their money and understand how it works, from a daily earner to a wealthy household.

## How we build it (KISS)

1. **No new tabs.** New things live where people already look: Add transaction, Bills, Budget, Profile.
2. **Hidden until relevant.** A feature shows up only for people it applies to (a daily earner, someone with debts, someone with a dollar account). Everyone else never sees it.
3. **Automatic first, one question second.** We detect transfers, refunds and price rises ourselves and ask one yes or no question. Never a form when a tap will do.
4. **One nudge at a time.** The insights feed already caps what it shows. New insights compete for the same slots rather than adding more noise.
5. **Balances are "what you told us", not a ledger.** Cash, wallets and assets are updated by typing the current number. No double entry.
6. **Rows, not cards.** New screens use plain lists with dividers. Cards only where something must stand apart.
7. **Plain words.** "Money you owe", not "liabilities". "What you own", not "assets".

## One new place: "Your money"

Items 5, 6, 13 and 14 share a single screen, reached from Profile:

```
Your money                       ₦4.2m   (what you have + own - owe)
  Cash and accounts              ₦620k   GTBank (linked), OPay, cash, $ account
  Things you own                 ₦3.9m   land, car, T-bills
  Owed to you                    ₦45k    Tunde ₦25k, Ada ₦20k
  You owe                       -₦365k   Carbon loan, cooperative
```

## Checklist

### Tier 1: basics that affect everyone
- [x] **1. Transfers between your own accounts.** Bank imports spot a debit in one of your accounts matched by a credit in another (same amount, within two days), or a transfer to your own name. They are marked "Moved between your accounts" and never count as spending or income. One tap to undo.
- [x] **2. Move money between buckets.** Cover it, Move money, amounts in naira, and moving this period's spending when a category changes bucket. Built 21 Sep 2026.
- [x] **3. Big costs that come round once in a while.** Bills can be yearly or once a term. Each shows "set aside ₦X a month" and one tap starts a savings pot for it, due on the bill's date.
- [x] **4. Refunds and reversals.** Imports spot a credit that says reversal or refund and matches an earlier debit. Both cancel out, and nothing counts as income. On any expense: "Got money back?" reduces it, or removes it when it was the full amount.
- [x] **5. Money owed, both ways.** "You owe" and "Owed to you" in Your money. Who, how much, when it's due. Recording a repayment lowers the balance. With more than one debt: "Clear this one first" (dearest interest first). A gentle word before adding a new loan while others are open. A reminder the day before a due date.

### Tier 2: fit how money really comes in
- [x] **6. Cash and wallets.** Cash, fintech wallets and accounts without a bank link, each with a balance you type in. Linked accounts fill in themselves.
- [x] **7. Daily earner mode.** Income can be "daily". After you log income, a short "Here's how to split it" shows what goes to bills, savings and spending, based on your own plan.
- [x] **8. Steady pay.** For irregular income (freelance, harvest, gratuity, windfall): a buffer pot and a monthly amount you pay yourself from it. Big month: "Move the extra to your buffer?" Small month: "Top up from your buffer?"
- [x] **9. When pay stops: tight month.** "My pay is late" pushes the budget end to the new date and recalculates the daily amount. A tight month view lists bills as must pay, can reduce or can pause (bill priority already exists) and shows how long your money lasts.
- [x] **10. Ajo, esusu and cooperatives.** A savings bill can be marked as a contribution group with your payout turn (date and amount). A reminder on your turn. Cooperative loans are handled by item 5.
- [x] **11. Family support.** A "Family support" category that counts as a need, a monthly limit if you want one, and a monthly line saying who you supported and how much. No judgement.
- [x] **12. Project budgets.** One-off budgets start from a template (wedding, burial, building, relocation) with stages already set up. Contributions from others count as income to the project.

### Tier 3: for people with more
- [x] **13. Net worth.** "Things you own" (land, property, car, shares, T-bills, pension, crypto) at a value you set. Net worth = what you have + own - owe, with a monthly history.
- [x] **14. Foreign currencies.** Accounts, assets and goals in USD, GBP, EUR or CAD. You set the rate once (or keep the app's), and everything adds up in naira. Income can be recorded in dollars with the rate used.
- [x] **15. Household staff.** Payroll and payslips in the personal space for a driver, nanny or cook.
- [x] **16. Delegate and caregiver access.** Invite someone (an accountant, a PA, an adult child) to view your money, or view and record. They use their own login. They can never change your settings or see your password.
- [x] **17. Landlord tools.** Properties and tenants in the business space. Rent amount, when it's due, paid or overdue, and one tap to record a payment.

### Tier 4: reach and inclusion
- [~] **18. Languages.** A language setting, starting with Pidgin, on the screens people use most. Voice entry understands Pidgin phrases ("I chop 2k", "dem pay me 50k").
- [x] **19. Low-end phones and scarce data.** A "Save data and battery" setting: no buzzes, no background re-checks. The offline queue already keeps entries until data returns. Turning off animations is not done yet.
- [x] **20. Accessibility and safety.** Text grows with the phone's font size. Private notifications show no amounts or names. Hide amounts is one tap from Home.
- [x] **21. Young people.** A "Pocket money" template: a weekly budget a parent sets up and shares with a child's account.

### Rising prices (new)
- [x] **22. Your own inflation.** Prices are rising (fuel, imports, exchange rates), and averages don't tell you what it means for you.
  - **Your cost of living:** what the same regular needs cost in the last three months against the three before, in one number ("Your needs cost 18% more than 3 months ago"), next to how your income moved.
  - **Price watch:** a bill that comes in higher than set ("DSTV went from ₦10,500 to ₦12,500. Update the bill?") and a need that keeps rising ("Fuel is up 30% since June").
  - **Budgets that keep up:** starting the next budget suggests amounts from what things actually cost now.
  - **Goals that keep up:** a long goal shows what it may cost by then at your own rate of price rises.
  - **Heads up from us:** staff can post a price alert in the console (e.g. a fuel price change). It reaches only people who spend in that category.
  - **Business:** "Your costs rose 20% but your prices didn't" when margins shrink.

## Eight KISS changes

Reviewed after the 22 items went in, when the question was what to take away rather than what to add. Each one
removes something from a screen. They are numbered because the user picks them by number.

| # | Change | Built |
| --- | --- | --- |
| 1 | One box for any code. A shared budget, a helper invite and a business code all went in different places; now Settings has one "Join with a code" that works out which it is and says so before you join. | Yes, `routes/join.ts`, `Common/JoinCodeSheet.tsx` |
| 2 | One kind of tip, on the first visit only. Several kinds of tip, hint and coach mark compete today. | No |
| 3 | Bank imports: one tap each. Every imported line has a tick that accepts it as shown; the row is only opened when the guess is wrong. | Yes, `PendingTransactionsScreen.tsx` |
| 4 | Add transaction: amount, what for, Save. Everything else moves behind "More". | No |
| 5 | Buckets plus category limits, no mini budgets. One idea for "cap this category" instead of two. | Yes |
| 6 | Plain names for regular payments. "Bills" meant two things and the same screen had two names. | Yes, see below |
| 7 | Home: three things. Safe to spend, what is coming, one thing to do. | No |
| 8 | Insights on one page, not a stack of cards to scroll. | No |

Item 6, what changed. The screen where things that repeat are set up is called **Bills** in the personal space
and **Regular costs** in a business, matching the two Settings rows that lead to it; it used to be called
"Recurring & bills" in one place and "Recurring costs & sales" in the other. The business screen for money owed
to suppliers is **Supplier bills**, not "Bills", and its tool on Business home is **Suppliers**, so no two things
share a name. `RecurringScreen` picks its title from `activeSpaceId`.

## Progress log

- 21 Sep 2026: checklist written. Item 2 built.
- 21 Sep 2026: items 1, 3 to 17 and 19 to 22 built; 18 started. Needs migration `20260921200000_money_for_everyone.sql` applied and the API deployed before the app update. The e2e suite has a "Money for everyone" section that skips until then.
- 22 Sep 2026: KISS changes 1 and 3 built and released. KISS change 6 built: one name per thing for bills and regular costs.

## Where each item lives

| Item | Server | App |
| --- | --- | --- |
| 1, 4 Transfers, refunds | `lib/importMatch.ts`, `routes/banks.ts`, `PATCH /transactions/:id {refund}` | Pending imports (hint, Yes / No), transaction detail "Got money back?" |
| 3 Big occasional costs | `recurring` termly, `goals.recurring_id`, pot pays the bill in `lib/recurring.ts` | Bills: "set aside ₦X a month", "Start a pot" |
| 5, 6, 13, 14 Your money | `routes/money.ts` (`/money`, `/holdings`, `/debts`, `/fx-rates`) | Profile > Your money (`MoneyScreen`) |
| 7 Daily earners | income frequency `daily` (26 working days) | Income editor, split note after logging income |
| 8 Steady pay | `goals.kind = 'buffer'`, `direction: 'out'` payouts, insights | Income & payday > Steady pay, goal "Pay yourself" |
| 9 Tight month | budget `endDate` patch, `/budgets/:id/pace` | Budget: "Money tight?" sheet, "My pay is late" |
| 10 Ajo | `recurring.payout_*`, payout reminder | Bill editor: "It's an ajo or esusu" |
| 11 Family support | monthly insight | Existing category, with a monthly limit on it |
| 12, 21 Templates | the budget's own stages | New budget: Wedding, Burial, Building, Moving abroad, Pocket money |
| 15 Household staff | `staff.space_id`, no PAYE at home | Profile > Household staff |
| 16 Helpers | `delegates`, checked in `requireAuth` for every request | Profile > People who help, banner while helping |
| 17 Landlords | `routes/people.ts` properties, rent reminders | Business profile > Properties |
| 18 Languages | `profiles.language`, Pidgin phrases in entry parsing | Settings > Language. Pidgin covers tabs, Add transaction and Your money so far; everything else stays English until translated. Translations need a native speaker's review. |
| 19 Save data | | Settings > Save data and battery (no haptics, no background config checks) |
| 20 Safety | private pushes in `lib/notify.ts` | Notifications > Keep notifications private; hide amounts already on Home |
| 22 Rising prices | `lib/prices.ts`, `/prices`, insights, next budget keeps up, staff price alerts and rates | Insights > Rising prices, goal "may cost nearer", console Content > Prices and exchange rates |
