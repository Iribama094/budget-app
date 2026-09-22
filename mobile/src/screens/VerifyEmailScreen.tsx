import React, { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Mail } from '../icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { IconTile, InlineError, PrimaryButton, Screen, TextButton, TextField } from '../components/Common/ui';
import { confirmEmailCode, sendEmailCode } from '../api/endpoints';
import { type } from '../theme/typography';

const RESEND_SECONDS = 60;

/**
 * The step between creating an account and using it: typing the code we emailed.
 *
 * Anyone can sign up with any address, so until the code comes back the app sends that address nothing else.
 * Otherwise somebody could sign a stranger up and have us email them. Accounts from before this step existed
 * never see it.
 */
export function VerifyEmailScreen() {
  const { user, refreshUser, logout } = useAuth();
  const { theme } = useTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const send = async () => {
    setError(null);
    try {
      const res = await sendEmailCode();
      if (res.status === 'verified') {
        await refreshUser();
        return;
      }
      setNote(res.status === 'sent' ? `We sent a code to ${user?.email}.` : `A code is already on its way to ${user?.email}.`);
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code. Check your connection.');
    }
  };

  // The first code goes out as soon as the screen opens, so nobody has to ask for it.
  useEffect(() => {
    void send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await confirmEmailCode(code);
      await refreshUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
      setCode('');
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bottomInset={40}>
      <View style={{ alignItems: 'center', marginTop: 32, marginBottom: 24 }}>
        <IconTile bg={theme.colors.primarySoft} size={64}>
          <Mail color={theme.colors.primary} size={28} />
        </IconTile>
        <Text style={[type.h1, { color: theme.colors.text, marginTop: 18, textAlign: 'center' }]}>Check your email</Text>
        <Text style={[type.body, { color: theme.colors.textMuted, marginTop: 8, textAlign: 'center' }]}>
          {note ?? `We are sending a six-digit code to ${user?.email}.`} Type it here to finish setting up your account.
        </Text>
      </View>

      {error ? <InlineError message={error} /> : null}

      <TextField
        label="Six-digit code"
        value={code}
        onChangeText={(t) => {
          setCode(t.replace(/\D/g, '').slice(0, 6));
          if (error) setError(null);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        inputRef={inputRef}
        autoFocus
        returnKeyType="go"
        onSubmitEditing={() => code.length === 6 && void confirm()}
        hint="Not there? Check spam or promotions. Never share this code with anyone."
      />

      <PrimaryButton title="Confirm my email" onPress={confirm} disabled={code.length !== 6 || busy} loading={busy} />
      <TextButton title={cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'} onPress={() => cooldown <= 0 && void send()} style={{ marginTop: 6 }} />
      <TextButton title="Wrong email? Sign out and start again" onPress={() => void logout()} color={theme.colors.textMuted} />
    </Screen>
  );
}
