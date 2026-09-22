import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { lookUpCode, useCode, type CodeLook } from '../../api/join';
import { useTeam } from '../../contexts/TeamContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from './Toast';
import { PrimaryButton, TextField } from './ui';
import { Sheet } from '../Business/parts';
import { afterSheetCloses } from '../../lib/afterSheetCloses';
import { type } from '../../theme/typography';

/**
 * One box for any code: a shared budget, help with someone's money, or a business you work in. Nobody should
 * have to know which kind they were sent. We look it up as they type and say what it is before they join.
 */
export function JoinCodeSheet({ visible, onClose, onJoined }: { visible: boolean; onClose: () => void; onJoined?: () => void }) {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const toast = useToast();
  const { enter, refresh } = useTeam();
  const [code, setCode] = useState('');
  const [look, setLook] = useState<CodeLook | null>(null);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setCode('');
      setLook(null);
    }
  }, [visible]);

  // Look it up once it's long enough, so the person sees what they're joining before they join it.
  useEffect(() => {
    const clean = code.replace(/[^A-Z0-9]/g, '');
    if (clean.length < 6) {
      setLook(null);
      return;
    }
    let cancelled = false;
    setLooking(true);
    const t = setTimeout(() => {
      lookUpCode(clean)
        .then((r) => !cancelled && setLook(r))
        .catch(() => !cancelled && setLook(null))
        .finally(() => !cancelled && setLooking(false));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code]);

  const join = async () => {
    setBusy(true);
    try {
      const res = await useCode(code.replace(/[^A-Z0-9]/g, ''));
      onClose();
      afterSheetCloses(() => {
        if (res.kind === 'business' && res.ownerId) {
          void enter(res.ownerId);
          toast.show(`You’re in ${res.name} as ${res.roleLabel}. Everything you record goes to ${res.name}.`, 'success', 5000);
        } else if (res.kind === 'helper') {
          toast.show(`You can now help with ${res.name}. It’s in Profile, People who help.`, 'success', 5000);
        } else {
          toast.show(`You’ve joined ${res.name}. It’s in Budgets.`, 'success', 4000);
          if (res.budgetId) nav.navigate('BudgetDetail', { budgetId: res.budgetId });
        }
        void refresh();
        onJoined?.();
      });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'That code didn’t work', 'error');
    } finally {
      setBusy(false);
    }
  };

  const ready = !!look?.found;
  return (
    <Sheet visible={visible} onClose={onClose} title="Join with a code" subtitle="From the message or email someone sent you.">
      <TextField
        label="Code"
        value={code}
        onChangeText={(v) => setCode(v.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="e.g. K7M2QX9P"
        maxLength={16}
      />
      {ready ? (
        <View style={{ padding: 14, borderRadius: 14, backgroundColor: theme.colors.primarySoft, marginBottom: 16 }}>
          <Text style={[type.bodyStrong, { color: theme.colors.primary }]}>{look!.name}</Text>
          <Text style={[type.caption, { color: theme.colors.primary, marginTop: 2 }]}>{look!.detail}</Text>
        </View>
      ) : (
        <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: -6, marginBottom: 16 }]}>
          {looking
            ? 'Checking that code…'
            : look && !look.found
              ? look.hint ?? 'We don’t know that code. Check it, or ask for a new one.'
              : 'It could be a shared budget, help with someone’s money, or a business you work in. We’ll tell you which.'}
        </Text>
      )}
      <PrimaryButton title={ready ? `Join ${look!.name}` : 'Join'} onPress={join} loading={busy} disabled={!ready} />
    </Sheet>
  );
}
