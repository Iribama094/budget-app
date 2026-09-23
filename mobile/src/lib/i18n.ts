import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * The app's language. English text is the key, so anything not yet translated simply shows in English:
 * wrapping a string in t() can never make a screen worse. Pidgin comes first because it reaches the most
 * people; Hausa, Yoruba and Igbo can be added as further maps the same way.
 */
export type Language = 'en' | 'pcm';

const PIDGIN: Record<string, string> = {
  // Tabs and common actions
  Home: 'Home',
  Budgets: 'Budget',
  Insights: 'Check am',
  Goals: 'Goals',
  Save: 'Save am',
  Cancel: 'Leave am',
  'Add a transaction': 'Add money wey move',
  // Add transaction
  Expense: 'I spend',
  Income: 'E enter',
  'Expense saved': 'I don save wetin you spend',
  'Income saved': 'I don save the money wey enter',
  'Add to this budget': 'Add am to this budget',
  'Raises what you can spend this period': 'E go raise wetin you fit spend this period',
  'Kept out of the plan. It still shows in money in.': 'E no go enter the plan. E still dey show for money wey enter.',
  'Received in': 'E enter as',
  // Home and budgets
  'Safe to spend today': 'Wetin you fit spend today',
  'left': 'remain',
  'Over by': 'E pass by',
  'Move money': 'Shift money',
  'Cover it': 'Cover am',
  'Money tight? See what to do →': 'Money tight? See wetin to do →',
  'Money is tight': 'Money tight',
  'My pay is late': 'My salary never land',
  // Your money
  'Your money': 'Your money',
  'What you have, own and owe': 'Wetin you get, wetin you own, wetin you owe',
  'Cash and accounts': 'Cash and account dem',
  'Things you own': 'Wetin you own',
  'Owed to you': 'Wetin people owe you',
  'You owe': 'Wetin you owe',
  'Someone owes me': 'Person owe me',
  'I owe someone': 'I owe person',
  'Rising prices': 'Price wey dey rise',
  'Steady pay': 'Steady pay',
  'Got money back?': 'Dem return money?'
};

const MAPS: Record<Language, Record<string, string>> = { en: {}, pcm: PIDGIN };

export function translate(text: string, language: Language | null | undefined): string {
  return MAPS[language ?? 'en']?.[text] ?? text;
}

/** t('Save') gives "Save am" in Pidgin and "Save" otherwise. */
export function useT() {
  const { user } = useAuth();
  const language = ((user as { language?: Language } | null)?.language ?? 'en') as Language;
  return useCallback((text: string) => translate(text, language), [language]);
}
