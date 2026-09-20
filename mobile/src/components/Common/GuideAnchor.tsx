import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTourAnchor } from '../../contexts/TourContext';

/**
 * Marks the part of a screen a first-visit guide step talks about, so the guide can highlight it
 * (see GuideContext and the `anchor` field in guides/screenGuides.ts). `collapsable={false}` keeps the view
 * measurable on Android, where a plain wrapper view would otherwise be optimised away.
 */
export function GuideAnchor({ id, children, style }: { id: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useTourAnchor(id);
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}
