import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { CalendarSync, Copy, Share2, Users } from '../icons';

import { acceptBudgetInvite, createBudgetInvite, listBudgetMembers, removeBudgetMember, type ApiBudgetMember } from '../api/features';
import { patchMe, type ApiBudget } from '../api/endpoints';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { Card, Chip, IconTile, InfoTip, InlineError, ListCard, ListRow, PrimaryButton, Screen, ScreenHeader, SecondaryButton, SectionHeader, TextButton, TextField } from '../components/Common/ui';
import { formatShortDate } from '../utils/format';
import { fonts, type } from '../theme/typography';
import { GuideAnchor } from '../components/Common/GuideAnchor';
import { goBackOrHome } from '../navigation/goBack';
import { settleJoinedBudget } from '../lib/joinedBudget';

const cleanCode = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const labelOf = (name: string) => name.replace(/^My Budget \((.*)\)$/, '$1');

function initials(m: { name: string | null; email: string }) {
  const parts = (m.name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? m.email[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * With a budgetId: see who shares it, invite someone, remove or leave.
 * Without: join someone else's budget with a code (also opened by a budgetfriendly://join/CODE link).
 */
export default function ShareBudgetScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const { user, refreshUser } = useAuth();
  const toast = useToast();

  const budgetId: string | null = route.params?.budgetId ? String(route.params.budgetId) : null;
  const budgetName: string = labelOf(String(route.params?.budgetName ?? 'this budget'));

  const [role, setRole] = useState<'owner' | 'member' | null>(null);
  const [purpose, setPurpose] = useState<string>('personal');
  const [members, setMembers] = useState<ApiBudgetMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState(cleanCode(String(route.params?.code ?? '')));
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    if (!budgetId) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await listBudgetMembers(budgetId)) as { role: 'owner' | 'member'; items: ApiBudgetMember[]; purpose?: string };
      setRole(res.role);
      setMembers(res.items);
      setPurpose(res.purpose ?? 'personal');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load who shares this budget.');
    } finally {
      setLoading(false);
    }
  }, [budgetId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const makeInvite = async () => {
    if (!budgetId) return;
    setCreating(true);
    setError(null);
    try {
      setInvite(await createBudgetInvite(budgetId));
      if (purpose === 'personal') setPurpose('household');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create an invite code.');
    } finally {
      setCreating(false);
    }
  };

  const shareInvite = async () => {
    if (!invite) return;
    await Share.share({
      message:
        `Join my BudgetFriendly budget "${budgetName}" so we can budget together.\n\n` +
        `Tap budgetfriendly://join/${invite.code}\n` +
        `or open BudgetFriendly › Budgets › Join a shared budget and enter ${invite.code}.\n\n` +
        `The code works once and expires on ${formatShortDate(invite.expiresAt)}.`
    });
  };

  const remove = (m: ApiBudgetMember) => {
    const leaving = m.userId === user?.id;
    Alert.alert(
      leaving ? `Leave ${budgetName}?` : `Remove ${m.name || m.email}?`,
      leaving ? 'You’ll stop seeing this budget. What you added stays in your own history, and everyone else is told you left.' : 'They’ll lose access to this budget. What they added stays.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: leaving ? 'Leave' : 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeBudgetMember(budgetId!, m.userId);
              if (leaving) {
                if (user?.homeBudget === 'shared') await patchMe({ homeBudget: 'own' }).catch(() => undefined);
                await refreshUser().catch(() => undefined);
                toast.show(`You left ${budgetName}`, 'success');
                nav.navigate('Main', { screen: 'Budget' });
              } else {
                toast.show('Member removed', 'success');
                await load();
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not update members.');
            }
          }
        }
      ]
    );
  };

  /** Lives in lib/joinedBudget so joining from the code box in Settings settles Home the same way. */
  const settleHome = (joined: ApiBudget) =>
    settleJoinedBudget(joined, { refreshUser, go: (budgetId) => nav.replace('BudgetDetail', { budgetId }) });

  const join = async () => {
    setJoining(true);
    setError(null);
    try {
      const budget = await acceptBudgetInvite(code);
      toast.show(`You joined ${labelOf(budget.name)}`, 'success');
      await settleHome(budget);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code didn’t work.');
    } finally {
      setJoining(false);
    }
  };

  const joinSection = (
    <>
      <GuideAnchor id="share.join">
        <SectionHeader title="Join a shared budget" />
      </GuideAnchor>
      <Card>
        <Text style={[type.small, { color: theme.colors.textMuted, marginBottom: 12 }]}>
          Got a code from a partner, family member or housemate? Enter it to budget together. Your own budget stays yours.
        </Text>
        <TextField
          label="Invite code"
          value={code}
          onChangeText={(t) => setCode(cleanCode(t))}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="e.g. K7PQ2M"
          // Spaced letters make a typed code easy to check, but they'd also stretch the "e.g." hint.
          style={code ? { fontFamily: fonts.display, letterSpacing: 4, fontSize: 20 } : undefined}
        />
        <PrimaryButton title="Join budget" onPress={join} disabled={code.length < 4} loading={joining} />
      </Card>
      <TextButton
        title="Start a shared budget instead"
        onPress={() => nav.navigate('Main', { screen: 'Budget', params: { startNew: true, purpose: 'household' } })}
        style={{ marginTop: 8 }}
      />
    </>
  );

  return (
    <Screen onRefresh={budgetId ? load : undefined} refreshing={loading} bottomInset={48}>
      <ScreenHeader title={budgetId ? 'Share budget' : 'Shared budgets'} onBack={() => goBackOrHome(nav)} />

      {budgetId ? (
        <Card style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <IconTile bg={theme.colors.primarySoft}>
              <Users color={theme.colors.primary} size={20} />
            </IconTile>
            <View style={{ flex: 1 }}>
              <Text style={[type.title, { color: theme.colors.text }]}>{budgetName}</Text>
              <Text style={[type.caption, { color: theme.colors.textMuted }]}>{purpose === 'event' ? 'A one-off budget you plan together' : 'Budget together with a partner, family or housemates'}</Text>
            </View>
          </View>
          <InfoTip
            style={{ marginTop: 12 }}
            text={`Everyone’s spending in this budget counts toward it, and everyone gets pace alerts plus a morning summary of what the others spent. Your other budgets, goals and transactions stay private. Only the owner can edit the budget or invite people.${
              purpose !== 'event' ? ' When next month’s budget starts, everyone here comes along automatically.' : ''
            }`}
          >
            Everyone’s spending counts here. Everything else stays private.
          </InfoTip>
        </Card>
      ) : null}

      {error ? (
        <View style={{ marginTop: 12 }}>
          <InlineError message={error} />
        </View>
      ) : null}

      {budgetId ? (
        <>
          <SectionHeader title="People" />
          {loading && !members.length ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <ListCard>
              {members.map((m) => {
                const isMe = m.userId === user?.id;
                const canRemove = m.role !== 'owner' && (role === 'owner' || isMe);
                return (
                  <ListRow
                    key={m.userId}
                    icon={
                      <View style={[styles.avatar, { backgroundColor: theme.colors.primarySoft }]}>
                        <Text style={{ fontFamily: fonts.display, color: theme.colors.primary, fontSize: 13 }}>{initials(m)}</Text>
                      </View>
                    }
                    title={isMe ? `${m.name || m.email} (you)` : m.name || m.email}
                    subtitle={m.role === 'owner' ? 'Owner' : `Joined ${formatShortDate(m.joinedAt)}`}
                    right={
                      canRemove ? (
                        <TextButton title={isMe ? 'Leave' : 'Remove'} color={theme.colors.error} onPress={() => remove(m)} />
                      ) : m.role === 'owner' ? (
                        <Chip tone="primary" label="Owner" />
                      ) : undefined
                    }
                  />
                );
              })}
            </ListCard>
          )}

          {role === 'owner' ? (
            <>
              <SectionHeader title="Invite someone" />
              {invite ? (
                <Card style={{ alignItems: 'center' }}>
                  <Text style={[type.caption, { color: theme.colors.textMuted }]}>Share this code</Text>
                  <Text selectable style={[styles.code, { color: theme.colors.text }]}>
                    {invite.code}
                  </Text>
                  <Text style={[type.caption, { color: theme.colors.textMuted }]}>Works once · expires {formatShortDate(invite.expiresAt)}</Text>
                  <View style={styles.row}>
                    <SecondaryButton
                      title="Copy"
                      onPress={async () => {
                        await Clipboard.setStringAsync(invite.code);
                        toast.show('Code copied', 'success');
                      }}
                      iconLeft={<Copy color={theme.colors.text} size={17} />}
                      style={{ flex: 1 }}
                    />
                    <PrimaryButton title="Share" onPress={() => void shareInvite()} iconLeft={<Share2 color={theme.colors.onPrimary} size={17} />} style={{ flex: 1 }} />
                  </View>
                </Card>
              ) : (
                <Card>
                  <Text style={[type.small, { color: theme.colors.textMuted, marginBottom: 12 }]}>
                    Create a one-time code and send it by WhatsApp or SMS. They tap the link or enter the code in BudgetFriendly to join.
                  </Text>
                  <PrimaryButton title="Create invite code" onPress={makeInvite} loading={creating} />
                </Card>
              )}
            </>
          ) : null}
        </>
      ) : (
        joinSection
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  code: { fontFamily: fonts.display, fontSize: 40, letterSpacing: 8, marginVertical: 8 },
  row: { flexDirection: 'row', gap: 10, marginTop: 16, alignSelf: 'stretch' },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, marginTop: 12 }
});
