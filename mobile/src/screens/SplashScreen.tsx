import React, { useEffect, useRef } from 'react';
import { View, Image, Text, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';
import { fonts } from '../theme/typography';

export function SplashScreen() {
  const { theme } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true })
    ]).start();
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [opacity, scale, sweep]);

  const ground = theme.mode === 'dark' ? '#06110E' : '#0D2B26';
  const inner = Array.from({ length: 12 }, (_, i) => 70 + i * 14);
  const outer = Array.from({ length: 10 }, (_, i) => 90 + i * 18);

  return (
    <View style={[styles.fill, { backgroundColor: ground }]}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
        {inner.map((r, i) => (
          <Circle key={`i${r}`} cx="50%" cy="41%" r={r} stroke="#E2B65C" strokeOpacity={0.11 - i * 0.007} strokeWidth={1} fill="none" />
        ))}
        {outer.map((r, i) => (
          <Circle key={`o${r}`} cx="50%" cy="56%" r={r} stroke="#FFFFFF" strokeOpacity={0.05 - i * 0.004} strokeWidth={1} fill="none" />
        ))}
      </Svg>

      <Animated.View style={[styles.center, { opacity, transform: [{ scale }] }]}>
        <View style={styles.tile}>
          <Image source={require('../../assets/logo.png')} style={{ width: 94, height: 91 }} resizeMode="contain" />
        </View>
        <Text style={styles.word}>BudgetFriendly</Text>
        <Text style={styles.tagline}>Give every naira a job.</Text>
      </Animated.View>

      <View style={styles.track} accessibilityLabel="Loading">
        <Animated.View style={[styles.bar, { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-26, 64] }) }] }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tile: {
    width: 112,
    height: 112,
    borderRadius: 34,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10
  },
  word: { fontFamily: fonts.display, fontSize: 27, letterSpacing: -0.7, color: '#EAF4F1', marginTop: 26 },
  tagline: { fontFamily: fonts.medium, fontSize: 15, color: 'rgba(234,244,241,0.72)', marginTop: 8 },
  track: { position: 'absolute', bottom: 90, alignSelf: 'center', width: 64, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  bar: { width: 26, height: 3, borderRadius: 2, backgroundColor: '#E2B65C' }
});
