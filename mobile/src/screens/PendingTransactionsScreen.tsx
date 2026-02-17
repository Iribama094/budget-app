import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, type TextStyle, type ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';

import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { Screen, Card, H1, P, PrimaryButton, SecondaryButton } from '../components/Common/ui';
import {
  listImportedTransactions,
  reconcileImportedTransaction,
  reconcileImportedTransactionInSpace,
  ignoreImportedTransaction,
  ignoreImportedTransactionInSpace,
  listBudgets,
  listGoals,
  listMiniBudgets,
  listMiniBudgetsInSpace,
  patchGoal,
  patchGoalInSpace,
  type ApiBudget,
  type ApiGoal,
  type ApiImportedTransaction,
  type ApiMiniBudget
} from '../api/endpoints';
import { formatMoney } from '../utils/format';
import { tokens } from '../theme/tokens';
import { useSpace } from '../contexts/SpaceContext';

function directionLabel(direction: 'debit' | 'credit') {
  return direction === 'debit' ? 'Expense (debit)' : 'Income (credit)';
}

function suggestedCategory(tx: ApiImportedTransaction): string {
  const base = `${tx.merchant || ''} ${tx.description || ''}`.toLowerCase();

  if (tx.direction === 'debit') {
    if (/mart|supermarket|grocer|shoprite|market/.test(base)) return 'Groceries';
    if (/uber|bolt|taxi|ride|transport|bus|fuel|gas|petrol/.test(base)) return 'Transport';
    if (/netflix|spotify|dstv|gotv|subscription|subs/.test(base)) return 'Subscriptions';
    if (/airtime|data|mtn|airtel|glo|9mobile/.test(base)) return 'Airtime & data';
    if (/restaurant|food|eatery|kfc|chicken republic|pizza/.test(base)) return 'Eating out';
    return 'General spending';
  }

  if (/salary|payroll|wage|employer/.test(base)) return 'Salary';
  if (/interest|refund|reversal|cashback/.test(base)) return 'Other income';
  return 'Income';
}

const PERSONAL_EXPENSE_CATEGORIES = ['Food', 'Transport', 'Housing', 'Bills', 'Shopping', 'Health', 'Entertainment', 'Other'] as const;
const PERSONAL_INCOME_CATEGORIES = ['Salary', 'Bonus', 'Gift', 'Interest', 'Other'] as const;

const BUSINESS_EXPENSE_CATEGORIES = [
  'Payroll',
  'Rent',
  'Utilities',
  'Office Supplies',
  'Software & Subscriptions',
  'Marketing',
  'Travel',
  'Professional Services',
  'Taxes & Fees',
  'Equipment',
  'Shipping',
  'Other'
] as const;
const BUSINESS_INCOME_CATEGORIES = ['Client Payment', 'Sales', 'Service Revenue', 'Interest', 'Other'] as const;

const BUCKETS = ['Essential', 'Free Spending', 'Savings', 'Investments', 'Miscellaneous', 'Debt Financing'] as const;

type PendingStep = 1 | 2 | 3 | 4 | 5 | 6;

type PendingDraft = {
  category: string;
  budgetId: string | null;
  budgetCategory: (typeof BUCKETS)[number];
  miniBudgetId: string | null;
  goalId: string | null;
  step: PendingStep;
};

const PENDING_TIP_KEY = 'bf_tip_pending_reconcile_v1_seen';

function pillStyle(theme: any, selected?: boolean) {
  return {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: selected ? theme.colors.surfaceAlt : theme.colors.surface,
    borderWidth: 1,
    borderColor: selected ? theme.colors.primary : theme.colors.border
  } satisfies ViewStyle;
}

function pillTextStyle(theme: any, selected?: boolean) {
  return {
    color: selected ? theme.colors.text : theme.colors.textMuted,
    fontWeight: selected ? '900' : '700',
    fontSize: 12
  } satisfies TextStyle;
}

export default function PendingTransactionsScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const toast = useToast();
  const { spacesEnabled, activeSpaceId, activeSpace } = useSpace();

  const [items, setItems] = useState<ApiImportedTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [reconciledThisWeek, setReconciledThisWeek] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [budgets, setBudgets] = useState<ApiBudget[]>([]);
  const [currentBudget, setCurrentBudget] = useState<ApiBudget | null>(null);
  const [miniBudgetsByBudget, setMiniBudgetsByBudget] = useState<Record<string, ApiMiniBudget[]>>({});
  const [drafts, setDrafts] = useState<Record<string, PendingDraft>>({});

  const [goals, setGoals] = useState<ApiGoal[]>([]);

  const [showTip, setShowTip] = useState(false);

  const isBusiness = spacesEnabled && activeSpaceId === 'business';
  const bucketLabel = useCallback(
    (key: string) => {
      if (!isBusiness) return key;
      if (key === 'Essential') return 'Operating Costs';
      if (key === 'Savings') return 'Reserves';
      if (key === 'Free Spending') return 'Discretionary';
      if (key === 'Investments') return 'Growth';
      if (key === 'Miscellaneous') return 'Misc Ops';
      if (key === 'Debt Financing') return 'Loans & Credit';
      return key;
    },
    [isBusiness]
  );

  const parseIsoDateLocal = (value?: string | null) => {
    if (!value) return null;
    const raw = String(value);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
    if (Number.isNaN(d.getTime())) {
      const fallback = new Date(raw);
      if (Number.isNaN(fallback.getTime())) return null;
      return fallback;
    }
    return d;
  };

  const budgetEffectiveEndIso = useCallback(
    (b: ApiBudget): string => {
      if (b.endDate) return b.endDate;
      const start = parseIsoDateLocal(b.startDate);
      if (!start) return new Date().toISOString().slice(0, 10);

      const d = new Date(start);
      if (b.period === 'weekly') {
        d.setDate(d.getDate() + 6);
      } else {
        d.setMonth(d.getMonth() + 1);
        d.setDate(0);
      }
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    },
    []
  );

  const isBudgetCurrent = useCallback(
    (b: ApiBudget) => {
      const start = parseIsoDateLocal(b.startDate);
      if (!start) return false;
      const end = parseIsoDateLocal(budgetEffectiveEndIso(b));
      if (!end) return false;

      const nowLocal = new Date();
      const today = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 12, 0, 0, 0);
      return today >= start && today <= end;
    },
    [budgetEffectiveEndIso]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pendingRes, reconciledRes, budgetsRes, goalsRes] = await Promise.all([
        listImportedTransactions('pending', spacesEnabled ? { spaceId: activeSpaceId } : undefined),
        listImportedTransactions('reconciled', spacesEnabled ? { spaceId: activeSpaceId } : undefined)
        ,
        listBudgets(spacesEnabled ? { spaceId: activeSpaceId } : undefined).catch(() => ({ items: [] })),
        listGoals(spacesEnabled ? { spaceId: activeSpaceId } : undefined).catch(() => [])
      ]);
      setItems(pendingRes.items || []);

      const rawBudgets = (budgetsRes?.items ?? []) as ApiBudget[];
      const b = spacesEnabled
        ? rawBudgets.filter((bb) => ((bb.spaceId ?? 'personal') as 'personal' | 'business') === activeSpaceId)
        : rawBudgets;
      setBudgets(b);
      const picked = b.find((x) => isBudgetCurrent(x)) ?? b[0] ?? null;
      setCurrentBudget(picked);

      setGoals((goalsRes || []) as ApiGoal[]);

      const now = Date.now();
      const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
      const count = (reconciledRes.items || []).filter((t) => {
        if (!t.reconciledAt) return false;
        const ts = Date.parse(t.reconciledAt);
        return Number.isFinite(ts) && ts >= weekAgo && ts <= now;
      }).length;
      setReconciledThisWeek(count);

      // One-time tip for the new step-by-step flow.
      try {
        const seen = await SecureStore.getItemAsync(PENDING_TIP_KEY);
        if (seen !== '1') setShowTip(true);
      } catch {
        // ignore
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load pending transactions';
      toast.show(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeSpaceId, spacesEnabled, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Ensure we have a draft per pending item.
    setDrafts((prev) => {
      const next = { ...prev };
      for (const tx of items) {
        if (next[tx.id]) continue;
        next[tx.id] = {
          category: suggestedCategory(tx),
          budgetId: null,
          budgetCategory: 'Essential',
          miniBudgetId: null,
          goalId: null,
          step: 1
        };
      }
      return next;
    });
  }, [items]);

  const loadMiniBudgetsForBudget = useCallback(
    async (budgetId: string) => {
      if (!budgetId) return;
      if (miniBudgetsByBudget[budgetId]) return;
      try {
        const res = spacesEnabled ? await listMiniBudgetsInSpace(budgetId, activeSpaceId) : await listMiniBudgets(budgetId);
        setMiniBudgetsByBudget((prev) => ({ ...prev, [budgetId]: (res.items ?? []) as ApiMiniBudget[] }));
      } catch {
        setMiniBudgetsByBudget((prev) => ({ ...prev, [budgetId]: [] }));
      }
    },
    [activeSpaceId, miniBudgetsByBudget, spacesEnabled]
  );

  useEffect(() => {
    // Reduce taps: when expanding, ensure we have a draft in state and default to the
    // current budget if none selected yet.
    if (!expandedId) return;

    setDrafts((prev) => {
      const existing = prev[expandedId];
      const ensured: PendingDraft = existing ?? {
        category: '',
        budgetId: null,
        budgetCategory: 'Essential',
        miniBudgetId: null,
        step: 1
      };

      if (!currentBudget?.id) {
        // Still ensure the draft exists.
        if (existing) return prev;
        return { ...prev, [expandedId]: ensured };
      }

      if (ensured.budgetId) return existing ? prev : { ...prev, [expandedId]: ensured };
      return {
        ...prev,
        [expandedId]: { ...ensured, budgetId: String(currentBudget.id), miniBudgetId: null }
      };
    });

    if (currentBudget?.id) {
      void loadMiniBudgetsForBudget(String(currentBudget.id));
    }
  }, [currentBudget?.id, expandedId, loadMiniBudgetsForBudget]);

  const hasItems = items.length > 0;

  const stepTitle = (step: PendingStep) => {
    if (step === 1) return 'Category';
    if (step === 2) return 'Budget';
    if (step === 3) return 'Type';
    if (step === 4) return 'Mini budget';
    if (step === 5) return 'Goal';
    return 'Confirm';
  };

  const canGoNext = (draft: PendingDraft) => {
    if (draft.step === 1) return draft.category.trim().length > 0;
    if (draft.step === 2) return !!draft.budgetId;
    if (draft.step === 3) return !!draft.budgetId && !!draft.budgetCategory;
    if (draft.step === 4) return !!draft.budgetId;
    if (draft.step === 5) return !!draft.budgetId;
    return false;
  };

  const nextStepFrom = (draft: PendingDraft): PendingStep => {
    if (draft.step === 1) return draft.budgetId ? 3 : 2;
    if (draft.step === 2) return 3;
    if (draft.step === 3) return 4;
    if (draft.step === 4) return draft.budgetCategory === 'Savings' ? 5 : 6;
    if (draft.step === 5) return 6;
    return 6;
  };

  const prevStepFrom = (draft: PendingDraft): PendingStep => {
    if (draft.step === 6) return draft.budgetCategory === 'Savings' ? 5 : 4;
    if (draft.step === 5) return 4;
    if (draft.step === 4) return 3;
    if (draft.step === 3) return 2;
    if (draft.step === 2) return 1;
    return 1;
  };

  const handleReconcile = async (id: string, tx: ApiImportedTransaction) => {
    if (actingId) return;
    setActingId(id);
    try {
      const type: 'expense' | 'income' = tx.direction === 'debit' ? 'expense' : 'income';
      const draft = drafts[id];
      const category = (draft?.category ?? suggestedCategory(tx)).trim();
      const description = (tx.merchant || tx.description || 'Imported transaction').trim();

      const payload: {
        type?: 'expense' | 'income';
        category?: string;
        description?: string;
        budgetId?: string | null;
        budgetCategory?: string | null;
        miniBudgetId?: string | null;
      } = {
        type,
        category,
        description,
        budgetId: draft?.budgetId ? String(draft.budgetId) : null,
        budgetCategory: draft?.budgetId ? (draft?.budgetCategory ?? 'Essential') : null,
        miniBudgetId: draft?.budgetId && draft?.miniBudgetId ? String(draft.miniBudgetId) : null
      };

      if (spacesEnabled) {
        await reconcileImportedTransactionInSpace(id, payload, activeSpaceId);
      } else {
        await reconcileImportedTransaction(id, payload);
      }

      // If this is a Savings expense and the user selected a goal, add progress.
      if (type === 'expense' && draft?.budgetCategory === 'Savings' && draft?.goalId) {
        const g = goals.find((x) => String(x.id) === String(draft.goalId)) ?? null;
        const next = Math.max(0, Number(g?.currentAmount ?? 0) + Number(tx.amount || 0));
        try {
          if (spacesEnabled) {
            await patchGoalInSpace(String(draft.goalId), { currentAmount: next }, activeSpaceId);
          } else {
            await patchGoal(String(draft.goalId), { currentAmount: next });
          }
        } catch (e) {
          toast.show(e instanceof Error ? e.message : 'Saved transaction but failed to update goal', 'error');
        }
      }

      setItems((prev) => prev.filter((t) => t.id !== id));
      setReconciledThisWeek((n) => n + 1);
      toast.show(`Added to transactions as ${category}.`, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to reconcile transaction';
      toast.show(msg, 'error');
    } finally {
      setActingId(null);
    }
  };

  const handleIgnore = async (id: string) => {
    if (actingId) return;
    setActingId(id);
    try {
      if (spacesEnabled) {
        await ignoreImportedTransactionInSpace(id, activeSpaceId);
      } else {
        await ignoreImportedTransaction(id);
      }
      setItems((prev) => prev.filter((t) => t.id !== id));
      toast.show('Transaction ignored. It will not affect your budgets.', 'info');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to ignore transaction';
      toast.show(msg, 'error');
    } finally {
      setActingId(null);
    }
  };

  const progress = useMemo(() => {
    const target = 15; // suggested weekly goal
    const done = Math.max(0, reconciledThisWeek);
    const pct = Math.min(100, Math.round((done / target) * 100));
    const remaining = Math.max(0, target - done);
    return { done, remaining, pct, target };
  }, [reconciledThisWeek]);

  return (
    <Screen scrollable={false}>
      <FlatList
        data={items}
        keyExtractor={(t) => t.id}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={
          hasItems
            ? { paddingBottom: 20 }
            : { flexGrow: 1, justifyContent: 'center', paddingBottom: 20 }
        }
        ListHeaderComponent={
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable
                onPress={() => nav.goBack()}
                style={({ pressed }) => [
                  {
                    width: 44,
                    height: 44,
                    borderRadius: 18,
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.92 : 1
                  }
                ]}
              >
                <ArrowLeft color={theme.colors.text} size={20} />
              </Pressable>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <H1 style={{ marginBottom: 0 }}>Pending transactions</H1>
                {spacesEnabled ? (
                  <Text style={{ marginTop: 4, color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>
                    Viewing: {activeSpace?.name ?? 'Personal'}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={{ marginTop: 14 }}>
              <P>
                These are imported from your bank connections. Confirm what should count as income or expenses in your budget.
              </P>
            </View>

            {showTip ? (
              <View style={{ marginTop: 12 }}>
                <Card>
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Tip</Text>
                  <Text style={{ color: theme.colors.textMuted, marginTop: 6 }}>
                    Tap a transaction to open it. Choose: category → budget → type (Essential/Savings/etc) → mini budget (or NIL), then add.
                  </Text>
                  <View style={{ marginTop: 10 }}>
                    <SecondaryButton
                      title="Got it"
                      onPress={async () => {
                        setShowTip(false);
                        try {
                          await SecureStore.setItemAsync(PENDING_TIP_KEY, '1');
                        } catch {
                          // ignore
                        }
                      }}
                    />
                  </View>
                </Card>
              </View>
            ) : null}

            <View style={{ marginTop: 12 }}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}>
                      Weekly reconciliation streak
                    </Text>
                    <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 4 }}>
                      {progress.done} of {progress.target} transactions cleared
                    </Text>
                    <Text style={{ color: theme.colors.textMuted, marginTop: 2, fontSize: 12 }}>Aim for inbox zero once a week.</Text>
                  </View>
                  <View
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 999,
                      borderWidth: 5,
                      borderColor: theme.colors.surfaceAlt,
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>{progress.pct}%</Text>
                  </View>
                </View>
              </Card>
            </View>

            <View style={{ marginTop: 12 }}>{loading ? <ActivityIndicator color={theme.colors.primary} /> : null}</View>
          </View>
        }
        ListEmptyComponent={!loading ? (
          <View style={{ alignItems: 'center' }}>
            <AlertCircle color={theme.colors.textMuted} size={32} />
            <P style={{ textAlign: 'center', marginTop: 8 }}>No pending transactions. You are all caught up.</P>
          </View>
        ) : null}
        onRefresh={load}
        refreshing={loading}
        renderItem={({ item }) => {
          const isExpense = item.direction === 'debit';
          const sign = isExpense ? '-' : '+';
          const color = isExpense ? theme.colors.error : theme.colors.success;
          const acting = actingId === item.id;

          const draft: PendingDraft = drafts[item.id] ?? {
            category: suggestedCategory(item),
            budgetId: null,
            budgetCategory: 'Essential',
            miniBudgetId: null,
            goalId: null,
            step: 1
          };

          const categoryOptions = (() => {
            const base = item.direction === 'debit'
              ? isBusiness
                ? [...BUSINESS_EXPENSE_CATEGORIES]
                : [...PERSONAL_EXPENSE_CATEGORIES]
              : isBusiness
                ? [...BUSINESS_INCOME_CATEGORIES]
                : [...PERSONAL_INCOME_CATEGORIES];

            const s = suggestedCategory(item);
            const opts = [s, ...base];
            return Array.from(new Set(opts.map((x) => x.trim()).filter(Boolean)));
          })();

          const budgetOptions = budgets.length > 0 ? budgets : (currentBudget ? [currentBudget] : []);
          const selectedBudget = draft.budgetId ? (budgetOptions.find((b) => String(b.id) === String(draft.budgetId)) ?? null) : null;
          const allowedBuckets = (() => {
            const order = ['Essential', 'Free Spending', 'Savings', 'Investments', 'Miscellaneous', 'Debt Financing'] as const;
            const cats = selectedBudget?.categories ? Object.keys(selectedBudget.categories) : [];
            const normalized = new Set(cats.map((x) => String(x).trim()).filter(Boolean));
            if (normalized.size === 0) return [...BUCKETS];
            return order.filter((x) => normalized.has(x)) as Array<(typeof BUCKETS)[number]>;
          })();
          const miniBudgetsForDraft = draft.budgetId ? (miniBudgetsByBudget[draft.budgetId] ?? []) : [];
          const miniBudgetsForBucket = miniBudgetsForDraft.filter((m) => (m.category ?? null) === draft.budgetCategory);

          // Keep draft bucket valid for the selected budget.
          if (selectedBudget && allowedBuckets.length > 0 && !allowedBuckets.includes(draft.budgetCategory)) {
            const nextBucket = allowedBuckets[0];
            setDrafts((prev) => ({
              ...prev,
              [item.id]: { ...draft, budgetCategory: nextBucket, miniBudgetId: null, goalId: null }
            }));
          }

          const canAdd = !acting && !!draft.category.trim() && !!draft.budgetId;
          return (
            <Card style={{ marginBottom: 10 }}>
              <Pressable
                onPress={() => {
                  setDrafts((prev) => {
                    if (prev[item.id]) return prev;
                    return {
                      ...prev,
                      [item.id]: {
                        category: suggestedCategory(item),
                        budgetId: null,
                        budgetCategory: 'Essential',
                        miniBudgetId: null,
                        goalId: null,
                        step: 1
                      }
                    };
                  });
                  setExpandedId((prev) => (prev === item.id ? null : item.id));
                }}
                style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1 }]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }} numberOfLines={1}>
                    {item.merchant || item.description || 'Transaction'}
                  </Text>
                  <Text style={{ color: theme.colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                    {directionLabel(item.direction)} • {item.bankName} • {item.bankAccountName}
                  </Text>
                  <Text style={{ color: theme.colors.textMuted, marginTop: 2, fontSize: 12 }} numberOfLines={1}>
                    {new Date(item.occurredAt).toLocaleString()}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color, fontWeight: '900' }}>
                    {sign}
                    {formatMoney(item.amount, item.currency === 'NGN' ? '₦' : item.currency)}
                  </Text>
                </View>
                </View>
              </Pressable>

              {expandedId === item.id ? (
                <View style={{ marginTop: 10 }}>
                  {/* Wizard header with < / > */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '800' }}>
                      {draft.step <= 5 ? `Step ${draft.step} of ${draft.budgetCategory === 'Savings' ? 5 : 4}` : 'Confirm'} • {stepTitle(draft.step)}
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Pressable
                        onPress={() => {
                          setDrafts((prev) => ({
                            ...prev,
                            [item.id]: { ...draft, step: prevStepFrom(draft) }
                          }));
                        }}
                        style={({ pressed }) => [
                          {
                            width: 34,
                            height: 34,
                            borderRadius: 12,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: theme.colors.surfaceAlt,
                            opacity: pressed ? 0.9 : 1
                          }
                        ]}
                      >
                        <ChevronLeft color={theme.colors.text} size={18} />
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          if (!canGoNext(draft)) return;
                          const next = nextStepFrom(draft);
                          setDrafts((prev) => ({
                            ...prev,
                            [item.id]: { ...draft, step: next }
                          }));
                        }}
                        disabled={!canGoNext(draft)}
                        style={({ pressed }) => [
                          {
                            width: 34,
                            height: 34,
                            borderRadius: 12,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: theme.colors.surfaceAlt,
                            opacity: !canGoNext(draft) ? 0.4 : pressed ? 0.9 : 1
                          }
                        ]}
                      >
                        <ChevronRight color={theme.colors.text} size={18} />
                      </Pressable>
                    </View>
                  </View>

                  {/* Completed steps collapse into a single summary row */}
                  {draft.step > 1 ? (
                    <View style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: theme.colors.border }}>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                        Category: <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{draft.category || '—'}</Text>
                      </Text>
                    </View>
                  ) : null}
                  {draft.step > 2 ? (
                    <View style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: theme.colors.border }}>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                        Budget: <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{(budgetOptions.find((b) => b.id === draft.budgetId)?.name ?? '—')}</Text>
                      </Text>
                    </View>
                  ) : null}
                  {draft.step > 3 ? (
                    <View style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: theme.colors.border }}>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                        Type: <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{bucketLabel(draft.budgetCategory)}</Text>
                      </Text>
                    </View>
                  ) : null}
                  {draft.step > 4 ? (
                    <View style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: theme.colors.border }}>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                        Mini budget: <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{draft.miniBudgetId ? (miniBudgetsForDraft.find((m) => m.id === draft.miniBudgetId)?.name ?? '—') : 'NIL'}</Text>
                      </Text>
                    </View>
                  ) : null}

                  {draft.step > 5 && draft.budgetCategory === 'Savings' ? (
                    <View style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: theme.colors.border }}>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                        Goal: <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{draft.goalId ? (goals.find((g) => String(g.id) === String(draft.goalId))?.name ?? '—') : 'None'}</Text>
                      </Text>
                    </View>
                  ) : null}

                  {/* Current step options (only one appears at a time) */}
                  {draft.step === 1 ? (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginBottom: 6 }}>Choose a category</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {categoryOptions.map((c) => {
                          const selected = draft.category === c;
                          return (
                            <Pressable
                              key={c}
                              onPress={() => {
                                const next: PendingStep = draft.budgetId ? 3 : 2;
                                setDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: { ...draft, category: c, step: next }
                                }));
                              }}
                              style={pillStyle(theme, selected)}
                            >
                              <Text style={pillTextStyle(theme, selected)}>{c}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  {draft.step === 2 ? (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginBottom: 6 }}>Choose a budget</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {budgetOptions.map((b) => {
                          const selected = draft.budgetId === b.id;
                          const label = currentBudget?.id === b.id ? `${b.name} (current)` : b.name;
                          return (
                            <Pressable
                              key={b.id}
                              onPress={() => {
                                setDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: { ...draft, budgetId: String(b.id), miniBudgetId: null, step: 3 }
                                }));
                                void loadMiniBudgetsForBudget(String(b.id));
                              }}
                              style={pillStyle(theme, selected)}
                            >
                              <Text style={pillTextStyle(theme, selected)} numberOfLines={1}>
                                {label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  {draft.step === 3 ? (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginBottom: 6 }}>Choose a type</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {allowedBuckets.map((b) => {
                          const selected = draft.budgetCategory === b;
                          return (
                            <Pressable
                              key={b}
                              onPress={() => {
                                setDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: { ...draft, budgetCategory: b, miniBudgetId: null, goalId: null, step: 4 }
                                }));
                              }}
                              style={pillStyle(theme, selected)}
                            >
                              <Text style={pillTextStyle(theme, selected)}>{bucketLabel(b)}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  {draft.step === 4 ? (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginBottom: 6 }}>Pick a mini budget (optional)</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        <Pressable
                          onPress={() => {
                            setDrafts((prev) => ({
                              ...prev,
                                  [item.id]: { ...draft, miniBudgetId: null, step: draft.budgetCategory === 'Savings' ? 5 : 6 }
                            }));
                          }}
                          style={pillStyle(theme, draft.miniBudgetId === null)}
                        >
                          <Text style={pillTextStyle(theme, draft.miniBudgetId === null)}>NIL</Text>
                        </Pressable>
                        {miniBudgetsForBucket.map((m) => {
                          const selected = draft.miniBudgetId === m.id;
                          return (
                            <Pressable
                              key={m.id}
                              onPress={() => {
                                setDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: { ...draft, miniBudgetId: String(m.id), step: draft.budgetCategory === 'Savings' ? 5 : 6 }
                                }));
                              }}
                              style={pillStyle(theme, selected)}
                            >
                              <Text style={pillTextStyle(theme, selected)} numberOfLines={1}>
                                {m.name}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      {draft.budgetId && miniBudgetsByBudget[draft.budgetId] && miniBudgetsForBucket.length === 0 ? (
                        <Text style={{ color: theme.colors.textMuted, marginTop: 8, fontSize: 12 }}>
                          No mini budgets under {bucketLabel(draft.budgetCategory)}.
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  {draft.step === 5 && draft.budgetCategory === 'Savings' ? (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginBottom: 6 }}>Add to existing goals? (optional)</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        <Pressable
                          onPress={() => {
                            setDrafts((prev) => ({
                              ...prev,
                              [item.id]: { ...draft, goalId: null, step: 6 }
                            }));
                          }}
                          style={pillStyle(theme, draft.goalId === null)}
                        >
                          <Text style={pillTextStyle(theme, draft.goalId === null)}>None</Text>
                        </Pressable>
                        {goals.map((g) => {
                          const selected = String(draft.goalId ?? '') === String(g.id);
                          return (
                            <Pressable
                              key={String(g.id)}
                              onPress={() => {
                                setDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: { ...draft, goalId: String(g.id), step: 6 }
                                }));
                              }}
                              style={pillStyle(theme, selected)}
                            >
                              <Text style={pillTextStyle(theme, selected)} numberOfLines={1}>
                                {g.emoji ? `${g.emoji} ` : ''}{g.name}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  {/* Actions */}
                  {draft.step === 6 ? (
                    <View style={{ marginTop: 12 }}>
                      <PrimaryButton
                        title={acting ? 'Saving…' : 'Add to transactions'}
                        onPress={() => handleReconcile(item.id, item)}
                        disabled={!canAdd}
                        iconLeft={<CheckCircle2 color={tokens.colors.white} size={16} />}
                      />
                      <View style={{ marginTop: 8 }}>
                        <SecondaryButton
                          title={acting ? 'Please wait…' : 'Ignore'}
                          onPress={() => handleIgnore(item.id)}
                          disabled={acting}
                          iconLeft={<XCircle color={theme.colors.text} size={16} />}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={{ marginTop: 12 }}>
                      <SecondaryButton
                        title={acting ? 'Please wait…' : 'Ignore'}
                        onPress={() => handleIgnore(item.id)}
                        disabled={acting}
                        iconLeft={<XCircle color={theme.colors.text} size={16} />}
                      />
                    </View>
                  )}
                </View>
              ) : (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>Tap to categorize and add.</Text>
                </View>
              )}
            </Card>
          );
        }}
      />
    </Screen>
  );
}
