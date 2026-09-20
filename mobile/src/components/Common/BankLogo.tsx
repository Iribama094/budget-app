import React, { useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../../contexts/ThemeContext';
import { fonts } from '../../theme/typography';

/**
 * A bank's mark. The provider's own logo is used when we have one; otherwise the bank's initials on its brand
 * colour, which people recognise nearly as fast and needs no logo files shipped with the app.
 */
type Brand = { bg: string; short: string; light?: boolean };

const BRANDS: Array<[RegExp, Brand]> = [
  [/gtbank|gtco|guaranty/i, { bg: '#E96B22', short: 'GT' }],
  [/access/i, { bg: '#F58220', short: 'AC' }],
  [/zenith/i, { bg: '#E4032E', short: 'ZE' }],
  [/\buba\b|united bank/i, { bg: '#D31C2B', short: 'UB' }],
  [/first ?bank|fbn/i, { bg: '#08206B', short: 'FB' }],
  [/fcmb|city monument/i, { bg: '#5B2C86', short: 'FC' }],
  [/fidelity/i, { bg: '#0C8A3E', short: 'FI' }],
  [/union bank/i, { bg: '#0072BC', short: 'UN' }],
  [/sterling/i, { bg: '#DA291C', short: 'ST' }],
  [/stanbic|ibtc/i, { bg: '#0033A0', short: 'SB' }],
  [/ecobank/i, { bg: '#00539F', short: 'EC' }],
  [/wema|alat/i, { bg: '#6B2D8B', short: 'WE' }],
  [/polaris/i, { bg: '#7A2E8E', short: 'PO' }],
  [/keystone/i, { bg: '#0B6E4F', short: 'KE' }],
  [/providus/i, { bg: '#2C2A6B', short: 'PR' }],
  [/jaiz/i, { bg: '#0F6B3B', short: 'JA' }],
  [/heritage/i, { bg: '#0E7C3A', short: 'HE' }],
  [/unity bank/i, { bg: '#0E8A44', short: 'UY' }],
  [/kuda/i, { bg: '#40196D', short: 'KU' }],
  [/opay/i, { bg: '#1DC071', short: 'OP' }],
  [/palmpay/i, { bg: '#6F2DA8', short: 'PA' }],
  [/moniepoint/i, { bg: '#0357EE', short: 'MO' }],
  [/paystack/i, { bg: '#011B33', short: 'PS' }],
  [/carbon/i, { bg: '#0C1D3D', short: 'CA' }],
  [/fairmoney/i, { bg: '#1E3A8A', short: 'FM' }],
  [/demo/i, { bg: '#5A6E69', short: 'DB' }]
];

function initials(name: string): string {
  const words = String(name || '')
    .replace(/bank|plc|limited|ltd/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '••';
  return (words[0][0] + (words[1]?.[0] ?? words[0][1] ?? '')).toUpperCase();
}

export function BankLogo({ name, logoUrl, size = 40, style }: { name: string; logoUrl?: string | null; size?: number; style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  const [broken, setBroken] = useState(false);
  const brand = BRANDS.find(([re]) => re.test(name || ''))?.[1];
  const bg = brand?.bg ?? theme.colors.primary;
  const radius = Math.round(size * 0.3);

  if (logoUrl && !broken) {
    return (
      <View style={[{ width: size, height: size, borderRadius: radius, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden' }, styles.center, style]}>
        <Image
          source={{ uri: logoUrl }}
          onError={() => setBroken(true)}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          style={{ width: size, height: size }}
        />
      </View>
    );
  }

  return (
    <View accessibilityElementsHidden style={[{ width: size, height: size, borderRadius: radius, backgroundColor: bg }, styles.center, style]}>
      <Text style={{ color: '#FFFFFF', fontFamily: fonts.display, fontSize: Math.round(size * 0.34), letterSpacing: 0.4 }}>{brand?.short ?? initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
