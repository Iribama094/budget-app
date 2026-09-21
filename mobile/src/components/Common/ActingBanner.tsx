import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActing } from '../../contexts/ActingContext';
import { fonts } from '../../theme/typography';

/** A thin strip on every screen while helping someone, so nobody forgets whose money they're looking at. */
export function ActingBanner({ onLeave }: { onLeave: () => void }) {
  const { acting } = useActing();
  const insets = useSafeAreaInsets();
  if (!acting) return null;
  return (
    <View
      accessibilityRole="summary"
      style={{ paddingTop: insets.top + 6, paddingBottom: 8, paddingHorizontal: 16, backgroundColor: '#B7832B', flexDirection: 'row', alignItems: 'center', gap: 10 }}
    >
      <Text style={{ flex: 1, color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 13 }} numberOfLines={1}>
        {acting.role === 'view' ? 'Viewing' : 'Helping with'} {acting.name}’s money
      </Text>
      <Pressable onPress={onLeave} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back to your own money">
        <Text style={{ color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 13, textDecorationLine: 'underline' }}>Back to mine</Text>
      </Pressable>
    </View>
  );
}
