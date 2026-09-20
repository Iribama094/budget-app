/**
 * First-visit guides: the first time someone opens a screen, a short card explains what it's for. One to three
 * steps each, written to the person, so every feature gets introduced at the moment they reach it instead of all
 * at once on day one. Keyed by route name; `business` replaces the guide when the Business space is active.
 * Plain forms (edit profile, change password, legal text) have no guide on purpose.
 */
/** `anchor` is a tour anchor id (see useTourAnchor). When that element is on screen, the step highlights it. */
export type GuideStep = { emoji: string; title: string; body: string; anchor?: string };
export type ScreenGuide = { steps: GuideStep[]; business?: GuideStep[] };

export const SCREEN_GUIDES: Record<string, ScreenGuide> = {
  /* ------------------------------------------------------------- tabs */
  Dashboard: {
    steps: [
      { emoji: '👋', title: 'This is Home', body: 'The number at the top is what’s safe to spend today and still be fine until payday. Savings and bills due soon are already kept aside.', anchor: 'dashboard.hero' },
      { emoji: '➕', title: 'Log spending in seconds', body: 'Tap + at the bottom. Type it, say it with the mic, or paste a bank alert, and we sort it into the right bucket.', anchor: 'dashboard.addTx' },
      { emoji: '✅', title: 'A quick daily check-in', body: 'Two minutes each evening keeps the number honest. Your weekly check-in lands every Sunday.' }
    ],
    business: [
      { emoji: '💼', title: 'Your business at a glance', body: 'Money in, money out and what customers owe you, kept apart from your personal money.', anchor: 'business.hero' },
      { emoji: '🧰', title: 'Your business tools', body: 'Invoices, bills, payroll, tax and reports are all a tap away from here.' , anchor: 'business.tools' },
      { emoji: '🔀', title: 'Switch spaces any time', body: 'Use the Personal / Business switch at the top to move between the two.', anchor: 'space.switcher' }
    ]
  },
  Budget: {
    steps: [
      { emoji: '📋', title: 'Your budgets live here', body: 'Your own plan, a household budget you share every month, or a one-off like a trip or an owambe.', anchor: 'budget.create' },
      { emoji: '🧺', title: 'Needs, Wants and Savings', body: 'Each budget splits your money into buckets, so you can see which one is running hot before it’s too late.', anchor: 'budget.buckets' },
      { emoji: '🔁', title: 'When a period ends', body: 'Start the next one with the same plan in one tap, and move anything left over into a goal.' }
    ],
    business: [
      { emoji: '📋', title: 'Plan what the business spends', body: 'Set a budget for stock, staff, rent and running costs, and see which one is running ahead of plan.', anchor: 'budget.create' }
    ]
  },
  Analytics: {
    steps: [
      { emoji: '📊', title: 'See where it went', body: 'Spending by category and bucket for any period. Tap a bar or a category to dig in.', anchor: 'analytics.timeframe' },
      { emoji: '💡', title: 'Small, useful nudges', body: 'We point out patterns, like a category creeping up, with one simple thing to try.' , anchor: 'analytics.digdeeper' }
    ],
    business: [
      { emoji: '📊', title: 'How the business is doing', body: 'Sales, costs and profit over any period. Tap a category to see what’s behind it.', anchor: 'analytics.timeframe' }
    ]
  },
  Goals: {
    steps: [
      { emoji: '🎯', title: 'Save for what matters to you', body: 'Pick a goal and a date. We work out what to put aside each month, and cheer you on as it fills up.', anchor: 'goals.add' },
      { emoji: '🌱', title: 'Small amounts count', body: 'Each time you set money aside, add it to a goal. Watching it grow is half the fun.' , anchor: 'goals.list' }
    ],
    business: [
      { emoji: '🛟', title: 'Money set aside', body: 'Build a cash reserve, tax money or savings for equipment, separate from day-to-day cash.', anchor: 'goals.list' }
    ]
  },

  /* ---------------------------------------------------------- everyday */
  AddTransaction: {
    steps: [
      { emoji: '⚡', title: 'Three ways to log', body: 'Type the amount, tap the mic and just say it, or paste a bank alert and we’ll fill it in for you.', anchor: 'addtx.voice' },
      { emoji: '🏷️', title: 'Categories do the sorting', body: 'Pick a category and it lands in Needs, Wants or Savings. Missing one? Add your own right here.' , anchor: 'addtx.categories' }
    ]
  },
  Transactions: {
    steps: [{ emoji: '🧾', title: 'Everything you’ve logged', body: 'Search, move between months, and tap any item to fix the amount, category or date.', anchor: 'transactions.search' }]
  },
  PendingTransactions: {
    steps: [{ emoji: '📥', title: 'Check before it counts', body: 'Imported items wait here. Confirm them, change the category, or discard, so only what’s right reaches your budget.', anchor: 'pending.list' }]
  },
  Recurring: {
    steps: [
      { emoji: '📅', title: 'Bills and regular income', body: 'Rent, data, school fees, salary: add them once and we’ll remind you before each one is due.', anchor: 'recurring.add' },
      { emoji: '⏭️', title: 'The next 30 days', body: 'The top shows what’s coming up soon, so nothing catches you off guard.' , anchor: 'recurring.upcoming' }
    ]
  },
  IncomeBills: {
    steps: [{ emoji: '🧮', title: 'The numbers behind your plan', body: 'Change your income, payday or bills here and your plan updates. If bills are more than income, we show what to pay first.', anchor: 'incomebills.income' }]
  },
  Categories: {
    steps: [{ emoji: '🏷️', title: 'Make categories yours', body: 'Add tithe, generator fuel or ajo, rename anything, and choose whether it counts as a Need, Want or Savings.', anchor: 'categories.add' }]
  },
  BudgetDetail: {
    steps: [
      { emoji: '👥', title: 'Inside this budget', body: 'See each bucket and, in a shared budget, who spent what. You can choose which budget shows on Home.', anchor: 'budgetdetail.buckets' },
      { emoji: '⏭️', title: 'Start the next period', body: 'When this one ends, start the next with the same plan in one tap.' , anchor: 'budgetdetail.next' }
    ]
  },
  MiniBudgets: {
    steps: [{ emoji: '🧩', title: 'Budgets inside your budget', body: 'Set a small budget for things you buy often, like fuel or data, and track it on its own so nothing sneaks up on you.', anchor: 'minibudgets.list' }]
  },
  BudgetStreakDetail: {
    steps: [{ emoji: '🔥', title: 'Your budget streak', body: 'Every day you spend below your usual daily amount keeps the streak alive. Check in daily to keep it going.', anchor: 'streak.card' }]
  },
  WeeklyCheckInDetail: {
    steps: [{ emoji: '🗓️', title: 'Your week in money', body: 'What came in, what went out and what’s left, day by day. Two minutes here sets you up for next week.', anchor: 'weekly.hero' }]
  },
  GoalDetail: {
    steps: [
      { emoji: '💰', title: 'Add money as you save', body: 'Tap Add money each time you set some aside. Count it under Savings so your budget stays accurate.' , anchor: 'goaldetail.add' },
      { emoji: '🔔', title: 'Let payday remind you', body: 'Turn on the auto-save reminder and we’ll nudge you to move a share of each income here.', anchor: 'goaldetail.autosave' }
    ]
  },
  Wrapped: {
    steps: [{ emoji: '🎁', title: 'Your Money Wrapped', body: 'Your money story for the half-year or the year. Tap through, then share your favourite card.' }]
  },

  /* ------------------------------------------------------- flux & more */
  Assistant: {
    steps: [
      { emoji: '🤖', title: 'Meet Flux, your money coach', body: 'Ask anything about your money, like “Can I afford this?” or “Where did my money go this week?”' , anchor: 'assistant.composer' },
      { emoji: '🎙️', title: 'Log by talking', body: 'Tell Flux what you spent, typed or by voice. It drafts the entry and you confirm before anything is saved.', anchor: 'assistant.mic' }
    ]
  },
  BankConnections: {
    steps: [{ emoji: '🏦', title: 'Connect your bank', body: 'Link an account and transactions come in by themselves. They wait for your review, so nothing counts without you.', anchor: 'banks.list' }]
  },
  BankAlertImport: {
    steps: [{ emoji: '📋', title: 'Paste a bank alert', body: 'Copy the SMS or email alert from your bank, paste it here, and we’ll turn it into a transaction for you to check.', anchor: 'bankalert.input' }]
  },
  ShareBudget: {
    steps: [{ emoji: '🤝', title: 'Budget together', body: 'Invite a partner, family or housemates with a code. Everyone logs to the same budget and sees who spent what.', anchor: 'share.join' }]
  },
  Notifications: {
    steps: [{ emoji: '🔔', title: 'Choose what we tell you', body: 'Turn alerts on or off: pace warnings, bill reminders, shared activity and the weekly check-in.', anchor: 'notifications.prefs' }]
  },
  Profile: {
    steps: [{ emoji: '🙋', title: 'Your profile', body: 'Your details, plan, income and security in one place. Update your plan here whenever life changes.', anchor: 'profile.plan' }],
    business: [{ emoji: '🏪', title: 'Your business profile', body: 'How the business shows up on invoices and reports, plus its key numbers.', anchor: 'profile.business' }]
  },
  Settings: {
    steps: [{ emoji: '⚙️', title: 'Make the app yours', body: 'Linked banks, your daily reminder, shared budgets, the Business space, and these tips all live here.', anchor: 'settings.list' }],
    business: [{ emoji: '⚙️', title: 'Business settings', body: 'Business details, tax, payroll, recurring costs and statement uploads all live here.', anchor: 'settings.list' }]
  },
  TaxSettings: {
    steps: [{ emoji: '🧾', title: 'Fine-tune your tax', body: 'Add rent and other reliefs so your tax estimate fits your real life. Rent relief is 20% of yearly rent, up to ₦500,000.', anchor: 'tax.reliefs' }]
  },
  ExportData: {
    steps: [{ emoji: '📤', title: 'Your data, your way', body: 'Download your transactions as a CSV or PDF any time, for yourself or your accountant.', anchor: 'export.actions' }]
  },
  Devices: {
    steps: [{ emoji: '📱', title: 'Where you’re signed in', body: 'Every phone signed in to your account. Sign out any you don’t recognise.', anchor: 'devices.list' }]
  },

  /* ----------------------------------------------------------- business */
  Invoices: {
    steps: [{ emoji: '🧾', title: 'Get paid on time', body: 'Create invoices, share them as PDFs and see what’s still owed. We remind you when one is overdue.', anchor: 'invoices.hero' }]
  },
  InvoiceDetail: {
    steps: [{ emoji: '📤', title: 'Share it, then record payment', body: 'Send this invoice as a PDF. When the money lands, tap Record payment and it counts as business income.', anchor: 'invoicedetail.actions' }]
  },
  Bills: {
    steps: [{ emoji: '📑', title: 'What the business owes', body: 'Supplier bills and PAYE from payroll, with reminders before they’re due.', anchor: 'bills.hero' }]
  },
  Payroll: {
    steps: [{ emoji: '👥', title: 'Your team and PAYE', body: 'Add staff and we estimate their PAYE and take-home pay. Record each month’s pay in one go.', anchor: 'payroll.run' }]
  },
  BusinessTax: {
    steps: [{ emoji: '🏛️', title: 'Tax without the stress', body: 'What to set aside for tax, your VAT and PAYE, and every filing date, estimated under the Nigeria Tax Act 2025.', anchor: 'businesstax.hero' }]
  },
  BusinessDetails: {
    steps: [{ emoji: '🏪', title: 'Who the business is', body: 'The name and contacts here appear at the top of your invoices and reports.', anchor: 'businessdetails.name' }]
  },
  PayYourself: {
    steps: [{ emoji: '💸', title: 'Pay yourself safely', body: 'We suggest what you can take this month without hurting the business. Pay it from your business account, then record it here.', anchor: 'payyourself.hero' }]
  },
  BusinessReports: {
    steps: [{ emoji: '📈', title: 'Reports that open doors', body: 'Profit and loss, cash flow and what’s owed, ready to share as a PDF with a lender, partner or accountant.', anchor: 'reports.share' }]
  },
  StatementImport: {
    steps: [{ emoji: '📂', title: 'Bring in your sales', body: 'Upload a Paystack, Moniepoint or bank CSV. Rows land in review first, so you stay in control.', anchor: 'statement.upload' }]
  }
};

// The Flux screen also opens as a sheet from Home.
SCREEN_GUIDES.AssistantModal = SCREEN_GUIDES.Assistant;

/** The guide for a route in the active space, and the key its "seen" flag is stored under. */
export function guideFor(route: string, space: 'personal' | 'business'): { key: string; steps: GuideStep[] } | null {
  const g = SCREEN_GUIDES[route];
  if (!g) return null;
  if (space === 'business' && g.business) return { key: `${route}:business`, steps: g.business };
  // Assistant and its sheet share one "seen" flag.
  return { key: route === 'AssistantModal' ? 'Assistant' : route, steps: g.steps };
}
