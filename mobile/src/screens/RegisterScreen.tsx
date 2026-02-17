import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Card, H1, InlineError, P, PrimaryButton, Screen, TextField } from '../components/Common/ui';
import { LogoMark } from '../components/Common/LogoMark';
import { useNavigation } from '@react-navigation/native';

export function RegisterScreen() {
  const auth = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const emailLooksValid = useMemo(() => {
    if (!normalizedEmail) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  }, [normalizedEmail]);

  const passwordTooShort = useMemo(() => password.length > 0 && password.length < 6, [password]);
  const passwordsMismatch = useMemo(
    () => confirmPassword.length > 0 && password !== confirmPassword,
    [password, confirmPassword]
  );

  const canSubmit = useMemo(() => {
    if (isSubmitting) return false;
    if (!emailLooksValid) return false;
    if (password.length < 6) return false;
    if (!confirmPassword) return false;
    if (passwordsMismatch) return false;
    return true;
  }, [confirmPassword, emailLooksValid, isSubmitting, password.length, passwordsMismatch]);

  const submit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await auth.register(normalizedEmail, password, name.trim() ? name.trim() : undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginBottom: 18, marginTop: 18 }}>
        <View style={{ marginBottom: 12 }}>
          <LogoMark size={80} />
        </View>
        <H1 style={{ textAlign: 'center' }}>Create account</H1>
        <P style={{ marginTop: 6, textAlign: 'center' }}>Set up your account in under a minute.</P>
      </View>

      <Card>
        {error ? <InlineError message={error} /> : null}

        <TextField
          label="Name (optional)"
          value={name}
          onChangeText={(t) => {
            setName(t);
            if (error) setError(null);
          }}
          autoCapitalize="words"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          placeholder="Enter your name"
          editable={!isSubmitting}
        />

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
          placeholder="Enter your email"
          editable={!isSubmitting}
          inputRef={emailRef}
          error={email.length > 3 && !emailLooksValid ? 'Enter a valid email address' : null}
        />

        <TextField
          label="Password"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            if (error) setError(null);
          }}
          secureTextEntry={!showPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          placeholder="Create a password"
          editable={!isSubmitting}
          inputRef={passwordRef}
          error={passwordTooShort ? 'Use at least 6 characters' : null}
        />
        <Pressable
          onPress={() => setShowPassword((v) => !v)}
          disabled={!password}
          style={({ pressed }) => [{ alignSelf: 'flex-end', paddingVertical: 8, opacity: !password ? 0.5 : pressed ? 0.85 : 1 }]}
        >
          <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>{showPassword ? 'Hide password' : 'Show password'}</Text>
        </Pressable>

        <TextField
          label="Confirm Password"
          value={confirmPassword}
          onChangeText={(t) => {
            setConfirmPassword(t);
            if (error) setError(null);
          }}
          secureTextEntry={!showConfirmPassword}
          placeholder="Repeat your password"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={() => {
            if (!isSubmitting && canSubmit) void submit();
          }}
          editable={!isSubmitting}
          inputRef={confirmRef}
          error={passwordsMismatch ? 'Passwords do not match' : null}
        />
        <Pressable
          onPress={() => setShowConfirmPassword((v) => !v)}
          disabled={!confirmPassword}
          style={({ pressed }) => [{ alignSelf: 'flex-end', paddingVertical: 8, opacity: !confirmPassword ? 0.5 : pressed ? 0.85 : 1 }]}
        >
          <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>{showConfirmPassword ? 'Hide password' : 'Show password'}</Text>
        </Pressable>

        <Text style={{ color: theme.colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
          By continuing, you agree to our Terms and Privacy Policy.
        </Text>

        <View style={{ marginTop: 12 }}>
          {isSubmitting ? (
            <View style={{ paddingVertical: 14, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <PrimaryButton title="Create account" onPress={submit} disabled={!canSubmit} />
          )}
        </View>

        <Pressable
          onPress={() => {
            setError(null);
            navigation.navigate('Login');
          }}
          style={({ pressed }) => [
            {
              paddingVertical: 14,
              alignItems: 'center',
              opacity: pressed ? 0.92 : 1,
              transform: [{ scale: pressed ? 0.985 : 1 }]
            }
          ]}
        >
          <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Already have an account? Sign in</Text>
        </Pressable>
      </Card>
    </Screen>
  );
}
