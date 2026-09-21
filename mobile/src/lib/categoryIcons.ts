import {
  BookOpen,
  Briefcase,
  Car,
  Church,
  Coins,
  CreditCard,
  Dumbbell,
  Fuel,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  Laptop,
  Megaphone,
  Package,
  Percent,
  PiggyBank,
  Plane,
  Receipt,
  Repeat,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Store,
  Tag,
  TrendingUp,
  Truck,
  Tv,
  Undo2,
  Users,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Zap,
  type LucideIcon
} from '../icons';

/** Icon keys stored with each category (the API uses the same keys). */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  cart: ShoppingCart,
  home: Home,
  car: Car,
  fuel: Fuel,
  zap: Zap,
  wifi: Wifi,
  phone: Smartphone,
  heart: HeartPulse,
  school: GraduationCap,
  book: BookOpen,
  family: Users,
  church: Church,
  card: CreditCard,
  utensils: UtensilsCrossed,
  bag: ShoppingBag,
  tv: Tv,
  repeat: Repeat,
  sparkles: Sparkles,
  gift: Gift,
  plane: Plane,
  gym: Dumbbell,
  piggy: PiggyBank,
  shield: Shield,
  trending: TrendingUp,
  briefcase: Briefcase,
  store: Store,
  coins: Coins,
  wallet: Wallet,
  percent: Percent,
  undo: Undo2,
  box: Package,
  landmark: Landmark,
  truck: Truck,
  megaphone: Megaphone,
  laptop: Laptop,
  receipt: Receipt,
  tag: Tag
};

export const ICON_CHOICES = Object.keys(CATEGORY_ICONS);

export function iconForKey(key?: string | null): LucideIcon | null {
  return key ? CATEGORY_ICONS[key] ?? null : null;
}

/** A sensible icon for a category name someone typed. */
export function guessIconKey(name: string, isIncome = false): string {
  const c = name.trim().toLowerCase();
  if (isIncome) return /salary|pay|wage/.test(c) ? 'briefcase' : /business|sales|shop/.test(c) ? 'store' : 'coins';
  if (/tithe|offering|church|mosque|zakat|give|giving|charity|donat/.test(c)) return 'church';
  if (/food|grocer|market/.test(c)) return 'cart';
  if (/eat|restaurant|lunch|dinner/.test(c)) return 'utensils';
  if (/bill|util|electric|power|light|water|gas/.test(c)) return 'zap';
  if (/rent|housing|home|house/.test(c)) return 'home';
  if (/fuel|petrol|diesel/.test(c)) return 'fuel';
  if (/transport|car|taxi|uber|bolt|ride|bus/.test(c)) return 'car';
  if (/data|airtime|internet|phone/.test(c)) return 'wifi';
  if (/health|medic|pharm|hospital/.test(c)) return 'heart';
  if (/school|fees|tuition|educat|book/.test(c)) return 'school';
  if (/family|parent|mum|dad|child|kid|baby/.test(c)) return 'family';
  if (/loan|debt|credit/.test(c)) return 'card';
  if (/shop|cloth|fashion/.test(c)) return 'bag';
  if (/subscri|netflix|dstv|gotv/.test(c)) return 'repeat';
  if (/fun|entertain|movie|game/.test(c)) return 'tv';
  if (/gift|birthday|wedding/.test(c)) return 'gift';
  if (/travel|trip|flight/.test(c)) return 'plane';
  if (/gym|fitness|sport/.test(c)) return 'gym';
  if (/saving|emergency/.test(c)) return 'piggy';
  if (/invest|stock/.test(c)) return 'trending';
  return 'tag';
}
