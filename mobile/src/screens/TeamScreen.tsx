import React, { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import { addTeamMember, getTeam, removeTeamMember, ROLES, suggestRole, updateTeamMember, type TeamMember, type TeamRole } from '../api/team';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { InlineError, ListRow, PrimaryButton, Screen, ScreenHeader, SecondaryButton, TextField } from '../components/Common/ui';
import { AddLine, PlainHeader, PlainList } from '../components/Common/PlainList';
import { Sheet } from '../components/Business/parts';
import { type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';
import { errorMessage } from '../lib/errorMessage';
import { confirmDestructive } from '../lib/confirm';
import { useScreenData } from '../hooks/useScreenData';

/** One role per person, each explained in a line. No grid of switches. */
function RolePicker({ value, onChange }: { value: TeamRole; onChange: (r: TeamRole) => void }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 8, marginBottom: 16 }}>
      {ROLES.map((r) => {
        const on = r.key === value;
        return (
          <Pressable
            key={r.key}
            onPress={() => onChange(r.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[styles.role, { borderColor: on ? theme.colors.primary : theme.colors.border, backgroundColor: on ? theme.colors.primarySoft : 'transparent' }]}
          >
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{r.label}</Text>
            <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>{r.line}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The owner's team: who can work in the business and in what role. Adding someone gives a code to share on
 * WhatsApp; they join with their own account. Everything they record carries their name.
 */
export default function TeamScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<TeamRole>('sales');
  const [staffId, setStaffId] = useState<string | null>(null);
  const [open, setOpen] = useState<TeamMember | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, error, reload: load } = useScreenData(async () => (await getTeam()).members, [], { fallback: 'Could not load your team' });
  const members = data ?? [];

  // Opened from Payroll's "Give them app access": the person and a role guessed from their job title.
  useEffect(() => {
    const p = route.params as { name?: string; title?: string; staffId?: string } | undefined;
    if (!p?.name) return;
    setName(p.name);
    setRole(suggestRole(p.title));
    setStaffId(p.staffId ?? null);
    setAdding(true);
    nav.setParams({ name: undefined, title: undefined, staffId: undefined });
  }, [nav, route.params]);

  const share = (message: string) => void Share.share({ message });

  const add = async () => {
    setBusy(true);
    try {
      const res = await addTeamMember({ name: name.trim(), role, staffId });
      setAdding(false);
      setName('');
      setStaffId(null);
      await load();
      share(res.message);
    } catch (e) {
      toast.show(errorMessage(e, 'Could not add them'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (m: TeamMember, next: TeamRole) => {
    try {
      await updateTeamMember(m.id, { role: next });
      setOpen(null);
      await load();
      toast.show(`${m.name} is now ${ROLES.find((r) => r.key === next)?.label}.`, 'success');
    } catch (e) {
      toast.show(errorMessage(e, 'Could not change that'), 'error');
    }
  };

  const remove = (m: TeamMember) =>
    confirmDestructive({
      title: `Remove ${m.name}?`,
      body: 'They lose access straight away. What they recorded stays, with their name on it.',
      action: 'Remove',
      onConfirm: () =>
        void removeTeamMember(m.id)
          .then(() => {
            setOpen(null);
            return load();
          })
          .catch(() => toast.show('Could not remove them', 'error'))
    });

  const label = (r: TeamRole) => ROLES.find((x) => x.key === r)?.label ?? r;
  return (
    <Screen onRefresh={load} bottomInset={48}>
      <ScreenHeader title="Your team" subtitle="People who work in your business" onBack={() => goBackOrHome(nav)} />
      {error ? <InlineError message={error} /> : null}

      <PlainHeader title="Team" />
      <PlainList>
        {members.map((m) => (
          <ListRow
            key={m.id}
            title={m.name}
            subtitle={m.joined ? label(m.role) : m.expired ? `${label(m.role)} · code ran out, share a new one` : `${label(m.role)} · waiting to join · code ${m.code}`}
            onPress={() => setOpen(m)}
            chevron
          />
        ))}
      </PlainList>
      <AddLine label="Add someone" onPress={() => setAdding(true)} />

      <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 24 }]}>
        Each person uses their own login and only sees what their role allows. They never see your personal money, and only you can delete anything. You get one summary a day of what they recorded.
      </Text>

      <Sheet visible={adding} onClose={() => setAdding(false)} title="Add someone" subtitle="You’ll get a code to send them on WhatsApp.">
        <TextField label="Their name" value={name} onChangeText={setName} placeholder="e.g. Tunde" maxLength={80} />
        <RolePicker value={role} onChange={setRole} />
        <PrimaryButton title="Add and share the code" onPress={add} loading={busy} disabled={!name.trim()} />
      </Sheet>

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} subtitle={open ? (open.joined ? 'On your team' : 'Hasn’t joined yet') : undefined}>
        {open ? (
          <>
            <RolePicker value={open.role} onChange={(r) => void changeRole(open, r)} />
            {!open.joined && open.code && !open.expired ? (
              <SecondaryButton title="Share the code again" onPress={() => share(`Your code to join on BudgetFriendly: ${open.code}. Enter it on sign up ("Have an invite code?") or in Settings, "Join a business".`)} style={{ marginBottom: 10 }} />
            ) : null}
            <SecondaryButton title={open.joined ? 'Remove from the team' : 'Cancel the invite'} onPress={() => remove(open)} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  role: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 }
});
