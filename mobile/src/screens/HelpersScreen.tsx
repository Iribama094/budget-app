import React, { useCallback, useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { getDelegates, inviteDelegate, removeDelegate, type ApiDelegates } from '../api/money';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { useActing } from '../contexts/ActingContext';
import { InlineError, ListRow, PrimaryButton, Screen, ScreenHeader, TextField } from '../components/Common/ui';
import { AddLine, PlainHeader, PlainList } from '../components/Common/PlainList';
import { ChoiceChip } from '../components/Plan/ChoiceChip';
import { Sheet } from '../components/Business/parts';
import { JoinCodeSheet } from '../components/Common/JoinCodeSheet';
import { type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';

const ROLE: Record<'view' | 'record', string> = { view: 'Can see', record: 'Can see and add spending' };

/**
 * People who help with your money (an accountant, a PA, a son or daughter), and people you help. Helpers use
 * their own login. They never see your password and can't change your settings.
 */
export default function HelpersScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const toast = useToast();
  const { start } = useActing();
  const [data, setData] = useState<ApiDelegates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'view' | 'record'>('view');
  const [joining, setJoining] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await getDelegates());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const invite = async () => {
    setBusy(true);
    try {
      const res = await inviteDelegate(email.trim(), role);
      setInviting(false);
      setEmail('');
      await load();
      if (!res.emailed) {
        void Share.share({ message: `I've invited you to help with my money in BudgetFriendly. In the app go to Profile, then "People who help", then "I have a code", and enter: ${res.code}` });
      } else {
        toast.show('Invite sent. They’ll get a code by email.', 'success');
      }
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not send the invite', 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = (id: string, title: string, body: string) =>
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void removeDelegate(id).then(load).catch(() => toast.show('Could not remove that', 'error'))
      }
    ]);

  return (
    <Screen onRefresh={load} bottomInset={48}>
      <ScreenHeader title="People who help" subtitle="Share your money with someone you trust" onBack={() => goBackOrHome(nav)} />
      {error ? <InlineError message={error} /> : null}

      <PlainHeader title="Helping you" />
      <PlainList>
        {(data?.helpers ?? []).map((h) => (
          <ListRow
            key={h.id}
            title={h.name ?? h.email}
            subtitle={h.accepted ? ROLE[h.role] : `Invited · code ${h.code}`}
            onPress={() => confirmRemove(h.id, `Remove ${h.name ?? h.email}?`, 'They lose access straight away.')}
          />
        ))}
      </PlainList>
      <AddLine label="Invite someone" onPress={() => setInviting(true)} />

      <PlainHeader title="You help" />
      <PlainList>
        {(data?.helping ?? []).map((h) => (
          <ListRow
            key={h.id}
            title={h.name}
            subtitle={`${ROLE[h.role]} · tap to open`}
            chevron
            onPress={() => {
              // The app reopens on Home in their money (see ActingBanner to come back).
              start({ ownerId: h.ownerId, name: h.name, role: h.role });
            }}
            onLongPress={() => confirmRemove(h.id, `Stop helping ${h.name}?`, 'You won’t see their money any more.')}
          />
        ))}
      </PlainList>
      <AddLine label="I have a code" onPress={() => setJoining(true)} />


      <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 24 }]}>
        Helpers use their own account. They can’t see your password, change your settings or add other helpers. Remove someone any time.
      </Text>

      <Sheet visible={inviting} onClose={() => setInviting(false)} title="Invite someone" subtitle="They’ll need a BudgetFriendly account with this email.">
        <TextField label="Their email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="name@example.com" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <ChoiceChip label="Can see" active={role === 'view'} onPress={() => setRole('view')} />
          <ChoiceChip label="Can see and add spending" active={role === 'record'} onPress={() => setRole('record')} />
        </View>
        <PrimaryButton title="Send invite" onPress={invite} loading={busy} disabled={!/.+@.+\..+/.test(email.trim())} />
      </Sheet>

      <JoinCodeSheet visible={joining} onClose={() => setJoining(false)} onJoined={load} />
    </Screen>
  );
}
