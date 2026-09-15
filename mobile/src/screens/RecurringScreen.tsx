import React, { useCallback, useMemo, useState } from 'react';
import { BUCKETS } from '../theme/buckets';
import { useCategories } from '../contexts/CategoriesContext';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Repeat, X } from 'lucide-react-native';

import { createRecurring, deleteRecurring, listRecurring, updateRecurring, type ApiRecurring, type RecurringFrequency } from '../api/features';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { useToast } from '../components/Common/Toast';
import { CategoryIcon } from '../components/Common/CategoryIcon';
import {
  Amount,
  Card,
  Chip,
  EmptyState,
  IconButton,
  InlineError,
  ListCard,
  ListRow,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SectionHeader,
  SecondaryButton,
  SegmentedControl,
  formatAmount
} from '../components/Common/ui';
import { SelectField } from '../components/Common/SelectField';
import { getRememberedPushToken, scheduleLocalBillReminders } from '../lib/notifications';
import { currencySymbol, formatNumberInput, formatShortDate, parseNumberInput, toIsoDate } from '../utils/format';
import { fonts, type } from '../theme/typography';

const FREQ_LABEL: Record<RecurringFrequency, string> = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

type Draft = {
  id: string | null;
  type: 'income' | 'expense';
  amount: string;
  description: string;
  category: string;
  frequency: RecurringFrequency;
  nextDueDate: string;
  autoCreate: boolean;
  remindDaysBefore: number;
  budgetCategory: string | null;
  paused: boolean;
};

function blankDraft(): Draft {
  return {
    id: null,
    type: 'expense',
    amount: '',
    description: '',
    category: 'Bills & utilities',
    frequency: 'monthly',
    nextDueDate: toIsoDate(new Date()),
    autoCreate: true,
    remindDaysBefore: 1,
    budgetCategory: 'Needs',
    paused: false
  };
}

function daysUntil(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

export default function RecurringScreen() {
  const { expense: expenseCats, income: incomeCats } = useCategories();
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const glyph = currencySymbol(user?.currency);

  const [items, setItems] = useState<ApiRecurring[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const syncLocalReminders = useCallback(
    async (list: ApiRecurring[]) => {
      // Server push handles reminders when this phone is registered; otherwise remind on-device.
      if (await getRememberedPushToken()) return;
      await scheduleLocalBillReminders(
        list.map((r) => ({
          id: r.id,
          name: r.description || r.category,
          amountLabel: formatAmount(r.amount, glyph),
          nextDueDate: r.nextDueDate,
          remindDaysBefore: r.remindDaysBefore,
          paused: r.paused,
          type: r.type
        })),
        true
      ).catch(() => undefined);
    },
    [glyph]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listRecurring(spacesEnabled ? activeSpaceId : undefined);
      setItems(list);
      void syncLocalReminders(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your recurring items.');
    } finally {
      setLoading(false);
    }
  }, [activeSpaceId, spacesEnabled, syncLocalReminders]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const active = items.filter((r) => !r.paused);
  const upcoming = useMemo(() => active.filter((r) => daysUntil(r.nextDueDate) <= 30).sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate)), [active]);
  const monthlyOut = active
    .filter((r) => r.type === 'expense')
    .reduce((s, r) => s + (r.frequency === 'weekly' ? (r.amount * 52) / 12 : r.frequency === 'yearly' ? r.amount / 12 : r.amount), 0);

  const openEdit = (r: ApiRecurring) => {
    setFormError(null);
    setDraft({
      id: r.id,
      type: r.type,
      amount: formatNumberInput(String(r.amount)),
      description: r.description,
      category: r.category,
      frequency: r.frequency,
      nextDueDate: r.nextDueDate,
      autoCreate: r.autoCreate,
      remindDaysBefore: r.remindDaysBefore,
      budgetCategory: r.budgetCategory,
      paused: r.paused
    });
  };

  const save = async () => {
    if (!draft) return;
    const amount = parseNumberInput(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) return setFormError('Enter an amount.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.nextDueDate)) return setFormError('Use the date format YYYY-MM-DD.');
    setFormError(null);
    setSaving(true);
    try {
      const common = {
        type: draft.type,
        amount,
        category: draft.category,
        description: draft.description.trim(),
        frequency: draft.frequency,
        autoCreate: draft.autoCreate,
        remindDaysBefore: draft.type === 'expense' ? draft.remindDaysBefore : 0,
        budgetCategory: draft.type === 'expense' ? draft.budgetCategory : null
      };
      const res = draft.id
        ? await updateRecurring(draft.id, { ...common, nextDueDate: draft.nextDueDate, paused: draft.paused })
        : await createRecurring({ ...common, startDate: draft.nextDueDate, ...(spacesEnabled ? { spaceId: activeSpaceId } : {}) });
      toast.show(res.created ? `Saved. ${res.created} due ${res.created === 1 ? 'payment was' : 'payments were'} recorded.` : 'Saved', 'success');
      setDraft(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!draft?.id) return;
    Alert.alert('Delete this schedule?', 'Transactions it already recorded stay in your history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRecurring(draft.id!);
            setDraft(null);
            toast.show('Schedule deleted', 'success');
            await load();
          } catch (e) {
            setFormError(e instanceof Error ? e.message : 'Could not delete. Try again.');
          }
        }
      }
    ]);
  };

  const row = (r: ApiRecurring) => {
    const d = daysUntil(r.nextDueDate);
    const when = d < 0 ? 'overdue' : d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
    return (
      <ListRow
        key={r.id}
        icon={<CategoryIcon category={r.category} type={r.type} />}
        title={r.description || r.category}
        subtitle={r.paused ? `${FREQ_LABEL[r.frequency]} · paused` : `${FREQ_LABEL[r.frequency]} · next ${formatShortDate(r.nextDueDate)} (${when})${r.autoCreate ? ' · automatic' : ''}`}
        onPress={() => openEdit(r)}
        right={<Amount value={r.type === 'expense' ? -r.amount : r.amount} currency={glyph} size="sm" signed={r.type === 'income'} color={r.type === 'income' ? theme.colors.success : theme.colors.text} />}
      />
    );
  };

  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, { backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface, borderColor: selected ? theme.colors.primary : theme.colors.border }]}
    >
      <Text style={[type.smallStrong, { color: selected ? theme.colors.primary : theme.colors.text }]}>{label}</Text>
    </Pressable>
  );

  const nextMonthFirst = (() => {
    const n = new Date();
    return toIsoDate(new Date(n.getFullYear(), n.getMonth() + 1, 1));
  })();

  return (
    <Screen onRefresh={load} refreshing={loading} bottomInset={48}>
      <ScreenHeader
        title="Recurring & bills"
        onBack={() => nav.goBack()}
        right={
          <IconButton
            accessibilityLabel="Add a recurring item"
            onPress={() => {
              setFormError(null);
              setDraft(blankDraft());
            }}
          >
            <Plus color={theme.colors.text} size={20} />
          </IconButton>
        }
      />
      <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 6 }]}>
        Rent, subscriptions, salary: set them once. We record them on the due date and remind you before bills are due.
      </Text>

      {error ? (
        <View style={{ marginTop: 12 }}>
          <InlineError message={error} />
        </View>
      ) : null}

      {items.length ? (
        <Card style={{ marginTop: 14 }}>
          <Text style={[type.smallStrong, { color: theme.colors.textMuted }]}>Regular bills each month</Text>
          <Amount value={Math.round(monthlyOut)} currency={glyph} size="lg" style={{ marginTop: 4 }} />
          <Text style={[type.caption, { color: theme.colors.textMuted }]}>
            {active.length} active schedule{active.length === 1 ? '' : 's'}
          </Text>
        </Card>
      ) : null}

      {loading && !items.length ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 24 }} /> : null}

      {!loading && !items.length && !error ? (
        <View style={{ marginTop: 16 }}>
          <EmptyState
            title="Nothing recurring yet"
            body="Add rent, DSTV, electricity or your salary so they’re recorded automatically and you’re reminded before bills are due."
            actionLabel="Add your first one"
            onAction={() => setDraft(blankDraft())}
          />
        </View>
      ) : null}

      {upcoming.length ? (
        <>
          <SectionHeader title="Next 30 days" />
          <ListCard>{upcoming.map(row)}</ListCard>
        </>
      ) : null}

      {items.length ? (
        <>
          <SectionHeader title="All schedules" />
          <ListCard>{items.map(row)}</ListCard>
        </>
      ) : null}

      <Modal transparent visible={!!draft} animationType="slide" onRequestClose={() => setDraft(null)}>
        <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={() => setDraft(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
            {draft ? (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={styles.sheetHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Repeat color={theme.colors.primary} size={18} />
                    <Text style={[type.title, { color: theme.colors.text }]}>{draft.id ? 'Edit schedule' : 'New schedule'}</Text>
                  </View>
                  <IconButton accessibilityLabel="Close" onPress={() => setDraft(null)}>
                    <X color={theme.colors.text} size={18} />
                  </IconButton>
                </View>

                {formError ? <InlineError message={formError} /> : null}

                <SegmentedControl
                  options={[
                    { key: 'expense', label: 'Bill or expense' },
                    { key: 'income', label: 'Income' }
                  ]}
                  value={draft.type}
                  onChange={(k) => setDraft({ ...draft, type: k, category: k === 'income' ? 'Salary' : 'Bills' })}
                />

                <Text style={[type.smallStrong, styles.label, { color: theme.colors.text }]}>Amount</Text>
                <View style={[styles.input, { borderColor: theme.colors.border }]}>
                  <Text style={{ fontFamily: fonts.medium, fontSize: 18, color: theme.colors.textMuted }}>{glyph}</Text>
                  <TextInput
                    value={draft.amount}
                    onChangeText={(t) => setDraft({ ...draft, amount: formatNumberInput(t) })}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={theme.colors.textMuted}
                    style={[styles.inputText, { color: theme.colors.text }]}
                  />
                </View>

                <Text style={[type.smallStrong, styles.label, { color: theme.colors.text }]}>Name</Text>
                <View style={[styles.input, { borderColor: theme.colors.border }]}>
                  <TextInput
                    value={draft.description}
                    onChangeText={(t) => setDraft({ ...draft, description: t })}
                    placeholder={draft.type === 'income' ? 'e.g. Salary from Acme' : 'e.g. DSTV Compact'}
                    placeholderTextColor={theme.colors.textMuted}
                    maxLength={120}
                    style={[styles.inputText, { color: theme.colors.text, fontFamily: fonts.medium, fontSize: 16 }]}
                  />
                </View>

                <SelectField
                  label="Category"
                  value={draft.category}
                  options={(draft.type === 'income' ? incomeCats : expenseCats).map((x) => ({ value: x.name, label: x.name }))}
                  onChange={(c) => setDraft({ ...draft, category: c })}
                  style={{ marginTop: 16, marginBottom: 0 }}
                />

                <Text style={[type.smallStrong, styles.label, { color: theme.colors.text }]}>How often</Text>
                <SegmentedControl
                  options={[
                    { key: 'weekly', label: 'Weekly' },
                    { key: 'monthly', label: 'Monthly' },
                    { key: 'yearly', label: 'Yearly' }
                  ]}
                  value={draft.frequency}
                  onChange={(k) => setDraft({ ...draft, frequency: k })}
                />

                <Text style={[type.smallStrong, styles.label, { color: theme.colors.text }]}>{draft.id ? 'Next due date' : 'First due date'}</Text>
                <View style={[styles.input, { borderColor: theme.colors.border }]}>
                  <TextInput
                    value={draft.nextDueDate}
                    onChangeText={(t) => setDraft({ ...draft, nextDueDate: t.replace(/[^\d-]/g, '').slice(0, 10) })}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    style={[styles.inputText, { color: theme.colors.text, fontFamily: fonts.medium, fontSize: 16 }]}
                  />
                </View>
                <View style={[styles.wrap, { marginTop: 8 }]}>
                  {chip('Today', draft.nextDueDate === toIsoDate(new Date()), () => setDraft({ ...draft, nextDueDate: toIsoDate(new Date()) }))}
                  {chip('1st of next month', draft.nextDueDate === nextMonthFirst, () => setDraft({ ...draft, nextDueDate: nextMonthFirst }))}
                </View>

                <View style={[styles.switchRow, { borderColor: theme.colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Record it automatically</Text>
                    <Text style={[type.caption, { color: theme.colors.textMuted }]}>Adds the transaction on each due date</Text>
                  </View>
                  <Switch
                    value={draft.autoCreate}
                    onValueChange={(v) => setDraft({ ...draft, autoCreate: v })}
                    trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {draft.type === 'expense' ? (
                  <>
                    <SelectField
                      label="Remind me"
                      value={draft.remindDaysBefore}
                      options={[
                        { value: 0, label: 'Off' },
                        { value: 1, label: '1 day before' },
                        { value: 3, label: '3 days before' },
                        { value: 7, label: 'A week before' }
                      ]}
                      onChange={(days) => setDraft({ ...draft, remindDaysBefore: days })}
                      style={{ marginTop: 16, marginBottom: 0 }}
                    />
                    <Text style={[type.smallStrong, styles.label, { color: theme.colors.text }]}>Budget bucket</Text>
                    <View style={styles.wrap}>{BUCKETS.map((b) => chip(b, draft.budgetCategory === b, () => setDraft({ ...draft, budgetCategory: b })))}</View>
                  </>
                ) : null}

                {draft.id ? (
                  <View style={[styles.switchRow, { borderColor: theme.colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Paused</Text>
                      <Text style={[type.caption, { color: theme.colors.textMuted }]}>Nothing is recorded or reminded while paused</Text>
                    </View>
                    <Switch
                      value={draft.paused}
                      onValueChange={(v) => setDraft({ ...draft, paused: v })}
                      trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                ) : null}

                <PrimaryButton title={draft.id ? 'Save changes' : 'Add schedule'} onPress={save} loading={saving} style={{ marginTop: 18 }} />
                {draft.id ? <SecondaryButton title="Delete schedule" onPress={remove} style={{ marginTop: 10 }} /> : null}
                {draft.id ? null : (
                  <Chip
                    tone="neutral"
                    label={draft.autoCreate ? 'If the first date is today or earlier, it’s recorded right away.' : 'You’ll only get reminders; nothing is recorded.'}
                    style={{ marginTop: 12, alignSelf: 'stretch' }}
                  />
                )}
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  label: { marginTop: 16, marginBottom: 8 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 50 },
  inputText: { flex: 1, fontFamily: fonts.display, fontSize: 22, paddingVertical: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth }
});
