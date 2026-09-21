import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CalendarClock, Pencil, PiggyBank, Plus, Repeat, Trash2 } from '../icons';

import { deleteGoal, deleteGoalInSpace, getGoal, getGoalInSpace, patchGoal, patchGoalInSpace, type ApiGoal } from '../api/endpoints';
import { addMoneyToGoal } from '../api/business';
import {
  Amount,
  Card,
  Chip,
  HeroCard,
  IconButton,
  IconTile,
  InlineError,
  PrimaryButton,
  ProgressBar,
  Screen,
  ScreenHeader,
  SecondaryButton,
  SectionHeader,
  TextField,
  formatAmount
} from '../components/Common/ui';
import { MoneyField, Sheet, parseMoney } from '../components/Business/parts';
import { PendingSavingsCard } from '../components/Home/PendingSavingsCard';
import { useToast } from '../components/Common/Toast';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { haptic } from '../lib/haptics';
import { pickQuote } from '../lib/quotes';
import { QuoteLine } from '../components/Common/QuoteLine';
import { GuideAnchor } from '../components/Common/GuideAnchor';
import { useSpace } from '../contexts/SpaceContext';
import { currencySymbol, formatNumberInput, formatShortDate } from '../utils/format';
import { type as typo } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';

const AUTO_SAVE_OPTIONS = [5, 10, 15, 20, 30];

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export default function GoalDetailScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const toast = useToast();
  const glyph = currencySymbol(user?.currency);
  const inkText = theme.colors.inkText;

  const goalId = String(route.params?.goalId ?? '');
  const initialGoal = (route.params?.goal ?? null) as ApiGoal | null;

  const [goal, setGoal] = useState<ApiGoal | null>(initialGoal);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftEmoji, setDraftEmoji] = useState('');
  const [draftCategory, setDraftCategory] = useState('');
  const [draftTargetAmount, setDraftTargetAmount] = useState('');
  const [draftCurrentAmount, setDraftCurrentAmount] = useState('');
  const [draftTargetDate, setDraftTargetDate] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [recordInBudget, setRecordInBudget] = useState(true);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!goalId) {
      setError('Missing goal id');
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const g = spacesEnabled ? await getGoalInSpace(goalId, activeSpaceId) : await getGoal(goalId);
      setGoal(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load goal');
    } finally {
      setIsLoading(false);
    }
  }, [activeSpaceId, goalId, spacesEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveAutoSave = async (percent: number | null) => {
    if (!goal || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = spacesEnabled
        ? await patchGoalInSpace(goal.id, { autoSavePercent: percent }, activeSpaceId)
        : await patchGoal(goal.id, { autoSavePercent: percent });
      setGoal(updated);
      toast.show(percent ? `We go remind you to move ${percent}% of each income to ${goal.name} 🔔` : 'Auto-save reminder turned off', 'success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update auto-save');
    } finally {
      setIsSaving(false);
    }
  };

  const beginEdit = useCallback(() => {
    if (!goal) return;
    setDraftName(goal.name ?? '');
    setDraftEmoji(String(goal.emoji ?? ''));
    setDraftCategory(String(goal.category ?? ''));
    setDraftTargetAmount(formatNumberInput(String(goal.targetAmount ?? 0)));
    setDraftCurrentAmount(formatNumberInput(String(goal.currentAmount ?? 0)));
    setDraftTargetDate(String(goal.targetDate ?? ''));
    setEditError(null);
    setIsEditing(true);
  }, [goal]);

  const saveEdits = useCallback(async () => {
    if (!goal || isSaving) return;
    setEditError(null);

    const name = draftName.trim();
    if (!name) {
      setEditError('Name is required');
      return;
    }

    const targetAmount = Number(String(draftTargetAmount).replace(/,/g, ''));
    const currentAmount = Number(String(draftCurrentAmount).replace(/,/g, ''));
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      setEditError('Target amount must be a positive number');
      return;
    }
    if (!Number.isFinite(currentAmount) || currentAmount < 0) {
      setEditError('Current amount must be 0 or more');
      return;
    }

    const targetDate = draftTargetDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      setEditError('Target date must be YYYY-MM-DD');
      return;
    }

    const patch = {
      name,
      targetAmount,
      currentAmount,
      targetDate,
      emoji: draftEmoji.trim() || undefined,
      category: draftCategory.trim() || undefined
    };

    setIsSaving(true);
    try {
      const updated = spacesEnabled ? await patchGoalInSpace(goal.id, patch, activeSpaceId) : await patchGoal(goal.id, patch);
      setGoal(updated);
      setIsEditing(false);
      toast.show('Goal updated ✅', 'success');
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Failed to save goal');
    } finally {
      setIsSaving(false);
    }
  }, [activeSpaceId, draftCategory, draftCurrentAmount, draftEmoji, draftName, draftTargetAmount, draftTargetDate, goal, isSaving, spacesEnabled, toast]);

  const openAddMoney = () => {
    setAddAmount('');
    setRecordInBudget(true);
    setAddError(null);
    setIsAdding(true);
  };

  const addMoney = async () => {
    if (!goal || isSaving) return;
    const amount = parseMoney(addAmount);
    if (amount <= 0) {
      setAddError('Enter an amount greater than zero');
      return;
    }
    setAddError(null);
    setIsSaving(true);
    try {
      const result = await addMoneyToGoal(goal.id, { amount, recordInBudget });
      setGoal((current) => (current ? { ...current, currentAmount: result.goal.currentAmount } : current));
      setIsAdding(false);
      // Celebrate the moments that matter: finishing, and passing halfway.
      const before = goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0;
      const after = goal.targetAmount > 0 ? result.goal.currentAmount / goal.targetAmount : 0;
      const firstName = (user?.name ?? '').trim().split(/\s+/)[0];
      if ((before < 1 && after >= 1) || (before < 0.5 && after >= 0.5)) haptic.success();
      toast.show(
        before < 1 && after >= 1
          ? `Goal reached 🎉 ${goal.name} is fully funded. You did it${firstName ? `, ${firstName}` : ''}!`
          : before < 0.5 && after >= 0.5
            ? `Halfway to ${goal.name} 🔥 ${formatAmount(Math.max(0, goal.targetAmount - result.goal.currentAmount), glyph)} to go.`
            : recordInBudget
              ? `${formatAmount(result.amount, glyph)} added to ${goal.name} and counted under Savings 🌱`
              : `${formatAmount(result.amount, glyph)} added to ${goal.name} 💪`,
        'success',
        4000
      );
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Could not add money to this goal');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = useCallback(() => {
    if (!goal) return;
    Alert.alert('Delete this goal?', 'Your progress on it goes too. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (spacesEnabled) await deleteGoalInSpace(goal.id, activeSpaceId);
            else await deleteGoal(goal.id);
            toast.show('Goal deleted');
            goBackOrHome(nav);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to delete goal');
          }
        }
      }
    ]);
  }, [activeSpaceId, goal, nav, spacesEnabled, toast]);

  const progress = useMemo(() => {
    if (!goal || goal.targetAmount <= 0) return 0;
    return clamp01(goal.currentAmount / goal.targetAmount);
  }, [goal?.currentAmount, goal?.targetAmount]);

  const remaining = useMemo(() => {
    if (!goal) return 0;
    return Math.max(0, goal.targetAmount - goal.currentAmount);
  }, [goal?.targetAmount, goal?.currentAmount]);

  const daysRemaining = useMemo(() => {
    if (!goal) return null;
    const d = Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (!Number.isFinite(d)) return null;
    return d;
  }, [goal?.targetDate]);

  /** What to put away each month to land on the target date; the whole remainder once the date has passed. */
  const perMonth = useMemo(() => {
    if (remaining <= 0 || daysRemaining == null) return null;
    const months = Math.max(1, Math.ceil(daysRemaining / 30.44));
    return Math.ceil(remaining / months);
  }, [daysRemaining, remaining]);

  const done = progress >= 1;
  const title = goal ? `${goal.emoji ? `${goal.emoji} ` : ''}${goal.name}` : 'Goal';

  const headerActions = goal ? (
    <View style={styles.row}>
      <IconButton accessibilityLabel="Edit goal" onPress={beginEdit}>
        <Pencil color={theme.colors.text} size={17} />
      </IconButton>
      <IconButton accessibilityLabel="Delete goal" onPress={confirmDelete}>
        <Trash2 color={theme.colors.error} size={17} />
      </IconButton>
    </View>
  ) : null;

  return (
    <Screen bottomInset={48} onRefresh={load} refreshing={isLoading}>
      <ScreenHeader title={title} subtitle={goal?.category ? String(goal.category) : undefined} onBack={() => goBackOrHome(nav)} right={headerActions} />

      {error ? <InlineError message={error} /> : null}
      {!goal && isLoading ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} /> : null}

      {goal ? (
        <>
          <HeroCard style={{ marginTop: 8 }}>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <View style={styles.row}>
                <PiggyBank color="#E2B65C" size={16} />
                <Text style={[typo.eyebrow, { color: inkText, opacity: 0.72 }]}>Saved so far</Text>
              </View>
              <Chip tone="onInk" label={`${Math.round(progress * 100)}%`} />
            </View>
            <Amount value={goal.currentAmount} currency={glyph} size="hero" color={inkText} style={{ marginTop: 8 }} />
            <Text style={[typo.small, { color: inkText, opacity: 0.78 }]}>of {formatAmount(goal.targetAmount, glyph)} target</Text>

            <View style={{ marginTop: 14 }}>
              <ProgressBar value={progress} height={8} color="#E2B65C" trackColor="rgba(255,255,255,0.14)" />
            </View>

            <View style={[styles.row, { marginTop: 14, alignItems: 'flex-start' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[typo.caption, { color: inkText, opacity: 0.7 }]}>{done ? 'Target' : 'Still to go'}</Text>
                <Text style={[typo.bodyStrong, { color: inkText, marginTop: 2 }]}>{formatAmount(done ? goal.targetAmount : remaining, glyph)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typo.caption, { color: inkText, opacity: 0.7 }]}>{perMonth != null && daysRemaining != null && daysRemaining > 0 ? 'Needed per month' : 'Target date'}</Text>
                <Text style={[typo.bodyStrong, { color: inkText, marginTop: 2 }]}>
                  {perMonth != null && daysRemaining != null && daysRemaining > 0 ? formatAmount(perMonth, glyph) : formatShortDate(goal.targetDate)}
                </Text>
              </View>
            </View>

            <Text style={[typo.caption, { color: inkText, opacity: 0.7, marginTop: 12 }]}>
              {done
                ? 'You hit your target 🎉 E choke!'
                : daysRemaining == null
                  ? 'Keep adding a little at a time. It adds up.'
                  : daysRemaining > 0
                    ? `${formatShortDate(goal.targetDate)} · ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left. You can do this 💪`
                    : `The target date (${formatShortDate(goal.targetDate)}) has passed. Tap the pencil to pick a new one.`}
            </Text>
          </HeroCard>

          {done ? <QuoteLine quote={pickQuote(['saving', 'patience'], goal.id)} style={{ marginTop: 16 }} /> : null}

          {!done ? (
            <GuideAnchor id="goaldetail.add">
              <PrimaryButton title="Add money" onPress={openAddMoney} iconLeft={<Plus color={theme.colors.onPrimary} size={18} />} style={{ marginTop: 14 }} />
            </GuideAnchor>
          ) : null}

          <PendingSavingsCard goalId={goal.id} onAnswered={load} />

          <SectionHeader
            title="Auto-save reminder"
            info="This is only a reminder: nothing moves automatically. When you record income we ask if you moved the money, and it counts once you say “I moved it”. BudgetFriendly never debits your account. What you record grows this goal and counts under Savings in your budget."
          />
          <Card>
            <GuideAnchor id="goaldetail.autosave" style={styles.row}>
              <IconTile bg={theme.colors.brassSoft} size={38}>
                <Repeat color={theme.colors.brass} size={18} />
              </IconTile>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[typo.bodyStrong, { color: theme.colors.text }]}>Remind me when income lands</Text>
                <Text style={[typo.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                  {goal.autoSavePercent ? `We’ll suggest ${goal.autoSavePercent}% of every income you record` : 'Get a nudge to move a share of each income here'}
                </Text>
              </View>
              <Switch
                value={!!goal.autoSavePercent}
                disabled={isSaving || done}
                onValueChange={(v) => void saveAutoSave(v ? 10 : null)}
                trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                thumbColor="#FFFFFF"
              />
            </GuideAnchor>
            {goal.autoSavePercent ? (
              <View style={styles.chips}>
                {AUTO_SAVE_OPTIONS.map((p) => {
                  const selected = goal.autoSavePercent === p;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => void saveAutoSave(p)}
                      disabled={isSaving}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={[styles.percent, { backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceAlt }]}
                    >
                      <Text style={[typo.smallStrong, { color: selected ? theme.colors.onPrimary : theme.colors.text }]}>{p}%</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </Card>
        </>
      ) : null}

      <Sheet visible={isAdding} onClose={() => setIsAdding(false)} title="Add money" subtitle={goal ? `Toward ${goal.name}` : undefined}>
        {addError ? <InlineError message={addError} /> : null}
        <MoneyField label="How much did you move?" value={addAmount} onChange={setAddAmount} glyph={glyph} autoFocus hint="Move it to your savings account first. We only record it." />
        <View style={[styles.row, { marginBottom: 16 }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[typo.bodyStrong, { color: theme.colors.text }]}>Record in my Savings budget</Text>
            <Text style={[typo.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
              {recordInBudget ? 'Also adds a Savings entry to this month’s budget.' : 'Only the goal grows. Use this if you already logged it as a transaction.'}
            </Text>
          </View>
          <Switch value={recordInBudget} onValueChange={setRecordInBudget} trackColor={{ true: theme.colors.primary, false: theme.colors.border }} thumbColor="#FFFFFF" />
        </View>
        <PrimaryButton title="Add to goal" onPress={addMoney} loading={isSaving} />
      </Sheet>

      <Sheet visible={isEditing} onClose={() => setIsEditing(false)} title="Edit goal">
        {editError ? <InlineError message={editError} /> : null}
        <TextField label="Name" value={draftName} onChangeText={setDraftName} placeholder="e.g., Emergency fund" />
        <TextField label="Emoji (optional)" value={draftEmoji} onChangeText={setDraftEmoji} placeholder="e.g., 🏦" />
        <TextField label="Category (optional)" value={draftCategory} onChangeText={setDraftCategory} placeholder="e.g., Savings" />
        <MoneyField label="Target amount" value={draftTargetAmount} onChange={setDraftTargetAmount} glyph={glyph} />
        <MoneyField label="Saved so far" value={draftCurrentAmount} onChange={setDraftCurrentAmount} glyph={glyph} hint="Fixing a mistake? Changing this does not touch your budget." />
        <TextField label="Target date (YYYY-MM-DD)" value={draftTargetDate} onChangeText={setDraftTargetDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        <View style={[styles.row, { marginTop: 4 }]}>
          <View style={{ flex: 1 }}>
            <SecondaryButton title="Cancel" onPress={() => setIsEditing(false)} disabled={isSaving} />
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton title="Save" onPress={saveEdits} loading={isSaving} />
          </View>
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  percent: { paddingHorizontal: 14, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }
});
