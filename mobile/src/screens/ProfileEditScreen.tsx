import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Camera, Check, Images, Trash2 } from '../icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { Avatar } from '../components/Common/Avatar';
import {
  InlineError,
  ListCard,
  ListRow,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SectionHeader,
  TextField
} from '../components/Common/ui';
import { Sheet } from '../components/Business/parts';
import { patchMe } from '../api/endpoints';
import { deletePhoto, pickPhoto, uploadPhoto } from '../lib/avatar';
import { afterSheetCloses } from '../lib/afterSheetCloses';
import { formatNumberInput } from '../utils/format';
import { goBackOrHome } from '../navigation/goBack';
import { fonts, type } from '../theme/typography';

const CURRENCIES = [
  { label: 'Naira', value: '₦', hint: 'Nigeria' },
  { label: 'US Dollar', value: '$', hint: 'United States' },
  { label: 'Pound', value: '£', hint: 'United Kingdom' },
  { label: 'Euro', value: '€', hint: 'Europe' }
];

const REGIONS = [
  { label: 'Nigeria', value: 'en-NG', hint: 'Dates and numbers the Nigerian way' },
  { label: 'United Kingdom', value: 'en-GB', hint: 'Day before month' },
  { label: 'United States', value: 'en-US', hint: 'Month before day' }
];

const labelFor = (list: { label: string; value: string }[], value: string | null, fallback: string) =>
  list.find((x) => x.value === value)?.label ?? (value || fallback);

/**
 * Your profile: the photo, the name, and the few settings that are about the person rather than their money.
 *
 * There is no view mode and no edit mode. The fields are the fields, Save appears once something has changed,
 * and the photo saves on its own because picking one is already the decision.
 */
export default function ProfileEditScreen() {
  const nav = useNavigation<any>();
  const { user, refreshUser } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();

  const [name, setName] = useState(user?.name ?? '');
  const [currency, setCurrency] = useState(user?.currency ?? '₦');
  const [locale, setLocale] = useState(user?.locale ?? 'en-NG');
  const [monthly, setMonthly] = useState(user?.monthlyIncome != null ? formatNumberInput(String(user.monthlyIncome)) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [photoSheet, setPhotoSheet] = useState(false);
  const [currencySheet, setCurrencySheet] = useState(false);
  const [regionSheet, setRegionSheet] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState(false);

  // If the account is refreshed from somewhere else, take the new values as the starting point.
  useEffect(() => {
    setName(user?.name ?? '');
    setCurrency(user?.currency ?? '₦');
    setLocale(user?.locale ?? 'en-NG');
    setMonthly(user?.monthlyIncome != null ? formatNumberInput(String(user.monthlyIncome)) : '');
  }, [user?.name, user?.currency, user?.locale, user?.monthlyIncome]);

  const initials = useMemo(() => {
    const parts = (user?.name ?? '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? user?.email?.[0] ?? 'U') + (parts[1]?.[0] ?? '')).toUpperCase();
  }, [user?.name, user?.email]);

  const memberSince = useMemo(() => {
    if (!user?.createdAt) return null;
    const d = new Date(user.createdAt);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  }, [user?.createdAt]);

  const monthlyNumber = monthly ? Number(monthly.replace(/,/g, '')) : null;
  const changed =
    (name.trim() || null) !== (user?.name ?? null) ||
    currency !== (user?.currency ?? '₦') ||
    locale !== (user?.locale ?? 'en-NG') ||
    monthlyNumber !== (user?.monthlyIncome ?? null);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await patchMe({
        name: name.trim() || null,
        currency,
        locale,
        monthlyIncome: monthlyNumber ?? undefined
      });
      await refreshUser();
      toast.show('Saved', 'success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const changePhoto = async (from: 'library' | 'camera') => {
    setPhotoSheet(false);
    // The photos and the camera open as their own full screen, so the sheet goes first.
    afterSheetCloses(async () => {
      setBusyPhoto(true);
      setError(null);
      try {
        const asset = await pickPhoto(from);
        if (!asset || !user?.id) return;
        const url = await uploadPhoto(user.id, asset);
        await patchMe({ avatarUrl: url });
        await refreshUser();
        toast.show('Photo updated', 'success');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not change your photo.');
      } finally {
        setBusyPhoto(false);
      }
    });
  };

  const removePhoto = async () => {
    setPhotoSheet(false);
    setBusyPhoto(true);
    setError(null);
    try {
      if (user?.id) await deletePhoto(user.id);
      await patchMe({ avatarUrl: null });
      await refreshUser();
      toast.show('Photo removed', 'success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove your photo.');
    } finally {
      setBusyPhoto(false);
    }
  };

  return (
    <Screen bottomInset={40}>
      <ScreenHeader title="Your profile" onBack={() => goBackOrHome(nav)} />

      {error ? <InlineError message={error} /> : null}

      <View style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 22 }}>
        <Pressable
          onPress={() => setPhotoSheet(true)}
          disabled={busyPhoto}
          accessibilityRole="button"
          accessibilityLabel={user?.avatarUrl ? 'Change your photo' : 'Add a photo'}
          style={({ pressed }) => [{ opacity: pressed || busyPhoto ? 0.7 : 1 }]}
        >
          <Avatar uri={user?.avatarUrl} initials={initials} size={104} />
          <View
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.primary,
              borderWidth: 3,
              borderColor: theme.colors.background
            }}
          >
            <Camera color={theme.colors.onPrimary} size={16} />
          </View>
        </Pressable>

        <Text style={[type.title, { color: theme.colors.text, marginTop: 14 }]}>{user?.name || 'Add your name'}</Text>
        <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>{user?.email ?? ''}</Text>
        {memberSince ? (
          <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>With us since {memberSince}</Text>
        ) : null}
        <Pressable onPress={() => setPhotoSheet(true)} disabled={busyPhoto} hitSlop={8} style={{ marginTop: 10 }}>
          <Text style={{ color: theme.colors.primary, fontFamily: fonts.semibold, fontSize: 13 }}>
            {busyPhoto ? 'Working on it' : user?.avatarUrl ? 'Change photo' : 'Add a photo'}
          </Text>
        </Pressable>
      </View>

      <SectionHeader title="About you" />
      <ListCard>
        <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 2 }}>
          <TextField label="Your name" value={name} onChangeText={setName} placeholder="What should we call you?" autoCapitalize="words" />
        </View>
        <ListRow title="Email" subtitle={user?.email ?? ''} />
      </ListCard>
      <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 6, marginBottom: 18, paddingHorizontal: 4 }]}>
        Your email is how you sign in. To change it, go to Settings, Account.
      </Text>

      <SectionHeader title="Money and region" />
      <ListCard>
        <ListRow
          title="Currency"
          subtitle={`${labelFor(CURRENCIES, currency, 'Naira')}, shown as ${currency}`}
          onPress={() => setCurrencySheet(true)}
          chevron
        />
        <ListRow title="Region" subtitle={labelFor(REGIONS, locale, 'Nigeria')} onPress={() => setRegionSheet(true)} chevron />
        <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
          <TextField
            label="Take-home pay each month"
            value={monthly}
            onChangeText={(v) => setMonthly(formatNumberInput(v))}
            keyboardType="numeric"
            placeholder="What lands in your account"
          />
        </View>
      </ListCard>
      <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 6, marginBottom: 20, paddingHorizontal: 4 }]}>
        Take-home pay is what actually reaches you, after tax and deductions. It is the starting point for your plan.
      </Text>

      {changed ? <PrimaryButton title="Save changes" onPress={save} loading={saving} /> : null}

      <Sheet
        visible={photoSheet}
        onClose={() => setPhotoSheet(false)}
        title="Your photo"
        subtitle="Anyone you share a budget or a business with will see it."
      >
        <ListCard>
          <ListRow icon={<Camera color={theme.colors.primary} size={18} />} title="Take a photo" onPress={() => void changePhoto('camera')} chevron />
          <ListRow
            icon={<Images color={theme.colors.primary} size={18} />}
            title="Choose from your photos"
            onPress={() => void changePhoto('library')}
            chevron
          />
          {user?.avatarUrl ? (
            <ListRow
              icon={<Trash2 color={theme.colors.error} size={18} />}
              title="Remove photo"
              titleStyle={{ color: theme.colors.error }}
              onPress={() => void removePhoto()}
            />
          ) : null}
        </ListCard>
      </Sheet>

      <Sheet visible={currencySheet} onClose={() => setCurrencySheet(false)} title="Currency" subtitle="What your amounts are shown in.">
        <ListCard>
          {CURRENCIES.map((c) => (
            <ListRow
              key={c.value}
              title={`${c.label} (${c.value})`}
              subtitle={c.hint}
              right={currency === c.value ? <Check color={theme.colors.primary} size={18} strokeWidth={3} /> : undefined}
              onPress={() => {
                setCurrency(c.value);
                setCurrencySheet(false);
              }}
            />
          ))}
        </ListCard>
      </Sheet>

      <Sheet visible={regionSheet} onClose={() => setRegionSheet(false)} title="Region" subtitle="How dates and numbers are written.">
        <ListCard>
          {REGIONS.map((r) => (
            <ListRow
              key={r.value}
              title={r.label}
              subtitle={r.hint}
              right={locale === r.value ? <Check color={theme.colors.primary} size={18} strokeWidth={3} /> : undefined}
              onPress={() => {
                setLocale(r.value);
                setRegionSheet(false);
              }}
            />
          ))}
        </ListCard>
      </Sheet>
    </Screen>
  );
}
