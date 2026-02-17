import { tokens } from '../theme/tokens';

export function toIsoDate(d: Date) {
  // Date-only values in this app represent a local calendar date (YYYY-MM-DD),
  // not a UTC timestamp. Using toISOString() can shift the day/month depending
  // on timezone, which breaks budget ranges and overlap validation.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toIsoDateTime(d: Date) {
  return d.toISOString();
}

export function formatMoney(amount: number, currency?: string | null) {
  const c = currency && currency.length <= 5 ? currency : 'USD';

  // RN Intl support varies by engine; keep a safe fallback.
  try {
    // Some backends store currency as symbol (e.g. "₦") not ISO code.
    // If it's not an ISO code, fall back to symbol formatting.
    if (/^[A-Z]{3}$/.test(c)) {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: c,
        maximumFractionDigits: 2
      }).format(amount);
    }
  } catch {
    // ignore
  }

  // Symbol fallback: accept things like ₦, $, €
  const symbol = currency && currency.length <= 3 ? currency : '$';
  const n = Math.abs(amount);
  const formatted = n.toLocaleString?.() ?? String(n);
  return `${amount < 0 ? '-' : ''}${symbol}${formatted}`;
}

// Formats a numeric input string with thousands separators, preserving an optional decimal part.
// Examples: "1000" -> "1,000", "20000.5" -> "20,000.5"
export function formatNumberInput(raw: string) {
  const cleaned = String(raw ?? '').replace(/[^0-9.,]/g, '');
  if (!cleaned) return '';

  // Normalize: treat ',' as grouping, '.' as decimal.
  const withoutGrouping = cleaned.replace(/,/g, '');
  const firstDot = withoutGrouping.indexOf('.');

  const intPart = firstDot === -1 ? withoutGrouping : withoutGrouping.slice(0, firstDot);
  const fracPart = firstDot === -1 ? '' : withoutGrouping.slice(firstDot + 1).replace(/\./g, '');

  const intDigits = intPart.replace(/^0+(?=\d)/, '');
  const groupedInt = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  if (firstDot === -1) return groupedInt;
  return `${groupedInt}.${fracPart}`;
}

export function parseNumberInput(raw: string) {
  const n = Number(String(raw ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

export function categoryDotColor(category: string): string {
  const c = category.trim().toLowerCase();
  if (c.includes('food') || c.includes('grocer') || c.includes('dining')) return tokens.colors.secondary[500];
  if (c.includes('transport') || c.includes('car') || c.includes('gas') || c.includes('taxi') || c.includes('uber')) return tokens.colors.primary[500];
  if (c.includes('shop')) return tokens.colors.accent[500];
  if (c.includes('bill') || c.includes('util') || c.includes('rent')) return tokens.colors.primary[700];
  return tokens.colors.gray[400];
}
