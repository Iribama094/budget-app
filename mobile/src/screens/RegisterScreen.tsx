import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { IconButton, InlineError, PrimaryButton, Screen, TextField } from '../components/Common/ui';
import { fonts, type } from '../theme/typography';

// Must match zPassword on the API (backend/_lib/validate.ts).
const MIN_PASSWORD = 8;

export function RegisterScreen() {
  const auth = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const emailLooksValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail), [normalizedEmail]);
  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const canSubmit = !isSubmitting && emailLooksValid && password.length >= MIN_PASSWORD;

  const submit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await auth.register(normalizedEmail, password, name.trim() ? name.trim() : undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Check your connection and try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <Screen bottomInset={40}>
      <View style={{ paddingTop: 4, minHeight: 44, justifyContent: 'center' }}>
        {navigation.canGoBack() ? (
          <IconButton accessibilityLabel="Go back" onPress={() => navigation.goBack()}>
            <ChevronLeft color={theme.colors.text} size={20} />
          </IconButton>
        ) : null}
      </View>

      <Text style={[type.h1, { color: theme.colors.text, fontSize: 28, lineHeight: 34, marginTop: 20 }]}>Create your account</Text>
      <Text style={[type.body, { color: theme.colors.textMuted, marginTop: 6, marginBottom: 24 }]}>
        Takes under a minute. Budgets and goals come right after.
      </Text>

      {error ? <InlineError message={error} /> : null}

      <TextField
        label="First name"
        value={name}
        onChangeText={(t) => {
          setName(t);
          if (error) setError(null);
        }}
        autoCapitalize="words"
        autoComplete="name-given"
        textContentType="givenName"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
        placeholder="What should we call you?"
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
        placeholder="you@example.com"
        editable={!isSubmitting}
        inputRef={emailRef}
        error={email.length > 3 && !emailLooksValid && email.includes('.') ? 'Enter a valid email address' : null}
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
        returnKeyType="go"
        onSubmitEditing={() => canSubmit && void submit()}
        placeholder={`At least ${MIN_PASSWORD} characters`}
        editable={!isSubmitting}
        inputRef={passwordRef}
        error={passwordTooShort ? `${MIN_PASSWORD - password.length} more character${MIN_PASSWORD - password.length === 1 ? '' : 's'} to go` : null}
        hint={`Use at least ${MIN_PASSWORD} characters.`}
        right={
          <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
            {showPassword ? <EyeOff color={theme.colors.textMuted} size={20} /> : <Eye color={theme.colors.textMuted} size={20} />}
          </Pressable>
        }
      />

      <PrimaryButton title="Create account" onPress={submit} disabled={!canSubmit} loading={isSubmitting} style={{ marginTop: 8 }} />

      <Text style={[type.caption, { color: theme.colors.textMuted, textAlign: 'center', marginTop: 14 }]}>
        By continuing, you agree to our Terms and Privacy Policy.
      </Text>

      <Pressable onPress={() => navigation.navigate('Login')} style={({ pressed }) => [{ alignItems: 'center', paddingVertical: 16, opacity: pressed ? 0.7 : 1 }]}>
        <Text style={[type.body, { color: theme.colors.textMuted }]}>
          Already have an account? <Text style={{ fontFamily: fonts.semibold, color: theme.colors.primary }}>Sign in</Text>
        </Text>
      </Pressable>
    </Screen>
  );
}
