import React, { useCallback, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';

import { claimReferral, getReferrals, type ApiReferrals } from '../api/referrals';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { InlineError, PrimaryButton, Screen, ScreenHeader, SecondaryButton, Skeleton, TextField } from '../components/Common/ui';
import { AddLine, PlainHeader, PlainList } from '../components/Common/PlainList';
import { Sheet } from '../components/Business/parts';
import { Copy, Share2 } from '../icons';
import { fonts, type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One code to share, and who has used it. No points or levels: friends who find it useful is the whole idea. */
export default function InviteFriendsScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const toast = useToast();
  const [data, setData] = useState<ApiReferrals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await getReferrals());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const share = () => {
    if (data) void Share.share({ message: data.message });
  };
  const copy = async () => {
    if (!data) return;
    await Clipboard.setStringAsync(data.code);
    toast.show('Code copied', 'success');
  };

  const claim = async () => {
    setBusy(true);
    try {
      const res = await claimReferral(code.trim());
      setEntering(false);
      setCode('');
      await load();
      toast.show(`Thanks. ${res.invitedBy} invited you.`, 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'That code didn’t work', 'error');
    } finally {
      setBusy(false);
    }
  };

  const pending = data ? data.joined - data.counted : 0;

  return (
    <Screen onRefresh={load} bottomInset={48}>
      <ScreenHeader title="Invite friends" subtitle="Know someone whose salary runs out early?" onBack={() => goBackOrHome(nav)} />
      {error ? <InlineError message={error} /> : null}

      <Text style={[type.body, { color: theme.colors.textMuted, marginTop: 8 }]}>
        Send them your code. They add it when they sign up, and we’ll let you know once they’ve started.
      </Text>

      {data ? (
        <>
          <Pressable onPress={copy} accessibilityRole="button" accessibilityLabel={`Your code is ${data.code}. Tap to copy.`} style={({ pressed }) => ({ marginTop: 28, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Text style={[type.eyebrow, { color: theme.colors.textMuted }]}>Your code</Text>
            <Text selectable style={{ fontFamily: fonts.display, fontSize: 34, letterSpacing: 3, color: theme.colors.text, marginTop: 6 }}>
              {data.code}
            </Text>
          </Pressable>
          <PrimaryButton title="Share" onPress={share} iconLeft={<Share2 color={theme.colors.onPrimary} size={18} />} style={{ marginTop: 24 }} />
          <SecondaryButton title="Copy code" onPress={copy} iconLeft={<Copy color={theme.colors.text} size={18} />} style={{ marginTop: 10 }} />

          <PlainHeader title="Friends" />
          <PlainList>
            <Text style={[type.body, { color: theme.colors.text, paddingVertical: 12 }]}>
              {data.joined === 0 && data.waitlist === 0
                ? 'Nobody yet. The first one is usually a sibling.'
                : [
                    data.counted ? `${plural(data.counted, 'friend is', 'friends are')} using BudgetFriendly` : null,
                    pending ? `${plural(pending, 'friend', 'friends')} signed up, not started yet` : null,
                    data.waitlist ? `${plural(data.waitlist, 'friend', 'friends')} on the waitlist` : null
                  ]
                    .filter(Boolean)
                    .join('\n')}
            </Text>
            {data.invitedBy ? <Text style={[type.small, { color: theme.colors.textMuted, paddingVertical: 12 }]}>{`${data.invitedBy} invited you.`}</Text> : null}
          </PlainList>
          {data.canEnterCode ? <AddLine label="A friend gave me a code" onPress={() => setEntering(true)} /> : null}
        </>
      ) : error ? null : (
        <View style={{ marginTop: 28 }}>
          <Skeleton rows={3} />
        </View>
      )}

      <Sheet visible={entering} onClose={() => setEntering(false)} title="Enter their code" subtitle="From the message your friend sent you.">
        <TextField label="Code" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" placeholder="e.g. ADAK7M2" maxLength={16} />
        <PrimaryButton title="Save" onPress={claim} loading={busy} disabled={code.trim().length < 4} />
      </Sheet>
    </Screen>
  );
}
