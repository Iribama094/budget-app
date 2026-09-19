// BudgetFriendly design tokens.
// Palette starts from the logo's deep teal. Scale keys are kept from the original
// Tailwind-derived tokens so existing screens keep compiling:
//   primary = teal, secondary = brass, accent = slate, success = green,
//   warning = amber, error = coral, gray = teal-biased neutrals.

export const tokens = {
  colors: {
    primary: {
      50: '#EEF6F3',
      100: '#DCEDE7',
      200: '#B6D9CE',
      300: '#86BFAF',
      400: '#3FA38F',
      500: '#1C6B5E',
      600: '#175A4F',
      700: '#134A41',
      800: '#0F3B34',
      900: '#0D2B26',
      950: '#08110F'
    },
    secondary: {
      50: '#FBF5EA',
      100: '#F5E9D2',
      200: '#EDD6AA',
      300: '#E2B65C',
      400: '#D4A04A',
      500: '#B7832B',
      600: '#9A6D22',
      700: '#8F6414',
      800: '#6B4B10',
      900: '#4A340B',
      950: '#382D18'
    },
    accent: {
      50: '#EEF2F8',
      100: '#E1E7F1',
      200: '#C3D0E4',
      300: '#9DB0D2',
      400: '#7F9BD0',
      500: '#5470A0',
      600: '#44608F',
      700: '#384F76',
      800: '#2C3E5C',
      900: '#1C2638',
      950: '#121925'
    },
    success: {
      50: '#EEF8F2',
      100: '#DDF1E6',
      200: '#B5E2C8',
      300: '#7FCCA3',
      400: '#45C28A',
      500: '#22A06B',
      600: '#1B8A58',
      700: '#166E47',
      800: '#125838',
      900: '#15342A',
      950: '#0B1F17'
    },
    warning: {
      50: '#FDF4E7',
      100: '#FAE6C8',
      200: '#F3CB8E',
      300: '#EAAE55',
      400: '#DF922E',
      500: '#C97A17',
      600: '#A86F12',
      700: '#8F5A0E',
      800: '#6E450C',
      900: '#4D300A',
      950: '#2E1C05'
    },
    error: {
      50: '#FCF1EF',
      100: '#F8E1DE',
      200: '#F0C0B9',
      300: '#E79A8F',
      400: '#F07565',
      500: '#D9534A',
      600: '#C8453A',
      700: '#A63A2F',
      800: '#7F2D25',
      900: '#3B1F1C',
      950: '#24120F'
    },
    gray: {
      50: '#F3F6F5',
      100: '#EAF0EE',
      200: '#DDE6E3',
      300: '#C3CFCB',
      400: '#8EA29D',
      500: '#6B7E79',
      600: '#5A6E69',
      700: '#3C4E4A',
      800: '#20312E',
      900: '#0F2723',
      950: '#08110F'
    },
    white: '#ffffff',
    black: '#000000'
  },
  radius: {
    md: 12,
    lg: 14,
    xl: 16,
    '2xl': 20,
    '3xl': 24
  }
} as const;

export type Tokens = typeof tokens;

// One distinct hue per budget bucket.
export const BUCKET_KEYS = ['Needs', 'Wants', 'Savings'] as const;
export type BucketKey = (typeof BUCKET_KEYS)[number];

export const bucketColors: Record<'light' | 'dark', Record<BucketKey, string>> = {
  light: { Needs: '#1C6B5E', Wants: '#C8963A', Savings: '#5470A0' },
  dark: { Needs: '#3FA38F', Wants: '#E2B65C', Savings: '#7F9BD0' }
};

// Categorical palette for spending categories (index-stable).
export const categoryPalette: Record<'light' | 'dark', { fg: string[]; bg: string[] }> = {
  light: {
    fg: ['#1C6B5E', '#5470A0', '#C8963A', '#8C5E8F', '#7FAE8E', '#8A9A96'],
    bg: ['#DCEDE7', '#E1E7F1', '#F5E9D2', '#EFE3EF', '#E3EFE6', '#E8EDEC']
  },
  dark: {
    fg: ['#3FA38F', '#7F9BD0', '#E2B65C', '#B98ABC', '#9CCBAA', '#8EA29D'],
    bg: ['#15332D', '#1C2638', '#382D18', '#33243A', '#1C3326', '#1E2A28']
  }
};
