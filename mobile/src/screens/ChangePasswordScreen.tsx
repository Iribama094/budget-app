import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { Screen, TextField, H1, P, SecondaryButton, PrimaryButton } from '../components/Common/ui';
import { useToast } from '../components/Common/Toast';
import { changePassword } from '../api/endpoints';
import { useTheme } from '../contexts/ThemeContext';

export default function ChangePasswordScreen() {
  const nav = useNavigation<any>();
  const toast = useToast();
  const { theme } = useTheme();
  const [currPass, setCurrPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [isChanging, setIsChanging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const handleUpdate = async () => {
    if (!currPass || !newPass) return toast.show('Please fill current and new password', 'error');
    if (newPass !== confirmPass) return toast.show('New password and confirmation do not match', 'error');
    setIsChanging(true);
    try {
      await changePassword(currPass, newPass);
      setCurrPass('');
      setNewPass('');
      setConfirmPass('');
      toast.show('Password updated', 'success');
      nav.goBack();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to change password';
      toast.show(msg, 'error');
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={() => nav.goBack()}
          style={({ pressed }) => [{
            width: 44,
            height: 44,
            borderRadius: 18,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.92 : 1
          }]}
        >
          <ArrowLeft color={theme.colors.text} size={20} />
        </Pressable>

        <View style={{ marginLeft: 12, flex: 1 }}>
          <H1 style={{ marginBottom: 0 }}>Change password</H1>
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        <P>For your security, you will need to enter your current password before setting a new one.</P>

        {!isEditing ? (
          <View style={{ marginTop: 16 }}>
            <PrimaryButton title="Edit password" onPress={() => setIsEditing(true)} />
          </View>
        ) : (
          <View style={{ marginTop: 12 }}>
            <TextField label="Current password" value={currPass} onChangeText={setCurrPass} secureTextEntry />
            <TextField label="New password" value={newPass} onChangeText={setNewPass} secureTextEntry />
            <TextField label="Confirm new password" value={confirmPass} onChangeText={setConfirmPass} secureTextEntry />

            <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              <SecondaryButton
                title="Cancel"
                onPress={() => {
                  setIsEditing(false);
                  setCurrPass('');
                  setNewPass('');
                  setConfirmPass('');
                }}
              />
              <PrimaryButton title={isChanging ? 'Updating…' : 'Update password'} onPress={handleUpdate} disabled={isChanging} />
            </View>
          </View>
        )}
      </View>
    </Screen>
  );
}
