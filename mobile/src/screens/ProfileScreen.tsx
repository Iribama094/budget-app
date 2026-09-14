import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Switch, Image, Alert, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Bell, Calculator, ClipboardPaste, CreditCard, Download, Fingerprint, HelpCircle, Layers, Lock, Repeat, RotateCcw, ScanFace, Smartphone, Sparkles, SunMoon, Users } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';

import { useToast } from '../components/Common/Toast';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useHints } from '../contexts/HintsContext';
import { Amount, Card, IconTile, ListCard, ListRow, Screen, ScreenHeader, SegmentedControl } from '../components/Common/ui';
import { getAnalyticsSummary, listBankLinks } from '../api/endpoints';
import { currencySymbol } from '../utils/format';
import { useSpace } from '../contexts/SpaceContext';
import { useTour } from '../contexts/TourContext';
import { useNudges } from '../contexts/NudgesContext';
import { fonts, type } from '../theme/typography';

const ONBOARDING_KEY = 'bf_onboarding_done_v1';

const COUNTRY_NAMES: Record<string, string> = {
  NG: 'Nigeria',
  GH: 'Ghana',
  KE: 'Kenya',
  ZA: 'South Africa',
  US: 'United States',
  GB: 'United Kingdom'
};

export function ProfileScreen() {
  const nav = useNavigation<any>();
  const { user, logout, biometric, setBiometricEnabled } = useAuth();
  const { theme, preference, setMode } = useTheme();
  const { spacesEnabled, activeSpaceId, setSpacesEnabled } = useSpace();
  const toast = useToast();
  const { resetAll: resetLegacyHints } = useHints();
  const { startFirstRunTour, resetTour } = useTour();
  const { resetAll: resetNudges } = useNudges();

  const displayName = user?.name || user?.email || 'You';
  const initials = useMemo(() => {
    const parts = (user?.name ?? '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? user?.email?.[0] ?? 'U') + (parts[1]?.[0] ?? '')).toUpperCase();
  }, [user?.email, user?.name]);
  const glyph = currencySymbol(user?.currency);

  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [bankSummary, setBankSummary] = useState<{ banks: number; accounts: number; names: string[] } | null>(null);
  const [computedNetWorth, setComputedNetWorth] = useState<number | null>(null);
  const [bioBusy, setBioBusy] = useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const v = await SecureStore.getItemAsync('bf_avatar_uri_v1');
        if (v) setAvatarUri(v);
      } catch {
        // ignore
      }
    })();
  }, []);

  React.useEffect(() => {
    if (!user) return;
    // Backend also returns lifetime totalBalance with a small-range summary.
    (async () => {
      try {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const end = new Date().toISOString().slice(0, 10);
        const summary = await getAnalyticsSummary(start, end, spacesEnabled ? { spaceId: activeSpaceId } : undefined);
        const candidate = Number(summary?.totalBalance);
        if (Number.isFinite(candidate)) setComputedNetWorth(candidate);
      } catch {
        // keep fallback
      }
    })();
  }, [activeSpaceId, spacesEnabled, user]);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await listBankLinks(spacesEnabled ? { spaceId: activeSpaceId } : undefined);
        const banks = res.items?.length ?? 0;
        const accounts = (res.items || []).reduce((sum, l) => sum + (l.accounts?.length ?? 0), 0);
        const names = (res.items || []).map((l) => l.bankName).filter(Boolean);
        setBankSummary({ banks, accounts, names });
      } catch {
        // optional
      }
    })();
  }, [activeSpaceId, spacesEnabled]);

  const netWorth = useMemo(() => {
    if (typeof user?.netWorth === 'number') return user.netWorth;
    if (typeof computedNetWorth === 'number') return computedNetWorth;
    if (typeof user?.monthlyIncome === 'number') return user.monthlyIncome * 12;
    return 0;
  }, [computedNetWorth, user]);

  const taxSubtitle = user?.taxProfile?.optInTaxFeature
    ? `On · ${COUNTRY_NAMES[user?.taxProfile?.country ?? 'NG'] ?? user?.taxProfile?.country}`
    : 'Off · set up to estimate take-home pay';

  const hasBanks = (bankSummary?.banks ?? 0) > 0;
  const BioIcon = biometric.kind === 'fingerprint' ? Fingerprint : ScanFace;

  const tile = (Icon: typeof Bell) => (
    <IconTile bg={theme.colors.primarySoft} size={34}>
      <Icon color={theme.colors.primary} size={17} />
    </IconTile>
  );

  const switchColors = { trackColor: { true: theme.colors.primary, false: theme.colors.border }, thumbColor: '#FFFFFF', ios_backgroundColor: theme.colors.border };

  const toggleBiometric = async (next: boolean) => {
    setBioBusy(true);
    try {
      const ok = await setBiometricEnabled(next);
      if (ok) toast.show(next ? `${biometric.label} sign-in is on` : `${biometric.label} sign-in is off`, 'success');
    } finally {
      setBioBusy(false);
    }
  };

  const openTipsMenu = () => {
    Alert.alert('Tips and intro', 'Bring back the guided help you’ve already dismissed.', [
      {
        text: 'Reset tips',
        onPress: () => {
          resetTour();
          resetNudges();
          toast.show('Tips reset. You’ll see them again as you use the app.', 'success');
        }
      },
      {
        text: 'Replay intro',
        onPress: async () => {
          try {
            await SecureStore.deleteItemAsync(ONBOARDING_KEY);
          } catch {
            // ignore
          }
          resetLegacyHints();
          resetNudges();
          resetTour();
          toast.show('Signing out so the intro can play from the start.', 'info');
          void logout();
        }
      },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const confirmLogout = () => {
    Alert.alert('Log out of BudgetFriendly?', 'You’ll need your password to sign back in on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void logout() }
    ]);
  };

  return (
    <Screen bottomInset={48}>
      <ScreenHeader title="Account" onBack={() => nav.goBack()} />

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

      <Card style={{ marginTop: 16 }}>
        <Text style={[type.smallStrong, { color: theme.colors.textMuted }]}>Net worth</Text>
        <Amount value={netWorth} currency={glyph} size="lg" style={{ marginTop: 4 }} />
        <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
          {hasBanks
            ? `${bankSummary!.names.slice(0, 2).join(' and ')}${bankSummary!.names.length > 2 ? ` +${bankSummary!.names.length - 2}` : ''} · ${bankSummary!.accounts} account${bankSummary!.accounts === 1 ? '' : 's'}`
            : 'Based on what you’ve tracked. Link a bank for a fuller picture.'}
        </Text>
      </Card>

      <Text style={[type.eyebrow, styles.groupLabel, { color: theme.colors.textMuted }]}>Money</Text>
      <ListCard>
        <ListRow
          icon={tile(Layers)}
          title="Spaces"
          subtitle="Keep Personal and Business apart"
          right={<Switch value={spacesEnabled} onValueChange={setSpacesEnabled} {...switchColors} />}
        />
        <ListRow
          icon={tile(CreditCard)}
          title="Linked banks"
          subtitle={hasBanks ? bankSummary!.names.join(', ') : 'Connect a bank to import transactions'}
          onPress={() => nav.navigate(hasBanks ? 'BankConnections' : 'BankConnectTerms')}
          chevron
        />
        <ListRow icon={tile(Repeat)} title="Recurring & bills" subtitle="Rent, subscriptions and salary on autopilot" onPress={() => nav.navigate('Recurring')} chevron />
        <ListRow icon={tile(ClipboardPaste)} title="Paste a bank alert" subtitle="Turn a debit or credit SMS into a transaction" onPress={() => nav.navigate('BankAlertImport')} chevron />
        <ListRow icon={tile(Users)} title="Join a shared budget" subtitle="Use a code from a partner or housemate" onPress={() => nav.navigate('ShareBudget')} chevron />
        <ListRow icon={tile(Calculator)} title="Tax" subtitle={taxSubtitle} onPress={() => nav.navigate('TaxSettings')} chevron />
        <ListRow icon={tile(Download)} title="Export data" subtitle="Download your transactions" onPress={() => nav.navigate('ExportData')} chevron />
      </ListCard>

      <Text style={[type.eyebrow, styles.groupLabel, { color: theme.colors.textMuted }]}>Security</Text>
      <ListCard>
        <ListRow
          icon={tile(BioIcon)}
          title={biometric.available ? `${biometric.label} sign-in` : 'Biometric sign-in'}
          subtitle={
            biometric.available
              ? biometric.enabled
                ? 'Unlock without typing your password'
                : 'Off'
              : 'Set up a face or fingerprint on this phone first'
          }
          right={
            <Switch
              value={biometric.enabled}
              disabled={!biometric.available || bioBusy}
              onValueChange={(v) => void toggleBiometric(v)}
              {...switchColors}
            />
          }
        />
        <ListRow icon={tile(Smartphone)} title="Your devices" subtitle="See and sign out phones on your account" onPress={() => nav.navigate('Devices')} chevron />
        <ListRow icon={tile(Lock)} title="Password" subtitle="Change your password" onPress={() => nav.navigate('ChangePassword')} chevron />
      </ListCard>

      <Text style={[type.eyebrow, styles.groupLabel, { color: theme.colors.textMuted }]}>App</Text>
      <ListCard>
        <View style={{ paddingVertical: 11 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {tile(SunMoon)}
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Appearance</Text>
          </View>
          <SegmentedControl
            options={[
              { key: 'system', label: 'System' },
              { key: 'light', label: 'Light' },
              { key: 'dark', label: 'Dark' }
            ]}
            value={preference}
            onChange={(k) => setMode(k)}
            style={{ marginTop: 10 }}
          />
        </View>
        <ListRow icon={tile(Bell)} title="Notifications" subtitle="Alerts, reminders and what you receive" onPress={() => nav.navigate('Notifications')} chevron />
      </ListCard>

      <Text style={[type.eyebrow, styles.groupLabel, { color: theme.colors.textMuted }]}>Support</Text>
      <ListCard>
        <ListRow icon={tile(HelpCircle)} title="Help & support" subtitle="FAQs and contact" onPress={() => nav.navigate('HelpSupport')} chevron />
        <ListRow
          icon={tile(Sparkles)}
          title="Take the app tour"
          subtitle="A two-minute walk through the key screens"
          onPress={() => {
            toast.show('Starting the tour…', 'info');
            startFirstRunTour({ force: true });
            nav.navigate('Main', { screen: 'Dashboard' });
          }}
          chevron
        />
        <ListRow icon={tile(RotateCcw)} title="Tips and intro" subtitle="Reset tips or replay the intro" onPress={openTipsMenu} chevron />
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
