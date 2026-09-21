import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, Image, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Check, ChevronLeft, Eye, EyeOff, Fingerprint, ScanFace } from '../icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { IconButton, InlineError, PrimaryButton, Screen, SecondaryButton, TextButton, TextField } from '../components/Common/ui';
import { fonts, type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';

export function LoginScreen() {
  const auth = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const locked = auth.isLocked;
  const bio = auth.biometric;
  const canUseBiometrics = locked && bio.enabled;

  const [email, setEmail] = useState(auth.lastUser?.email ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const autoPrompted = useRef(false);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const emailLooksValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail), [normalizedEmail]);
  const firstName = (auth.lastUser?.name ?? '').trim().split(/\s+/)[0];
  const BioIcon = bio.kind === 'fingerprint' ? Fingerprint : ScanFace;

  const unlock = useCallback(async () => {
    setError(null);
    setUnlocking(true);
    try {
      const result = await auth.unlockWithBiometrics();
      if (result === 'failed') setError(`${bio.label} didn’t recognise you. Try again or use your password.`);
      if (result === 'expired') setError('Your saved session has expired. Sign in with your password.');
    } finally {
      setUnlocking(false);
    }
  }, [auth, bio.label]);

  // Prompt straight away when a locked session opens, like a banking app.
  useEffect(() => {
    if (!canUseBiometrics || autoPrompted.current) return;
    autoPrompted.current = true;
    const t = setTimeout(() => void unlock(), 450);
    return () => clearTimeout(t);
  }, [canUseBiometrics, unlock]);

  const submit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await auth.login(normalizedEmail, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Check your connection and try again.');
      setIsSubmitting(false);
    }
  };

  const canSubmit = emailLooksValid && password.length > 0 && !isSubmitting;

  return (
    <Screen bottomInset={40}>
      <View style={styles.top}>
        {navigation.canGoBack() ? (
          <IconButton accessibilityLabel="Go back" onPress={() => goBackOrHome(navigation)}>
            <ChevronLeft color={theme.colors.text} size={20} />
          </IconButton>
        ) : (
          <View style={styles.brand}>
            <Image source={require('../../assets/logo.png')} style={{ width: 32, height: 32 }} resizeMode="contain" />
            <Text style={[type.title, { color: theme.colors.text }]}>BudgetFriendly</Text>
          </View>
        )}
      </View>

      <Text style={[type.h1, { color: theme.colors.text, fontSize: 28, lineHeight: 34, marginTop: 24 }]}>
        {locked && firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
      </Text>
      <Text style={[type.body, { color: theme.colors.textMuted, marginTop: 6, marginBottom: 24 }]}>
        {canUseBiometrics ? `Unlock with ${bio.label}, or sign in with your password.` : 'Sign in to pick up where you left off.'}
      </Text>

      {error ? <InlineError message={error} /> : null}

      {canUseBiometrics ? (
        <>
          <PrimaryButton
            title={`Unlock with ${bio.label}`}
            onPress={unlock}
            loading={unlocking}
            iconLeft={<BioIcon color={theme.colors.onPrimary} size={20} />}
          />
          <View style={styles.or}>
            <View style={[styles.orLine, { backgroundColor: theme.colors.border }]} />
            <Text style={[type.caption, { color: theme.colors.textMuted }]}>or use your password</Text>
            <View style={[styles.orLine, { backgroundColor: theme.colors.border }]} />
          </View>
        </>
      ) : null}

      <TextField
        label="Email"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          if (error) setError(null);
        }}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        placeholder="you@example.com"
        editable={!isSubmitting}
        error={email.length > 3 && !emailLooksValid && !email.includes('@') ? 'Enter a valid email address' : null}
        right={
          emailLooksValid ? (
            <View style={[styles.ok, { backgroundColor: theme.colors.successSoft }]}>
              <Check color={theme.colors.success} size={13} strokeWidth={3} />
            </View>
          ) : null
        }
      />

      <TextField
        label="Password"
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          if (error) setError(null);
        }}
        secureTextEntry={!showPassword}
        autoComplete="password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => canSubmit && void submit()}
        placeholder="Your password"
        editable={!isSubmitting}
        inputRef={passwordRef}
        right={
          <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
            {showPassword ? <EyeOff color={theme.colors.textMuted} size={20} /> : <Eye color={theme.colors.textMuted} size={20} />}
          </Pressable>
        }
      />

      <Pressable
        onPress={() => navigation.navigate('ForgotPassword', { email: normalizedEmail })}
        hitSlop={10}
        style={({ pressed }) => [{ alignSelf: 'flex-end', marginTop: -4, marginBottom: 22, opacity: pressed ? 0.7 : 1 }]}
      >
        <Text style={[type.smallStrong, { color: theme.colors.primary }]}>Forgot password?</Text>
      </Pressable>

      {canUseBiometrics ? (
        <SecondaryButton title={isSubmitting ? 'Signing in…' : 'Sign in with password'} onPress={submit} disabled={!canSubmit} />
      ) : (
        <PrimaryButton title="Sign in" onPress={submit} disabled={!canSubmit} loading={isSubmitting} />
      )}

      {locked ? (
        <TextButton title="Not you? Sign out" color={theme.colors.textMuted} onPress={() => void auth.logout()} style={{ marginTop: 12 }} />
      ) : (
        <Pressable onPress={() => navigation.navigate('Register')} style={({ pressed }) => [{ alignItems: 'center', paddingVertical: 16, opacity: pressed ? 0.7 : 1 }]}>
          <Text style={[type.body, { color: theme.colors.textMuted }]}>
            New here? <Text style={{ fontFamily: fonts.semibold, color: theme.colors.primary }}>Create an account</Text>
          </Text>
        </Pressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { minHeight: 44, justifyContent: 'center', paddingTop: 4 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth },
  ok: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }
});
