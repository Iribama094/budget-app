import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Check, X } from '../icons';

import { BankLogo } from '../components/Common/BankLogo';
import { Card, HeroCard, PrimaryButton, Screen, ScreenHeader, SecondaryButton } from '../components/Common/ui';
import { useSpace } from '../contexts/SpaceContext';
import { useTheme } from '../contexts/ThemeContext';
import { goBackOrHome } from '../navigation/goBack';
import { type } from '../theme/typography';

const POPULAR = ['GTBank', 'Access', 'Zenith', 'UBA', 'First Bank', 'Kuda', 'Opay', 'Moniepoint'];

/**
 * What connecting a bank means, before the bank list opens. This is the only consent step: the promise and the
 * limits sit together so "Choose your bank" goes straight to Mono.
 */
export default function BankConnectTermsScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpace, activeSpaceId } = useSpace();
  const isBusiness = spacesEnabled && activeSpaceId === 'business';

  const facts: Array<{ ok: boolean; title: string; body: string }> = [
    { ok: true, title: 'We read your last 90 days', body: isBusiness ? 'Sales and costs arrive on their own, ready for you to check.' : 'New transactions arrive each day, ready for you to review.' },
    { ok: false, title: 'We can never move your money', body: 'Reading only. No transfers, no debits, ever.' },
    { ok: false, title: 'We never see your password', body: 'You sign in on your bank’s own page, not ours.' }
  ];

  return (
    <Screen bottomInset={40}>
      <ScreenHeader title="Connect a bank" subtitle={spacesEnabled ? activeSpace?.name ?? 'Personal' : undefined} onBack={() => goBackOrHome(nav)} />

      <HeroCard style={{ marginTop: 12 }}>
        <Text style={[type.eyebrow, { color: theme.colors.inkText, opacity: 0.72 }]}>Read-only access</Text>
        <Text style={[type.h2, { color: theme.colors.inkText, marginTop: 8 }]}>
          {isBusiness ? 'Your sales and costs, logged for you' : 'Your spending, logged before you open the app'}
        </Text>
        <Text style={[type.small, { color: theme.colors.inkText, opacity: 0.78, marginTop: 8 }]}>
          We use Mono, a licensed open-banking provider, to read your account history.
        </Text>
      </HeroCard>

      <Card style={{ marginTop: 12, gap: 14 }}>
        {facts.map((f) => (
          <View key={f.title} style={styles.fact}>
            <View style={[styles.mark, { backgroundColor: f.ok ? theme.colors.successSoft : theme.colors.errorSoft }]}>
              {f.ok ? <Check color={theme.colors.success} size={13} strokeWidth={3.4} /> : <X color={theme.colors.error} size={13} strokeWidth={3.4} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{f.title}</Text>
              <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>{f.body}</Text>
            </View>
          </View>
        ))}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={[type.smallStrong, { color: theme.colors.textMuted }]}>Works with</Text>
        <View style={styles.banks}>
          {POPULAR.map((b) => (
            <View key={b} style={[styles.bankPill, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
              <BankLogo name={b} size={22} />
              <Text style={[type.caption, { color: theme.colors.text }]}>{b}</Text>
            </View>
          ))}
          <View style={[styles.bankPill, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
            <Text style={[type.caption, { color: theme.colors.textMuted }]}>and 20 more</Text>
          </View>
        </View>
      </Card>

      <Text style={[type.caption, { color: theme.colors.textMuted, textAlign: 'center', marginTop: 16 }]}>
        By continuing you allow read-only access to your transaction history. You can disconnect at any time in Settings.
      </Text>

      <PrimaryButton title="Choose your bank" onPress={() => nav.navigate('MonoConnect', { start: true })} style={{ marginTop: 12 }} />
      <SecondaryButton title="Not now" onPress={() => goBackOrHome(nav)} style={{ marginTop: 10 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fact: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  mark: { width: 22, height: 22, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  banks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  bankPill: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 }
});
