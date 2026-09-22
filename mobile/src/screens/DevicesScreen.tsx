import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Smartphone } from '../icons';

import { listSessions, revokeOtherSessions, revokeSession, type ApiSession } from '../api/features';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { Chip, IconTile, InlineError, ListCard, ListRow, Screen, ScreenHeader, SecondaryButton, Spinner, TextButton } from '../components/Common/ui';
import { formatShortDate } from '../utils/format';
import { type } from '../theme/typography';
import { GuideAnchor } from '../components/Common/GuideAnchor';
import { goBackOrHome } from '../navigation/goBack';
import { errorMessage } from '../lib/errorMessage';
import { confirmDestructive } from '../lib/confirm';
import { useScreenData } from '../hooks/useScreenData';

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} day${days === 1 ? '' : 's'} ago` : formatShortDate(iso);
}

export default function DevicesScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const { data, setData, error, setError, loading, reload: load } = useScreenData(listSessions, [], { fallback: 'Could not load your devices.' });
  const items = data ?? [];


  const others = items.filter((s) => !s.current);

  const signOut = (s: ApiSession) => {
    confirmDestructive({
      title: `Sign out ${s.deviceName || 'this device'}?`,
      body: 'It will need your password to get back in.',
      action: 'Sign out',
      onConfirm: async () => {
        try {
          await revokeSession(s.id);
          setData((list) => (list ?? []).filter((x) => x.id !== s.id));
          toast.show('Device signed out', 'success');
        } catch (e) {
          setError(errorMessage(e, 'Could not sign that device out.'));
        }
      }
    });
  };

  const signOutOthers = () => {
    confirmDestructive({
      title: 'Sign out everywhere else?',
      body: `${others.length} other device${others.length === 1 ? '' : 's'} will need your password to get back in.`,
      action: 'Sign out others',
      onConfirm: async () => {
        setBusy(true);
        try {
          const { revoked } = await revokeOtherSessions();
          toast.show(`${revoked} device${revoked === 1 ? '' : 's'} signed out`, 'success');
          await load();
        } catch (e) {
          setError(errorMessage(e, 'Could not sign other devices out.'));
        } finally {
          setBusy(false);
        }
      }
    });
  };

  return (
    <Screen onRefresh={load} refreshing={loading} bottomInset={48}>
      <ScreenHeader title="Your devices" onBack={() => goBackOrHome(nav)} />
      <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 6, marginBottom: 14 }]}>
        Phones signed in to your account. If you don’t recognise one, sign it out and change your password.
      </Text>

      {error ? <InlineError message={error} /> : null}
      {loading && !items.length ? <Spinner style={{ marginTop: 24 }} /> : null}

      {items.length ? (
        <GuideAnchor id="devices.list">
        <ListCard>
          {items.map((s) => (
            <ListRow
              key={s.id}
              icon={
                <IconTile bg={s.current ? theme.colors.primarySoft : theme.colors.surfaceAlt}>
                  <Smartphone color={s.current ? theme.colors.primary : theme.colors.text} size={19} />
                </IconTile>
              }
              title={s.deviceName || 'Unknown device'}
              subtitle={s.current ? `This phone · signed in ${formatShortDate(s.startedAt)}` : `Active ${timeAgo(s.lastUsedAt)} · signed in ${formatShortDate(s.startedAt)}`}
              right={s.current ? <Chip tone="primary" label="This phone" /> : <TextButton title="Sign out" color={theme.colors.error} onPress={() => signOut(s)} />}
            />
          ))}
        </ListCard>
        </GuideAnchor>
      ) : null}

      {others.length ? <SecondaryButton title="Sign out all other devices" onPress={signOutOthers} disabled={busy} style={{ marginTop: 16 }} /> : null}

      <View style={{ marginTop: 14 }}>
        <Text style={[type.caption, { color: theme.colors.textMuted }]}>
          A signed-out device loses access within 15 minutes. Resetting your password signs out every other device straight away.
        </Text>
      </View>
    </Screen>
  );
}
