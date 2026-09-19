import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import {
  BellRing,
  Bell,
  Building2,
  Calculator,
  ChartColumn,
  ClipboardPaste,
  CreditCard,
  Download,
  Fingerprint,
  HelpCircle,
  House,
  Landmark,
  Layers,
  Repeat,
  RotateCcw,
  ScanFace,
  Sparkles,
  SunMoon,
  Tags,
  Upload,
  UserPlus,
  Users,
  Wallet,
  Wand2
} from 'lucide-react-native';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { useTour } from '../contexts/TourContext';
import { useGuides } from '../contexts/GuideContext';
import { useNudges } from '../contexts/NudgesContext';
import { useHints } from '../contexts/HintsContext';
import { useCategories } from '../contexts/CategoriesContext';
import { useToast } from '../components/Common/Toast';
import { IconTile, ListCard, ListRow, Screen, ScreenHeader, SegmentedControl } from '../components/Common/ui';
import { SelectSheet } from '../components/Common/SelectField';
import { listBankLinks, patchMe } from '../api/endpoints';
import { getBusinessSettings, type BusinessSettings } from '../api/business';
import { getDailyReminder, setDailyReminder, type DailyReminder } from '../lib/notifications';
import { type } from '../theme/typography';

const ONBOARDING_KEY = 'bf_onboarding_done_v1';

const REMINDER_OPTIONS = [
  { value: 8, label: '8:00 am' },
  { value: 13, label: '1:00 pm' },
  { value: 18, label: '6:00 pm' },
  { value: 20, label: '8:00 pm' },
  { value: 22, label: '10:00 pm' },
  { value: -1, label: 'Off' }
];

const HOME_OPTIONS: Array<{ value: 'own' | 'shared'; label: string; subtitle: string }> = [
  { value: 'own', label: 'My own budget', subtitle: 'Your plan on Home; shared budgets stay in Budgets' },
  { value: 'shared', label: 'The shared budget', subtitle: 'The budget you run with others on Home' }
];

function timeLabel(r: DailyReminder): string {
  if (!r) return 'Off';
  const h = r.hour % 12 || 12;
  return `${h}:${String(r.minute).padStart(2, '0')} ${r.hour < 12 ? 'am' : 'pm'}`;
}

/** App settings. In the Business space the money settings are about the business. Personal details live on the profile. */
export default function SettingsScreen() {
  const nav = useNavigation<any>();
  const { theme, preference, setMode } = useTheme();
  const { user, refreshUser, biometric, setBiometricEnabled, logout } = useAuth();
  const { spacesEnabled, activeSpaceId, setSpacesEnabled } = useSpace();
  const { startFirstRunTour, resetTour } = useTour();
  const { resetGuides } = useGuides();
  const { resetAll: resetNudges } = useNudges();
  const { resetAll: resetLegacyHints } = useHints();
  const { all: categories } = useCategories();
  const toast = useToast();
  const isBusiness = spacesEnabled && activeSpaceId === 'business';

  const [banks, setBanks] = useState<string[]>([]);
  const [reminder, setReminder] = useState<DailyReminder>(null);
  const [reminderSheet, setReminderSheet] = useState(false);
  const [homeSheet, setHomeSheet] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [biz, setBiz] = useState<BusinessSettings | null>(null);

  useFocusEffect(
    useCallback(() => {
      getDailyReminder().then(setReminder).catch(() => undefined);
      listBankLinks(spacesEnabled ? { spaceId: activeSpaceId } : undefined)
        .then((res) => setBanks((res.items || []).map((l) => l.bankName).filter(Boolean)))
        .catch(() => undefined);
      if (isBusiness) getBusinessSettings().then(setBiz).catch(() => undefined);
    }, [activeSpaceId, isBusiness, spacesEnabled])
  );

  const tile = (Icon: typeof Bell) => (
    <IconTile bg={isBusiness ? theme.colors.brassSoft : theme.colors.primarySoft} size={34}>
      <Icon color={isBusiness ? theme.colors.brass : theme.colors.primary} size={17} />
    </IconTile>
  );
  const switchColors = { trackColor: { true: theme.colors.primary, false: theme.colors.border }, thumbColor: '#FFFFFF', ios_backgroundColor: theme.colors.border };
  const BioIcon = biometric.kind === 'fingerprint' ? Fingerprint : ScanFace;
  const customCount = categories.filter((c) => !c.isDefault).length;
  const group = (label: string) => <Text style={[type.eyebrow, styles.groupLabel, { color: theme.colors.textMuted }]}>{label}</Text>;
  const homeBudget = user?.homeBudget ?? 'own';

  const chooseReminder = async (next: DailyReminder) => {
    setReminderSheet(false);
    const ok = await setDailyReminder(next).catch(() => false);
    if (!ok) {
      toast.show('Allow notifications for BudgetFriendly in your phone settings first.', 'error', 4000);
      return;
    }
    setReminder(next);
    toast.show(next ? `Daily reminder set for ${timeLabel(next)}` : 'Daily reminder turned off', 'success');
  };

  const chooseHome = async (next: 'own' | 'shared') => {
    setHomeSheet(false);
    if (next === homeBudget) return;
    try {
      await patchMe({ homeBudget: next });
      await refreshUser();
      toast.show(next === 'shared' ? 'Home now shows your shared budget 🏠' : 'Home now shows your own budget', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not change that', 'error');
    }
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
          void resetGuides();
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
          await resetGuides();
          toast.show('Signing out so the intro can play from the start.', 'info');
          void logout();
        }
      },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const bankRow = (
    <ListRow
      icon={tile(CreditCard)}
      title="Linked banks"
      subtitle={banks.length ? banks.join(', ') : isBusiness ? 'Connect your business account to import sales and costs' : 'Connect a bank to import transactions'}
      onPress={() => nav.navigate(banks.length ? 'BankConnections' : 'BankConnectTerms')}
      chevron
    />
  );

  const subtitle = !spacesEnabled ? undefined : isBusiness ? `Business space${biz?.businessName ? ` · ${biz.businessName}` : ''}` : 'Personal space';

  return (
    <Screen bottomInset={48}>
      <ScreenHeader title="Settings" subtitle={subtitle} onBack={() => nav.goBack()} />

      {isBusiness ? (
        <>
          {group('Your business')}
          <ListCard>
            <ListRow
              icon={tile(Building2)}
              title="Business details"
              subtitle={biz?.businessName ? `${biz.businessName} · invoices start ${biz.invoicePrefix}-0001` : 'Name, contacts and what shows on invoices'}
              onPress={() => nav.navigate('BusinessDetails')}
              chevron
            />
            <ListRow
              icon={tile(Landmark)}
              title="Tax & VAT"
              subtitle={biz ? `${biz.vatRegistered ? `VAT registered at ${biz.vatRate}%` : 'Not VAT registered'} · set aside ${biz.taxSetAsidePct}% of profit` : 'VAT, PAYE and money to set aside'}
              onPress={() => nav.navigate('BusinessTax')}
              chevron
            />
            <ListRow icon={tile(Users)} title="Staff & payroll" subtitle="Salaries, PAYE and pay history" onPress={() => nav.navigate('Payroll')} chevron />
            <ListRow
              icon={tile(Wallet)}
              title="Pay yourself"
              subtitle={biz ? `Keeps ${biz.runwayBufferMonths} month${biz.runwayBufferMonths === 1 ? '' : 's'} of costs before suggesting owner pay` : 'Your safe owner pay each month'}
              onPress={() => nav.navigate('PayYourself')}
              chevron
            />
          </ListCard>

          {group('Money in and out')}
          <ListCard>
            <ListRow
              icon={tile(Tags)}
              title="Categories"
              subtitle={customCount ? `${customCount} of your own · sales and cost categories` : 'Sales and cost categories, like stock or delivery'}
              onPress={() => nav.navigate('Categories')}
              chevron
            />
            <ListRow icon={tile(Repeat)} title="Recurring costs & sales" subtitle="Shop rent, subscriptions and regular income" onPress={() => nav.navigate('Recurring')} chevron />
            {bankRow}
            <ListRow icon={tile(Upload)} title="Upload a statement" subtitle="Paystack, Moniepoint or bank CSV" onPress={() => nav.navigate('StatementImport')} chevron />
            <ListRow icon={tile(ClipboardPaste)} title="Paste a bank alert" subtitle="Turn a credit alert into a sale, or a debit into a cost" onPress={() => nav.navigate('BankAlertImport')} chevron />
          </ListCard>

          {group('Reports')}
          <ListCard>
            <ListRow icon={tile(ChartColumn)} title="Reports" subtitle="Profit and loss and cash flow, shareable as PDF" onPress={() => nav.navigate('BusinessReports')} chevron />
            <ListRow icon={tile(Download)} title="Export data" subtitle="Download your business transactions" onPress={() => nav.navigate('ExportData')} chevron />
          </ListCard>
        </>
      ) : (
        <>
          {group('Money')}
          <ListCard>
            <ListRow
              icon={tile(Tags)}
              title="Categories"
              subtitle={customCount ? `${customCount} of your own · add or rename` : 'Add your own, like generator fuel or ajo'}
              onPress={() => nav.navigate('Categories')}
              chevron
            />
            <ListRow icon={tile(Repeat)} title="Recurring & bills" subtitle="Rent, subscriptions, tithe and salary on autopilot" onPress={() => nav.navigate('Recurring')} chevron />
            {bankRow}
            <ListRow icon={tile(ClipboardPaste)} title="Paste a bank alert" subtitle="Turn a debit or credit SMS into a transaction" onPress={() => nav.navigate('BankAlertImport')} chevron />
            <ListRow icon={tile(Calculator)} title="Tax" subtitle="Estimate your take-home pay and reliefs" onPress={() => nav.navigate('TaxSettings')} chevron />
            <ListRow icon={tile(Download)} title="Export data" subtitle="Download your transactions" onPress={() => nav.navigate('ExportData')} chevron />
          </ListCard>

          {group('Budgeting together')}
          <ListCard>
            <ListRow
              icon={tile(House)}
              title="Home shows"
              subtitle={HOME_OPTIONS.find((o) => o.value === homeBudget)?.label}
              onPress={() => setHomeSheet(true)}
              chevron
            />
            <ListRow
              icon={tile(UserPlus)}
              title="Start a shared budget"
              subtitle="For a partner, family or housemates"
              onPress={() => nav.navigate('Main', { screen: 'Budget', params: { startNew: true, purpose: 'household' } })}
              chevron
            />
            <ListRow icon={tile(Users)} title="Join a shared budget" subtitle="Use a code from someone you budget with" onPress={() => nav.navigate('ShareBudget')} chevron />
          </ListCard>
        </>
      )}

      {group('Spaces')}
      <ListCard>
        <ListRow
          icon={tile(Layers)}
          title="Personal and Business spaces"
          subtitle={isBusiness ? 'Switch back to Personal from the top of Home' : spacesEnabled ? 'On · switch spaces from the top of Home' : 'Keep business money apart from personal'}
          right={<Switch value={spacesEnabled} onValueChange={setSpacesEnabled} {...switchColors} />}
        />
      </ListCard>

      {group('Reminders')}
      <ListCard>
        <ListRow
          icon={tile(BellRing)}
          title="Daily reminder"
          subtitle={isBusiness ? 'A nudge to log sales and costs' : 'A nudge to log what you spent'}
          right={<Text style={[type.smallStrong, { color: reminder ? theme.colors.primary : theme.colors.textMuted }]}>{timeLabel(reminder)}</Text>}
          onPress={() => setReminderSheet(true)}
          chevron
        />
        <ListRow
          icon={tile(Bell)}
          title={isBusiness ? 'Business alerts' : 'Notifications'}
          subtitle={isBusiness ? 'Customers who owe you, bills, VAT and PAYE dates' : 'Alerts, bill reminders, shared budgets and insights'}
          onPress={() => nav.navigate('Notifications')}
          chevron
        />
      </ListCard>

      {group('Security')}
      <ListCard>
        <ListRow
          icon={tile(BioIcon)}
          title={biometric.available ? `${biometric.label} sign-in` : 'Biometric sign-in'}
          subtitle={biometric.available ? (biometric.enabled ? 'Unlock without typing your password' : 'Off') : 'Set up a face or fingerprint on this phone first'}
          right={<Switch value={biometric.enabled} disabled={!biometric.available || bioBusy} onValueChange={(v) => void toggleBiometric(v)} {...switchColors} />}
        />
      </ListCard>

      {group('Appearance')}
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

      {group('Help')}
      <ListCard>
        <ListRow
          icon={tile(Sparkles)}
          title="Ask Flux"
          subtitle={isBusiness ? 'Ask about profit, cash and costs' : 'Your AI money coach'}
          onPress={() => nav.navigate('AssistantModal')}
          chevron
        />
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

      <SelectSheet
        visible={reminderSheet}
        onClose={() => setReminderSheet(false)}
        title="Daily reminder"
        subtitle="Pick a time you’re usually free for two minutes."
        value={reminder ? reminder.hour : -1}
        options={REMINDER_OPTIONS}
        onSelect={(hour) => void chooseReminder(hour === -1 ? null : { hour, minute: 0 })}
      />

      <SelectSheet
        visible={homeSheet}
        onClose={() => setHomeSheet(false)}
        title="Home shows"
        subtitle="Both budgets are always in Budgets. This picks the one on Home."
        value={homeBudget}
        options={HOME_OPTIONS}
        onSelect={(v) => void chooseHome(v)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  groupLabel: { marginTop: 24, marginBottom: 8, marginLeft: 4 }
});
