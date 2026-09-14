import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Switch, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft, Pencil } from 'lucide-react-native';

import { deleteGoal, deleteGoalInSpace, getGoal, getGoalInSpace, patchGoal, patchGoalInSpace, type ApiGoal } from '../api/endpoints';
import { Screen, Card, InlineError, PrimaryButton, SecondaryButton, TextField } from '../components/Common/ui';
import { useToast } from '../components/Common/Toast';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useSpace } from '../contexts/SpaceContext';
import { formatMoney, formatNumberInput } from '../utils/format';
import { tokens } from '../theme/tokens';
import { type as typo } from '../theme/typography';

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export default function GoalDetailScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const toast = useToast();

  const goalId = String(route.params?.goalId ?? '');
  const initialGoal = (route.params?.goal ?? null) as ApiGoal | null;

  const [goal, setGoal] = useState<ApiGoal | null>(initialGoal);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftName, setDraftName] = useState('');
  const [draftEmoji, setDraftEmoji] = useState('');
  const [draftCategory, setDraftCategory] = useState('');
  const [draftTargetAmount, setDraftTargetAmount] = useState('');
  const [draftCurrentAmount, setDraftCurrentAmount] = useState('');
  const [draftTargetDate, setDraftTargetDate] = useState('');

  const currency = user?.currency ?? '₦';

  const saveAutoSave = async (percent: number | null) => {
    if (!goal || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = spacesEnabled
        ? await patchGoalInSpace(goal.id, { autoSavePercent: percent }, activeSpaceId)
        : await patchGoal(goal.id, { autoSavePercent: percent });
      setGoal(updated);
      toast.show(percent ? `${percent}% of each income will go toward ${goal.name}` : 'Auto-save turned off', 'success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update auto-save');
    } finally {
      setIsSaving(false);
    }
  };

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

  const beginEdit = useCallback(() => {
    if (!goal) return;
    setDraftName(goal.name ?? '');
    setDraftEmoji(String(goal.emoji ?? ''));
    setDraftCategory(String(goal.category ?? ''));
    setDraftTargetAmount(String(goal.targetAmount ?? 0));
    setDraftCurrentAmount(String(goal.currentAmount ?? 0));
    setDraftTargetDate(String(goal.targetDate ?? ''));
    setIsEditing(true);
  }, [goal]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setError(null);
  }, []);

  const saveEdits = useCallback(async () => {
    if (!goal || isSaving) return;
    setError(null);

    const name = draftName.trim();
    if (!name) {
      setError('Name is required');
      return;
    }

    const targetAmount = Number(String(draftTargetAmount).replace(/,/g, ''));
    const currentAmount = Number(String(draftCurrentAmount).replace(/,/g, ''));
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      setError('Target amount must be a positive number');
      return;
    }
    if (!Number.isFinite(currentAmount) || currentAmount < 0) {
      setError('Current amount must be 0 or more');
      return;
    }

    const targetDate = draftTargetDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      setError('Target date must be YYYY-MM-DD');
      return;
    }

    setIsSaving(true);
    try {
      const updated = spacesEnabled
        ? await patchGoalInSpace(
            goal.id,
            {
              name,
              targetAmount,
              currentAmount,
              targetDate,
              emoji: draftEmoji.trim() || undefined,
              category: draftCategory.trim() || undefined
            },
            activeSpaceId
          )
        : await patchGoal(goal.id, {
            name,
            targetAmount,
            currentAmount,
            targetDate,
            emoji: draftEmoji.trim() || undefined,
            category: draftCategory.trim() || undefined
          });
      setGoal(updated);
      setIsEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save goal');
    } finally {
      setIsSaving(false);
    }
  }, [activeSpaceId, draftCategory, draftCurrentAmount, draftEmoji, draftName, draftTargetAmount, draftTargetDate, goal, isSaving, spacesEnabled]);

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

  const bumpProgress = async () => {
    if (!goal || isSaving) return;
    setError(null);
    setIsSaving(true);
    try {
      const bump = Math.max(1, Math.round(goal.targetAmount * 0.05));
      const next = Math.min(goal.targetAmount, (goal.currentAmount ?? 0) + bump);
      const updated = spacesEnabled
        ? await patchGoalInSpace(goal.id, { currentAmount: next }, activeSpaceId)
        : await patchGoal(goal.id, { currentAmount: next });
      setGoal(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update goal');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = useCallback(() => {
    if (!goal) return;
    Alert.alert('Delete goal?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (spacesEnabled) await deleteGoalInSpace(goal.id, activeSpaceId);
            else await deleteGoal(goal.id);
            toast.show('Goal deleted');
            nav.goBack();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to delete goal');
          }
        }
      }
    ]);
  }, [activeSpaceId, goal, nav, spacesEnabled, toast]);

  return (
    <Screen onRefresh={load} refreshing={isLoading || isSaving}>
      <Pressable
        onPress={() => nav.goBack()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.8 : 1 })}
      >
        <ChevronLeft color={theme.colors.text} size={20} />
        <Text style={{ color: theme.colors.text, fontFamily: 'Figtree_700Bold', marginLeft: 6 }}>Back</Text>
      </Pressable>

      <View style={{ marginTop: 12 }}>
        {error ? <InlineError message={error} /> : null}
        {isLoading ? <ActivityIndicator color={theme.colors.primary} /> : null}
      </View>

      {goal ? (
        <View style={{ marginTop: 10 }}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <View style={{ padding: 14, backgroundColor: theme.colors.surface }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.textMuted, fontFamily: 'Figtree_600SemiBold', fontSize: 12 }}>
                    Goal
                  </Text>
                  <Text style={{ color: theme.colors.text, fontFamily: 'Figtree_700Bold', fontSize: 20, marginTop: 6 }} numberOfLines={2}>
                    {goal.emoji ? `${goal.emoji} ` : ''}{goal.name}
                  </Text>
                  <Text style={{ color: theme.colors.textMuted, marginTop: 6 }}>
                    Target date: {formatDate(goal.targetDate)}
                    {daysRemaining !== null ? ` • ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left` : ''}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Pressable
                    onPress={() => (isEditing ? cancelEdit() : beginEdit())}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                      <Pencil color={theme.colors.textMuted} size={18} />
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={confirmDelete}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                  >
                    <View
                      style={{
                        paddingHorizontal: 12,
                        height: 44,
                        borderRadius: 14,
                        backgroundColor: theme.colors.surfaceAlt,
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Text style={{ color: theme.colors.error, fontFamily: 'Figtree_700Bold' }}>Delete</Text>
                    </View>
                  </Pressable>
                </View>
              </View>

              {isEditing ? (
                <View style={{ marginTop: 14 }}>
                  <TextField label="Name" value={draftName} onChangeText={setDraftName} placeholder="e.g., Emergency fund" />
                  <TextField label="Emoji (optional)" value={draftEmoji} onChangeText={setDraftEmoji} placeholder="e.g., 🏦" />
                  <TextField label="Category (optional)" value={draftCategory} onChangeText={setDraftCategory} placeholder="e.g., Savings" />
                  <TextField
                    label={`Target amount${currency ? ` (${currency})` : ''}`}
                    value={draftTargetAmount}
                    onChangeText={(v) => setDraftTargetAmount(formatNumberInput(v))}
                    placeholder="0"
                    keyboardType="decimal-pad"
                  />
                  <TextField
                    label={`Current amount${currency ? ` (${currency})` : ''}`}
                    value={draftCurrentAmount}
                    onChangeText={(v) => setDraftCurrentAmount(formatNumberInput(v))}
                    placeholder="0"
                    keyboardType="decimal-pad"
                  />
                  <TextField
                    label="Target date (YYYY-MM-DD)"
                    value={draftTargetDate}
                    onChangeText={setDraftTargetDate}
                    placeholder="YYYY-MM-DD"
                  />

                  <View style={{ marginTop: 12, flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <SecondaryButton title="Cancel" onPress={cancelEdit} disabled={isSaving} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <PrimaryButton title={isSaving ? 'Saving…' : 'Save changes'} onPress={saveEdits} disabled={isSaving} />
                    </View>
                  </View>
                </View>
              ) : null}

              <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: theme.colors.textMuted, fontFamily: 'Figtree_600SemiBold' }}>Progress</Text>
                <Text style={{ color: theme.colors.text, fontFamily: 'Figtree_700Bold' }}>{Math.round(progress * 100)}%</Text>
              </View>

              <View style={{ height: 10, backgroundColor: theme.colors.surfaceAlt, borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
                <View
                  style={{
                    height: '100%',
                    width: `${Math.round(progress * 100)}%`,
                    backgroundColor: theme.colors.primary
                  }}
                />
              </View>

              <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.textMuted, fontFamily: 'Figtree_600SemiBold', fontSize: 12 }}>Saved</Text>
                  <Text style={{ color: theme.colors.text, fontFamily: 'Figtree_700Bold', marginTop: 4 }}>
                    {formatMoney(goal.currentAmount, currency)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.textMuted, fontFamily: 'Figtree_600SemiBold', fontSize: 12 }}>Remaining</Text>
                  <Text style={{ color: theme.colors.text, fontFamily: 'Figtree_700Bold', marginTop: 4 }}>
                    {formatMoney(remaining, currency)}
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 16, padding: 14, borderRadius: 16, backgroundColor: theme.colors.surfaceAlt }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[typo.bodyStrong, { color: theme.colors.text }]}>Auto-save from income</Text>
                    <Text style={[typo.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                      {goal.autoSavePercent
                        ? `${goal.autoSavePercent}% of every income you record goes toward this goal`
                        : 'Put a share of every income toward this goal automatically'}
                    </Text>
                  </View>
                  <Switch
                    value={!!goal.autoSavePercent}
                    disabled={isSaving || progress >= 1}
                    onValueChange={(v) => void saveAutoSave(v ? 10 : null)}
                    trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                    thumbColor="#FFFFFF"
                  />
                </View>
                {goal.autoSavePercent ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    {[5, 10, 15, 20, 30].map((p) => {
                      const selected = goal.autoSavePercent === p;
                      return (
                        <Pressable
                          key={p}
                          onPress={() => void saveAutoSave(p)}
                          disabled={isSaving}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          style={{ paddingHorizontal: 14, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? theme.colors.primary : theme.colors.surface }}
                        >
                          <Text style={[typo.smallStrong, { color: selected ? theme.colors.onPrimary : theme.colors.text }]}>{p}%</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
                <Text style={[typo.caption, { color: theme.colors.textMuted, marginTop: 10 }]}>
                  This tracks progress in BudgetFriendly. Move the money into your savings account yourself.
                </Text>
              </View>

              {progress >= 1 ? (
                <View style={{ marginTop: 10, padding: 10, borderRadius: 14, backgroundColor: tokens.colors.success[50] }}>
                  <Text style={{ color: tokens.colors.success[700], fontFamily: 'Figtree_700Bold' }}>Goal completed</Text>
                  <Text style={{ color: tokens.colors.success[700], marginTop: 4 }}>
                    Nice work — you hit your target.
                  </Text>
                </View>
              ) : null}
            </View>
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}
