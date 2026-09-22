import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Briefcase } from '../icons';

import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { Card, IconTile, InlineError, PrimaryButton, Screen, ScreenHeader, SectionHeader, TextField } from '../components/Common/ui';
import { getBusinessSettings, updateBusinessSettings } from '../api/business';
import { type } from '../theme/typography';
import { GuideAnchor } from '../components/Common/GuideAnchor';
import { goBackOrHome } from '../navigation/goBack';
import { errorMessage } from '../lib/errorMessage';

type Form = { businessName: string; businessPhone: string; businessEmail: string; businessAddress: string; invoicePrefix: string };

/** Who the business is: shown at the top of invoices, reports and the business profile. */
export default function BusinessDetailsScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const toast = useToast();

  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getBusinessSettings()
      .then((s) =>
        setForm({
          businessName: s.businessName ?? '',
          businessPhone: s.businessPhone ?? '',
          businessEmail: s.businessEmail ?? '',
          businessAddress: s.businessAddress ?? '',
          invoicePrefix: s.invoicePrefix
        })
      )
      .catch((e) => setError(errorMessage(e, 'Could not load your business details')));
  }, []);

  if (!form) {
    return (
      <Screen bottomInset={48}>
        <ScreenHeader title="Business details" onBack={() => goBackOrHome(nav)} />
        {error ? <InlineError message={error} /> : <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />}
      </Screen>
    );
  }

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const email = form.businessEmail.trim();
  const emailError = email && !/^\S+@\S+\.\S+$/.test(email) ? 'Enter a valid email' : null;
  const prefix = form.invoicePrefix.trim().toUpperCase() || 'INV';

  const save = async () => {
    if (emailError) return;
    setSaving(true);
    try {
      await updateBusinessSettings({
        businessName: form.businessName.trim() || null,
        businessPhone: form.businessPhone.trim() || null,
        businessEmail: email || null,
        businessAddress: form.businessAddress.trim() || null,
        invoicePrefix: prefix
      });
      toast.show('Business details saved ✅', 'success');
      goBackOrHome(nav);
    } catch (e) {
      toast.show(errorMessage(e, 'Could not save your details'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen bottomInset={48}>
      <ScreenHeader title="Business details" subtitle="Shows on your invoices and reports" onBack={() => goBackOrHome(nav)} />

      <SectionHeader title="Invoice preview" style={{ marginTop: 8 }} />
      <Card>
        <View style={styles.previewTop}>
          <IconTile bg={theme.colors.brassSoft} size={40}>
            <Briefcase color={theme.colors.brass} size={19} />
          </IconTile>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[type.bodyStrong, { color: theme.colors.text }]}>
              {form.businessName.trim() || 'Your business name'}
            </Text>
            {form.businessAddress.trim() ? (
              <Text numberOfLines={2} style={[type.caption, { color: theme.colors.textMuted }]}>
                {form.businessAddress.trim()}
              </Text>
            ) : null}
            {form.businessPhone.trim() || email ? (
              <Text numberOfLines={1} style={[type.caption, { color: theme.colors.textMuted }]}>
                {[form.businessPhone.trim(), email].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[type.caption, { color: theme.colors.textMuted }]}>Invoice</Text>
            <Text style={[type.smallStrong, { color: theme.colors.text }]}>{prefix}-0001</Text>
          </View>
        </View>
      </Card>

      <SectionHeader title="Details" />
      <GuideAnchor id="businessdetails.name">
        <TextField label="Business name" value={form.businessName} onChangeText={(v) => set({ businessName: v })} placeholder="e.g. Ada Foods" />
      </GuideAnchor>
      <TextField label="Phone" value={form.businessPhone} onChangeText={(v) => set({ businessPhone: v })} keyboardType="phone-pad" placeholder="0803 000 0000" hint="Customers can reply on WhatsApp to this number" />
      <TextField
        label="Email"
        value={form.businessEmail}
        onChangeText={(v) => set({ businessEmail: v })}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder="hello@adafoods.ng"
        error={emailError}
      />
      <TextField label="Address" value={form.businessAddress} onChangeText={(v) => set({ businessAddress: v })} placeholder="12 Allen Avenue, Ikeja" />
      <TextField
        label="Invoice number prefix"
        value={form.invoicePrefix}
        onChangeText={(v) => set({ invoicePrefix: v.replace(/[^A-Za-z0-9-]/g, '').slice(0, 8) })}
        autoCapitalize="characters"
        hint="Letters or numbers, up to 8. Only new invoices use a changed prefix."
      />

      <PrimaryButton title="Save details" onPress={save} loading={saving} disabled={!!emailError} style={{ marginTop: 6 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  previewTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }
});
