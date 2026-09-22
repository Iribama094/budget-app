import React, { useState } from 'react';
import { Text } from 'react-native';
import { useTeam } from '../../contexts/TeamContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../Common/Toast';
import { PrimaryButton, TextField } from '../Common/ui';
import { Sheet } from './parts';
import { type } from '../../theme/typography';
import { afterSheetCloses } from '../../lib/afterSheetCloses';

/** Joining someone's business with the code they sent. Lands straight in that business. */
export function JoinBusinessSheet({ visible, onClose, onJoined }: { visible: boolean; onClose: () => void; onJoined?: () => void }) {
  const { theme } = useTheme();
  const toast = useToast();
  const { join, enter } = useTeam();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const m = await join(code.trim());
      setCode('');
      onClose();
      // Into the business once the sheet is gone: switching rebuilds every screen.
      afterSheetCloses(() => {
        void enter(m.ownerId);
        toast.show(`You’re in ${m.name} as ${m.roleLabel}. Everything you record goes to ${m.name}.`, 'success', 5000);
        onJoined?.();
      });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'That code didn’t work', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Join a business" subtitle="Enter the code the owner sent you.">
      <TextField label="Code" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" placeholder="e.g. K7M2QX9P" maxLength={12} />
      <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: -6, marginBottom: 14 }]}>
        You’ll only see what your role allows. Your own money stays private.
      </Text>
      <PrimaryButton title="Join" onPress={submit} loading={busy} disabled={code.trim().length < 6} />
    </Sheet>
  );
}
