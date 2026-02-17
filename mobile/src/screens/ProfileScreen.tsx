import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Switch, Image } from 'react-native';
import { useToast } from '../components/Common/Toast';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Bell, Tag, Moon, ChevronRight, LogOut, CreditCard, Download, HelpCircle, Sparkles, Calculator } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useHints } from '../contexts/HintsContext';
import { Card, Screen, H1, P, PrimaryButton } from '../components/Common/ui';
import { getAnalyticsSummary, listBankLinks } from '../api/endpoints';
import { tokens } from '../theme/tokens';
import { formatMoney } from '../utils/format';
import { useSpace } from '../contexts/SpaceContext';
import { useTour } from '../contexts/TourContext';
import { useNudges } from '../contexts/NudgesContext';
/** removed duplicate SecureStore import */

const ONBOARDING_KEY = 'bf_onboarding_done_v1';

export function ProfileScreen() {
  const nav = useNavigation<any>();
  const { user, logout, refreshUser } = useAuth();
  const { theme, setMode, isDarkMode } = useTheme();
  const { spacesEnabled, activeSpaceId, setSpacesEnabled } = useSpace();
  const toast = useToast();
  const { resetAll: resetLegacyHints } = useHints();
  const { startFirstRunTour, resetTour } = useTour();
  const { resetAll: resetNudges } = useNudges();

  const initials = (user?.name || user?.email || 'U').slice(0, 2).toUpperCase();
  const displayName = user?.name || user?.email || 'User';
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const PLACEHOLDER_AVATAR = 'https://via.placeholder.com/150/CCCCCC/FFFFFF?text=';

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

  const [bankSummary, setBankSummary] = useState<{ banks: number; accounts: number; names: string[] } | null>(null);
  const [computedNetWorth, setComputedNetWorth] = useState<number | null>(null);

  const taxSummary = useMemo(() => {
    const enabled = !!user?.taxProfile?.optInTaxFeature;
    const c = user?.taxProfile?.country ?? 'NG';
    if (!enabled) return { title: 'Tax settings', subtitle: 'Off • Set up to estimate taxes', enabled };
    return { title: 'Tax settings', subtitle: `Enabled • ${c}`, enabled };
  }, [user?.taxProfile?.country, user?.taxProfile?.optInTaxFeature]);

  const Row = ({
    icon,
    title,
    subtitle,
    onPress,
    right
  }: {
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    right?: React.ReactNode;
  }) => (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingVertical: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: pressed && onPress ? 0.9 : 1
        }
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: theme.colors.surfaceAlt,
            marginRight: 12,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {icon}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: theme.colors.text, fontWeight: '800' }}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={2} ellipsizeMode="tail" style={{ color: theme.colors.textMuted, marginTop: 2, fontSize: 12 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {right ?? (onPress ? <ChevronRight color={theme.colors.textMuted} size={18} /> : null)}
    </Pressable>
  );

  const netWorth = useMemo(() => {
    if (typeof user?.netWorth === 'number') return user.netWorth;
    if (typeof computedNetWorth === 'number') return computedNetWorth;
    if (typeof user?.monthlyIncome === 'number') return user.monthlyIncome * 12;
    return 0;
  }, [computedNetWorth, user]);

  React.useEffect(() => {
    if (!user) return;
    // Fetch a small-range analytics summary; backend also returns lifetime totalBalance.
    (async () => {
      try {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const end = new Date().toISOString().slice(0, 10);
        const summary = await getAnalyticsSummary(start, end, spacesEnabled ? { spaceId: activeSpaceId } : undefined);
        const candidate = Number(summary?.totalBalance);
        if (Number.isFinite(candidate)) setComputedNetWorth(candidate);
      } catch {
        // ignore; keep fallback
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
        // silently ignore; bank summary is optional UI sugar
      }
    })();
  }, [activeSpaceId, spacesEnabled]);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={() => nav.goBack()}
          style={({ pressed }) => [
            {
              width: 44,
              height: 44,
              borderRadius: 18,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.92 : 1
            }
          ]}
        >
          <ArrowLeft color={theme.colors.text} size={20} />
        </Pressable>
        <View style={{ marginLeft: 12, flex: 1 }}>
          <H1 style={{ marginBottom: 0 }}>My Account</H1>
        </View>
      </View>

      <View style={{ marginTop: 14 }}>
        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginBottom: 8 }}>Profile</Text>
        <Pressable onPress={() => nav.navigate('ProfileEdit')}>
          <Card style={{ padding: 18, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' }}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={{ width: 64, height: 64 }} />
              ) : (
                <Image source={{ uri: PLACEHOLDER_AVATAR }} style={{ width: 64, height: 64 }} />
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
                {displayName}
              </Text>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{ color: theme.colors.primary, marginTop: 4, textDecorationLine: 'underline' }}
              >
                {user?.email ?? ''}
              </Text>
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>Net Worth</Text>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginTop: 4 }}
                >
                  {formatMoney(netWorth, user?.currency ?? '₦')}
                </Text>
              </View>
            </View>
          </Card>
        </Pressable>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Preferences</Text>

          <Row
            icon={<Tag color={theme.colors.primary} size={18} />}
            title="Spaces"
            subtitle="Separate Personal and Business budgets"
            right={<Switch value={spacesEnabled} onValueChange={setSpacesEnabled} />}
          />

          <Row
            icon={<Moon color={theme.colors.primary} size={18} />}
            title="Dark mode"
            subtitle={isDarkMode ? 'On' : 'Off'}
            right={<Switch value={isDarkMode} onValueChange={(v) => setMode(v ? 'dark' : 'light')} />}
          />

          <Row
            icon={<Bell color={theme.colors.primary} size={18} />}
            title="Notifications"
            subtitle="View your notifications center"
            onPress={() => (nav as any).navigate('Notifications')}
          />
        </Card>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Security</Text>
          <Row
            icon={<Sparkles color={theme.colors.primary} size={18} />}
            title="Change password"
            subtitle="Update your password"
            onPress={() => (nav as any).navigate('ChangePassword')}
          />
        </Card>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Tax</Text>
          <Row
            icon={<Calculator color={theme.colors.primary} size={18} />}
            title={taxSummary.title}
            subtitle={taxSummary.subtitle}
            onPress={() => (nav as any).navigate('TaxSettings')}
          />
        </Card>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Data</Text>
          {bankSummary ? (
            <View style={{ marginTop: 4 }}>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                {Math.min(bankSummary.banks, 6)} connected bank{Math.min(bankSummary.banks, 6) === 1 ? '' : 's'} • {Math.min(bankSummary.accounts, 12)} account{Math.min(bankSummary.accounts, 12) === 1 ? '' : 's'}
              </Text>
            </View>
          ) : null}

          <Row
            icon={<CreditCard color={theme.colors.primary} size={18} />}
            title="Connect Bank"
            subtitle="Add a new bank connection"
            onPress={() => (nav as any).navigate('BankConnectTerms')}
          />

          <Row
            icon={<CreditCard color={theme.colors.primary} size={18} />}
            title="Manage connections"
            subtitle={bankSummary && bankSummary.banks > 0 ? 'View and disconnect connected banks' : 'No connections yet — connect a bank first'}
            onPress={() => (nav as any).navigate(bankSummary && bankSummary.banks > 0 ? 'BankConnections' : 'BankConnectTerms')}
          />

          <Row
            icon={<Download color={theme.colors.primary} size={18} />}
            title="Export data"
            subtitle="Download your transactions"
            onPress={() => (nav as any).navigate('ExportData')}
          />
        </Card>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Help</Text>
          <Row
            icon={<HelpCircle color={theme.colors.primary} size={18} />}
            title="Help & support"
            subtitle="FAQs and contact"
            onPress={() => (nav as any).navigate('HelpSupport')}
          />
        </Card>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Smart tips</Text>
          <Row
            icon={<Sparkles color={theme.colors.primary} size={18} />}
            title="Take a quick tour"
            subtitle="Learn the key parts of the app"
            onPress={() => {
              toast.show('Starting guided tour…', 'success');
              startFirstRunTour({ force: true });
              (nav as any).navigate('Main', { screen: 'Dashboard' });
            }}
          />
          <Row
            icon={<Sparkles color={theme.colors.primary} size={18} />}
            title="Reset smart tips"
            subtitle="Tour + tooltips"
            onPress={() => {
              resetTour();
              resetNudges();
              toast.show('Smart tips reset. You can run the tour again now.', 'success');
            }}
          />
          <Row
            icon={<Sparkles color={theme.colors.primary} size={18} />}
            title="Restart intro"
            subtitle="Splash + onboarding"
            onPress={async () => {
              try {
                await SecureStore.deleteItemAsync(ONBOARDING_KEY);
              } catch {
                // ignore
              }
              resetLegacyHints();
              resetNudges();
              resetTour();
              toast.show('Restarting intro flow… Close & reopen the app to see Splash and Onboarding again.', 'success');
              void logout();
            }}
          />
        </Card>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Account</Text>
          <Row
            icon={<LogOut color={theme.colors.error} size={18} />}
            title="Log out"
            subtitle="Sign out of this device"
            onPress={() => void logout()}
          />
        </Card>
      </View>
    </Screen>
  );
}
