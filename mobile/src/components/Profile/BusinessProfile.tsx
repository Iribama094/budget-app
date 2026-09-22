import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Briefcase, Building2, FileText, Gift, Home, Landmark, Lock, Receipt, Smartphone, UserRound, Users, Wallet } from '../../icons';

import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { SPACE_LOOK } from '../../contexts/SpaceContext';
import { useAmountVisibility } from '../../contexts/AmountVisibilityContext';
import { Amount, Chip, IconTile, InlineError, ListCard, ListRow, Screen, ScreenHeader, formatAmount } from '../Common/ui';
import { getBusinessSummary, type BusinessSummary } from '../../api/business';
import { currencySymbol } from '../../utils/format';
import { type } from '../../theme/typography';
import { GuideAnchor } from '../Common/GuideAnchor';
import { useConfig } from '../../contexts/ConfigContext';
import { goBackOrHome } from '../../navigation/goBack';
import { errorMessage } from '../../lib/errorMessage';

const LOOK = SPACE_LOOK.business;

/** The profile in the Business space: who the business is, how it's doing this month, and the owner's account. */
export function BusinessProfile({ onLogout }: { onLogout: () => void }) {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const wrapped = useConfig().wrappedFor('business');
  const { showAmounts } = useAmountVisibility();
  const glyph = currencySymbol(user?.currency);
  const hide = !showAmounts;

  const [s, setS] = useState<BusinessSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setError(null);
      getBusinessSummary()
        .then(setS)
        .catch((e) => setError(errorMessage(e, 'Could not load your business')));
    }, [])
  );

  const settings = s?.settings;
  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] || null;
  const name = settings?.businessName || (firstName ? `${firstName}’s business` : 'Your business');
  const contact = [settings?.businessPhone, settings?.businessEmail].filter(Boolean).join(' · ');

  const bizTile = (Icon: typeof Lock) => (
    <IconTile bg={theme.colors.brassSoft} size={34}>
      <Icon color={theme.colors.brass} size={17} />
    </IconTile>
  );
  const ownerTile = (Icon: typeof Lock) => (
    <IconTile bg={theme.colors.primarySoft} size={34}>
      <Icon color={theme.colors.primary} size={17} />
    </IconTile>
  );
  const group = (label: string) => <Text style={[type.eyebrow, styles.groupLabel, { color: theme.colors.textMuted }]}>{label}</Text>;

  const stats = s
    ? [
        { label: 'Sales', value: s.current.revenue },
        { label: 'Costs', value: s.current.costs },
        { label: s.current.profit < 0 ? 'Loss' : 'Profit', value: Math.abs(s.current.profit) }
      ]
    : [];

  return (
    <Screen bottomInset={48}>
      <ScreenHeader title="Business profile" onBack={() => goBackOrHome(nav)} />

      <View style={styles.hero}>
        <LinearGradient colors={[LOOK.bg, LOOK.bg2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.heroTop}>
          <View style={[styles.logo, { backgroundColor: LOOK.soft }]}>
            <Briefcase color={LOOK.accent} size={22} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[type.title, { color: LOOK.onBg, fontSize: 18 }]}>
              {name}
            </Text>
            <Text numberOfLines={1} style={[type.small, { color: LOOK.onBg, opacity: 0.72 }]}>
              {contact || 'Add a phone and email for your invoices'}
            </Text>
          </View>
          <Pressable
            onPress={() => nav.navigate('BusinessDetails')}
            accessibilityRole="button"
            accessibilityLabel="Edit business details"
            style={({ pressed }) => [styles.editPill, { backgroundColor: LOOK.soft, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={[type.smallStrong, { color: LOOK.accent }]}>Edit</Text>
          </Pressable>
        </View>

        {s ? (
          <>
            <Text style={[type.eyebrow, { color: LOOK.onBg, opacity: 0.7, marginTop: 18 }]}>{s.current.label} so far</Text>
            <View style={styles.stats}>
              {stats.map((st) => (
                <View key={st.label} style={{ flex: 1 }}>
                  <Text style={[type.caption, { color: LOOK.onBg, opacity: 0.7 }]}>{st.label}</Text>
                  <Amount value={st.value} currency={glyph} size="sm" color={st.label === 'Loss' ? '#F07565' : LOOK.onBg} hidden={hide} />
                </View>
              ))}
            </View>
            <View style={styles.chips}>
              {s.margin != null ? <Chip tone="onInk" label={`${s.margin}% margin`} /> : null}
              {s.runwayMonths != null ? <Chip tone="onInk" label={`${Math.round(s.runwayMonths * 10) / 10} months of runway`} /> : null}
              {settings?.vatRegistered ? <Chip tone="onInk" label="VAT registered" /> : null}
              {s.staffCount ? <Chip tone="onInk" label={`${s.staffCount} staff`} /> : null}
            </View>
          </>
        ) : error ? null : (
          <ActivityIndicator color={LOOK.accent} style={{ marginTop: 18 }} />
        )}
      </View>

      {error ? (
        <View style={{ marginTop: 12 }}>
          <InlineError message={error} />
        </View>
      ) : null}

      {group('Your business')}
      <GuideAnchor id="profile.business">
      <ListCard>
        <ListRow
          icon={bizTile(Building2)}
          title="Business details"
          subtitle={settings ? `Invoices numbered ${settings.invoicePrefix}-0001 and up` : 'Name, contacts and invoice details'}
          onPress={() => nav.navigate('BusinessDetails')}
          chevron
        />
        <ListRow
          icon={bizTile(FileText)}
          title="Customers & invoices"
          subtitle={s ? `${s.receivables.openCount} open${s.receivables.overdueCount ? ` · ${s.receivables.overdueCount} overdue` : ''}` : 'Invoices you’ve sent'}
          onPress={() => nav.navigate('Invoices')}
          chevron
        />
        <ListRow
          icon={bizTile(Receipt)}
          title="Supplier bills"
          subtitle={s ? `${s.payables.openCount} to pay${s.payables.dueSoonCount ? ` · ${s.payables.dueSoonCount} due soon` : ''}` : 'What you owe suppliers'}
          onPress={() => nav.navigate('Bills')}
          chevron
        />
        <ListRow icon={bizTile(Users)} title="Staff & payroll" subtitle={s ? `${s.staffCount} on payroll` : 'Salaries and PAYE'} onPress={() => nav.navigate('Payroll')} chevron />
        <ListRow icon={bizTile(UserRound)} title="Your team" subtitle="People who record and manage with their own login" onPress={() => nav.navigate('Team')} chevron />
        <ListRow icon={bizTile(Home)} title="Properties" subtitle="Rent, tenants and when it’s due" onPress={() => nav.navigate('Properties')} chevron />
        <ListRow
          icon={bizTile(Landmark)}
          title="Tax & VAT"
          subtitle={s ? `Setting aside ${s.tax.setAsidePct}% of profit${s.tax.deadlines[0] ? ` · next: ${s.tax.deadlines[0].title}` : ''}` : 'VAT, PAYE and money to set aside'}
          onPress={() => nav.navigate('BusinessTax')}
          chevron
        />
        <ListRow
          icon={bizTile(Wallet)}
          title="Pay yourself"
          subtitle={s && !hide ? `Safe to pay yourself: ${formatAmount(s.payYourself.suggested, glyph)}` : 'Your safe owner pay this month'}
          onPress={() => nav.navigate('PayYourself')}
          chevron
        />
        {wrapped.available ? (
          <ListRow icon={bizTile(Gift)} title="Business Wrapped" subtitle="Your business year in one story 🎁" onPress={() => nav.navigate('Wrapped', { spaceId: 'business' })} chevron />
        ) : null}
      </ListCard>
      </GuideAnchor>

      {group('You, the owner')}
      <ListCard>
        <ListRow icon={ownerTile(UserRound)} title="Personal details" subtitle={[user?.name, user?.email].filter(Boolean).join(' · ') || 'Name, photo and currency'} onPress={() => nav.navigate('ProfileEdit')} chevron />
        <ListRow icon={ownerTile(Lock)} title="Password" subtitle="Change your password" onPress={() => nav.navigate('ChangePassword')} chevron />
        <ListRow icon={ownerTile(Smartphone)} title="Your devices" subtitle="See and sign out phones on your account" onPress={() => nav.navigate('Devices')} chevron />
      </ListCard>
      <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 8, marginHorizontal: 4 }]}>
        Your personal plan and goals live in the Personal space. Owner pay you record here shows there as income.
      </Text>

      <Pressable
        onPress={onLogout}
        accessibilityRole="button"
        style={({ pressed }) => [styles.logout, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.8 : 1 }]}
      >
        <Text style={[type.bodyStrong, { color: theme.colors.error }]}>Log out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: 12, borderRadius: 24, padding: 18, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  editPill: { height: 34, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: 10, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  groupLabel: { marginTop: 24, marginBottom: 8, marginLeft: 4 },
  logout: { marginTop: 24, height: 52, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' }
});
