import React from 'react';
import { Briefcase, Car, HeartPulse, Home, Receipt, ShoppingBag, ShoppingCart, Tv, Wifi, Zap, PiggyBank, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { categorySlot } from '../../theme/theme';
import { IconTile } from './ui';

function iconFor(category: string, isIncome: boolean): LucideIcon {
  const c = category.trim().toLowerCase();
  if (isIncome) return Briefcase;
  if (/food|grocer|dining|restaurant/.test(c)) return ShoppingCart;
  if (/bill|util|electric|power/.test(c)) return Zap;
  if (/rent|housing|home/.test(c)) return Home;
  if (/transport|car|fuel|gas|taxi|uber|bolt|ride|travel/.test(c)) return Car;
  if (/shop|cloth|fashion|office/.test(c)) return ShoppingBag;
  if (/entertain|movie|netflix|leisure|subscription|software/.test(c)) return Tv;
  if (/data|airtime|internet|phone/.test(c)) return Wifi;
  if (/health|medic|pharm/.test(c)) return HeartPulse;
  if (/saving|invest|reserve/.test(c)) return PiggyBank;
  return Receipt;
}

/** Tinted tile with an icon that matches the transaction category. */
export function CategoryIcon({ category, type = 'expense', size = 40 }: { category?: string | null; type?: 'income' | 'expense'; size?: number }) {
  const { theme } = useTheme();
  const isIncome = type === 'income';
  const Icon = iconFor(String(category ?? ''), isIncome);
  const slot = categorySlot(category);
  const bg = isIncome ? theme.colors.successSoft : theme.categories.bg[slot];
  const fg = isIncome ? theme.colors.success : theme.categories.fg[slot];
  return (
    <IconTile bg={bg} size={size}>
      <Icon color={fg} size={Math.round(size * 0.48)} />
    </IconTile>
  );
}
