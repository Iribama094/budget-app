import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Smartphone } from 'lucide-react-native';

import { listSessions, revokeOtherSessions, revokeSession, type ApiSession } from '../api/features';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { Chip, IconTile, InlineError, ListCard, ListRow, Screen, ScreenHeader, SecondaryButton, TextButton } from '../components/Common/ui';
import { formatShortDate } from '../utils/format';
import { type } from '../theme/typography';
import { GuideAnchor } from '../components/Common/GuideAnchor';

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
  const [items, setItems] = useState<ApiSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listSessions());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your devices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const others = items.filter((s) => !s.current);

  const signOut = (s: ApiSession) => {
    Alert.alert(`Sign out ${s.deviceName || 'this device'}?`, 'It will need your password to get back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeSession(s.id);
            setItems((list) => list.filter((x) => x.id !== s.id));
            toast.show('Device signed out', 'success');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not sign that device out.');
          }
        }
      }
    ]);
  };

  const signOutOthers = () => {
    Alert.alert('Sign out everywhere else?', `${others.length} other device${others.length === 1 ? '' : 's'} will need your password to get back in.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out others',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const { revoked } = await revokeOtherSessions();
            toast.show(`${revoked} device${revoked === 1 ? '' : 's'} signed out`, 'success');
            await load();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not sign other devices out.');
          } finally {
            setBusy(false);
          }
        }
      }
    ]);
  };

  return (
    <Screen onRefresh={load} refreshing={loading} bottomInset={48}>
      <ScreenHeader title="Your devices" onBack={() => nav.goBack()} />
      <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 6, marginBottom: 14 }]}>
        Phones signed in to your account. If you don’t recognise one, sign it out and change your password.
      </Text>

      {error ? <InlineError message={error} /> : null}
      {loading && !items.length ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 24 }} /> : null}

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
