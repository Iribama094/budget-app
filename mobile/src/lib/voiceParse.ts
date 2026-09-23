/**
 * Turns a spoken money note into the parts of a transaction: "I spent 5k on fuel yesterday",
 * "paid 12,500 for school fees", "got paid 150k salary". Whatever it can't work out is left alone
 * for the person to fill in, so a wrong guess never saves silently.
 */
export type ParsedVoiceEntry = {
  type: 'income' | 'expense' | null;
  /** In the person's currency, or null when no amount was heard. */
  amount: number | null;
  /** What it was for, ready for the description field. */
  description: string;
  /** 0 for today, -1 for yesterday. */
  dayOffset: 0 | -1;
  /** One of the person's own categories, when they named it. */
  category: string | null;
  /** What the money was for, tidied into something that could become a category. Null when nothing was named. */
  subject: string | null;
};

/** Words that are about the spending, not about what was bought, so they never become a category. */
const NOT_A_SUBJECT = new Set([
  'it', 'that', 'this', 'them', 'him', 'her', 'me', 'my', 'myself', 'the', 'a', 'an', 'some', 'something',
  'today', 'yesterday', 'now', 'naira', 'ngn', 'money', 'cash', 'total', 'here', 'there', 'stuff', 'things'
]);

const singular = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
const normalise = (w: string) => singular(w.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim());

/**
 * The category the person actually said. Their own names are matched first and longest first, so "school fees"
 * wins over "school", and a plural is treated as its singular so "fees" finds "Fee".
 */
function findCategory(lower: string, known: string[]): string | null {
  const hay = ' ' + normalise(lower).replace(/\s+/g, ' ') + ' ';
  const sorted = [...known].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    const needle = normalise(name);
    if (needle && hay.includes(' ' + needle + ' ')) return name;
  }
  // Each word on its own, so "fuel" finds "Generator fuel" when nothing matched whole.
  for (const name of sorted) {
    const words = normalise(name).split(' ').filter((w) => w.length > 3 && !NOT_A_SUBJECT.has(w));
    if (words.some((w) => hay.includes(' ' + w + ' '))) return name;
  }
  return null;
}

/** The thing bought, short enough to be a category name: "fuel for the generator" becomes "Fuel". */
function findSubject(description: string): string | null {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !NOT_A_SUBJECT.has(w));
  if (!words.length) return null;
  // Up to two words, stopping at a joining word, so "school fees" survives but "fuel for generator" does not.
  const stop = new Set(['for', 'from', 'with', 'at', 'in', 'on', 'to', 'and', 'of']);
  const take: string[] = [];
  for (const w of words) {
    if (stop.has(w)) break;
    take.push(w);
    if (take.length === 2) break;
  }
  if (!take.length) return null;
  const name = take.join(' ');
  if (name.length < 3 || /^\d+$/.test(name)) return null;
  return name[0].toUpperCase() + name.slice(1);
}

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90
};
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, million: 1_000_000 };

const INCOME_WORDS = /\b(received|receive|got paid|get paid|salary|income|earned|earn|credited|credit alert|sold|sales|paid me|refund|allowance|bonus|dem pay me|dem don pay me|dem send me|don enter|don land|i collect|i don collect|my alert)\b/i;
const EXPENSE_WORDS = /\b(spent|spend|paid|pay|bought|buy|sent|send|gave|give|bill|fuel|transport|recharge|subscription|fees|chop|chopped|dash|dashed|i don pay|i don buy|okada|keke|danfo|mama put)\b/i;

/** "five thousand two hundred" → 5200. Returns null when there are no number words. */
function wordsToNumber(text: string): number | null {
  const tokens = text.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter((t) => t in UNITS || t in SCALES || t === 'and');
  if (!tokens.length) return null;
  let total = 0;
  let group = 0;
  let seen = false;
  for (const t of tokens) {
    if (t === 'and') continue;
    if (t in UNITS) {
      group += UNITS[t];
      seen = true;
    } else {
      const scale = SCALES[t];
      seen = true;
      if (scale === 100) group = Math.max(1, group) * 100;
      else {
        total += Math.max(1, group) * scale;
        group = 0;
      }
    }
  }
  return seen ? total + group : null;
}

/** The first amount in the text: ₦5,000 · 5k · 2.5m · 1500 · "five thousand". */
function findAmount(text: string): { amount: number; matched: string } | null {
  const digits = text.match(/(?:₦|ngn\s*)?(\d[\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?/i);
  if (digits) {
    const value = Number(digits[1].replace(/,/g, ''));
    if (Number.isFinite(value) && value > 0) {
      const suffix = (digits[2] ?? '').toLowerCase();
      const multiplier = suffix === 'k' || suffix === 'thousand' ? 1000 : suffix === 'm' || suffix === 'million' ? 1_000_000 : 1;
      return { amount: Math.round(value * multiplier * 100) / 100, matched: digits[0] };
    }
  }
  const spoken = wordsToNumber(text);
  if (spoken && spoken > 0) {
    const words = text.match(/\b(?:[a-z]+\s+)*?(?:hundred|thousand|million)\b/i);
    return { amount: spoken, matched: words ? words[0] : '' };
  }
  return null;
}

export function parseVoiceEntry(raw: string, knownCategories: string[] = []): ParsedVoiceEntry {
  const text = raw.trim().replace(/\s+/g, ' ');
  const lower = text.toLowerCase();
  const found = findAmount(lower);

  // "got paid" beats "paid", so income is checked first.
  const type: ParsedVoiceEntry['type'] = INCOME_WORDS.test(lower) ? 'income' : EXPENSE_WORDS.test(lower) ? 'expense' : null;
  const dayOffset: 0 | -1 = /\byesterday\b/i.test(lower) ? -1 : 0;

  // What it was for: the part after "on" or "for", otherwise the sentence without the money words.
  let description = '';
  const after = text.match(/\b(?:on|for|to)\s+(.+)$/i);
  // "bought bread for 1500" puts the money after "for", not the thing bought, so only take what follows when
  // there is something there besides the amount.
  const afterText = after ? after[1] : '';
  const afterIsOnlyMoney = !afterText
    .replace(/[₦,\d\s]/g, '')
    .replace(/\b(naira|ngn|k|m|thousand|million|hundred)\b/gi, '')
    .trim();
  if (after && !afterIsOnlyMoney) description = afterText;
  else {
    description = text
      .replace(new RegExp(`(?:₦|ngn)?\\s*${found?.matched ? found.matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '(?!)'}`, 'i'), ' ')
      .replace(/\b(i|just|today|yesterday|naira|ngn)\b/gi, ' ')
      .replace(INCOME_WORDS, ' ')
      .replace(EXPENSE_WORDS, ' ');
  }
  description = description
    .replace(/\b(today|yesterday)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.-]+|[\s,.-]+$/g, '')
    // A joining word left dangling at either end once the money came out of the middle: "Bread for".
    .replace(/\s+\b(for|on|to|and|of|with|at|in|from)\b$/i, '')
    .replace(/^\b(a|an|the)\b\s+/i, '')
    .slice(0, 80);
  if (description) description = description[0].toUpperCase() + description.slice(1);

  return {
    type,
    amount: found?.amount ?? null,
    description,
    dayOffset,
    category: findCategory(lower, knownCategories),
    subject: findSubject(description)
  };
}
