import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, Image, Alert, Modal, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Card, Screen, H1, P, TextField, PrimaryButton, SecondaryButton } from '../components/Common/ui';
import { patchMe, uploadAvatar } from '../api/endpoints';
import { apiFetch } from '../api/client';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { tokens } from '../theme/tokens';
import { formatNumberInput } from '../utils/format';

const CURRENCY_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Nigerian Naira (₦)', value: '₦' },
  { label: 'US Dollar ($)', value: '$' },
  { label: 'British Pound (£)', value: '£' },
  { label: 'Euro (€)', value: '€' }
];

const LOCALE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Nigeria (en-NG)', value: 'en-NG' },
  { label: 'United States (en-US)', value: 'en-US' },
  { label: 'United Kingdom (en-GB)', value: 'en-GB' }
];

export default function ProfileEditScreen() {
  const nav = useNavigation<any>();
  const { user, refreshUser } = useAuth();
  const { theme } = useTheme();

  const [name, setName] = useState(user?.name ?? '');
  const [currency, setCurrency] = useState(user?.currency ?? '₦');
  const [monthly, setMonthly] = useState(user?.monthlyIncome != null ? String(user.monthlyIncome) : '');
  const [locale, setLocale] = useState(user?.locale ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showLocalePicker, setShowLocalePicker] = useState(false);

  const initials = useMemo(() => (user?.name || user?.email || 'U').slice(0, 2).toUpperCase(), [user]);
  const displayName = useMemo(() => user?.name || user?.email || 'User', [user]);
  const memberSince = useMemo(() => {
    if (!user?.createdAt) return null;
    try {
      const d = new Date(user.createdAt);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
    } catch {
      return null;
    }
  }, [user]);

  const [isEditing, setIsEditing] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const val = await SecureStore.getItemAsync('bf_avatar_uri_v1');
        if (val) setAvatarUri(val);
      } catch {
        // ignore
      }
    })();
  }, []);

  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission required', 'Please grant photo library access to choose an avatar.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: true, aspect: [1, 1] });
      if (!res.cancelled) {
        // Persist immediately as a local fallback
        await SecureStore.setItemAsync('bf_avatar_uri_v1', res.uri);
        setAvatarUri(res.uri);

        // Attempt to upload to backend and persist returned remote URL
        try {
          const uploaded = await uploadAvatar(res.uri);
          if (uploaded?.avatarUrl) {
            // Persist server-side avatar URL and refresh user
            await apiFetch('/v1/users/me', { method: 'PATCH', body: JSON.stringify({ avatarUrl: uploaded.avatarUrl }) });
            await refreshUser();
            await SecureStore.setItemAsync('bf_avatar_uri_v1', uploaded.avatarUrl);
            setAvatarUri(uploaded.avatarUrl);
          }
        } catch (e) {
          // ignore upload failures and keep local URI
        }
      }
    } catch (e) {
      // ignore
    }
  };

  const removeAvatar = async () => {
    try {
      await SecureStore.deleteItemAsync('bf_avatar_uri_v1');
      setAvatarUri(null);
    } catch {
      // ignore
    }
  };

  const save = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await patchMe({
        name: name.trim() || null,
        currency: currency || null,
        monthlyIncome: monthly ? Number(monthly.replace(/,/g, '')) : undefined,
        locale: locale.trim() || null
      });
      await refreshUser();
      setIsEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={() => nav.goBack()}
          style={({ pressed }) => [{
            width: 44,
            height: 44,
            borderRadius: 18,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.92 : 1
          }]}
        >
          <ArrowLeft color={theme.colors.text} size={20} />
        </Pressable>

        <View style={{ marginLeft: 12, flex: 1 }}>
          <H1 style={{ marginBottom: 0 }}>Profile details</H1>
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        {error ? (
          <Card style={{ padding: 12 }}>
            <Text style={{ color: theme.colors.error }}>{error}</Text>
          </Card>
        ) : null}

        <Card style={{ padding: 18, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={pickImage} style={{ marginRight: 12 }}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={{ width: 64, height: 64, borderRadius: 18 }} />
            ) : (
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.primary
                }}
              >
                <Text style={{ color: tokens.colors.white, fontWeight: '900', fontSize: 20 }}>{initials}</Text>
              </View>
            )}
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
              {displayName}
            </Text>
            <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: theme.colors.textMuted, marginTop: 4 }}>
              {user?.email ?? ''}
            </Text>
            {memberSince ? (
              <P style={{ marginTop: 4, fontSize: 12 }}>Member since {memberSince}</P>
            ) : null}
            {avatarUri ? (
              <Pressable onPress={removeAvatar} style={({ pressed }) => [{ marginTop: 8, alignSelf: 'flex-start', opacity: pressed ? 0.9 : 1 }]}>
                <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '700' }}>Remove photo</Text>
              </Pressable>
            ) : null}
          </View>
        </Card>

        <View style={{ marginTop: 12 }}>
          <Card>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Personal details</Text>
            <View style={{ marginTop: 12, gap: 12 }}>
              {!isEditing ? (
                <>
                  <View>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>Full name</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: '700', marginTop: 4 }}>{name || 'Not set'}</Text>
                  </View>
                  <View>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>Email</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: '700', marginTop: 4 }}>{user?.email ?? '-'}</Text>
                  </View>
                </>
              ) : (
                <>
                  <TextField label="Full name" value={name} onChangeText={setName} placeholder="Your full name" />
                </>
              )}
            </View>
          </Card>
        </View>

        <View style={{ marginTop: 12 }}>
          <Card>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Region & preferences</Text>
            <View style={{ marginTop: 12, gap: 12 }}>
              {!isEditing ? (
                <>
                  <View>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>Preferred currency</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: '700', marginTop: 4 }}>{currency || '₦'}</Text>
                  </View>
                  <View>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>Region / locale</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: '700', marginTop: 4 }}>{locale || 'Not set'}</Text>
                  </View>
                </>
              ) : (
                <>
                  <View>
                    <Text style={{ color: theme.colors.text, fontWeight: '700', marginBottom: 6 }}>Preferred currency</Text>
                    <Pressable
                      onPress={() => setShowCurrencyPicker(true)}
                      style={({ pressed }) => [
                        {
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surfaceAlt,
                          borderRadius: tokens.radius['2xl'],
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          opacity: pressed ? 0.92 : 1
                        }
                      ]}
                    >
                      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{currency || '₦'}</Text>
                      <Text style={{ color: theme.colors.textMuted, marginTop: 4, fontSize: 12 }}>Tap to change</Text>
                    </Pressable>
                  </View>

                  <View>
                    <Text style={{ color: theme.colors.text, fontWeight: '700', marginBottom: 6 }}>Region / locale</Text>
                    <Pressable
                      onPress={() => setShowLocalePicker(true)}
                      style={({ pressed }) => [
                        {
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surfaceAlt,
                          borderRadius: tokens.radius['2xl'],
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          opacity: pressed ? 0.92 : 1
                        }
                      ]}
                    >
                      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{locale || 'en-NG'}</Text>
                      <Text style={{ color: theme.colors.textMuted, marginTop: 4, fontSize: 12 }}>Tap to change</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </Card>
        </View>

        <View style={{ marginTop: 12 }}>
          <Card>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Income</Text>
            <View style={{ marginTop: 12 }}>
              {!isEditing ? (
                <View>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>Monthly income (take-home)</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: '700', marginTop: 4 }}>{monthly || 'Not set'}</Text>
                </View>
              ) : (
                <TextField
                  label="Monthly income (take-home)"
                  value={monthly}
                  onChangeText={(v) => setMonthly(formatNumberInput(v))}
                  placeholder="0"
                  keyboardType="decimal-pad"
                />
              )}
              <P style={{ marginTop: 4 }}>We use this to personalise budgets, insights and formatting.</P>
            </View>
          </Card>
        </View>

        <View style={{ marginTop: 16 }}>
          {!isEditing ? (
            <PrimaryButton title="Edit profile" onPress={() => setIsEditing(true)} />
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <SecondaryButton
                  title="Cancel"
                  onPress={() => {
                    setIsEditing(false);
                    setName(user?.name ?? '');
                    setCurrency(user?.currency ?? '₦');
                    setMonthly(user?.monthlyIncome != null ? String(user.monthlyIncome) : '');
                    setLocale(user?.locale ?? '');
                    setError(null);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton title={isSaving ? 'Saving…' : 'Save changes'} onPress={save} disabled={isSaving} />
              </View>
            </View>
          )}
        </View>
      </View>

      <Modal visible={showCurrencyPicker} transparent animationType="fade" onRequestClose={() => setShowCurrencyPicker(false)}>
        <Pressable
          onPress={() => setShowCurrencyPicker(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', padding: 18, justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={() => {}}
            style={{ backgroundColor: theme.colors.surface, borderRadius: tokens.radius['2xl'], borderWidth: 1, borderColor: theme.colors.border, padding: 14, maxHeight: '70%' }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Preferred currency</Text>
            <ScrollView style={{ marginTop: 10 }}>
              {CURRENCY_OPTIONS.map((o) => {
                const active = o.value === currency;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => {
                      setCurrency(o.value);
                      setShowCurrencyPicker(false);
                    }}
                    style={({ pressed }) => [
                      {
                        paddingVertical: 12,
                        paddingHorizontal: 10,
                        borderRadius: 12,
                        backgroundColor: active ? theme.colors.surfaceAlt : 'transparent',
                        opacity: pressed ? 0.92 : 1
                      }
                    ]}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: active ? '900' : '800' }}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showLocalePicker} transparent animationType="fade" onRequestClose={() => setShowLocalePicker(false)}>
        <Pressable
          onPress={() => setShowLocalePicker(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', padding: 18, justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={() => {}}
            style={{ backgroundColor: theme.colors.surface, borderRadius: tokens.radius['2xl'], borderWidth: 1, borderColor: theme.colors.border, padding: 14, maxHeight: '70%' }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Region / locale</Text>
            <ScrollView style={{ marginTop: 10 }}>
              {LOCALE_OPTIONS.map((o) => {
                const active = o.value === (locale || 'en-NG');
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => {
                      setLocale(o.value);
                      setShowLocalePicker(false);
                    }}
                    style={({ pressed }) => [
                      {
                        paddingVertical: 12,
                        paddingHorizontal: 10,
                        borderRadius: 12,
                        backgroundColor: active ? theme.colors.surfaceAlt : 'transparent',
                        opacity: pressed ? 0.92 : 1
                      }
                    ]}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: active ? '900' : '800' }}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
