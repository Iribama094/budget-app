import { bucketColors, categoryPalette, tokens, type BucketKey } from './tokens';
import { normalizeBucket } from './buckets';

export type Theme = {
  mode: 'light' | 'dark';
  colors: {
    // Grounds and surfaces
    background: string;
    backgroundAlt: string;
    surface: string;
    surfaceAlt: string;
    border: string;
    // Text
    text: string;
    textMuted: string;
    // Brand
    primary: string;
    onPrimary: string;
    primarySoft: string;
    ink: string;
    inkText: string;
    // Accent and semantic
    secondary: string;
    accent: string;
    brass: string;
    brassSoft: string;
    warn: string;
    success: string;
    successSoft: string;
    error: string;
    errorSoft: string;
    overlay: string;
  };
  buckets: Record<BucketKey, string>;
  categories: { fg: string[]; bg: string[] };
};

const c = tokens.colors;

export function getTheme(mode: Theme['mode']): Theme {
  if (mode === 'dark') {
    return {
      mode,
      colors: {
        background: c.primary[950],
        backgroundAlt: '#101C1A',
        surface: '#101C1A',
        surfaceAlt: '#172724',
        border: '#20312E',
        text: '#E6EFEC',
        textMuted: c.gray[400],
        primary: c.primary[400],
        onPrimary: '#03140F',
        primarySoft: '#15332D',
        ink: '#133A32',
        inkText: '#EAF4F1',
        secondary: c.secondary[300],
        accent: c.accent[400],
        brass: c.secondary[300],
        brassSoft: c.secondary[950],
        warn: '#E9C27A',
        success: c.success[400],
        successSoft: c.success[900],
        error: c.error[400],
        errorSoft: c.error[900],
        overlay: 'rgba(0,0,0,0.55)'
      },
      buckets: bucketColors.dark,
      categories: categoryPalette.dark
    };
  }

  return {
    mode,
    colors: {
      background: c.gray[50],
      backgroundAlt: c.white,
      surface: c.white,
      surfaceAlt: c.gray[100],
      border: c.gray[200],
      text: c.gray[900],
      textMuted: c.gray[600],
      primary: c.primary[500],
      onPrimary: c.white,
      primarySoft: c.primary[100],
      ink: c.primary[900],
      inkText: '#EAF4F1',
      secondary: c.secondary[500],
      accent: c.accent[500],
      brass: c.secondary[500],
      brassSoft: c.secondary[100],
      warn: c.secondary[700],
      success: c.success[600],
      successSoft: c.success[100],
      error: c.error[600],
      errorSoft: c.error[100],
      overlay: 'rgba(8,17,15,0.45)'
    },
    buckets: bucketColors.light,
    categories: categoryPalette.light
  };
}

/** Stable colour slot for a spending category name. */
export function categorySlot(category: string | null | undefined): number {
  const name = String(category ?? '').trim().toLowerCase();
  if (!name) return 5;
  if (/food|grocer|dining|restaurant|eat/.test(name)) return 0;
  if (/bill|util|rent|electric|water|power/.test(name)) return 1;
  if (/transport|car|fuel|gas|taxi|uber|bolt|ride/.test(name)) return 2;
  if (/shop|cloth|fashion/.test(name)) return 3;
  if (/entertain|fun|movie|netflix|leisure/.test(name)) return 4;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 6;
}

/** Colour for a budget bucket, tolerant of business and older labels. */
export function bucketColor(theme: Theme, key: string): string {
  const b = normalizeBucket(key);
  return b ? theme.buckets[b] : theme.colors.textMuted;
}
