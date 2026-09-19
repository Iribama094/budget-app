/**
 * Short money quotes shown as encouragement. Keep this list in sync with supabase/functions/api/lib/quotes.ts,
 * which follows the same rules:
 * - A named person is only credited when the line can be traced to a book, letter or speech, and that source is
 *   written next to it. Sayings with no traceable author are credited to "Proverb".
 * - Only in encouraging moments (the plan, the weekly check-in, a reached goal). Never next to warnings,
 *   overspending, bills, debt or security. One quote per screen at most.
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
  { id: 'penny', text: 'A penny saved is a penny earned.', author: 'Proverb', source: 'English proverb', themes: ['saving'] },
  { id: 'wesley', text: 'Gain all you can, save all you can, give all you can.', author: 'John Wesley', source: 'Sermon: The Use of Money, 1744', themes: ['saving'] },
  { id: 'thoreau', text: 'A man is rich in proportion to the number of things which he can afford to let alone.', author: 'Henry David Thoreau', source: 'Walden, 1854', themes: ['spending'] },
  { id: 'aesop-ant', text: 'It is thrifty to prepare today for the wants of tomorrow.', author: 'Aesop', source: 'The Ant and the Grasshopper', themes: ['saving', 'planning'] },
  { id: 'aesop-little', text: 'Little by little does the trick.', author: 'Aesop', source: 'The Crow and the Pitcher', themes: ['patience'] },
  { id: 'shakespeare', text: 'Neither a borrower nor a lender be.', author: 'William Shakespeare', source: 'Hamlet, 1603', themes: ['planning'] },
  { id: 'housel-unseen', text: 'Wealth is what you don’t see.', author: 'Morgan Housel', source: 'The Psychology of Money, 2020', themes: ['spending'] },
  { id: 'kiyosaki', text: 'It’s not how much money you make, but how much money you keep.', author: 'Robert Kiyosaki', source: 'Rich Dad Poor Dad, 1997', themes: ['saving'] },
  { id: 'franklin-bed', text: 'Rather go to bed without dinner than rise in debt.', author: 'Benjamin Franklin', source: 'Poor Richard’s Almanack, 1758', themes: ['planning'] },
  { id: 'achebe-hands', text: 'If a child washed his hands he could eat with kings.', author: 'Chinua Achebe', source: 'Things Fall Apart, 1958', themes: ['change', 'patience'] },
  { id: 'coat', text: 'Cut your coat according to your cloth.', author: 'Proverb', source: 'English proverb', themes: ['planning'] },
  { id: 'tree', text: 'The best time to plant a tree was twenty years ago. The second best time is now.', author: 'Proverb', source: 'Widely cited as a proverb; origin uncertain', themes: ['patience', 'saving'] },
  { id: 'together', text: 'If you want to go fast, go alone. If you want to go far, go together.', author: 'Proverb', source: 'Widely cited as an African proverb', themes: ['patience', 'planning'] },
  { id: 'dawn', text: 'However long the night, the dawn will break.', author: 'Proverb', source: 'Widely cited as an African proverb', themes: ['patience', 'change'] },
  { id: 'servant', text: 'Money is a good servant but a bad master.', author: 'Proverb', source: 'English proverb, 17th century', themes: ['spending'] },
  { id: 'hay', text: 'Make hay while the sun shines.', author: 'Proverb', source: 'English proverb', themes: ['saving'] },
  { id: 'stitch', text: 'A stitch in time saves nine.', author: 'Proverb', source: 'English proverb', themes: ['planning'] }
];

/** A quote for these themes. The same seed always gives the same quote, so it doesn't change on every visit. */
export function pickQuote(themes: QuoteTheme[], seed: string): Quote {
  const fit = QUOTES.filter((q) => q.themes.some((t) => themes.includes(t)));
  const list = fit.length ? fit : QUOTES;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}
