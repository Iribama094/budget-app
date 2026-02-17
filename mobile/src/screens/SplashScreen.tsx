import React, { useEffect, useRef } from 'react';
import { View, Image, Text, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';

export function SplashScreen() {
  const { theme } = useTheme();

  // Entrance animations
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(14)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;

  // Soft background motion
  const glowOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Run cinematic entrance once (1.6s total)
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 6,
          tension: 90,
          useNativeDriver: true
        })
      ]),
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 550,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(titleTranslateY, {
          toValue: 0,
          duration: 550,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true
        })
      ])
    ]).start();

    // Gentle looping motion for background glow
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowOffset, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(glowOffset, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        })
      ])
    ).start();
  }, [logoOpacity, logoScale, titleOpacity, titleTranslateY, glowOffset]);

  const translateGlowUp = glowOffset.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const translateGlowDown = glowOffset.interpolate({ inputRange: [0, 1], outputRange: [0, 12] });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Soft animated gradient background */}
      <LinearGradient
        colors={
          theme.mode === 'dark'
            ? ['#020617', '#0f172a', '#111827']
            : ['#ecfdf5', '#f5f3ff', '#eff6ff']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', inset: 0 }}
      />

      {/* Glow blobs / waves */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: 260,
          height: 260,
          borderRadius: 260,
          backgroundColor: theme.mode === 'dark' ? 'rgba(59,130,246,0.16)' : 'rgba(16,185,129,0.18)',
          top: -40,
          right: -40,
          transform: [{ translateY: translateGlowUp }]
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: 320,
          height: 320,
          borderRadius: 320,
          backgroundColor: theme.mode === 'dark' ? 'rgba(147,51,234,0.16)' : 'rgba(59,130,246,0.16)',
          bottom: -80,
          left: -60,
          transform: [{ translateY: translateGlowDown }]
        }}
      />

      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 32
        }}
      >
        <Animated.View
          style={{
            marginBottom: 20,
            transform: [{ scale: logoScale }],
            opacity: logoOpacity
          }}
        >
          <Image
            source={require('../../assets/logo.png')}
            style={{ width: 128, height: 128 }}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View
          style={{
            alignItems: 'center',
            transform: [{ translateY: titleTranslateY }],
            opacity: titleOpacity
          }}
        >
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 26,
              fontWeight: '900',
              marginBottom: 6
            }}
          >
            BudgetFriendly
          </Text>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: 14,
              fontWeight: '600',
              textAlign: 'center'
            }}
          >
            Smarter budgeting, every day.
          </Text>
        </Animated.View>

      </View>
    </SafeAreaView>
  );
}
