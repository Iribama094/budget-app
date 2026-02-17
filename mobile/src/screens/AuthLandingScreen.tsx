import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { H1, P, PrimaryButton, SecondaryButton } from '../components/Common/ui';
import { useNavigation } from '@react-navigation/native';
import { LogoMark } from '../components/Common/LogoMark';

export function AuthLandingScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const heroSource = require('../../assets/splash-icon.png');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Full-screen hero background */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <Image source={heroSource} style={StyleSheet.absoluteFillObject} resizeMode="cover" />

        {/* Soft wave overlay for readability */}
        <LinearGradient
          colors={
            theme.mode === 'dark'
              ? ['rgba(2,6,23,0.10)', 'rgba(2,6,23,0.68)', 'rgba(2,6,23,0.94)']
              : ['rgba(249,250,251,0.10)', 'rgba(15,118,110,0.62)', 'rgba(2,6,23,0.92)']
          }
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{
            position: 'absolute',
            left: -80,
            right: -80,
            bottom: -140,
            height: '84%',
            borderTopLeftRadius: 240,
            borderTopRightRadius: 340,
            transform: [{ rotate: '-3deg' }]
          }}
        />
      </View>

      {/* Content */}
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 24, justifyContent: 'flex-end' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <LogoMark size={44} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: 'rgba(249,250,251,0.92)', fontWeight: '900', letterSpacing: 0.4, fontSize: 14 }}>
              BudgetFriendly
            </Text>
            <Text style={{ color: 'rgba(249,250,251,0.75)', fontWeight: '800', fontSize: 12 }}>
              Personal finance, made simple.
            </Text>
          </View>
        </View>

        <H1 style={{ color: '#fff', textAlign: 'left', maxWidth: 360 }}>
          Track spending.
          {'\n'}Build a budget.
          {'\n'}Hit your goals.
        </H1>
        <P style={{ color: 'rgba(249,250,251,0.88)', marginTop: 10, maxWidth: 420 }}>
          Get a clear picture of your money — then let budgets and insights do the heavy lifting.
        </P>

        <Text style={{ color: 'rgba(249,250,251,0.78)', marginTop: 12, fontSize: 12, fontWeight: '700', maxWidth: 420 }}>
          “you dont grow rich to manage well, you manage well to grow rich.”
        </Text>

        <View style={{ height: 18 }} />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <PrimaryButton title="Create Account" onPress={() => navigation.navigate('Register')} />
          </View>
          <View style={{ flex: 1 }}>
            <SecondaryButton title="Sign In" onPress={() => navigation.navigate('Login')} />
          </View>
        </View>

        <View style={{ height: 14 }} />

        <Text style={{ color: 'rgba(249,250,251,0.75)', fontSize: 12 }}>
          Your data stays private. You’re always in control.
        </Text>
      </View>
    </SafeAreaView>
  );
}
