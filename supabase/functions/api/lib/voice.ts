/**
 * BudgetFriendly's notification voice: warm, playful Nigerian English with a touch of Pidgin, short and
 * always useful. Titles carry the personality; bodies carry the numbers and the next step.
 * Security messages stay plain on purpose.
 */

export type Note = { title: string; body: string };

/** Picks one option. With a seed the choice is stable, so a suggestion doesn't change wording on every refresh. */
export function pick<T>(options: readonly T[], seed?: string): T {
  if (!seed) return options[Math.floor(Math.random() * options.length)];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return options[h % options.length];
}

export const boss = (seed?: string) => pick(['Boss', 'Chief', 'My person', 'Oga'], seed);

export const voice = {
  budgetOver: (label: string, spent: string, total: string): Note => ({
    title: pick([`${boss()}, ${label} don pass budget o 😬`, `Chief, the ${label} budget don finish`, `${boss()} no be so o, ${label} is over budget`]),
    body: `${spent} spent out of ${total}. Let’s slow down on wants till things balance.`
  }),

  bucketOver: (bucket: string, label: string, spent: string, budgeted: string): Note => ({
    title: pick([`${bucket} don burst o 😬`, `${boss()}, ${bucket} is over budget`]),
    body: `${spent} spent, but the plan for ${label} was ${budgeted}. ${
      bucket === 'Wants' ? 'Time to pause the enjoyment small till payday.' : 'Maybe shift a little from Wants to cover it.'
    }`
  }),

  runningHot: (bucket: string, label: string, usedPct: number, timePct: number, perDay: string): Note => ({
    title: pick([`Easy o, ${boss()} 🔥 ${bucket} dey run fast`, `${boss()}, ${bucket} is moving too fast`]),
    body: `${usedPct}% used and ${label} is only ${timePct}% gone. About ${perDay} a day keeps am steady.`
  }),

  dailySpend: (spentToday: string, times: number): Note => ({
    title: pick([`${boss()} no be so o 👀`, 'Chief, today dey heavy o', `Hmm, ${boss()}… big spending day`]),
    body: `You’ve spent ${spentToday} today, about ${times}× your usual day. Hope everything dey alright? If na one-off, no wahala.`
  }),

  autosave: (amount: string, goalName: string | null, income: string): Note => ({
    title: pick(['My Oga, you’re really trying o 💪', `${boss()}, you dey save! 🎉`, 'Small small, the goal dey grow 🌱']),
    body: goalName ? `${amount} just went into ${goalName} from your ${income} income.` : `${amount} went into your goals from your ${income} income.`
  }),

  recurringRecorded: (name: string, amount: string, isIncome: boolean, times: number): Note => ({
    title: times === 1 ? pick([`Done ✅ ${name} don record`, `${name} don enter, no stress`]) : `${name} recorded ${times} times ✅`,
    body: `${amount} ${isIncome ? 'income' : 'expense'} added automatically from your schedule.`
  }),

  billDue: (name: string, when: string, amount: string, autoCreate: boolean): Note => ({
    title: pick([`Heads up, ${boss()}: ${name} is due ${when}`, `${name} dey come ${when} o`]),
    body: autoCreate ? `${amount}. We’ll record it for you on the day.` : `${amount}. Make sure the money dey ground.`
  }),

  bankReauth: (bank: string): Note => ({
    title: `${boss()}, ${bank} don disconnect`,
    body: 'Reconnect it so your transactions keep coming in.'
  }),

  bankImported: (count: number, bank: string): Note => ({
    title: pick([`${count} new transaction${count === 1 ? '' : 's'} from ${bank} don land`, `Fresh transactions from ${bank} 📥`]),
    body: 'Tap to sort them into your budget. E no go take long.'
  }),

  rollover: (amount: string, label: string, destination: string): Note => ({
    title: pick([`Oya! ${amount} don move from ${label}`, `Nice one, ${boss()} 🎉 ${amount} saved from ${label}`]),
    body: `Added to ${destination}. Small small, e go full.`
  }),

  memberJoined: (name: string, label: string): Note => ({
    title: `${name} don join ${label} 🎉`,
    body: 'Their spending now counts toward this budget.'
  })
};
