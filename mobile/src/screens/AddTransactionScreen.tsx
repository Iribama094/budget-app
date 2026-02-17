import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Modal, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';

import { createTransaction, listBudgets, listGoals, listMiniBudgets, listMiniBudgetsInSpace, patchGoal, patchGoalInSpace, type ApiBudget, type ApiGoal } from '../api/endpoints';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { Card, InlineError, PrimaryButton, Screen, SecondaryButton, TextField, H1 } from '../components/Common/ui';
import { useToast } from '../components/Common/Toast';
import { tokens } from '../theme/tokens';
import { formatNumberInput, toIsoDate, toIsoDateTime } from '../utils/format';

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

export function AddTransactionScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId, activeSpace } = useSpace();
  const toast = useToast();

  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [applyToBudget, setApplyToBudget] = useState(true);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>('');
  const [otherCategory, setOtherCategory] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => toIsoDate(new Date()));

  const [dateManual, setDateManual] = useState(false);
  const lastDateTapRef = useRef(0);
  const dateInputRef = useRef<TextInput>(null);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const d = new Date(`${toIsoDate(new Date())}T12:00:00`);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budgets, setBudgets] = useState<ApiBudget[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [budgetTxnType, setBudgetTxnType] = useState<'essential' | 'savings' | 'free' | 'investments' | 'misc' | 'debt'>('essential');
  const [miniBudgets, setMiniBudgets] = useState<Array<{ id: string; name: string; category?: string | null }>>([]);
  // undefined = not decided yet, null = explicitly "None"
  const [selectedMiniBudgetId, setSelectedMiniBudgetId] = useState<string | null | undefined>(undefined);
  const [showBudgetPicker, setShowBudgetPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showBucketPicker, setShowBucketPicker] = useState(false);
  const [showMiniBudgetPicker, setShowMiniBudgetPicker] = useState(false);

  const [goals, setGoals] = useState<ApiGoal[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

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
  const categories = useMemo(() => {
    if (type === 'expense') return isBusiness ? [...BUSINESS_EXPENSE_CATEGORIES] : [...PERSONAL_EXPENSE_CATEGORIES];
    return isBusiness ? [...BUSINESS_INCOME_CATEGORIES] : [...PERSONAL_INCOME_CATEGORIES];
  }, [isBusiness, type]);

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const parseIsoDateLocal = (value?: string | null) => {
    if (!value) return null;
    const d = new Date(`${value}T12:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  };

  const isBudgetCurrent = useCallback((b: ApiBudget) => {
    const start = parseIsoDateLocal(b.startDate) ?? null;
    if (!start) return false;
    const end = parseIsoDateLocal(b.endDate ?? null);
    const effectiveEnd = end
      ? end
      : (() => {
          const d = new Date(start);
          if (b.period === 'weekly') {
            d.setDate(d.getDate() + 6);
          } else {
            d.setMonth(d.getMonth() + 1);
            d.setDate(0);
          }
          return d;
        })();

    const nowLocal = new Date();
    const today = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 12, 0, 0, 0);
    return today >= start && today <= effectiveEnd;
  }, []);

  const monthLabel = useMemo(() => {
    return `${MONTHS[calendarCursor.getMonth()]} ${calendarCursor.getFullYear()}`;
  }, [calendarCursor]);

  const calendarGrid = useMemo(() => {
    const y = calendarCursor.getFullYear();
    const m = calendarCursor.getMonth();
    const firstDay = new Date(y, m, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    const cells: Array<number | null> = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    const rows: Array<Array<number | null>> = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [calendarCursor]);

  const budgetCategoryLabel = useMemo(() => {
    return budgetTxnType === 'essential' ? 'Essential'
      : budgetTxnType === 'savings' ? 'Savings'
      : budgetTxnType === 'investments' ? 'Investments'
      : budgetTxnType === 'misc' ? 'Miscellaneous'
      : budgetTxnType === 'debt' ? 'Debt Financing'
      : 'Free Spending';
  }, [budgetTxnType]);

  const budgetCategoryDisplay = useMemo(() => {
    return bucketLabel(budgetCategoryLabel);
  }, [bucketLabel, budgetCategoryLabel]);

  const selectedBudget = useMemo(() => {
    if (!selectedBudgetId) return null;
    return budgets.find((b) => String(b.id) === String(selectedBudgetId)) ?? null;
  }, [budgets, selectedBudgetId]);

  const requiresBudget = type === 'expense' || (type === 'income' && applyToBudget);

  const allowedBudgetTypes = useMemo(() => {
    const order = ['Essential', 'Free Spending', 'Savings', 'Investments', 'Miscellaneous', 'Debt Financing'] as const;
    const labelForType: Record<typeof budgetTxnType, (typeof order)[number]> = {
      essential: 'Essential',
      free: 'Free Spending',
      savings: 'Savings',
      investments: 'Investments',
      misc: 'Miscellaneous',
      debt: 'Debt Financing'
    };
    const typeForLabel: Record<(typeof order)[number], typeof budgetTxnType> = {
      Essential: 'essential',
      'Free Spending': 'free',
      Savings: 'savings',
      Investments: 'investments',
      Miscellaneous: 'misc',
      'Debt Financing': 'debt'
    };

    const budgetCats = selectedBudget?.categories ? Object.keys(selectedBudget.categories) : [];
    const normalized = new Set(budgetCats.map((x) => String(x).trim()).filter(Boolean));
    if (normalized.size === 0) {
      return order.map((lbl) => ({ key: typeForLabel[lbl], label: bucketLabel(lbl) }));
    }

    return order
      .filter((lbl) => normalized.has(lbl))
      .map((lbl) => ({ key: typeForLabel[lbl], label: bucketLabel(lbl) }));
  }, [bucketLabel, budgetTxnType, selectedBudget?.categories]);

  React.useEffect(() => {
    if (!requiresBudget) return;
    if (allowedBudgetTypes.length === 0) return;
    if (allowedBudgetTypes.some((t) => t.key === budgetTxnType)) return;
    setBudgetTxnType(allowedBudgetTypes[0].key);
  }, [allowedBudgetTypes, budgetTxnType, requiresBudget]);

  const miniBudgetsForCategory = useMemo(() => {
    return miniBudgets.filter((m) => (m.category ?? null) === budgetCategoryLabel);
  }, [budgetCategoryLabel, miniBudgets]);

  const parsedAmount = useMemo(() => {
    // Remove thousand separators; keep dot as decimal separator.
    const n = Number(amount.replace(/,/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }, [amount]);

  const resolvedCategory = useMemo(() => {
    if (category === 'Other') return otherCategory.trim();
    return category.trim();
  }, [category, otherCategory]);

  const showGoalLink = useMemo(() => {
    return type === 'expense' && requiresBudget && budgetCategoryLabel === 'Savings';
  }, [budgetCategoryLabel, requiresBudget, type]);

  React.useEffect(() => {
    if (!showGoalLink) {
      setSelectedGoalId(null);
      setGoals([]);
      return;
    }

    (async () => {
      try {
        const items = await listGoals(spacesEnabled ? { spaceId: activeSpaceId } : undefined);
        setGoals(items || []);
      } catch {
        setGoals([]);
      }
    })();
  }, [activeSpaceId, showGoalLink, spacesEnabled]);

  const canSubmit =
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    resolvedCategory.length > 0 &&
    (!requiresBudget || !!selectedBudgetId) &&
    !isSaving;

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setIsSaving(true);
    try {
      // Use midday local time to reduce timezone date-shift surprises.
      const occurredAt = toIsoDateTime(new Date(`${date}T12:00:00`));

      const trimmedDescription = description.trim();

      await createTransaction({
        type,
        amount: parsedAmount,
        category: resolvedCategory,
        description: trimmedDescription,
        occurredAt,
        ...(requiresBudget && selectedBudgetId
          ? {
              budgetId: selectedBudgetId,
              budgetCategory: budgetCategoryLabel,
              miniBudget: selectedMiniBudgetId ?? undefined
            }
          : {}),
        ...(spacesEnabled ? { spaceId: activeSpaceId } : {})
      });

      if (showGoalLink && selectedGoalId) {
        const g = goals.find((x) => String(x.id) === String(selectedGoalId)) ?? null;
        const next = Math.max(0, Number(g?.currentAmount ?? 0) + parsedAmount);
        try {
          if (spacesEnabled) {
            await patchGoalInSpace(String(selectedGoalId), { currentAmount: next }, activeSpaceId);
          } else {
            await patchGoal(String(selectedGoalId), { currentAmount: next });
          }
        } catch (e) {
          toast.show(e instanceof Error ? e.message : 'Saved transaction but failed to update goal', 'error');
        }
      }
      nav.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add transaction');
    } finally {
      setIsSaving(false);
    }
  };

  React.useEffect(() => {
    (async () => {
      try {
        const b = await listBudgets({ spaceId: spacesEnabled ? activeSpaceId : undefined });
        const raw = (b.items || []) as ApiBudget[];
        const filtered = spacesEnabled
          ? raw.filter((bb) => ((bb.spaceId ?? 'personal') as 'personal' | 'business') === activeSpaceId)
          : raw;

        setBudgets(filtered);

        if (filtered.length > 0) {
          const current = filtered.find((bb) => isBudgetCurrent(bb)) ?? filtered[0];
          setSelectedBudgetId(String(current.id));
        } else {
          setSelectedBudgetId(null);
        }
      } catch (err) {
        // ignore
      }
    })();
  }, [activeSpaceId, isBudgetCurrent, spacesEnabled]);

  // Load mini-budgets when a budget is selected.
  React.useEffect(() => {
    const shouldLoadMiniBudgets = requiresBudget && !!selectedBudgetId;
    if (!shouldLoadMiniBudgets) {
      setMiniBudgets([]);
      setSelectedMiniBudgetId(null);
      return;
    }

    (async () => {
      try {
        const res = spacesEnabled
          ? await listMiniBudgetsInSpace(String(selectedBudgetId), activeSpaceId)
          : await listMiniBudgets(String(selectedBudgetId));
        setMiniBudgets((res.items || []).map((m: any) => ({ id: m.id, name: m.name, category: m.category ?? null })));
      } catch {
        setMiniBudgets([]);
      }
    })();
  }, [activeSpaceId, requiresBudget, selectedBudgetId, budgetTxnType, spacesEnabled, type]);

  // When the selected bucket changes, try to keep mini budget selection valid.
  React.useEffect(() => {
    if (!selectedBudgetId) return;
    if (miniBudgetsForCategory.length === 0) {
      setSelectedMiniBudgetId(null);
      return;
    }

    // Only auto-pick a mini budget when the user hasn't made a choice yet.
    if (selectedMiniBudgetId === undefined) {
      setSelectedMiniBudgetId(miniBudgetsForCategory[0]?.id ?? null);
      return;
    }

    // If a specific mini budget was chosen but is no longer valid, fall back.
    if (selectedMiniBudgetId !== null && !miniBudgetsForCategory.some((m) => m.id === selectedMiniBudgetId)) {
      setSelectedMiniBudgetId(miniBudgetsForCategory[0]?.id ?? null);
    }
  }, [miniBudgetsForCategory, selectedBudgetId, selectedMiniBudgetId, type]);

  React.useEffect(() => {
    // Reset the free-text category when leaving "Other".
    if (category !== 'Other') setOtherCategory('');
  }, [category]);

  return (
    <Screen>
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
              opacity: pressed ? 0.92 : 1,
              transform: [{ scale: pressed ? 0.985 : 1 }]
            }
          ]}
        >
          <ArrowLeft color={theme.colors.text} size={20} />
        </Pressable>
        <View style={{ marginLeft: 12, flex: 1 }}>
          <H1 style={{ marginBottom: 0 }}>Add Transaction</H1>
          {spacesEnabled ? (
            <Text style={{ marginTop: 4, color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>
              Adding to: {activeSpace?.name ?? 'Personal'}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ marginTop: 14 }}>
        {error ? <InlineError message={error} /> : null}
        {isSaving ? <ActivityIndicator color={theme.colors.primary} /> : null}
      </View>

      <View style={{ marginTop: 10 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Type</Text>
          <View style={{ flexDirection: 'row', marginTop: 10, gap: 10 }}>
            {(['expense', 'income'] as const).map((k) => {
              const active = type === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => {
                      setType(k);
                      setCategory('');
                      if (k === 'expense') {
                        setApplyToBudget(true);
                      } else {
                        setApplyToBudget(false);
                        setSelectedMiniBudgetId(null);
                      }
                    }}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      borderRadius: tokens.radius['2xl'],
                      paddingVertical: 12,
                      alignItems: 'center',
                      backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                      opacity: pressed ? 0.92 : 1,
                      transform: [{ scale: pressed ? 0.985 : 1 }]
                    }
                  ]}
                >
                  <Text style={{ color: active ? tokens.colors.white : theme.colors.text, fontWeight: '900' }}>
                    {k === 'expense' ? 'Expense' : 'Income'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ marginTop: 14 }}>
            <TextField
              label={`Amount${user?.currency ? ` (${user.currency})` : ''}`}
              value={amount}
              onChangeText={(v) => setAmount(formatNumberInput(v))}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
            <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Optional note…" />

            <View style={{ marginTop: 6 }}>
              <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>Date</Text>
              <Pressable
                onPress={() => {
                  const now = Date.now();
                  const delta = now - lastDateTapRef.current;
                  lastDateTapRef.current = now;
                  if (delta > 0 && delta < 280) {
                    setDateManual(true);
                    setTimeout(() => dateInputRef.current?.focus(), 50);
                    return;
                  }

                  if (dateManual) return;
                  const current = parseIsoDateLocal(date) ?? new Date();
                  setCalendarCursor(new Date(current.getFullYear(), current.getMonth(), 1));
                  setShowDatePicker(true);
                }}
                style={({ pressed }) => [
                  {
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceAlt,
                    borderRadius: tokens.radius['2xl'],
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    opacity: pressed ? 0.92 : 1
                  }
                ]}
              >
                <TextInput
                  ref={dateInputRef}
                  value={date}
                  onChangeText={setDate}
                  editable={dateManual}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.colors.textMuted}
                  style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700', padding: 0, margin: 0 }}
                />
                <Text style={{ color: theme.colors.textMuted, marginTop: 4, fontSize: 12, fontWeight: '700' }}>
                  {dateManual ? 'Typing enabled' : 'Tap to pick a date • Double-tap to type'}
                </Text>
              </Pressable>
            </View>
          </View>

          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginTop: 6 }}>Category</Text>
          <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
            <Pressable
              onPress={() => {
                if (categories.length === 0) return;
                setShowCategoryPicker((v) => !v);
              }}
              style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: pressed ? 0.9 : 1 }]}
            >
              <Text style={{ color: category ? theme.colors.text : theme.colors.textMuted, fontWeight: '700' }}>
                {category ? category : 'Tap to choose category'}
              </Text>
              <Text style={{ color: theme.colors.textMuted }}>▼</Text>
            </Pressable>

            {showCategoryPicker ? (
              <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }}>
                {categories.map((c: any) => {
                  const active = String(c) === String(category);
                  return (
                    <Pressable
                      key={String(c)}
                      onPress={() => {
                        setCategory(String(c));
                        setShowCategoryPicker(false);
                      }}
                      style={({ pressed }) => [
                        {
                          paddingVertical: 12,
                          paddingHorizontal: 12,
                          backgroundColor: pressed || active ? theme.colors.surfaceAlt : 'transparent'
                        }
                      ]}
                    >
                      <Text style={{ color: theme.colors.text, fontWeight: active ? '900' : '700' }}>{String(c)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          {category === 'Other' ? (
            <View style={{ marginTop: 12 }}>
              <TextField
                label="Other category"
                value={otherCategory}
                onChangeText={setOtherCategory}
                placeholder="e.g., Gifts"
                maxLength={60}
                autoCapitalize="words"
              />
            </View>
          ) : null}

          {type === 'income' ? (
            <View style={{ marginTop: 16 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Add to a budget?</Text>
              <View style={{ flexDirection: 'row', marginTop: 10, gap: 10 }}>
                {[{ key: true, label: 'Yes' }, { key: false, label: 'No' }].map((opt) => {
                  const active = applyToBudget === opt.key;
                  return (
                    <Pressable
                      key={String(opt.key)}
                      onPress={() => {
                        setApplyToBudget(opt.key);
                        if (!opt.key) setSelectedMiniBudgetId(null);
                      }}
                      style={({ pressed }) => [
                        {
                          flex: 1,
                          borderRadius: tokens.radius['2xl'],
                          paddingVertical: 12,
                          alignItems: 'center',
                          backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                          opacity: pressed ? 0.92 : 1,
                          transform: [{ scale: pressed ? 0.985 : 1 }]
                        }
                      ]}
                    >
                      <Text style={{ color: active ? tokens.colors.white : theme.colors.text, fontWeight: '900' }}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {requiresBudget ? (
            <View style={{ marginTop: 16 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Budget *</Text>
              <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
                <Pressable
                  onPress={() => {
                    if (budgets.length === 0) return;
                    setShowBudgetPicker((v) => !v);
                  }}
                  style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: pressed ? 0.9 : 1 }]}
                >
                  <Text style={{ color: selectedBudgetId ? theme.colors.text : theme.colors.textMuted, fontWeight: '700' }}>
                    {selectedBudgetId
                      ? budgets.find((b) => String(b.id) === String(selectedBudgetId))?.name ?? 'Selected budget'
                      : budgets.length > 0
                        ? 'Tap to choose budget'
                        : 'No budgets available'}
                  </Text>
                  <Text style={{ color: theme.colors.textMuted }}>▼</Text>
                </Pressable>

                {showBudgetPicker ? (
                  <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }}>
                    {budgets.length === 0 ? (
                      <Text style={{ color: theme.colors.textMuted, paddingVertical: 12, paddingHorizontal: 12, fontWeight: '700' }}>
                        No budgets available.
                      </Text>
                    ) : (
                      budgets.map((b: any) => {
                        const active = String(b.id) === String(selectedBudgetId);
                        return (
                          <Pressable
                            key={String(b.id)}
                            onPress={() => {
                              setSelectedBudgetId(String(b.id));
                              setShowBudgetPicker(false);
                            }}
                            style={({ pressed }) => [
                              {
                                paddingVertical: 12,
                                paddingHorizontal: 12,
                                backgroundColor: pressed || active ? theme.colors.surfaceAlt : 'transparent'
                              }
                            ]}
                          >
                            <Text style={{ color: theme.colors.text, fontWeight: active ? '900' : '700' }}>{b.name}</Text>
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {requiresBudget ? (
            <View style={{ marginTop: 16 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Type of transaction</Text>
              <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
                <Pressable
                  onPress={() => setShowBucketPicker((v) => !v)}
                  style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: pressed ? 0.9 : 1 }]}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{budgetCategoryDisplay}</Text>
                  <Text style={{ color: theme.colors.textMuted }}>▼</Text>
                </Pressable>

                {showBucketPicker ? (
                  <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }}>
                    {allowedBudgetTypes.map((opt) => {
                      const active = budgetTxnType === opt.key;
                      return (
                        <Pressable
                          key={opt.key}
                          onPress={() => {
                            setBudgetTxnType(opt.key);
                            setShowBucketPicker(false);
                          }}
                          style={({ pressed }) => [
                            {
                              paddingVertical: 12,
                              paddingHorizontal: 12,
                              backgroundColor: pressed || active ? theme.colors.surfaceAlt : 'transparent'
                            }
                          ]}
                        >
                          <Text style={{ color: theme.colors.text, fontWeight: active ? '900' : '700' }}>{opt.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {requiresBudget ? (
            <View style={{ marginTop: 16 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Mini Budget (optional)</Text>
              <Text style={{ color: theme.colors.textMuted, fontWeight: '700', marginTop: 4, fontSize: 12 }}>
                Shows mini budgets under: {budgetCategoryDisplay}
              </Text>
              <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
                <Pressable
                  onPress={() => {
                    if (miniBudgetsForCategory.length === 0) return;
                    setShowMiniBudgetPicker((v) => !v);
                  }}
                  style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: pressed ? 0.9 : 1 }]}
                >
                  <Text style={{ color: miniBudgetsForCategory.length > 0 ? theme.colors.text : theme.colors.textMuted, fontWeight: '700' }}>
                    {miniBudgetsForCategory.length === 0
                      ? `No mini budgets for ${budgetCategoryDisplay}`
                      : selectedMiniBudgetId
                        ? miniBudgetsForCategory.find((m) => m.id === selectedMiniBudgetId)?.name ?? 'Selected mini budget'
                        : 'None'}
                  </Text>
                  {miniBudgetsForCategory.length > 0 ? <Text style={{ color: theme.colors.textMuted }}>▼</Text> : null}
                </Pressable>

                {showMiniBudgetPicker ? (
                  <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }}>
                    <Pressable
                      onPress={() => {
                        setSelectedMiniBudgetId(null);
                        setShowMiniBudgetPicker(false);
                      }}
                      style={({ pressed }) => [
                        {
                          paddingVertical: 12,
                          paddingHorizontal: 12,
                          backgroundColor: pressed || selectedMiniBudgetId === null ? theme.colors.surfaceAlt : 'transparent'
                        }
                      ]}
                    >
                      <Text style={{ color: theme.colors.text, fontWeight: selectedMiniBudgetId === null ? '900' : '700' }}>None</Text>
                    </Pressable>
                    {miniBudgetsForCategory.map((m) => {
                      const active = m.id === selectedMiniBudgetId;
                      return (
                        <Pressable
                          key={m.id}
                          onPress={() => {
                            setSelectedMiniBudgetId(m.id);
                            setShowMiniBudgetPicker(false);
                          }}
                          style={({ pressed }) => [
                            {
                              paddingVertical: 12,
                              paddingHorizontal: 12,
                              backgroundColor: pressed || active ? theme.colors.surfaceAlt : 'transparent'
                            }
                          ]}
                        >
                          <Text style={{ color: theme.colors.text, fontWeight: active ? '900' : '700' }}>{m.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {showGoalLink ? (
            <View style={{ marginTop: 16 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Add to existing goals?</Text>
              <Text style={{ color: theme.colors.textMuted, fontWeight: '700', marginTop: 4, fontSize: 12 }}>
                Optional: add this Savings expense to a goal’s progress.
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <Pressable
                  onPress={() => setSelectedGoalId(null)}
                  style={({ pressed }) => [
                    {
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: !selectedGoalId ? theme.colors.primary : theme.colors.surfaceAlt,
                      opacity: pressed ? 0.9 : 1
                    }
                  ]}
                >
                  <Text style={{ color: !selectedGoalId ? tokens.colors.white : theme.colors.text, fontWeight: '900', fontSize: 12 }}>
                    None
                  </Text>
                </Pressable>

                {goals.map((g) => {
                  const active = String(g.id) === String(selectedGoalId);
                  return (
                    <Pressable
                      key={String(g.id)}
                      onPress={() => setSelectedGoalId(String(g.id))}
                      style={({ pressed }) => [
                        {
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                          opacity: pressed ? 0.9 : 1
                        }
                      ]}
                    >
                      <Text style={{ color: active ? tokens.colors.white : theme.colors.text, fontWeight: '900', fontSize: 12 }} numberOfLines={1}>
                        {g.emoji ? `${g.emoji} ` : ''}{g.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <View style={{ flex: 1 }}>
              <SecondaryButton title="Cancel" onPress={() => nav.goBack()} disabled={isSaving} />
            </View>
            <View style={{ flex: 1 }}>
              <PrimaryButton title="Save" onPress={submit} disabled={!canSubmit} />
            </View>
          </View>
        </Card>
      </View>

      {showDatePicker ? (
        <Modal transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center' }}>
            <View style={{ margin: 20, backgroundColor: theme.colors.background, borderRadius: 16, overflow: 'hidden' }}>
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderColor: theme.colors.border,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Select date</Text>
                <Pressable onPress={() => setShowDatePicker(false)}>
                  <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Close</Text>
                </Pressable>
              </View>

              <View style={{ padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Pressable
                    onPress={() => {
                      const d = new Date(calendarCursor);
                      d.setMonth(d.getMonth() - 1);
                      setCalendarCursor(new Date(d.getFullYear(), d.getMonth(), 1));
                    }}
                    style={({ pressed }) => [{ paddingVertical: 8, paddingHorizontal: 10, opacity: pressed ? 0.85 : 1 }]}
                  >
                    <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>‹</Text>
                  </Pressable>

                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{monthLabel}</Text>

                  <Pressable
                    onPress={() => {
                      const d = new Date(calendarCursor);
                      d.setMonth(d.getMonth() + 1);
                      setCalendarCursor(new Date(d.getFullYear(), d.getMonth(), 1));
                    }}
                    style={({ pressed }) => [{ paddingVertical: 8, paddingHorizontal: 10, opacity: pressed ? 0.85 : 1 }]}
                  >
                    <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>›</Text>
                  </Pressable>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, idx) => (
                    <Text key={`${d}-${idx}`} style={{ width: 36, textAlign: 'center', color: theme.colors.textMuted, fontWeight: '800' }}>
                      {d}
                    </Text>
                  ))}
                </View>

                {calendarGrid.map((row, rowIdx) => (
                  <View key={rowIdx} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    {row.map((day, colIdx) => {
                      if (!day) return <View key={colIdx} style={{ width: 36, height: 36 }} />;

                      const y = calendarCursor.getFullYear();
                      const m = calendarCursor.getMonth();
                      const dateObj = new Date(y, m, day);
                      const iso = toIsoDate(dateObj);
                      const isSelected = iso === date;

                      return (
                        <Pressable
                          key={colIdx}
                          onPress={() => {
                            setDate(iso);
                            setDateManual(false);
                            setShowDatePicker(false);
                          }}
                          style={({ pressed }) => [
                            {
                              width: 36,
                              height: 36,
                              borderRadius: 10,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: isSelected ? theme.colors.primary : pressed ? theme.colors.surfaceAlt : 'transparent'
                            }
                          ]}
                        >
                          <Text style={{ color: isSelected ? tokens.colors.white : theme.colors.text, fontWeight: isSelected ? '900' : '700' }}>{day}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </Screen>
  );
}

