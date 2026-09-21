import type { BudgetPurpose } from '../api/endpoints';

/**
 * Starting points for one-off projects and a child's pocket money. A template only fills in the name and splits
 * the total into stages (mini budgets) people can change; nothing else about the budget is special.
 */
export type BudgetTemplate = {
  key: string;
  label: string;
  purpose: BudgetPurpose;
  title: string;
  period?: 'monthly' | 'weekly';
  /** Stage names with their share of the total, in percent. They add up to 100. */
  stages: Array<[string, number]>;
};

export const BUDGET_TEMPLATES: BudgetTemplate[] = [
  {
    key: 'wedding',
    label: 'Wedding',
    purpose: 'event',
    title: 'Wedding',
    stages: [['Venue', 20], ['Food & drinks', 30], ['Outfits & aso-ebi', 15], ['Photos & video', 10], ['Decor & music', 10], ['Other', 15]]
  },
  {
    key: 'burial',
    label: 'Burial',
    purpose: 'event',
    title: 'Burial',
    stages: [['Mortuary & casket', 25], ['Venue & canopy', 15], ['Food & drinks', 30], ['Printing & souvenirs', 10], ['Transport', 10], ['Other', 10]]
  },
  {
    key: 'building',
    label: 'Building a house',
    purpose: 'event',
    title: 'Building project',
    stages: [['Land & papers', 20], ['Foundation', 15], ['Walls & roofing', 30], ['Plumbing & wiring', 15], ['Finishing', 20]]
  },
  {
    key: 'relocation',
    label: 'Moving abroad',
    purpose: 'event',
    title: 'Relocation',
    stages: [['Exams & visa', 15], ['Flights', 25], ['Tuition or deposit', 30], ['First month’s rent', 20], ['Other', 10]]
  },
  { key: 'pocket', label: 'Pocket money for a child', purpose: 'household', title: 'Pocket money', period: 'weekly', stages: [] }
];
