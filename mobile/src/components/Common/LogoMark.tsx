import React from 'react';
import { Image, View } from 'react-native';

export function LogoMark({ size = 72 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), overflow: 'hidden' }}>
      <Image source={require('../../../assets/logo.png')} style={{ width: size, height: size }} resizeMode="contain" />
    </View>
  );
}
