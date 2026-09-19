/**
 * BudgetFriendly's notification voice: warm, plain Nigerian English, like a friend who is good with money.
 *
 * Tone rules:
 * - Mostly plain English, with a sprinkle of the slang people actually text each other: omo, oya, easy o,
 *   no wahala, sapa, credit alert, e choke, soft life. If it sounds like an ad trying to be Nigerian, cut it.
 * - At most one slang touch per message, and not in every message. Happy and light moments only.
 * - No nicknames (Boss, Chief, Oga) and no long Pidgin sentences.
 * - Warnings, bills, debt and security stay calm and plain. Titles say what happened; bodies give the numbers
 *   and the next step.
 */

export type Note = { title: string; body: string };

/** Picks one option. With a seed the choice is stable, so a suggestion doesn't change wording on every refresh. */
export function pick<T>(options: readonly T[], seed?: string): T {
  if (!seed) return options[Math.floor(Math.random() * options.length)];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return options[h % options.length];
}

export const voice = {
  budgetOver: (label: string, spent: string, total: string): Note => ({
    title: pick([`${label} is over budget`, `You’ve gone past your ${label} budget`]),
    body: `${spent} spent out of ${total}. Easing off on wants for a while will help it balance.`
  }),

  bucketOver: (bucket: string, label: string, spent: string, budgeted: string): Note => ({
    title: `${bucket} is over budget`,
    body: `${spent} spent, but the plan for ${label} was ${budgeted}. ${
      bucket === 'Wants' ? 'Maybe hold off on extras until payday.' : 'You could move a little from Wants to cover it.'
    }`
  }),

  runningHot: (bucket: string, label: string, usedPct: number, timePct: number, perDay: string): Note => ({
    title: pick([`Easy o, ${bucket} is going fast 🔥`, `Heads up: ${bucket} is ahead of plan`]),
    body: `${usedPct}% used and ${label} is only ${timePct}% gone. About ${perDay} a day keeps it steady.`
  }),

  dailySpend: (spentToday: string, times: number): Note => ({
    title: pick(['Omo, big spending day 👀', 'Today’s spending is high']),
    body: `You’ve spent ${spentToday} today, about ${times}× your usual day. If it was a one-off, no wahala.`
  }),

  autosave: (amount: string, goalName: string | null, income: string): Note => ({
    title: pick(['Well done o, you’re saving 💪', 'Your goal just grew 🌱']),
    body: goalName ? `${amount} just went into ${goalName} from your ${income} income.` : `${amount} went into your goals from your ${income} income.`
  }),

  autosaveReminder: (amount: string, goalName: string, income: string): Note => ({
    title: pick([`Time to top up ${goalName} 🌱`, `${amount} for ${goalName}?`]),
    body: `From your ${income} income. Move ${amount} to your savings, then tap “I moved it” so your goal and budget stay correct.`
  }),

  invoiceDueSoon: (customer: string, amount: string, number: string): Note => ({
    title: `${customer}’s invoice is due tomorrow 📅`,
    body: `${number} for ${amount} is due tomorrow. A friendly reminder today helps.`
  }),

  invoiceOverdue: (customer: string, amount: string, days: number): Note => ({
    title: `${customer} is ${days} day${days === 1 ? '' : 's'} late paying`,
    body: `${amount} is overdue. Send a gentle reminder from Invoices.`
  }),

  billDueSoon: (supplier: string, amount: string, when: string): Note => ({
    title: `Heads up: ${supplier} bill is due ${when}`,
    body: `${amount}. Make sure the money is ready.`
  }),

  vatReminder: (month: string): Note => ({
    title: 'VAT return coming up 🧾',
    body: `Your VAT return for ${month} is usually due by the 21st. Confirm with your accountant.`
  }),

  payeReminder: (month: string, owed: string | null): Note => ({
    title: 'PAYE reminder 🧾',
    body: `${owed ? `${owed} of ` : ''}PAYE for ${month} is usually due by the 10th. Confirm with your accountant.`
  }),

  wrappedReady: (label: string): Note => ({
    title: `Your ${label} Money Wrapped is here 🎁`,
    body: 'See how your money moved, your top spots and your money personality.'
  }),

  recurringRecorded: (name: string, amount: string, isIncome: boolean, times: number): Note => ({
    title: times === 1 ? `${name} recorded ✅` : `${name} recorded ${times} times ✅`,
    body: `${amount} ${isIncome ? 'income' : 'expense'} added automatically from your schedule.`
  }),

  billDue: (name: string, when: string, amount: string, autoCreate: boolean): Note => ({
    title: `Heads up: ${name} is due ${when}`,
    body: autoCreate ? `${amount}. We’ll record it for you on the day.` : `${amount}. Make sure the money is ready.`
  }),

  bankReauth: (bank: string): Note => ({
    title: `${bank} has disconnected`,
    body: 'Reconnect it so your transactions keep coming in.'
  }),

  bankImported: (count: number, bank: string): Note => ({
    title: `${count} new transaction${count === 1 ? '' : 's'} from ${bank} 📥`,
    body: 'Tap to sort them into your budget. E no go take long.'
  }),

  rollover: (amount: string, label: string, destination: string): Note => ({
    title: pick([`Oya! ${amount} saved from ${label} 🎉`, `${amount} left over from ${label}, and saved`]),
    body: `Added to ${destination}. Little by little, it adds up.`
  }),

  memberJoined: (name: string, label: string): Note => ({
    title: `${name} joined ${label} 🎉`,
    body: 'Their spending now counts toward this budget.'
  }),

  memberLeft: (name: string, label: string): Note => ({
    title: `${name} left ${label}`,
    body: 'They no longer see this budget. What they already added stays.'
  }),

  sharedDigest: (label: string, who: string, tail: string | null): Note => ({
    title: pick([`Here’s what went into ${label} yesterday 👀`, `${label}: yesterday’s spending`]),
    body: `${who}.${tail ? ` ${tail}` : ''}`
  }),

  periodEnding: (label: string, shared: boolean): Note => ({
    title: pick([`${label} ends tomorrow ⏳`, `Last day of ${label} tomorrow`]),
    body: shared ? 'Start the next one in a tap and everyone stays in.' : 'Start the next one in a tap: same plan, fresh numbers.'
  }),

  overWhileShort: (label: string): Note => ({
    title: `${label} is used up`,
    body: 'Your bills are bigger than your income this month, so this was expected. Pay must-pay bills first; Income & bills shows what to pause.'
  }),

  nextPeriodReady: (label: string): Note => ({
    title: `${label} is ready 🎉`,
    body: 'Same plan, same people. Spending you add now counts here.'
  })
};
