import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Chip, IconButton, InlineError, PrimaryButton, Screen, TextButton, TextField } from '../components/Common/ui';
import { fonts, type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

export default function ForgotPasswordScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const auth = useAuth();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState<string>(route.params?.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [codeFocused, setCodeFocused] = useState(false);
  const codeRef = useRef<TextInput>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const canReset = code.length === CODE_LENGTH && password.length >= 8 && !busy;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await auth.requestPasswordReset(normalizedEmail);
      setDevCode(res.devCode ?? null);
      setStep('code');
      setCooldown(RESEND_SECONDS);
      setTimeout(() => codeRef.current?.focus(), 350);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      // On success the auth stack unmounts and the app opens signed in.
      await auth.resetPassword(normalizedEmail, code, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset your password. Try again.');
      setBusy(false);
    }
  };

  const goBack = () => {
    if (step === 'code') {
      setStep('email');
      setCode('');
      setError(null);
      return;
    }
    goBackOrHome(nav);
  };

  return (
    <Screen bottomInset={40}>
      <View style={{ paddingTop: 4 }}>
        <IconButton accessibilityLabel="Go back" onPress={goBack}>
          <ChevronLeft color={theme.colors.text} size={20} />
        </IconButton>
      </View>

      {step === 'email' ? (
        <>
          <Text style={[type.h1, { color: theme.colors.text, marginTop: 24, fontSize: 28, lineHeight: 34 }]}>Reset your password</Text>
          <Text style={[type.body, { color: theme.colors.textMuted, marginTop: 8, marginBottom: 26 }]}>
            Enter the email you signed up with. We’ll send you a 6-digit code.
          </Text>
          {error ? <InlineError message={error} /> : null}
          <TextField
            label="Email"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (error) setError(null);
            }}
            autoCapitalize="none"
            autoFocus={!email}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={() => emailValid && !busy && void sendCode()}
            placeholder="you@example.com"
          />
          <PrimaryButton title="Send code" onPress={sendCode} disabled={!emailValid} loading={busy} style={{ marginTop: 8 }} />
        </>
      ) : (
        <>
          <Text style={[type.h1, { color: theme.colors.text, marginTop: 24, fontSize: 28, lineHeight: 34 }]}>Check your email</Text>
          <Text style={[type.body, { color: theme.colors.textMuted, marginTop: 8, marginBottom: 22 }]}>
            If an account exists for <Text style={{ fontFamily: fonts.semibold, color: theme.colors.text }}>{normalizedEmail}</Text>, we sent it a
            6-digit code. It expires in 15 minutes.
          </Text>
          {devCode ? <Chip tone="brass" label={`Test mode code: ${devCode}`} style={{ marginBottom: 14 }} /> : null}
          {error ? <InlineError message={error} /> : null}

          <Text style={[type.smallStrong, { color: theme.colors.text, marginBottom: 8 }]}>Code</Text>
          <Pressable onPress={() => codeRef.current?.focus()} style={styles.codeRow} accessibilityLabel={`Code, ${code.length} of 6 digits entered`}>
            {Array.from({ length: CODE_LENGTH }).map((_, i) => {
              const active = codeFocused && i === Math.min(code.length, CODE_LENGTH - 1);
              return (
                <View
                  key={i}
                  style={[
                    styles.codeBox,
                    { backgroundColor: theme.colors.surface, borderColor: active ? theme.colors.primary : theme.colors.border, borderWidth: active ? 1.5 : 1 }
                  ]}
                >
                  <Text style={[type.h2, { color: theme.colors.text }]}>{code[i] ?? ''}</Text>
                </View>
              );
            })}
          </Pressable>
          <TextInput
            ref={codeRef}
            value={code}
            onChangeText={(t) => {
              setCode(t.replace(/\D/g, '').slice(0, CODE_LENGTH));
              if (error) setError(null);
            }}
            onFocus={() => setCodeFocused(true)}
            onBlur={() => setCodeFocused(false)}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            style={styles.hiddenInput}
          />

          <View style={{ marginTop: 18 }}>
            <TextField
              label="New password"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (error) setError(null);
              }}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="At least 8 characters"
              hint="Use at least 8 characters."
              right={
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff color={theme.colors.textMuted} size={20} /> : <Eye color={theme.colors.textMuted} size={20} />}
                </Pressable>
              }
            />
          </View>

          <PrimaryButton title="Reset and sign in" onPress={submit} disabled={!canReset} loading={busy} style={{ marginTop: 6 }} />
          <TextButton
            title={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            color={cooldown > 0 ? theme.colors.textMuted : theme.colors.primary}
            onPress={() => cooldown <= 0 && !busy && void sendCode()}
            style={{ marginTop: 8 }}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  codeRow: { flexDirection: 'row', gap: 8 },
  codeBox: { flex: 1, height: 58, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 }
});
