# BudgetFriendly: functional documentation

What the app does, for whom, and the rules it follows. For how it is built, see [TECHNICAL.md](TECHNICAL.md). For what is and is not ready, see [READINESS.md](READINESS.md).

## Who it is for

- **People** who want their money to last from one payday to the next, mostly in Nigeria, paid in naira, often with irregular income.
- **Small businesses and sole traders** who want invoices, staff pay, statements and tax in one place, kept apart from their personal money.

One account can have both a **personal space** and a **business space**, switched from the top of the app. Money in one never appears in the other unless the owner moves it ("Pay yourself").

BudgetFriendly is not a bank. It never holds, sends or debits money. Bank links are read-only.

## First run

1. **Welcome slides** (four, with photos) explain the idea, then offer Sign in or Create account.
2. **Create account**: name, email, password. Passwords need at least 8 characters with letters and numbers, and the most-guessed passwords are refused.
3. **Confirm email** (when email sending is switched on): a six-digit code is emailed; the account cannot be used until it is entered. See [Email confirmation](#email-confirmation).
4. **Set up your plan**: what you earn, when payday is, your fixed bills. The app splits what is left into **Needs, Wants and Savings** for each budget period (payday to payday, or calendar month). It can be skipped and done later.
5. A **guided tour** highlights each part of the Home screen as it explains it.

## Personal space

| Area | What people can do |
| --- | --- |
| **Home** | Safe to spend today, how the budget is pacing, payday countdown, insights, a weekly check-in, and a first-week checklist for new people |
| **Budget** | The period's budget split into Needs, Wants and Savings; mini budgets for events like a wedding or a trip; a budget streak; roll unspent money into the next period |
| **Transactions** | Add income or spending by typing, by voice, by pasting a bank alert SMS, by importing a bank statement, or automatically from a linked bank. Imported items wait in **Pending** until confirmed |
| **Categories** | Built-in and custom categories (tithe, generator fuel). The app learns which category a payee belongs to |
| **Recurring and bills** | Salary, rent, subscriptions and bills that repeat; bill reminders before they are due |
| **Goals** | Save towards something. Auto-save moves a set share of each income into a goal. A "steady pay" buffer smooths irregular income |
| **Analytics** | Spending by bucket, category and week, mini budget progress, and a money wellness score |
| **Your money** | What you have (cash, savings, investments, in any currency), what you owe and are owed, property and rent due, and rising prices |
| **Tax** | Personal income tax estimate under the Nigeria Tax Act 2025, including rent relief, pension and other reliefs |
| **Flux** | An AI money coach that answers from the person's own budget. Direct questions get 3 to 5 sentences, with an offer of more detail |
| **Money Wrapped** | An animated look back at the first half of the year or the whole year. Only visible when staff have certified it ready (see below) |
| **Sharing** | Share a household budget with a partner or family by invite code; each keeps their own budget too |
| **Helpers** | Let a trusted person see (view) or add transactions to (record) your money. They can never change settings, security or anything else |
| **Invite friends** | One short code per person, from Profile. A friend enters it at sign-up (or within 30 days, from the same screen). People who joined the waitlist keep their waitlist code, so friends they brought before launch still count. A friend counts once they confirm their email and record something, and the inviter is told the next morning. No reward is attached yet |
| **Notifications** | Alerts, bill reminders, insights, a weekly summary, and a daily nudge to log spending, each switchable in Settings |
| **Widgets** | "Safe to spend" on the Android home screen, with an iOS widget target in place |

## Business space

| Area | What businesses can do |
| --- | --- |
| **Business setup** | Three steps: the business name and what it does, how much it has today, and whether it is VAT registered and pays staff. Offered once on the first visit to the business space, and in Settings until it is done. Done means the business has a name, saved on the server; Later is remembered on that phone only, so another phone offers it again. The money-today step is optional and adds a Business account balance under Your money, not a sale |
| **Home** | Money in and out, what customers owe, what is owed to suppliers |
| **Invoices and customers** | Create invoices with VAT, record part and full payments, send, void |
| **Supplier bills** | Record bills from suppliers and pay them off |
| **Staff and payroll** | Staff list, pay runs, PAYE worked out per person |
| **Pay yourself** | Move money from the business to the personal space, recorded on both sides |
| **Statement import** | CSV from Paystack, Moniepoint and bank exports, matched against what is already recorded |
| **Reports** | Profit and loss style summaries by period |
| **Business tax** | Company income tax estimate: no tax at or below ₦50m turnover, 30% of profit above it (as currently configured) |
| **Money Wrapped** | A quarterly look back, again only when staff certify it |
| **Team** | Invite staff into the business with roles. See [team-access.md](team-access.md) |

## Account and security, as the user sees it

- **Face ID or fingerprint** unlock, offered after first sign-in. The app locks again after 5 minutes in the background.
- **Your devices** (Profile): every phone signed in to the account, with sign out for any one or all others. A signed-out phone loses access at once.
- **New sign-in alerts**: when the account is opened on a new device, the other devices get a notification and, once email is on, an email saying what to do if it was not them.
- **Password changed** alert, the same way.
- **App switcher privacy**: balances are covered by the logo when the app is not in front.
- **Staying safe from scams** in Help: what BudgetFriendly will never ask for (passwords, codes, money), what real support looks like, what to do about a lost phone.
- **Export data** for your records or an accountant.
- **Forgot password**: a six-digit code by email, then a new password. Needs email sending to be switched on.

### Email confirmation

New accounts prove they own their email address by typing a six-digit code. Until they do, the app shows only the code screen, the address receives nothing except that code and password resets, and the account cannot invite anybody. Codes expire after 15 minutes and allow 5 tries.

**While no mail provider is configured, this step stands aside**, because no code could arrive; it switches on by itself when the Brevo key is set. Accounts that existed before this step was added count as confirmed.

## Money Wrapped: when people see it

Wrapped is hidden unless all three are true:

1. the `money_wrapped` feature flag is on,
2. staff have **certified** that period ready in the console, with a note,
3. today is inside that period's window.

| Space | Periods | Window |
| --- | --- | --- |
| Personal | First half (January to June), full year | End of June into July; December into January |
| Business | Each quarter | Around each quarter's end |

## Staff console

A separate web app for the team that runs BudgetFriendly. Sign-in needs the password **and** a six-digit code from an authenticator app; the first sign-in sets the authenticator up.

| Page | What staff can do | Who |
| --- | --- | --- |
| Overview | Health at a glance, what needs attention, waitlist size and top referrers | All staff |
| Feature flags | Switch features on or off for everyone, or for a share of people | Owner, engineer |
| Money Wrapped | Certify a period ready, preview any person's Wrapped | Owner, engineer |
| People | Find someone by name, email or account id; see how their account is set up (never their transactions); send a password reset; sign out their devices | Owner, support |
| Content and copy | Edit money quotes and notification wording without a release | Owner, engineer |
| Tax rules | Draft a new version of the tax bands, reliefs and company tax; a **second person** must approve it; the old version is retired, not deleted | Owner, finance |
| Audit log | Every staff action, who did it and when. Cannot be edited or deleted | All staff |
| Staff | Add or remove staff. Only accounts that already exist can be added | Owner |
| Settings | Your role, change password, where the console points | All staff |

Staff never see a person's transactions and there is no "sign in as them".

## Language and tone

Plain English, with light Nigerian Pidgin only on celebratory moments (Wrapped, milestones). Quotes from Nigerian voices and finance figures appear in notifications and empty states.

## Limits worth knowing

- Tax figures are estimates for planning, not filings, and say so in the app.
- Push notifications to the lock screen need a production build with an Expo project configured. Until then, notifications appear in the in-app feed only.
- Bank linking depends on Mono, and live linking needs a live Mono account.
- Voice entry and Flux need an AI provider key on the server (Groq is configured).
