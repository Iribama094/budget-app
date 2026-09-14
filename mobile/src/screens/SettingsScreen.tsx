import React, { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import {
  BellRing,
  Bell,
  Calculator,
  ClipboardPaste,
  CreditCard,
  Download,
  Fingerprint,
  HelpCircle,
  Layers,
  Repeat,
  RotateCcw,
  ScanFace,
  Sparkles,
  SunMoon,
  Tags,
  Users,
  Wand2
} from 'lucide-react-native';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { useTour } from '../contexts/TourContext';
import { useNudges } from '../contexts/NudgesContext';
import { useHints } from '../contexts/HintsContext';
import { useCategories } from '../contexts/CategoriesContext';
import { useToast } from '../components/Common/Toast';
import { IconTile, ListCard, ListRow, PrimaryButton, Screen, ScreenHeader, SegmentedControl } from '../components/Common/ui';
import { ChoiceChip } from '../components/Plan/ChoiceChip';
import { listBankLinks } from '../api/endpoints';
import { getDailyReminder, setDailyReminder, type DailyReminder } from '../lib/notifications';
import { type } from '../theme/typography';

const ONBOARDING_KEY = 'bf_onboarding_done_v1';

const REMINDER_TIMES = [
  { label: '8:00 am', hour: 8 },
  { label: '1:00 pm', hour: 13 },
  { label: '6:00 pm', hour: 18 },
  { label: '8:00 pm', hour: 20 },
  { label: '10:00 pm', hour: 22 }
];

function timeLabel(r: DailyReminder): string {
  if (!r) return 'Off';
  const h = r.hour % 12 || 12;
  return `${h}:${String(r.minute).padStart(2, '0')} ${r.hour < 12 ? 'am' : 'pm'}`;
}

/** App settings. Personal details live on the profile (the avatar on Home). */
export default function SettingsScreen() {
  const nav = useNavigation<any>();
  const { theme, preference, setMode } = useTheme();
  const { biometric, setBiometricEnabled, logout } = useAuth();
  const { spacesEnabled, activeSpaceId, setSpacesEnabled } = useSpace();
  const { startFirstRunTour, resetTour } = useTour();
  const { resetAll: resetNudges } = useNudges();
  const { resetAll: resetLegacyHints } = useHints();
  const { all: categories } = useCategories();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [banks, setBanks] = useState<string[]>([]);
  const [reminder, setReminder] = useState<DailyReminder>(null);
  const [reminderSheet, setReminderSheet] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getDailyReminder().then(setReminder).catch(() => undefined);
      listBankLinks(spacesEnabled ? { spaceId: activeSpaceId } : undefined)
        .then((res) => setBanks((res.items || []).map((l) => l.bankName).filter(Boolean)))
        .catch(() => undefined);
    }, [activeSpaceId, spacesEnabled])
  );

  const tile = (Icon: typeof Bell) => (
    <IconTile bg={theme.colors.primarySoft} size={34}>
      <Icon color={theme.colors.primary} size={17} />
    </IconTile>
  );
  const switchColors = { trackColor: { true: theme.colors.primary, false: theme.colors.border }, thumbColor: '#FFFFFF', ios_backgroundColor: theme.colors.border };
  const BioIcon = biometric.kind === 'fingerprint' ? Fingerprint : ScanFace;
  const customCount = categories.filter((c) => !c.isDefault).length;

  const chooseReminder = async (next: DailyReminder) => {
    const ok = await setDailyReminder(next).catch(() => false);
    if (!ok) {
      toast.show('Allow notifications for BudgetFriendly in your phone settings first.', 'error', 4000);
      return;
    }
    setReminder(next);
    setReminderSheet(false);
    toast.show(next ? `Daily reminder set for ${timeLabel(next)}` : 'Daily reminder turned off', 'success');
  };

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
          await SecureStore.deleteItemAsync(ONBOARDING_KEY).catch(() => undefined);
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

  return (
    <Screen>
      <ScreenHeader title="Settings" />

      <Text style={[type.eyebrow, styles.groupLabel, { color: theme.colors.textMuted }]}>Money</Text>
      <ListCard>
        <ListRow
          icon={tile(Tags)}
          title="Categories"
          subtitle={customCount ? `${customCount} of your own · add or rename` : 'Add your own, like generator fuel or ajo'}
          onPress={() => nav.navigate('Categories')}
          chevron
        />
        <ListRow icon={tile(Repeat)} title="Recurring & bills" subtitle="Rent, subscriptions and salary on autopilot" onPress={() => nav.navigate('Recurring')} chevron />
        <ListRow
          icon={tile(CreditCard)}
          title="Linked banks"
          subtitle={banks.length ? banks.join(', ') : 'Connect a bank to import transactions'}
          onPress={() => nav.navigate(banks.length ? 'BankConnections' : 'BankConnectTerms')}
          chevron
        />
        <ListRow icon={tile(ClipboardPaste)} title="Paste a bank alert" subtitle="Turn a debit or credit SMS into a transaction" onPress={() => nav.navigate('BankAlertImport')} chevron />
        <ListRow icon={tile(Users)} title="Join a shared budget" subtitle="Use a code from a partner or housemate" onPress={() => nav.navigate('ShareBudget')} chevron />
        <ListRow
          icon={tile(Layers)}
          title="Spaces"
          subtitle="Keep Personal and Business apart"
          right={<Switch value={spacesEnabled} onValueChange={setSpacesEnabled} {...switchColors} />}
        />
        <ListRow icon={tile(Calculator)} title="Tax" subtitle="Estimate your take-home pay" onPress={() => nav.navigate('TaxSettings')} chevron />
        <ListRow icon={tile(Download)} title="Export data" subtitle="Download your transactions" onPress={() => nav.navigate('ExportData')} chevron />
      </ListCard>

      <Text style={[type.eyebrow, styles.groupLabel, { color: theme.colors.textMuted }]}>Reminders</Text>
      <ListCard>
        <ListRow
          icon={tile(BellRing)}
          title="Daily reminder"
          subtitle="A nudge to log what you spent"
          right={<Text style={[type.smallStrong, { color: reminder ? theme.colors.primary : theme.colors.textMuted }]}>{timeLabel(reminder)}</Text>}
          onPress={() => setReminderSheet(true)}
          chevron
        />
        <ListRow icon={tile(Bell)} title="Notifications" subtitle="Alerts, bill reminders and insights" onPress={() => nav.navigate('Notifications')} chevron />
      </ListCard>

      <Text style={[type.eyebrow, styles.groupLabel, { color: theme.colors.textMuted }]}>Security</Text>
      <ListCard>
        <ListRow
          icon={tile(BioIcon)}
          title={biometric.available ? `${biometric.label} sign-in` : 'Biometric sign-in'}
          subtitle={biometric.available ? (biometric.enabled ? 'Unlock without typing your password' : 'Off') : 'Set up a face or fingerprint on this phone first'}
          right={<Switch value={biometric.enabled} disabled={!biometric.available || bioBusy} onValueChange={(v) => void toggleBiometric(v)} {...switchColors} />}
        />
      </ListCard>

      <Text style={[type.eyebrow, styles.groupLabel, { color: theme.colors.textMuted }]}>Appearance</Text>
      <ListCard>
        <View style={{ paddingVertical: 11 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {tile(SunMoon)}
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Theme</Text>
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
      </ListCard>

      <Text style={[type.eyebrow, styles.groupLabel, { color: theme.colors.textMuted }]}>Help</Text>
      <ListCard>
        <ListRow icon={tile(Sparkles)} title="Ask Flux" subtitle="Your AI money coach" onPress={() => nav.navigate('AssistantModal')} chevron />
        <ListRow icon={tile(HelpCircle)} title="Help & support" subtitle="FAQs and contact" onPress={() => nav.navigate('HelpSupport')} chevron />
        <ListRow
          icon={tile(Wand2)}
          title="Take the app tour"
          subtitle="A two-minute walk through the key screens"
          onPress={() => {
            startFirstRunTour({ force: true });
            nav.navigate('Main', { screen: 'Dashboard' });
          }}
          chevron
        />
        <ListRow icon={tile(RotateCcw)} title="Tips and intro" subtitle="Reset tips or replay the intro" onPress={openTipsMenu} chevron />
      </ListCard>

      <Modal transparent visible={reminderSheet} animationType="slide" onRequestClose={() => setReminderSheet(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={() => setReminderSheet(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
            <Text style={[type.title, { color: theme.colors.text }]}>Daily reminder</Text>
            <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 4 }]}>Pick a time you’re usually free for two minutes.</Text>
            <View style={styles.wrap}>
              {REMINDER_TIMES.map((t) => (
                <ChoiceChip key={t.hour} label={t.label} active={reminder?.hour === t.hour} onPress={() => void chooseReminder({ hour: t.hour, minute: 0 })} />
              ))}
            </View>
            <PrimaryButton title={reminder ? 'Turn off reminder' : 'Close'} onPress={() => (reminder ? void chooseReminder(null) : setReminderSheet(false))} style={{ marginTop: 18 }} />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  groupLabel: { marginTop: 24, marginBottom: 8, marginLeft: 4 },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }
});
