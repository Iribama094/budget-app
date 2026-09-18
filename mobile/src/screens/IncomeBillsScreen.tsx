import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, Briefcase, Sparkles } from 'lucide-react-native';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import {
  Amount,
  Card,
  Chip,
  EmptyState,
  IconTile,
  InfoTip,
  InlineError,
  ListCard,
  ListRow,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SecondaryButton,
  SectionHeader,
  SegmentedControl,
  formatAmount
} from '../components/Common/ui';
import { IncomeEditor } from '../components/Plan/IncomeEditor';
import { PlanSplit } from '../components/Plan/PlanSplit';
import { CategoryIcon } from '../components/Common/CategoryIcon';
import { patchMe } from '../api/endpoints';
import { createIncomeSource, deleteIncomeSource, getPlan, updateIncomeSource, type ApiPlan } from '../api/personal';
import { blankIncome, describePay, fromApiIncome, toIncomeInput, type DraftIncome } from '../lib/planDrafts';
import { TIER_LABEL, billTier, gapRoutes, sortBills, type BillTier } from '../lib/billPriority';
import { currencySymbol } from '../utils/format';
import { type } from '../theme/typography';

const FREQ: Record<string, string> = { monthly: 'monthly', yearly: 'yearly', weekly: 'weekly', biweekly: 'every 2 weeks', irregular: 'varies' };
const TIER_TONE: Record<BillTier, 'neutral' | 'brass' | 'primary'> = { must: 'neutral', reduce: 'brass', pause: 'primary' };

/** Income sources, payday and bills: the inputs behind the plan, all editable. When bills beat income, it shows how to close the gap. */
export default function IncomeBillsScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
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

  // "Add income" from the shortfall card opens straight into a new income.
  useEffect(() => {
    if (!route.params?.addIncome) return;
    nav.setParams({ addIncome: undefined });
    setEditing({ id: null, draft: blankIncome('side_hustle') });
  }, [nav, route.params?.addIncome]);

  const sources = plan?.incomeSources ?? [];
  const bills = sortBills(plan?.bills ?? []);
  const short = plan?.status === 'short' && plan.shortfall > 0;
  const routes = short ? gapRoutes(plan!.bills ?? [], plan!.shortfall) : null;

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

      {short && routes ? (
        <Card style={{ marginTop: 8, backgroundColor: theme.colors.brassSoft, borderColor: theme.colors.brassSoft }}>
          <View style={styles.row}>
            <IconTile bg={theme.colors.surface} size={38}>
              <AlertTriangle color={theme.colors.warn} size={18} />
            </IconTile>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Bills are {formatAmount(plan!.shortfall, glyph)} more than you earn</Text>
              <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>A gap to close each month. Here’s where it can come from.</Text>
            </View>
          </View>

          <View style={{ marginTop: 12, gap: 6 }}>
            {routes.pause.total ? (
              <Text style={[type.small, { color: theme.colors.text }]}>
                • Pause {routes.pause.names}: frees {formatAmount(routes.pause.total, glyph)} a month
              </Text>
            ) : null}
            {routes.reduce.total ? (
              <Text style={[type.small, { color: theme.colors.text }]}>
                • Trim {routes.reduce.names}: {formatAmount(routes.reduce.total, glyph)} a month between them
              </Text>
            ) : null}
            <Text style={[type.small, { color: theme.colors.text }]}>• Add income: a side hustle, or money you expect to come in</Text>
            <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
              {routes.pause.total
                ? routes.pauseCovers
                  ? 'Pausing alone would close the gap.'
                  : `Even after pausing, you’d be ${formatAmount(routes.afterPause, glyph)} short, so trimming or extra income is the other half.`
                : 'Nothing here is an obvious extra, so trimming and extra income are the way through.'}
            </Text>
          </View>

          <View style={styles.actions}>
            <SecondaryButton title="Manage bills" onPress={() => nav.navigate('Recurring')} style={{ flex: 1 }} />
            <PrimaryButton title="Add income" onPress={() => setEditing({ id: null, draft: blankIncome('side_hustle') })} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : null}

      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />
      ) : plan && plan.monthlyIncome > 0 ? (
        <Card style={{ marginTop: 12 }}>
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

      <SectionHeader
        title="Bills"
        actionLabel="Manage"
        onAction={() => nav.navigate('Recurring')}
        info="Listed in the order to pay them: must-pay bills like rent, food, school fees and loans first; then bills you can reduce; then extras you can pause. Biggest first within each group. Tithe and offering stay yours to decide; we never suggest cutting them."
      />
      {bills.length ? (
        <ListCard>
          {bills.map((b, i) => {
            const tier = billTier(b);
            return (
              <ListRow
                key={`${b.name}-${i}`}
                icon={<CategoryIcon category={b.category} />}
                title={b.name}
                subtitle={`${formatAmount(b.amount, glyph)} ${FREQ[b.frequency]}${b.frequency !== 'monthly' ? ` · about ${formatAmount(b.monthlyAmount, glyph)} a month` : ''}`}
                right={<Chip tone={TIER_TONE[tier]} label={TIER_LABEL[tier]} />}
                onPress={() => nav.navigate('Recurring')}
                chevron
              />
            );
          })}
        </ListCard>
      ) : (
        <Text style={[type.small, { color: theme.colors.textMuted }]}>No regular bills yet. Add rent, school fees or subscriptions in Recurring & bills.</Text>
      )}
      {short ? (
        <InfoTip
          style={{ marginTop: 10 }}
          text="While bills are bigger than income, we hold back ‘you’re overspending’ nudges, because the budget was never coverable. Your plan still only counts money you actually have."
        >
          Why you won’t get overspending nudges right now
        </InfoTip>
      ) : null}

      <Modal transparent visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={() => setEditing(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {editing ? (
                  <IncomeEditor value={editing.draft} glyph={glyph} title={editing.id ? 'Edit income' : 'New income'} onChange={(draft) => setEditing({ ...editing, draft })} />
                ) : null}
                {!editing?.id && short ? (
                  <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 12 }]}>
                    Not sure of the amount? Pick “Varies” and add a safe guess of what usually comes in. You can change it any time.
                  </Text>
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
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20 }
});
