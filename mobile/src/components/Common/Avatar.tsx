import React, { useState } from 'react';
import { Image, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { fonts } from '../../theme/typography';

/**
 * Someone's photo, or their initials until they add one. Used anywhere a person is shown, so a photo added
 * once turns up everywhere without each screen having to know how.
 *
 * A photo that will not load falls back to the initials rather than a broken square.
 */
export function Avatar({
  uri,
  initials,
  size = 44,
  style
}: {
  uri?: string | null;
  initials: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const [failed, setFailed] = useState(false);
  const radius = Math.round(size / 2);

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
        style={[{ width: size, height: size, borderRadius: radius, backgroundColor: theme.colors.surfaceAlt }, style as StyleProp<ImageStyle>]}
      />
    );
  }

  return (
    <View
      style={[
        { width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary },
        style
      ]}
    >
      <Text style={{ color: theme.colors.onPrimary, fontFamily: fonts.bold, fontSize: Math.max(12, Math.round(size * 0.36)) }}>{initials}</Text>
    </View>
  );
}
