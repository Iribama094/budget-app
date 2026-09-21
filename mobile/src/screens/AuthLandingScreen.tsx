import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Check, Lock } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { Amount, Card, Chip, HeroCard, PrimaryButton, ProgressBar, Ring, SecondaryButton } from '../components/Common/ui';
import { type } from '../theme/typography';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function AuthLandingScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const month = MONTHS[new Date().getMonth()];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <View style={styles.brand}>
        <Image source={require('../../assets/logo.png')} style={{ width: 30, height: 30 }} resizeMode="contain" />
        <Text style={[type.title, { color: theme.colors.text }]}>BudgetFriendly</Text>
      </View>

      {/* Product preview built from the real components, not a stock image. */}
      <View style={[styles.illo, { backgroundColor: theme.colors.primarySoft }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <HeroCard style={styles.heroTilt}>
          <View style={styles.rowBetween}>
            <Text style={[type.eyebrow, { color: theme.colors.inkText, opacity: 0.72 }]}>{month} budget</Text>
            <Chip tone="onInk" label="On pace" icon={<Check color="#8FD6C3" size={12} strokeWidth={3} />} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <Amount value={263600} size="lg" color={theme.colors.inkText} />
            <Text style={[type.small, { color: theme.colors.inkText, opacity: 0.7 }]}>left</Text>
          </View>
          <View style={{ marginTop: 12 }}>
            <ProgressBar value={0.41} marker={0.43} height={8} color="#8FD6C3" trackColor="rgba(255,255,255,0.14)" markerColor="#FFFFFF" />
          </View>
        </HeroCard>
        <Card style={styles.goalTilt}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ring progress={0.52} label="52%" />
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Emergency fund</Text>
              <Text style={[type.caption, { color: theme.colors.textMuted }]}>₦520,000 of ₦1m</Text>
            </View>
          </View>
        </Card>
      </View>

      <Text style={[type.h1, { color: theme.colors.text, fontSize: 34, lineHeight: 40, marginTop: 26 }]}>Money with a plan.</Text>
      <Text style={[type.body, { color: theme.colors.textMuted, marginTop: 10, fontSize: 16, lineHeight: 24 }]}>
        Budgets that flex with your income, goals you can watch move, and one clear number for what’s safe to spend today.
      </Text>

      <View style={{ flex: 1 }} />

      <PrimaryButton title="Create account" onPress={() => navigation.navigate('Register')} />
      <SecondaryButton title="Sign in" onPress={() => navigation.navigate('Login')} style={{ marginTop: 10 }} />
      <View style={styles.trust}>
        <Lock color={theme.colors.textMuted} size={13} />
        <Text style={[type.caption, { color: theme.colors.textMuted }]}>Your data stays private. You’re always in control.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20, paddingBottom: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  illo: { height: 280, borderRadius: 28, marginTop: 18, overflow: 'hidden' },
  heroTilt: { position: 'absolute', left: 20, right: 34, top: 34, transform: [{ rotate: '-4deg' }] },
  goalTilt: { position: 'absolute', left: 86, right: 18, bottom: 28, paddingVertical: 12, transform: [{ rotate: '2deg' }] },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trust: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 }
});
