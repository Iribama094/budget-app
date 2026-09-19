import type { TextStyle } from 'react-native';

// Custom fonts on Android ignore fontWeight, so every weight is its own family.
export const fonts = {
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
  display: 'Sora_600SemiBold',
  displayMedium: 'Sora_500Medium',
  displayRegular: 'Sora_400Regular'
} as const;

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

export const type = {
  hero: { fontFamily: fonts.display, fontSize: 44, lineHeight: 50, letterSpacing: -1.6, fontVariant: tabular },
  amountLg: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, letterSpacing: -1, fontVariant: tabular },
  amount: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, letterSpacing: -0.4, fontVariant: tabular },
  amountSm: { fontFamily: fonts.display, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, fontVariant: tabular },
  h1: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, letterSpacing: -0.8 },
  h2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.5 },
  title: { fontFamily: fonts.display, fontSize: 17, lineHeight: 22, letterSpacing: -0.25 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1, textTransform: 'uppercase' }
} satisfies Record<string, TextStyle>;
