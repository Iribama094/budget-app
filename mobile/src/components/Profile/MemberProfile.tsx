import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Lock, Smartphone, UserRound } from '../../icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useTeam } from '../../contexts/TeamContext';
import { ROLES, removeTeamMember } from '../../api/team';
import { ListRow, Screen, ScreenHeader } from '../Common/ui';
import { PlainHeader, PlainList } from '../Common/PlainList';
import { type } from '../../theme/typography';
import { goBackOrHome } from '../../navigation/goBack';
import { confirmDestructive } from '../../lib/confirm';

/** Profile for someone working in another person's business: which business, what their role allows, and them. */
export function MemberProfile({ onLogout }: { onLogout: () => void }) {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { active, choose, refresh } = useTeam();
  if (!active) return null;
  const line = ROLES.find((r) => r.key === active.role)?.line;

  const leave = () =>
    confirmDestructive({
      title: `Leave ${active.name}?`,
      body: 'You won’t see it any more. What you recorded stays there.',
      action: 'Leave',
      onConfirm: async () => {
        await removeTeamMember(active.id).catch(() => undefined);
        await choose(null);
        await refresh();
      }
    });

  return (
    <Screen bottomInset={48}>
      <ScreenHeader title={active.name} subtitle={`You work here as ${active.roleLabel}`} onBack={() => goBackOrHome(nav)} />
      <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 12 }]}>{line} Only the owner can delete anything.</Text>

      <PlainHeader title="You" />
      <PlainList>
        <ListRow title="Personal details" subtitle={[user?.name, user?.email].filter(Boolean).join(' · ')} onPress={() => nav.navigate('ProfileEdit')} chevron icon={<UserRound color={theme.colors.textMuted} size={18} />} />
        <ListRow title="Password" subtitle="Change your password" onPress={() => nav.navigate('ChangePassword')} chevron icon={<Lock color={theme.colors.textMuted} size={18} />} />
        <ListRow title="Your devices" subtitle="See and sign out phones on your account" onPress={() => nav.navigate('Devices')} chevron icon={<Smartphone color={theme.colors.textMuted} size={18} />} />
      </PlainList>

      <PlainList style={{ marginTop: 24 }}>
        <ListRow title={`Leave ${active.name}`} onPress={leave} titleStyle={{ color: theme.colors.error }} />
      </PlainList>

      <Pressable onPress={onLogout} accessibilityRole="button" style={({ pressed }) => [styles.logout, { borderColor: theme.colors.border, opacity: pressed ? 0.8 : 1 }]}>
        <Text style={[type.bodyStrong, { color: theme.colors.error }]}>Log out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logout: { marginTop: 24, height: 52, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' }
});
