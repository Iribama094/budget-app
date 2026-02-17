import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Card, H1, InlineError, P, PrimaryButton, Screen, TextField } from '../components/Common/ui';
import { LogoMark } from '../components/Common/LogoMark';
import { useNavigation } from '@react-navigation/native';

export function LoginScreen() {
  const auth = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  const title = useMemo(() => 'Sign in', []);
  const subtitle = useMemo(() => 'Continue to your account.', []);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const emailLooksValid = useMemo(() => {
    // intentionally simple; prevents obvious typos without being overly strict
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  }, [normalizedEmail]);

  const submit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await auth.login(normalizedEmail, password);
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
        <H1 style={{ textAlign: 'center' }}>{title}</H1>
        <P style={{ marginTop: 6, textAlign: 'center' }}>{subtitle}</P>
      </View>

      <Card>
        {error ? <InlineError message={error} /> : null}

        <TextField
          label="Email Address"
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
          autoComplete="password"
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={() => {
            if (!isSubmitting && normalizedEmail && password && emailLooksValid) void submit();
          }}
          placeholder="Enter your password"
          editable={!isSubmitting}
          inputRef={passwordRef}
        />

        <Pressable
          onPress={() => setShowPassword((v) => !v)}
          disabled={!password}
          style={({ pressed }) => [
            {
              alignSelf: 'flex-end',
              paddingVertical: 8,
              opacity: !password ? 0.5 : pressed ? 0.85 : 1
            }
          ]}
        >
          <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>{showPassword ? 'Hide password' : 'Show password'}</Text>
        </Pressable>

        <View style={{ marginTop: 6 }}>
          {isSubmitting ? (
            <View style={{ paddingVertical: 14, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <PrimaryButton title="Continue" onPress={submit} disabled={!normalizedEmail || !emailLooksValid || !password} />
          )}
        </View>

        <Pressable
          onPress={() => {
            setError(null);
            navigation.navigate('Register');
          }}
          style={({ pressed }) => [{ paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }]}
        >
          <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>
            Don't have an account? Create one
          </Text>
        </Pressable>

        {__DEV__ ? (
          <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 2, textAlign: 'center' }}>
            Dev tip: set EXPO_PUBLIC_API_BASE_URL to your backend URL.
          </Text>
        ) : null}
      </Card>
    </Screen>
  );
}
