import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, Image, Alert, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { Briefcase, Gift, HeartHandshake, Lock, Smartphone, UserRound } from 'lucide-react-native';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { Amount, Card, IconTile, ListCard, ListRow, PrimaryButton, Screen, ScreenHeader } from '../components/Common/ui';
import { PlanSplit } from '../components/Plan/PlanSplit';
import { BusinessProfile } from '../components/Profile/BusinessProfile';
import { getAnalyticsSummary } from '../api/endpoints';
import { getPlan, type ApiPlan } from '../api/personal';
import { currencySymbol } from '../utils/format';
import { fonts, type } from '../theme/typography';
import { GuideAnchor } from '../components/Common/GuideAnchor';
import { goBackOrHome } from '../navigation/goBack';

const PAIN_LABELS: Record<string, string> = {
  runs_out: 'Money lasting until payday',
  no_idea: 'Seeing where money goes',
  cant_save: 'Saving more',
  debt: 'Paying off debt',
  irregular: 'Planning with changing income'
};

/** The person behind the account: their details, plan, income and security. In the Business space it shows the business profile. */
export function ProfileScreen() {
  const nav = useNavigation<any>();
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const glyph = currencySymbol(user?.currency);
  const isBusiness = spacesEnabled && activeSpaceId === 'business';

  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [plan, setPlan] = useState<ApiPlan | null>(null);
  const [netWorth, setNetWorth] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (isBusiness) return;
      SecureStore.getItemAsync('bf_avatar_uri_v1').then((v) => v && setAvatarUri(v)).catch(() => undefined);
      getPlan().then(setPlan).catch(() => setPlan(null));
      const now = new Date();
      getAnalyticsSummary(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), now.toISOString().slice(0, 10), spacesEnabled ? { spaceId: activeSpaceId } : undefined)
        .then((s) => Number.isFinite(Number(s?.totalBalance)) && setNetWorth(Number(s.totalBalance)))
        .catch(() => undefined);
    }, [activeSpaceId, isBusiness, spacesEnabled])
  );

  const displayName = user?.name || user?.email || 'You';
  const initials = useMemo(() => {
    const parts = (user?.name ?? '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? user?.email?.[0] ?? 'U') + (parts[1]?.[0] ?? '')).toUpperCase();
  }, [user?.email, user?.name]);

  const tile = (Icon: typeof Lock) => (
    <IconTile bg={theme.colors.primarySoft} size={34}>
      <Icon color={theme.colors.primary} size={17} />
    </IconTile>
  );

  const sources = plan?.incomeSources ?? [];
  const pains = (user?.onboarding?.painPoints ?? []).map((p) => PAIN_LABELS[p]).filter(Boolean);
  const hasPlan = !!plan && plan.monthlyIncome > 0;

  const confirmLogout = () => {
    Alert.alert('Log out of BudgetFriendly?', 'You’ll need your password to sign back in on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void logout() }
    ]);
  };

  if (isBusiness) return <BusinessProfile onLogout={confirmLogout} />;

  return (
    <Screen bottomInset={48}>
      <ScreenHeader title="Profile" subtitle={spacesEnabled ? 'Personal space' : undefined} onBack={() => goBackOrHome(nav)} />

      <View style={styles.profile}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontFamily: fonts.display, fontSize: 19, color: theme.colors.primary }}>{initials}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[type.title, { color: theme.colors.text, fontSize: 18 }]}>
            {displayName}
          </Text>
          {user?.name ? (
            <Text numberOfLines={1} style={[type.small, { color: theme.colors.textMuted }]}>
              {user.email}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => nav.navigate('ProfileEdit')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.editPill, { backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={[type.smallStrong, { color: theme.colors.text }]}>Edit</Text>
        </Pressable>
      </View>

      <GuideAnchor id="profile.plan">
      <Card style={{ marginTop: 16 }}>
        <Text style={[type.eyebrow, { color: theme.colors.primary }]}>Your plan</Text>
        {hasPlan ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
              <Amount value={plan!.monthlyIncome} currency={glyph} size="lg" />
              <Text style={[type.small, { color: theme.colors.textMuted }]}>a month</Text>
            </View>
            <Text style={[type.caption, { color: theme.colors.textMuted, marginBottom: 6 }]}>
              {plan!.period.basis === 'payday' ? `${plan!.period.label} · ${plan!.period.daysToPayday} days to payday` : `Budgeting by calendar month · ${plan!.period.label}`}
            </Text>
            <PlanSplit split={plan!.split} percents={plan!.percents} glyph={glyph} />
            {plan!.status === 'short' && plan!.shortfall > 0 ? (
              <Text style={[type.small, { color: theme.colors.warn, marginTop: 8 }]}>
                Your bills are {glyph}
                {Math.round(plan!.shortfall).toLocaleString()} more than you earn. Income & bills shows what to pause first.
              </Text>
            ) : null}
            <PrimaryButton
              title={plan!.status === 'short' ? 'See how to close the gap' : 'Income & bills'}
              onPress={() => nav.navigate('IncomeBills')}
              style={{ marginTop: 10 }}
            />
          </>
        ) : (
          <>
            <Text style={[type.bodyStrong, { color: theme.colors.text, marginTop: 6 }]}>Make a plan that fits your pay</Text>
            <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 4 }]}>
              Tell us what you earn and what you must pay, and we’ll split it into Needs, Wants and Savings.
            </Text>
            <PrimaryButton title="Make my plan" onPress={() => nav.navigate('SetupPlan', { fromHome: true })} style={{ marginTop: 12 }} />
          </>
        )}
      </Card>
      </GuideAnchor>

      <Text style={[type.eyebrow, styles.groupLabel, { color: theme.colors.textMuted }]}>About you</Text>
      <ListCard>
        <ListRow
          icon={tile(Briefcase)}
          title="Income & payday"
          subtitle={sources.length ? `${sources.length} source${sources.length === 1 ? '' : 's'} · ${plan?.budgetPeriod === 'monthly' ? 'calendar months' : 'payday to payday'}` : 'Add what you earn'}
          onPress={() => nav.navigate('IncomeBills')}
          chevron
        />
        <ListRow
          icon={tile(HeartHandshake)}
          title="What you’re working on"
          subtitle={pains.length ? pains.join(', ') : 'Tell us, and your tips get more personal'}
          onPress={() => nav.navigate('SetupPlan', { fromHome: true })}
          chevron
        />
        <ListRow icon={tile(UserRound)} title="Personal details" subtitle="Name, photo and currency" onPress={() => nav.navigate('ProfileEdit')} chevron />
        <ListRow icon={tile(Gift)} title="Money Wrapped" subtitle="Your money story, the fun way 🎁" onPress={() => nav.navigate('Wrapped', { spaceId: 'personal' })} chevron />
      </ListCard>

      {netWorth != null ? (
        <Card style={{ marginTop: 16 }}>
          <Text style={[type.smallStrong, { color: theme.colors.textMuted }]}>Balance of everything you’ve tracked</Text>
          <Amount value={netWorth} currency={glyph} size="lg" style={{ marginTop: 4 }} />
          <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>All income minus all spending logged in BudgetFriendly.</Text>
        </Card>
      ) : null}

      <Text style={[type.eyebrow, styles.groupLabel, { color: theme.colors.textMuted }]}>Account security</Text>
      <ListCard>
        <ListRow icon={tile(Lock)} title="Password" subtitle="Change your password" onPress={() => nav.navigate('ChangePassword')} chevron />
        <ListRow icon={tile(Smartphone)} title="Your devices" subtitle="See and sign out phones on your account" onPress={() => nav.navigate('Devices')} chevron />
      </ListCard>

      <Pressable
        onPress={confirmLogout}
        accessibilityRole="button"
        style={({ pressed }) => [styles.logout, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.8 : 1 }]}
      >
        <Text style={[type.bodyStrong, { color: theme.colors.error }]}>Log out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  editPill: { height: 34, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  groupLabel: { marginTop: 24, marginBottom: 8, marginLeft: 4 },
  logout: { marginTop: 24, height: 52, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' }
});
