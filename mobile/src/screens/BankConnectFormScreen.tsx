import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';

import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { useAuth } from '../contexts/AuthContext';
import { useSpace } from '../contexts/SpaceContext';
import { Screen, Card, H1, P, PrimaryButton, TextField } from '../components/Common/ui';
import { createBankLink } from '../api/endpoints';

export default function BankConnectFormScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const { spacesEnabled, activeSpaceId, activeSpace } = useSpace();

  const [connecting, setConnecting] = useState(false);
  const [fullName, setFullName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [bankName, setBankName] = useState('Demo Bank');
  const [accountNumber, setAccountNumber] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const handleConnectDemo = async () => {
    if (connecting) return;
    setNameError(null);

    if (!fullName.trim()) {
      setNameError('Please confirm your full name.');
      toast.show('Please confirm your full name before connecting.', 'error');
      return;
    }

    setConnecting(true);
    try {
      await createBankLink({
        provider: 'demo-provider',
        bankName,
        userName: fullName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        accountNumber: accountNumber.trim() || undefined,
        ...(spacesEnabled ? { spaceId: activeSpaceId } : {})
      });
      toast.show('Bank linked. Pending transactions created.', 'success');
      nav.goBack();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to link bank';
      toast.show(msg, 'error');
    } finally {
      setConnecting(false);
    }
  };

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
          <H1 style={{ marginBottom: 0 }}>Connection details</H1>
          {spacesEnabled ? (
            <Text style={{ marginTop: 4, color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>
              Viewing: {activeSpace?.name ?? 'Personal'}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ marginTop: 14 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Fill in your details</Text>
          <P style={{ marginTop: 6 }}>This demo simulates a bank connection and creates pending transactions.</P>

          <View style={{ marginTop: 12 }}>
            <TextField
              label="Bank name"
              value={bankName}
              onChangeText={setBankName}
              placeholder="e.g. Demo Bank"
              autoCapitalize="words"
            />
            <TextField
              label="Account number"
              value={accountNumber}
              onChangeText={setAccountNumber}
              placeholder="1234567890"
              keyboardType="number-pad"
            />
            <TextField
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Name on your bank account"
              autoCapitalize="words"
              error={nameError}
            />
            <TextField
              label="Email address"
              value={email}
              onChangeText={setEmail}
              placeholder="e.g. you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextField
              label="Phone number (optional)"
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone linked to your bank"
              keyboardType="phone-pad"
            />
          </View>
        </Card>
      </View>

      <View style={{ marginTop: 14 }}>
        <PrimaryButton title={connecting ? 'Connecting…' : 'Connect'} onPress={handleConnectDemo} disabled={connecting} />
      </View>
    </Screen>
  );
}
