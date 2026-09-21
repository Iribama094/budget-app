import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Eye, EyeOff } from '../icons';
import { InlineError, PrimaryButton, Screen, ScreenHeader, TextField } from '../components/Common/ui';
import { useToast } from '../components/Common/Toast';
import { changePassword } from '../api/endpoints';
import { useTheme } from '../contexts/ThemeContext';
import { type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';

const MIN_PASSWORD = 8;

export default function ChangePasswordScreen() {
  const nav = useNavigation<any>();
  const toast = useToast();
  const { theme } = useTheme();
  const [currPass, setCurrPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isChanging, setIsChanging] = useState(false);

  const mismatch = confirmPass.length > 0 && newPass !== confirmPass;
  const canSubmit = !!currPass && newPass.length >= MIN_PASSWORD && newPass === confirmPass && !isChanging;

  const handleUpdate = async () => {
    setError(null);
    setIsChanging(true);
    try {
      await changePassword(currPass, newPass);
      toast.show('Password updated', 'success');
      goBackOrHome(nav);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update your password. Try again.');
    } finally {
      setIsChanging(false);
    }
  };

  const eye = (
    <Pressable onPress={() => setShow((v) => !v)} hitSlop={10} accessibilityLabel={show ? 'Hide passwords' : 'Show passwords'}>
      {show ? <EyeOff color={theme.colors.textMuted} size={20} /> : <Eye color={theme.colors.textMuted} size={20} />}
    </Pressable>
  );

  return (
    <Screen bottomInset={40}>
      <ScreenHeader title="Password" onBack={() => goBackOrHome(nav)} />
      <Text style={[type.body, { color: theme.colors.textMuted, marginTop: 12, marginBottom: 20 }]}>
        Enter your current password, then choose a new one with at least {MIN_PASSWORD} characters.
      </Text>

      {error ? <InlineError message={error} /> : null}

      <TextField label="Current password" value={currPass} onChangeText={setCurrPass} secureTextEntry={!show} autoComplete="password" textContentType="password" right={eye} />
      <TextField
        label="New password"
        value={newPass}
        onChangeText={setNewPass}
        secureTextEntry={!show}
        autoComplete="new-password"
        textContentType="newPassword"
        error={newPass.length > 0 && newPass.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters` : null}
      />
      <TextField
        label="Confirm new password"
        value={confirmPass}
        onChangeText={setConfirmPass}
        secureTextEntry={!show}
        autoComplete="new-password"
        textContentType="newPassword"
        error={mismatch ? 'Passwords don’t match' : null}
      />

      <PrimaryButton title="Update password" onPress={handleUpdate} disabled={!canSubmit} loading={isChanging} style={{ marginTop: 8 }} />
    </Screen>
  );
}
