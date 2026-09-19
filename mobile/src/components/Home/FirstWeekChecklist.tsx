import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Check, ChevronRight, X } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Card, ProgressBar } from '../Common/ui';
import { listGoals } from '../../api/endpoints';
import { getDailyReminder } from '../../lib/notifications';
import { type } from '../../theme/typography';

/** "Your first week": the handful of steps that make budgeting stick, ticked off as they happen. */
export function FirstWeekChecklist({ hasTransactions, hasBudget, loading }: { hasTransactions: boolean; hasBudget: boolean; loading: boolean }) {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const storageKey = user ? `bf_first_week_hidden_v1:${user.id}` : null;
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [hasGoal, setHasGoal] = useState(false);
  const [hasReminder, setHasReminder] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    AsyncStorage.getItem(storageKey)
      .then((v) => setHidden(v === '1'))
      .catch(() => setHidden(false));
  }, [storageKey]);

  useFocusEffect(
    useCallback(() => {
      listGoals()
        .then((g) => setHasGoal(g.length > 0))
        .catch(() => undefined);
      getDailyReminder()
        .then((r) => setHasReminder(!!r))
        .catch(() => undefined);
    }, [])
  );

  const steps = [
    { key: 'plan', title: 'Make your plan', body: 'Income, bills and a simple split', done: !!user?.onboarding?.completedAt, go: () => nav.navigate('SetupPlan', { fromHome: true }) },
    { key: 'log', title: 'Log what you spent today', body: 'Or paste a bank alert', done: hasTransactions, go: () => nav.navigate('AddTransaction') },
    { key: 'budget', title: 'Set your first budget', body: 'See what’s safe to spend each day', done: hasBudget, go: () => nav.navigate('Budget', { startNew: true }) },
    { key: 'goal', title: 'Start a savings goal', body: 'Even a small emergency fund helps', done: hasGoal, go: () => nav.navigate('CreateGoal') },
    { key: 'reminder', title: 'Turn on a daily reminder', body: 'Two minutes a day is enough', done: hasReminder, go: () => nav.navigate('Settings') }
  ];
  const done = steps.filter((s) => s.done).length;

  if (loading || hidden !== false || done === steps.length) return null;

  const hide = () => {
    setHidden(true);
    if (storageKey) AsyncStorage.setItem(storageKey, '1').catch(() => undefined);
  };

  return (
    <Card style={{ marginTop: 14 }}>
      <View style={styles.rowBetween}>
        <View>
          <Text style={[type.title, { color: theme.colors.text }]}>Your first week</Text>
          <Text style={[type.caption, { color: theme.colors.textMuted }]}>
            {done} of {steps.length} done
          </Text>
        </View>
        <Pressable onPress={hide} hitSlop={10} accessibilityRole="button" accessibilityLabel="Hide this checklist">
          <X color={theme.colors.textMuted} size={18} />
        </Pressable>
      </View>
      <View style={{ marginTop: 10, marginBottom: 4 }}>
        <ProgressBar value={done / steps.length} />
      </View>
      {steps.map((s) => (
        <Pressable
          key={s.key}
          onPress={s.done ? undefined : s.go}
          disabled={s.done}
          accessibilityRole="button"
          accessibilityState={{ checked: s.done, disabled: s.done }}
          style={({ pressed }) => [styles.step, { opacity: pressed ? 0.7 : 1 }]}
        >
          <View style={[styles.tick, { borderColor: s.done ? theme.colors.success : theme.colors.border, backgroundColor: s.done ? theme.colors.success : 'transparent' }]}>
            {s.done ? <Check color="#FFFFFF" size={13} strokeWidth={3} /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: s.done ? theme.colors.textMuted : theme.colors.text, textDecorationLine: s.done ? 'line-through' : 'none' }]}>{s.title}</Text>
            {!s.done ? <Text style={[type.caption, { color: theme.colors.textMuted }]}>{s.body}</Text> : null}
          </View>
          {!s.done ? <ChevronRight color={theme.colors.textMuted} size={17} /> : null}
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  tick: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' }
});
