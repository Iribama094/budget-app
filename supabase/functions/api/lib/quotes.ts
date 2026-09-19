import { sql } from './db.ts';
import type { Note } from './voice.ts';

/**
 * Short money quotes used as encouragement. Keep this list in sync with mobile/src/lib/quotes.ts.
 *
 * Rules for adding one:
 * - Only quotes with a checkable source (book, letter, speech). No "widely attributed" lines; proverbs are
 *   credited as proverbs. Keep them under about 120 characters so they fit a notification.
 * - Tag each with the moments it suits. Quotes only go with encouraging moments: a good week, a new period,
 *   money saved, a goal reached. Never with warnings, overspending, bills, debt or security messages.
 */
export type QuoteTheme = 'saving' | 'spending' | 'planning' | 'patience' | 'change';

export type Quote = { id: string; text: string; author: string; source: string; themes: QuoteTheme[] };

export const QUOTES: Quote[] = [
  { id: 'franklin-leak', text: 'Beware of little expenses; a small leak will sink a great ship.', author: 'Benjamin Franklin', source: 'The Way to Wealth, 1758', themes: ['spending'] },
  { id: 'franklin-saving', text: 'If you would be wealthy, think of saving as well as of getting.', author: 'Benjamin Franklin', source: 'The Way to Wealth, 1758', themes: ['saving'] },
  { id: 'jefferson', text: 'Never spend your money before you have it.', author: 'Thomas Jefferson', source: 'Letter to Thomas Jefferson Smith, 1825', themes: ['planning'] },
  { id: 'micawber', text: 'Annual income twenty pounds, annual expenditure nineteen nineteen and six, result happiness.', author: 'Charles Dickens', source: 'David Copperfield, 1850', themes: ['planning'] },
  { id: 'seneca', text: 'It is not the man who has too little, but the man who craves more, that is poor.', author: 'Seneca', source: 'Letters to Lucilius, Letter 2', themes: ['spending'] },
  { id: 'housel', text: 'Spending money to show people how much money you have is the fastest way to have less money.', author: 'Morgan Housel', source: 'The Psychology of Money, 2020', themes: ['spending'] },
  { id: 'graham', text: 'Price is what you pay; value is what you get.', author: 'Warren Buffett', source: 'Berkshire Hathaway letter, 2008 (crediting Ben Graham)', themes: ['spending'] },
  { id: 'carney', text: 'Little drops of water, little grains of sand, make the mighty ocean and the pleasant land.', author: 'Julia A. Carney', source: '“Little Things”, 1845', themes: ['saving', 'patience'] },
  { id: 'achebe-eneke', text: 'Eneke the bird says that since men have learned to shoot without missing, he has learned to fly without perching.', author: 'Chinua Achebe', source: 'Things Fall Apart, 1958', themes: ['change'] },
  { id: 'nest', text: 'Little by little, the bird builds its nest.', author: 'Proverb', source: 'French proverb', themes: ['saving', 'patience'] },
  { id: 'penny', text: 'A penny saved is a penny earned.', author: 'Proverb', source: 'English proverb', themes: ['saving'] }
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** A quote for these themes. The same seed always gives the same quote, so a message never changes on refresh. */
export function pickQuote(themes: QuoteTheme[], seed: string): Quote {
  const fit = QUOTES.filter((q) => q.themes.some((t) => themes.includes(t)));
  const list = fit.length ? fit : QUOTES;
  return list[hash(seed) % list.length];
}

export const quoteLine = (q: Quote) => `“${q.text}” — ${q.author}`;

/**
 * Adds a quote to the end of an encouraging notification, at most once every three days per person so it stays
 * a nice surprise rather than a habit people scroll past.
 */
export async function withQuote(userId: string, note: Note, themes: QuoteTheme[], seed: string): Promise<Note> {
  try {
    const claimed = await sql`
      insert into public.alert_log (key, user_id, expires_at)
      values (${`${userId}:quote`}, ${userId}, now() + interval '3 days')
      on conflict (key) do update set created_at = now(), expires_at = excluded.expires_at
        where alert_log.expires_at <= now()
      returning key
    `;
    if (!claimed.length) return note;
  } catch {
    return note;
  }
  return { ...note, body: `${note.body}\n\n${quoteLine(pickQuote(themes, `${userId}:${seed}`))}` };
}
