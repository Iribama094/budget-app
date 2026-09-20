import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { GuideAnchor } from '../components/Common/GuideAnchor';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';

import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { useCategories } from '../contexts/CategoriesContext';
import { useToast } from '../components/Common/Toast';
import { CategoryIcon } from '../components/Common/CategoryIcon';
import { Chip, IconButton, ListCard, ListRow, PrimaryButton, Screen, ScreenHeader, SecondaryButton, SectionHeader, SegmentedControl, TextField } from '../components/Common/ui';
import type { ApiCategory } from '../api/personal';
import { CATEGORY_ICONS, ICON_CHOICES, guessIconKey } from '../lib/categoryIcons';
import { BUCKETS, bucketDescription, bucketDisplayName, type Bucket } from '../theme/buckets';
import { type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';

type Draft = { id: string | null; name: string; type: 'income' | 'expense'; bucket: Bucket; icon: string; hidden: boolean; iconTouched: boolean };

/** Add, rename, regroup or hide categories, e.g. tithe, generator fuel or ajo contributions. */
export default function CategoriesScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const isBusiness = spacesEnabled && activeSpaceId === 'business';
  const { all, create, update, remove, refresh } = useCategories();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const visible = useMemo(() => all.filter((c) => c.type === kind && !c.hidden).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)), [all, kind]);
  const hidden = useMemo(() => all.filter((c) => c.type === kind && c.hidden), [all, kind]);
  const offline = all.some((c) => c.id.startsWith('default:'));

  const openNew = () => setDraft({ id: null, name: '', type: kind, bucket: 'Needs', icon: 'tag', hidden: false, iconTouched: false });
  const openEdit = (c: ApiCategory) => setDraft({ id: c.id, name: c.name, type: c.type, bucket: c.bucket ?? 'Needs', icon: c.icon, hidden: c.hidden, iconTouched: true });

  const save = async () => {
    if (!draft || !draft.name.trim()) return;
    if (offline) {
      toast.show('Connect to the internet to change categories.', 'error');
      return;
    }
    setSaving(true);
    try {
      const icon = draft.iconTouched ? draft.icon : guessIconKey(draft.name, draft.type === 'income');
      if (draft.id) {
        await update(draft.id, { name: draft.name.trim(), bucket: draft.type === 'expense' ? draft.bucket : null, icon, hidden: draft.hidden });
        toast.show('Category saved', 'success');
      } else {
        await create({ name: draft.name.trim(), type: draft.type, bucket: draft.type === 'expense' ? draft.bucket : null, icon });
        toast.show(`${draft.name.trim()} added`, 'success');
      }
      setDraft(null);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not save that category', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!draft?.id) return;
    const id = draft.id;
    Alert.alert(`Delete ${draft.name}?`, 'Past transactions keep this name. To keep it off the list without deleting, hide it instead.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove(id);
            setDraft(null);
          } catch (e) {
            toast.show(e instanceof Error ? e.message : 'Could not delete', 'error');
          }
        }
      }
    ]);
  };

  const row = (c: ApiCategory) => (
    <ListRow
      key={c.id}
      icon={<CategoryIcon category={c.name} type={c.type} icon={c.icon} />}
      title={c.name}
      subtitle={c.isDefault ? undefined : 'Added by you'}
      onPress={() => openEdit(c)}
      chevron
    />
  );

  return (
    <Screen bottomInset={48}>
      <ScreenHeader
        title="Categories"
        onBack={() => goBackOrHome(nav)}
        right={
          <GuideAnchor id="categories.add">
            <IconButton accessibilityLabel="Add a category" onPress={openNew}>
              <Plus color={theme.colors.text} size={20} />
            </IconButton>
          </GuideAnchor>
        }
      />
      <SegmentedControl
        options={[
          { key: 'expense', label: 'Spending' },
          { key: 'income', label: 'Income' }
        ]}
        value={kind}
        onChange={setKind}
        style={{ marginTop: 6 }}
      />
      <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 10 }]}>
        {kind === 'expense'
          ? 'Each spending category counts toward Needs, Wants or Savings in your budget. Renaming one also updates past transactions.'
          : 'Income categories help you see where your money comes from.'}
      </Text>

      {kind === 'expense' ? (
        BUCKETS.map((b) => {
          const items = visible.filter((c) => c.bucket === b);
          return (
            <View key={b}>
              <SectionHeader title={bucketDisplayName(b, isBusiness)} />
              <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: -6, marginBottom: 8 }]}>{bucketDescription(b, isBusiness)}</Text>
              {items.length ? <ListCard>{items.map(row)}</ListCard> : <Text style={[type.small, { color: theme.colors.textMuted }]}>None yet.</Text>}
            </View>
          );
        })
      ) : (
        <>
          <SectionHeader title="Income" />
          <ListCard>{visible.map(row)}</ListCard>
        </>
      )}

      {hidden.length ? (
        <>
          <SectionHeader title="Hidden" />
          <ListCard>{hidden.map(row)}</ListCard>
        </>
      ) : null}

      <PrimaryButton title={`Add a ${kind === 'expense' ? 'spending' : 'income'} category`} iconLeft={<Plus color={theme.colors.onPrimary} size={18} />} onPress={openNew} style={{ marginTop: 20 }} />

      <Modal transparent visible={!!draft} animationType="slide" onRequestClose={() => setDraft(null)} statusBarTranslucent navigationBarTranslucent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={() => setDraft(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
              {draft ? (
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <Text style={[type.title, { color: theme.colors.text, marginBottom: 12 }]}>{draft.id ? 'Edit category' : 'New category'}</Text>
                  <TextField
                    label="Name"
                    value={draft.name}
                    onChangeText={(t) => setDraft({ ...draft, name: t, icon: draft.iconTouched ? draft.icon : guessIconKey(t, draft.type === 'income') })}
                    placeholder={draft.type === 'expense' ? 'e.g. Generator fuel' : 'e.g. Rent from tenants'}
                    maxLength={40}
                    autoCapitalize="words"
                    autoFocus={!draft.id}
                  />
                  {draft.type === 'expense' ? (
                    <>
                      <Text style={[type.smallStrong, { color: theme.colors.text, marginBottom: 8 }]}>Counts as</Text>
                      <SegmentedControl options={BUCKETS.map((b) => ({ key: b, label: bucketDisplayName(b, isBusiness) }))} value={draft.bucket} onChange={(b) => setDraft({ ...draft, bucket: b })} />
                    </>
                  ) : null}

                  <Text style={[type.smallStrong, { color: theme.colors.text, marginTop: 16, marginBottom: 8 }]}>Icon</Text>
                  <View style={styles.icons}>
                    {ICON_CHOICES.map((key) => {
                      const Icon = CATEGORY_ICONS[key];
                      const active = draft.icon === key;
                      return (
                        <Pressable
                          key={key}
                          onPress={() => setDraft({ ...draft, icon: key, iconTouched: true })}
                          accessibilityRole="button"
                          accessibilityLabel={`Icon ${key}`}
                          accessibilityState={{ selected: active }}
                          style={[styles.icon, { backgroundColor: active ? theme.colors.primarySoft : theme.colors.surfaceAlt, borderColor: active ? theme.colors.primary : 'transparent' }]}
                        >
                          <Icon color={active ? theme.colors.primary : theme.colors.textMuted} size={18} />
                        </Pressable>
                      );
                    })}
                  </View>

                  {draft.id ? (
                    <View style={[styles.switchRow, { borderColor: theme.colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Show when adding transactions</Text>
                        <Text style={[type.caption, { color: theme.colors.textMuted }]}>Hidden categories stay on past transactions</Text>
                      </View>
                      <Switch value={!draft.hidden} onValueChange={(v) => setDraft({ ...draft, hidden: !v })} trackColor={{ true: theme.colors.primary, false: theme.colors.border }} thumbColor="#FFFFFF" />
                    </View>
                  ) : (
                    <Chip tone="primary" label="It’ll be ready to use straight away" style={{ marginTop: 14 }} />
                  )}

                  <PrimaryButton title={draft.id ? 'Save' : 'Add category'} onPress={save} loading={saving} disabled={!draft.name.trim()} style={{ marginTop: 18 }} />
                  {draft.id ? <SecondaryButton title="Delete" onPress={confirmDelete} style={{ marginTop: 10 }} /> : null}
                </ScrollView>
              ) : null}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20 },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  icon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 16, paddingTop: 14 }
});
