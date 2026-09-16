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
};

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

const INCOME_WORDS = /\b(received|receive|got paid|get paid|salary|income|earned|earn|credited|credit alert|sold|sales|paid me|refund|allowance|bonus)\b/i;
const EXPENSE_WORDS = /\b(spent|spend|paid|pay|bought|buy|sent|send|gave|give|bill|fuel|transport|recharge|subscription|fees)\b/i;

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

export function parseVoiceEntry(raw: string): ParsedVoiceEntry {
  const text = raw.trim().replace(/\s+/g, ' ');
  const lower = text.toLowerCase();
  const found = findAmount(lower);

  // "got paid" beats "paid", so income is checked first.
  const type: ParsedVoiceEntry['type'] = INCOME_WORDS.test(lower) ? 'income' : EXPENSE_WORDS.test(lower) ? 'expense' : null;
  const dayOffset: 0 | -1 = /\byesterday\b/i.test(lower) ? -1 : 0;

  // What it was for: the part after "on" or "for", otherwise the sentence without the money words.
  let description = '';
  const after = text.match(/\b(?:on|for|to)\s+(.+)$/i);
  if (after) description = after[1];
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
    .slice(0, 80);
  if (description) description = description[0].toUpperCase() + description.slice(1);

  return { type, amount: found?.amount ?? null, description, dayOffset };
}
