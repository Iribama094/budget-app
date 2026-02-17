import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';

import { Screen, Card, H1, P, PrimaryButton } from '../components/Common/ui';
import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';

export default function BankConnectTermsScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpace } = useSpace();

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={() => nav.goBack()}
          style={({ pressed }) => [
            {
              width: 44,
              height: 44,
              borderRadius: 18,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.92 : 1
            }
          ]}
        >
          <ArrowLeft color={theme.colors.text} size={20} />
        </Pressable>
        <View style={{ marginLeft: 12, flex: 1 }}>
          <H1 style={{ marginBottom: 0 }}>Connect bank</H1>
          {spacesEnabled ? (
            <Text style={{ marginTop: 4, color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>
              Viewing: {activeSpace?.name ?? 'Personal'}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ marginTop: 14 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Terms & consent</Text>
          <P style={{ marginTop: 8 }}>
            By connecting, you authorise read-only access to your transaction history via a secure partner.
          </P>
          <P style={{ marginTop: 8 }}>
            We do not request or store your bank password. You can disconnect a connection at any time.
          </P>
        </Card>
      </View>

      <View style={{ marginTop: 14 }}>
        <PrimaryButton title="Connect Bank" onPress={() => nav.navigate('BankConnectForm')} />
      </View>
    </Screen>
  );
}
