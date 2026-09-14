import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Briefcase, Plus, Sparkles } from 'lucide-react-native';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { Amount, Card, EmptyState, IconTile, InlineError, ListCard, ListRow, PrimaryButton, Screen, ScreenHeader, SecondaryButton, SectionHeader, SegmentedControl, formatAmount } from '../components/Common/ui';
import { IncomeEditor } from '../components/Plan/IncomeEditor';
import { PlanSplit } from '../components/Plan/PlanSplit';
import { CategoryIcon } from '../components/Common/CategoryIcon';
import { patchMe } from '../api/endpoints';
import { createIncomeSource, deleteIncomeSource, getPlan, updateIncomeSource, type ApiPlan } from '../api/personal';
import { blankIncome, describePay, fromApiIncome, toIncomeInput, type DraftIncome } from '../lib/planDrafts';
import { currencySymbol } from '../utils/format';
import { type } from '../theme/typography';

const FREQ: Record<string, string> = { monthly: 'monthly', yearly: 'yearly', weekly: 'weekly', biweekly: 'every 2 weeks', irregular: 'varies' };

/** Income sources, payday and bills: the inputs behind the plan, all editable. */
export default function IncomeBillsScreen() {
  const nav = useNavigation<any>();
  const { user, refreshUser } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const glyph = currencySymbol(user?.currency);

  const [plan, setPlan] = useState<ApiPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; draft: DraftIncome } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPlan(await getPlan());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your plan');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const sources = plan?.incomeSources ?? [];
  const bills = plan?.bills ?? [];

  const save = async () => {
    if (!editing) return;
    const input = toIncomeInput(editing.draft);
    if (!input) {
      toast.show('Enter how much you get', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing.id) await updateIncomeSource(editing.id, input);
      else await createIncomeSource(input);
      setEditing(null);
      await load();
      toast.show('Income saved. Your plan is updated.', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!editing?.id) return;
    const id = editing.id;
    Alert.alert('Remove this income?', 'Your plan will be recalculated without it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteIncomeSource(id);
            setEditing(null);
            await load();
          } catch (e) {
            toast.show(e instanceof Error ? e.message : 'Could not remove', 'error');
          }
        }
      }
    ]);
  };

  const setPeriod = async (basis: 'payday' | 'monthly') => {
    try {
      await patchMe({ budgetPeriod: basis });
      await Promise.all([refreshUser(), load()]);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not change that', 'error');
    }
  };

  return (
    <Screen bottomInset={48} onRefresh={load} refreshing={false}>
      <ScreenHeader title="Income & bills" onBack={() => nav.goBack()} />
      {error ? <InlineError message={error} /> : null}

      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />
      ) : plan && plan.monthlyIncome > 0 ? (
        <Card style={{ marginTop: 8 }}>
          <Text style={[type.eyebrow, { color: theme.colors.primary }]}>Your plan each month</Text>
          <Amount value={plan.monthlyIncome} currency={glyph} size="lg" style={{ marginTop: 6 }} />
          <Text style={[type.caption, { color: theme.colors.textMuted, marginBottom: 6 }]}>
            {plan.committed > 0 ? `${formatAmount(plan.committed, glyph)} of it goes to bills` : 'No regular bills added yet'}
          </Text>
          <PlanSplit split={plan.split} percents={plan.percents} glyph={glyph} />
          <View style={{ gap: 8, marginTop: 6 }}>
            {plan.tips.slice(0, 3).map((tip) => (
              <View key={tip} style={styles.tip}>
                <Sparkles color={theme.colors.primary} size={14} style={{ marginTop: 3 }} />
                <Text style={[type.small, { color: theme.colors.text, flex: 1 }]}>{tip}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : (
        <View style={{ marginTop: 8 }}>
          <EmptyState title="Add what you earn" body="Rough numbers are fine. We’ll turn them into a Needs, Wants and Savings plan." actionLabel="Add income" onAction={() => setEditing({ id: null, draft: blankIncome('salary') })} />
        </View>
      )}

      <SectionHeader title="Income" actionLabel="Add" onAction={() => setEditing({ id: null, draft: blankIncome(sources.length ? 'side_hustle' : 'salary') })} />
      {sources.length ? (
        <ListCard>
          {sources.map((s) => (
            <ListRow
              key={s.id}
              icon={
                <IconTile bg={theme.colors.successSoft} size={40}>
                  <Briefcase color={theme.colors.success} size={19} />
                </IconTile>
              }
              title={s.name}
              subtitle={`${formatAmount(s.amount, glyph)} ${FREQ[s.frequency]} · ${describePay(s)}`}
              right={<Amount value={s.monthlyAmount} currency={glyph} size="sm" />}
              onPress={() => setEditing({ id: s.id, draft: fromApiIncome(s) })}
              chevron
            />
          ))}
        </ListCard>
      ) : !loading ? (
        <Text style={[type.small, { color: theme.colors.textMuted }]}>No income added yet.</Text>
      ) : null}

      <SectionHeader title="Budget period" />
      <Card>
        <SegmentedControl
          options={[
            { key: 'payday', label: 'Payday to payday' },
            { key: 'monthly', label: 'Calendar month' }
          ]}
          value={plan?.budgetPeriod ?? 'payday'}
          onChange={(k) => void setPeriod(k)}
        />
        <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 10 }]}>
          {plan?.budgetPeriod !== 'monthly'
            ? plan?.period.basis === 'payday'
              ? `Your budget runs ${plan.period.label}, so the money you get lasts until the next payday.`
              : 'Add the day you’re paid to a salary above to budget from payday to payday.'
            : 'Your budget runs from the 1st to the end of each month.'}
        </Text>
      </Card>

      <SectionHeader title="Bills" actionLabel="Manage" onAction={() => nav.navigate('Recurring')} />
      {bills.length ? (
        <ListCard>
          {bills.map((b, i) => (
            <ListRow
              key={`${b.name}-${i}`}
              icon={<CategoryIcon category={b.category} />}
              title={b.name}
              subtitle={`${formatAmount(b.amount, glyph)} ${FREQ[b.frequency]}${b.frequency !== 'monthly' ? ` · about ${formatAmount(b.monthlyAmount, glyph)} a month` : ''}`}
              onPress={() => nav.navigate('Recurring')}
              chevron
            />
          ))}
        </ListCard>
      ) : (
        <Text style={[type.small, { color: theme.colors.textMuted }]}>No regular bills yet. Add rent, school fees or subscriptions in Recurring & bills.</Text>
      )}

      <Modal transparent visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={() => setEditing(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {editing ? (
                  <IncomeEditor value={editing.draft} glyph={glyph} title={editing.id ? 'Edit income' : 'New income'} onChange={(draft) => setEditing({ ...editing, draft })} />
                ) : null}
                <PrimaryButton title="Save" onPress={save} loading={saving} style={{ marginTop: 18 }} />
                {editing?.id ? <SecondaryButton title="Remove" onPress={remove} style={{ marginTop: 10 }} /> : null}
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tip: { flexDirection: 'row', gap: 8 },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20 }
});
