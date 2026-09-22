import React, { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Check } from '../icons';

import { useTeam } from '../contexts/TeamContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { ListRow, Screen, ScreenHeader } from '../components/Common/ui';
import { PlainList } from '../components/Common/PlainList';
import { removeTeamMember } from '../api/team';
import { type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';
import { confirmDestructive } from '../lib/confirm';

/**
 * Which business "Business" means right now. Only reachable when there's more than one: your own and the ones
 * you're on the team of. The switch is said out loud so nobody records into the wrong one.
 */
export default function YourBusinessesScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const toast = useToast();
  const { team, active, choose, refresh } = useTeam();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const pick = async (ownerId: string | null, name: string) => {
    if ((active?.ownerId ?? null) === ownerId) return goBackOrHome(nav);
    await choose(ownerId);
    toast.show(`You’re now working in ${name}. Everything you record goes to ${name}.`, 'success', 5000);
    goBackOrHome(nav);
  };

  const leave = (id: string, name: string) =>
    confirmDestructive({
      title: `Leave ${name}?`,
      body: 'You won’t see it any more. What you recorded stays there.',
      action: 'Leave',
      onConfirm: async () => {
        await removeTeamMember(id).catch(() => undefined);
        if (active?.id === id) await choose(null);
        await refresh();
      }
    });

  const tick = <Check color={theme.colors.primary} size={18} strokeWidth={3} />;
  return (
    <Screen bottomInset={48}>
      <ScreenHeader title="Your businesses" subtitle="Pick the one you’re working in" onBack={() => goBackOrHome(nav)} />
      <PlainList style={{ marginTop: 16 }}>
        {team?.own.active ? (
          <ListRow title={team.own.name} subtitle="Your own business" right={active ? undefined : tick} onPress={() => void pick(null, team.own.name)} />
        ) : null}
        {(team?.businesses ?? []).map((b) => (
          <ListRow
            key={b.id}
            title={b.name}
            subtitle={`${b.roleLabel} · long press to leave`}
            right={active?.ownerId === b.ownerId ? tick : undefined}
            onPress={() => void pick(b.ownerId, b.name)}
            onLongPress={() => leave(b.id, b.name)}
          />
        ))}
      </PlainList>
      <View style={{ marginTop: 20 }}>
        <Text style={[type.caption, { color: theme.colors.textMuted }]}>
          The top of the app still says Business. The business’s name on Home and on the Save button tells you which one you’re in.
        </Text>
      </View>
    </Screen>
  );
}
