/**
 * Spots "log this for me" in a message to Flux: "I spent 5k on fuel yesterday", "paid 12,500 for school fees",
 * "got paid 150k salary". Questions are never treated as entries, and nothing is recorded until the person
 * taps Save in the app.
 */
import { addDaysIso } from './dates.ts';

export type EntryDraft = {
  type: 'income' | 'expense';
  amount: number;
  description: string;
  occurredOn: string;
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

const INCOME_WORDS = /\b(received|receive|got paid|get paid|salary|earned|earn|credited|credit alert|sold|paid me|refund|bonus)\b/i;
const EXPENSE_WORDS = /\b(spent|spend|paid|pay|bought|buy|sent|send|gave|give|subscribed|recharged)\b/i;
// "How much did I spend on fuel?" is a question, not something to record.
const QUESTION = /^\s*(how|what|when|where|why|which|who|can|could|should|will|would|do|did|does|is|are|am|was|were|any|tell|show|explain)\b|\?\s*$/i;

function wordsToNumber(text: string): number | null {
  const tokens = text
    .toLowerCase()
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter((t) => t in UNITS || t in SCALES || t === 'and');
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

/** A draft transaction when the message is clearly about money that has already moved, otherwise null. */
export function parseEntryIntent(raw: string, today: string): EntryDraft | null {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (!text || QUESTION.test(text)) return null;

  const lower = text.toLowerCase();
  const isIncome = INCOME_WORDS.test(lower);
  const isExpense = EXPENSE_WORDS.test(lower);
  if (!isIncome && !isExpense) return null;

  const found = findAmount(lower);
  if (!found || found.amount <= 0) return null;

  let description = '';
  const after = text.match(/\b(?:on|for|from)\s+(.+)$/i);
  if (after) {
    description = after[1];
  } else {
    // Cut the amount out by position, so none of it has to be escaped into a pattern.
    const at = found.matched ? lower.indexOf(found.matched.toLowerCase()) : -1;
    const withoutAmount = at >= 0 ? `${text.slice(0, at)} ${text.slice(at + found.matched.length)}` : text;
    description = withoutAmount.replace(/\b(i|just|today|yesterday|naira|ngn)\b/gi, ' ').replace(INCOME_WORDS, ' ').replace(EXPENSE_WORDS, ' ');
  }
  description = description
    .replace(/\b(today|yesterday)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.-]+|[\s,.-]+$/g, '')
    .slice(0, 80);
  if (description) description = description[0].toUpperCase() + description.slice(1);

  return {
    type: isIncome ? 'income' : 'expense',
    amount: found.amount,
    description,
    occurredOn: /\byesterday\b/i.test(lower) ? addDaysIso(today, -1) : today
  };
}
