import type { ApiCategory } from '../api/personal';
import type { Bucket } from '../theme/buckets';

type SpaceId = 'personal' | 'business';
type Group = { type: 'income' | 'expense'; bucket: Bucket | null; items: Array<[string, string]> };

// Mirrors the defaults the API gives every new account, so the app works offline before the first sync.
const DEFAULTS: Record<SpaceId, Group[]> = {
  personal: [
    {
      type: 'expense',
      bucket: 'Needs',
      items: [
        ['Food & groceries', 'cart'],
        ['Rent & housing', 'home'],
        ['Transport', 'car'],
        ['Bills & utilities', 'zap'],
        ['Data & airtime', 'wifi'],
        ['Health', 'heart'],
        ['School fees', 'school'],
        ['Family support', 'family'],
        ['Tithe & offering', 'church'],
        ['Debt repayment', 'card']
      ]
    },
    {
      type: 'expense',
      bucket: 'Wants',
      items: [
        ['Eating out', 'utensils'],
        ['Shopping', 'bag'],
        ['Entertainment', 'tv'],
        ['Subscriptions', 'repeat'],
        ['Personal care', 'sparkles'],
        ['Gifts', 'gift'],
        ['Travel', 'plane'],
        ['Other', 'tag']
      ]
    },
    { type: 'expense', bucket: 'Savings', items: [['Savings', 'piggy'], ['Emergency fund', 'shield'], ['Investments', 'trending']] },
    {
      type: 'income',
      bucket: null,
      items: [
        ['Salary', 'briefcase'],
        ['Business income', 'store'],
        ['Side hustle', 'coins'],
        ['Allowance', 'wallet'],
        ['Gift received', 'gift'],
        ['Interest', 'percent'],
        ['Refund', 'undo'],
        ['Other income', 'tag']
      ]
    }
  ],
  business: [
    {
      type: 'expense',
      bucket: 'Needs',
      items: [
        ['Payroll', 'family'],
        ['Rent', 'home'],
        ['Utilities', 'zap'],
        ['Stock & supplies', 'box'],
        ['Professional services', 'briefcase'],
        ['Taxes & fees', 'landmark'],
        ['Shipping & delivery', 'truck'],
        ['Loan repayment', 'card']
      ]
    },
    { type: 'expense', bucket: 'Wants', items: [['Marketing', 'megaphone'], ['Software & subscriptions', 'laptop'], ['Travel', 'plane'], ['Equipment', 'box'], ['Other', 'tag']] },
    { type: 'expense', bucket: 'Savings', items: [['Business savings', 'piggy'], ['Growth & expansion', 'trending']] },
    { type: 'income', bucket: null, items: [['Client payment', 'briefcase'], ['Sales', 'store'], ['Service revenue', 'coins'], ['Interest', 'percent'], ['Other income', 'tag']] }
  ]
};

export function defaultCategories(spaceId: SpaceId): ApiCategory[] {
  let order = 0;
  return DEFAULTS[spaceId].flatMap((g) =>
    g.items.map(([name, icon]) => ({
      id: `default:${spaceId}:${g.type}:${name}`,
      spaceId,
      name,
      type: g.type,
      bucket: g.bucket,
      icon,
      isDefault: true,
      hidden: false,
      sortOrder: order++,
      // Limits are set by the person, so a default has none until they do.
      monthlyLimit: null
    }))
  );
}
