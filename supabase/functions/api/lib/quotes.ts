import { sql } from './db.ts';
import type { Note } from './voice.ts';

/**
 * Short money quotes used as encouragement. Keep this list in sync with mobile/src/lib/quotes.ts.
 *
 * Rules for adding one:
 * - A named person is only credited when the line can be traced to a book, letter or speech, and that source
 *   is written next to it. Never credit a name for a line that is merely "widely attributed" to them.
 * - Sayings with no traceable author are credited to "Proverb", with what is known in the source field.
 * - Keep them under about 120 characters so they fit a notification.
 * - Tag each with the moments it suits. Quotes only go with encouraging moments: a good week, a new period,
 *   money saved, a goal reached. Never with warnings, overspending, bills, debt or security messages.
 */
export type QuoteTheme = 'saving' | 'spending' | 'planning' | 'patience' | 'change';

/** `local` marks a Nigerian or African voice. The picker offers these about three times as often. */
export type Quote = { id: string; text: string; author: string; source: string; themes: QuoteTheme[]; local?: boolean };

const LOCAL_WEIGHT = 3;

export const QUOTES: Quote[] = [
  { id: 'franklin-leak', text: 'Beware of little expenses; a small leak will sink a great ship.', author: 'Benjamin Franklin', source: 'The Way to Wealth, 1758', themes: ['spending'] },
  { id: 'franklin-saving', text: 'If you would be wealthy, think of saving as well as of getting.', author: 'Benjamin Franklin', source: 'The Way to Wealth, 1758', themes: ['saving'] },
  { id: 'jefferson', text: 'Never spend your money before you have it.', author: 'Thomas Jefferson', source: 'Letter to Thomas Jefferson Smith, 1825', themes: ['planning'] },
  { id: 'micawber', text: 'Annual income twenty pounds, annual expenditure nineteen nineteen and six, result happiness.', author: 'Charles Dickens', source: 'David Copperfield, 1850', themes: ['planning'] },
  { id: 'seneca', text: 'It is not the man who has too little, but the man who craves more, that is poor.', author: 'Seneca', source: 'Letters to Lucilius, Letter 2', themes: ['spending'] },
  { id: 'housel', text: 'Spending money to show people how much money you have is the fastest way to have less money.', author: 'Morgan Housel', source: 'The Psychology of Money, 2020', themes: ['spending'] },
  { id: 'graham', text: 'Price is what you pay; value is what you get.', author: 'Warren Buffett', source: 'Berkshire Hathaway letter, 2008 (crediting Ben Graham)', themes: ['spending'] },
  { id: 'carney', text: 'Little drops of water, little grains of sand, make the mighty ocean and the pleasant land.', author: 'Julia A. Carney', source: '“Little Things”, 1845', themes: ['saving', 'patience'] },
  { id: 'achebe-eneke', text: 'Eneke the bird says that since men have learned to shoot without missing, he has learned to fly without perching.', author: 'Chinua Achebe', source: 'Things Fall Apart, 1958', themes: ['change'], local: true },
  { id: 'nest', text: 'Little by little, the bird builds its nest.', author: 'Proverb', source: 'French proverb', themes: ['saving', 'patience'] },
  { id: 'penny', text: 'A penny saved is a penny earned.', author: 'Proverb', source: 'English proverb', themes: ['saving'] },
  { id: 'wesley', text: 'Gain all you can, save all you can, give all you can.', author: 'John Wesley', source: 'Sermon: The Use of Money, 1744', themes: ['saving'] },
  { id: 'thoreau', text: 'A man is rich in proportion to the number of things which he can afford to let alone.', author: 'Henry David Thoreau', source: 'Walden, 1854', themes: ['spending'] },
  { id: 'aesop-ant', text: 'It is thrifty to prepare today for the wants of tomorrow.', author: 'Aesop', source: 'The Ant and the Grasshopper', themes: ['saving', 'planning'] },
  { id: 'aesop-little', text: 'Little by little does the trick.', author: 'Aesop', source: 'The Crow and the Pitcher', themes: ['patience'] },
  { id: 'shakespeare', text: 'Neither a borrower nor a lender be.', author: 'William Shakespeare', source: 'Hamlet, 1603', themes: ['planning'] },
  { id: 'housel-unseen', text: 'Wealth is what you don’t see.', author: 'Morgan Housel', source: 'The Psychology of Money, 2020', themes: ['spending'] },
  { id: 'kiyosaki', text: 'It’s not how much money you make, but how much money you keep.', author: 'Robert Kiyosaki', source: 'Rich Dad Poor Dad, 1997', themes: ['saving'] },
  { id: 'franklin-bed', text: 'Rather go to bed without dinner than rise in debt.', author: 'Benjamin Franklin', source: 'Poor Richard’s Almanack, 1758', themes: ['planning'] },
  { id: 'achebe-hands', text: 'If a child washed his hands he could eat with kings.', author: 'Chinua Achebe', source: 'Things Fall Apart, 1958', themes: ['change', 'patience'], local: true },
  { id: 'coat', text: 'Cut your coat according to your cloth.', author: 'Proverb', source: 'English proverb', themes: ['planning'] },
  { id: 'tree', text: 'The best time to plant a tree was twenty years ago. The second best time is now.', author: 'Proverb', source: 'Widely cited as a proverb; origin uncertain', themes: ['patience', 'saving'] },
  { id: 'together', text: 'If you want to go fast, go alone. If you want to go far, go together.', author: 'Proverb', source: 'Widely cited as an African proverb', themes: ['patience', 'planning'], local: true },
  { id: 'dawn', text: 'However long the night, the dawn will break.', author: 'Proverb', source: 'Widely cited as an African proverb', themes: ['patience', 'change'], local: true },
  { id: 'servant', text: 'Money is a good servant but a bad master.', author: 'Proverb', source: 'English proverb, 17th century', themes: ['spending'] },
  { id: 'hay', text: 'Make hay while the sun shines.', author: 'Proverb', source: 'English proverb', themes: ['saving'] },
  { id: 'stitch', text: 'A stitch in time saves nine.', author: 'Proverb', source: 'English proverb', themes: ['planning'] },
  // Nigerian voices. Each one is a line the person actually said, with where they said it.
  { id: 'elumelu', text: 'If you have a dollar in your hands, put some of it aside.', author: 'Tony Elumelu', source: 'RFI “Guest Africa” interview, 2023', themes: ['saving'], local: true },
  { id: 'ovia', text: 'If you are disciplined and work hard, definitely you will do well.', author: 'Jim Ovia', source: 'Forbes Africa interview, 20 September 2018', themes: ['patience', 'planning'], local: true },
  { id: 'dangote', text: 'It’s not all about making money. It’s about making impact.', author: 'Aliko Dangote', source: 'Bloomberg Markets interview, 2017', themes: ['spending'], local: true },
  { id: 'oyedepo-slow', text: 'Things may be slow, but it is sure.', author: 'David Oyedepo', source: 'Sermon, reported by Vanguard, 26 July 2026', themes: ['patience', 'saving'], local: true },
  { id: 'oyedepo-bet', text: 'Naija bet is not the way to financial fortune.', author: 'David Oyedepo', source: 'Sermon, reported by Vanguard, 26 July 2026', themes: ['spending'], local: true }
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** A quote for these themes. The same seed always gives the same quote, so a message never changes on refresh. */
export function pickQuote(themes: QuoteTheme[], seed: string, from: Quote[] = QUOTES): Quote {
  const fit = from.filter((q) => q.themes.some((t) => themes.includes(t)));
  const list = fit.length ? fit : from;
  // Nigerian and African voices go in more than once, so they come up more often than the rest.
  const weighted = list.flatMap((q) => (q.local ? (Array(LOCAL_WEIGHT).fill(q) as Quote[]) : [q]));
  return weighted[hash(seed) % weighted.length];
}

export const quoteLine = (q: Quote) => `“${q.text}” ${q.author}`;

let cached: { at: number; list: Quote[] } | null = null;

/**
 * The quotes in force. Anything the staff console has saved wins; otherwise the list that ships in the code.
 * Held for five minutes, so editing one reaches the next message without asking the database every time.
 */
export async function liveQuotes(): Promise<Quote[]> {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.list;
  try {
    const rows = await sql<{ key: string; value: Quote }[]>`
      select key, value from public.content_blocks where kind = 'quote' and enabled
    `;
    const list = rows
      .map((r) => ({ ...(r.value as Quote), id: r.key.replace(/^quote\./, '') }))
      .filter((q) => q && typeof q.text === 'string' && typeof q.author === 'string');
    cached = { at: Date.now(), list: list.length ? list : QUOTES };
  } catch {
    cached = { at: Date.now(), list: QUOTES };
  }
  return cached.list;
}

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
