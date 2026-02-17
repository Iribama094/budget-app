import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';

import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useSpace } from '../contexts/SpaceContext';
import { useToast } from '../components/Common/Toast';
import { Card, InlineError, PrimaryButton, Screen, SecondaryButton, TextField } from '../components/Common/ui';
import { formatMoney, formatNumberInput, toIsoDate, toIsoDateTime } from '../utils/format';
import {
  deleteTransaction,
  deleteTransactionInSpace,
  getTransaction,
  getTransactionInSpace,
  listBudgets,
  listMiniBudgets,
  listMiniBudgetsInSpace,
  patchTransaction,
  patchTransactionInSpace,
  type ApiBudget,
  type ApiTransaction
} from '../api/endpoints';

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

export default function TransactionDetailScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const { spacesEnabled, activeSpaceId } = useSpace();

  const id = String(route.params?.id ?? '');

  const [tx, setTx] = useState<ApiTransaction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);

  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
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

  const [budgets, setBudgets] = useState<ApiBudget[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [showBudgetPicker, setShowBudgetPicker] = useState(false);

  const [bucket, setBucket] = useState<(typeof BUCKETS)[number]>('Essential');
  const [showBucketPicker, setShowBucketPicker] = useState(false);

  const [miniBudgets, setMiniBudgets] = useState<Array<{ id: string; name: string; category?: string | null }>>([]);
  const [selectedMiniBudgetId, setSelectedMiniBudgetId] = useState<string | null>(null);
  const [showMiniBudgetPicker, setShowMiniBudgetPicker] = useState(false);

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [otherCategory, setOtherCategory] = useState('');

  const currency = user?.currency ?? '₦';

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

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabel = useMemo(() => `${MONTHS[calendarCursor.getMonth()]} ${calendarCursor.getFullYear()}`, [calendarCursor]);
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

  const load = useCallback(async () => {
    if (!id) {
      setError('Missing transaction id');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const t = spacesEnabled ? await getTransactionInSpace(id, activeSpaceId) : await getTransaction(id);
      setTx(t);
      setType(t.type);
      setAmount(String(t.amount ?? ''));
      setCategory(String(t.category ?? ''));
      setDescription(String(t.description ?? ''));
      setDate(toIsoDate(new Date(t.occurredAt)));
      setSelectedBudgetId(t.budgetId ? String(t.budgetId) : null);
      setBucket(((t.budgetCategory as any) || 'Essential') as (typeof BUCKETS)[number]);
      setSelectedMiniBudgetId(t.miniBudgetId ? String(t.miniBudgetId) : null);
      setIsEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load transaction');
    } finally {
      setIsLoading(false);
    }
  }, [activeSpaceId, id, spacesEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const parsedAmount = useMemo(() => {
    const n = Number(String(amount).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : NaN;
  }, [amount]);

  const resolvedCategory = useMemo(() => {
    if (category === 'Other') return otherCategory.trim();
    return category.trim();
  }, [category, otherCategory]);

  useEffect(() => {
    if (category !== 'Other') setOtherCategory('');
  }, [category]);

  const miniBudgetsForBucket = useMemo(() => {
    return miniBudgets.filter((m) => (m.category ?? null) === bucket);
  }, [bucket, miniBudgets]);

  useEffect(() => {
    (async () => {
      try {
        const b = await listBudgets({ spaceId: spacesEnabled ? activeSpaceId : undefined });
        const raw = (b.items || []) as ApiBudget[];
        const filtered = spacesEnabled
          ? raw.filter((bb) => ((bb.spaceId ?? 'personal') as 'personal' | 'business') === activeSpaceId)
          : raw;
        setBudgets(filtered);
      } catch {
        setBudgets([]);
      }
    })();
  }, [activeSpaceId, spacesEnabled]);

  useEffect(() => {
    if (!selectedBudgetId) {
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
  }, [activeSpaceId, selectedBudgetId, spacesEnabled]);

  const initialRef = useRef<any>(null);
  useEffect(() => {
    if (!tx) return;
    initialRef.current = {
      type: tx.type,
      amount: tx.amount,
      category: tx.category,
      description: tx.description ?? '',
      date: toIsoDate(new Date(tx.occurredAt)),
      budgetId: tx.budgetId ? String(tx.budgetId) : null,
      bucket: (tx.budgetCategory as any) ?? null,
      miniBudgetId: tx.miniBudgetId ? String(tx.miniBudgetId) : null
    };
  }, [tx]);

  const isDirty = useMemo(() => {
    const initial = initialRef.current;
    if (!initial) return false;
    const nextBucket = selectedBudgetId ? bucket : null;
    const nextMini = selectedBudgetId ? selectedMiniBudgetId : null;
    return (
      initial.type !== type ||
      Number(initial.amount) !== Number(parsedAmount) ||
      String(initial.category ?? '') !== String(resolvedCategory ?? '') ||
      String(initial.description ?? '') !== String(description ?? '') ||
      String(initial.date ?? '') !== String(date ?? '') ||
      String(initial.budgetId ?? null) !== String(selectedBudgetId ?? null) ||
      String(initial.bucket ?? null) !== String(nextBucket ?? null) ||
      String(initial.miniBudgetId ?? null) !== String(nextMini ?? null)
    );
  }, [bucket, date, description, parsedAmount, resolvedCategory, selectedBudgetId, selectedMiniBudgetId, type]);

  const handleSave = useCallback(async () => {
    if (!tx) return;
    setError(null);
    if (!resolvedCategory.trim()) {
      setError('Category is required');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be a positive number');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      setError('Date must be YYYY-MM-DD');
      return;
    }

    setIsSaving(true);
    try {
      const occurredAt = toIsoDateTime(new Date(`${date.trim()}T12:00:00`));
      const patch = {
        type,
        amount: parsedAmount,
        category: resolvedCategory.trim(),
        description: description.trim(),
        occurredAt,
        budgetId: selectedBudgetId ?? null,
        budgetCategory: selectedBudgetId ? bucket : null,
        miniBudgetId: selectedBudgetId ? selectedMiniBudgetId ?? null : null
      };
      const updated = spacesEnabled ? await patchTransactionInSpace(tx.id, patch, activeSpaceId) : await patchTransaction(tx.id, patch);
      setTx(updated);
      toast.show('Transaction updated', 'success');
      setIsEditing(false);
      setDateManual(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update transaction';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }, [activeSpaceId, bucket, date, description, parsedAmount, resolvedCategory, selectedBudgetId, selectedMiniBudgetId, spacesEnabled, toast, tx, type]);

  const confirmDelete = useCallback(() => {
    if (!tx) return;
    Alert.alert('Delete transaction?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (spacesEnabled) await deleteTransactionInSpace(tx.id, activeSpaceId);
            else await deleteTransaction(tx.id);
            toast.show('Transaction deleted', 'success');
            nav.goBack();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to delete transaction');
          }
        }
      }
    ]);
  }, [activeSpaceId, nav, spacesEnabled, toast, tx]);

  return (
    <Screen scrollable onRefresh={load} refreshing={isLoading || isSaving}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable
          onPress={() => nav.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.8 : 1 })}
        >
          <ChevronLeft color={theme.colors.text} size={20} />
          <Text style={{ color: theme.colors.text, fontWeight: '900', marginLeft: 6 }}>Back</Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 14 }}>
        {error ? <InlineError message={error} /> : null}
        {isLoading ? <ActivityIndicator color={theme.colors.primary} /> : null}
      </View>

      {tx ? (
        <View style={{ marginTop: 12 }}>
          <Card>
            <Text style={{ color: theme.colors.textMuted, fontWeight: '800' }}>Amount</Text>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 22, marginTop: 6 }}>
              {formatMoney(tx.amount, currency)}
            </Text>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Details</Text>

            {!isEditing ? (
              <View style={{ marginTop: 10, gap: 8 }}>
                <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>Type: <Text style={{ color: theme.colors.text }}>{type === 'expense' ? 'Expense' : 'Income'}</Text></Text>
                <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>Category: <Text style={{ color: theme.colors.text }}>{resolvedCategory || '—'}</Text></Text>
                <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>Date: <Text style={{ color: theme.colors.text }}>{date}</Text></Text>
                <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>Budget: <Text style={{ color: theme.colors.text }}>{selectedBudgetId ? (budgets.find((b) => String(b.id) === String(selectedBudgetId))?.name ?? 'Selected') : 'None'}</Text></Text>
                {selectedBudgetId ? (
                  <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>Type of transaction: <Text style={{ color: theme.colors.text }}>{bucketLabel(bucket)}</Text></Text>
                ) : null}
                {selectedBudgetId ? (
                  <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>Mini budget: <Text style={{ color: theme.colors.text }}>{selectedMiniBudgetId ? (miniBudgets.find((m) => m.id === selectedMiniBudgetId)?.name ?? 'Selected') : 'None'}</Text></Text>
                ) : null}
                {description.trim() ? (
                  <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>Note: <Text style={{ color: theme.colors.text }}>{description}</Text></Text>
                ) : null}
              </View>
            ) : null}

            {isEditing ? (
              <>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  {(['expense', 'income'] as const).map((k) => {
                    const active = type === k;
                    return (
                      <Pressable
                        key={k}
                        onPress={() => setType(k)}
                        style={({ pressed }) => ({
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: 14,
                          alignItems: 'center',
                          backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                          opacity: pressed ? 0.92 : 1
                        })}
                      >
                        <Text style={{ color: active ? '#fff' : theme.colors.text, fontWeight: '900' }}>
                          {k === 'expense' ? 'Expense' : 'Income'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={{ marginTop: 10 }}>
                  <TextField label="Amount" value={amount} onChangeText={(v) => setAmount(formatNumberInput(v))} placeholder="e.g. 2,500" keyboardType="numeric" />
                </View>

                <View style={{ marginTop: 2 }}>
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
                      const current = new Date(`${date}T12:00:00`);
                      if (!Number.isNaN(current.getTime())) {
                        setCalendarCursor(new Date(current.getFullYear(), current.getMonth(), 1));
                      }
                      setShowDatePicker(true);
                    }}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceAlt,
                      borderRadius: 16,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      opacity: pressed ? 0.92 : 1
                    })}
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

                <View style={{ marginTop: 10 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Category</Text>
                  <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
                    <Pressable
                      onPress={() => {
                        if (categories.length === 0) return;
                        setShowCategoryPicker((v) => !v);
                      }}
                      style={({ pressed }) => ({ paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: pressed ? 0.9 : 1 })}
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
                              style={({ pressed }) => ({
                                paddingVertical: 12,
                                paddingHorizontal: 12,
                                backgroundColor: pressed || active ? theme.colors.surfaceAlt : 'transparent'
                              })}
                            >
                              <Text style={{ color: theme.colors.text, fontWeight: active ? '900' : '700' }}>{String(c)}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                </View>

                {category === 'Other' ? (
                  <View style={{ marginTop: 10 }}>
                    <TextField label="Other category" value={otherCategory} onChangeText={setOtherCategory} placeholder="e.g. Gifts" maxLength={60} autoCapitalize="words" />
                  </View>
                ) : null}

                <View style={{ marginTop: 10 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Budget</Text>
                  <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
                    <Pressable
                      onPress={() => {
                        if (budgets.length === 0) return;
                        setShowBudgetPicker((v) => !v);
                      }}
                      style={({ pressed }) => ({ paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: pressed ? 0.9 : 1 })}
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
                        <Pressable
                          onPress={() => {
                            setSelectedBudgetId(null);
                            setSelectedMiniBudgetId(null);
                            setShowBudgetPicker(false);
                          }}
                          style={({ pressed }) => ({
                            paddingVertical: 12,
                            paddingHorizontal: 12,
                            backgroundColor: pressed || !selectedBudgetId ? theme.colors.surfaceAlt : 'transparent'
                          })}
                        >
                          <Text style={{ color: theme.colors.text, fontWeight: !selectedBudgetId ? '900' : '700' }}>None</Text>
                        </Pressable>
                        {budgets.map((b: any) => {
                          const active = String(b.id) === String(selectedBudgetId);
                          return (
                            <Pressable
                              key={String(b.id)}
                              onPress={() => {
                                setSelectedBudgetId(String(b.id));
                                setShowBudgetPicker(false);
                              }}
                              style={({ pressed }) => ({
                                paddingVertical: 12,
                                paddingHorizontal: 12,
                                backgroundColor: pressed || active ? theme.colors.surfaceAlt : 'transparent'
                              })}
                            >
                              <Text style={{ color: theme.colors.text, fontWeight: active ? '900' : '700' }}>{b.name}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                </View>

                {selectedBudgetId ? (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Type of transaction</Text>
                    <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
                      <Pressable
                        onPress={() => setShowBucketPicker((v) => !v)}
                        style={({ pressed }) => ({ paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: pressed ? 0.9 : 1 })}
                      >
                        <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{bucketLabel(bucket)}</Text>
                        <Text style={{ color: theme.colors.textMuted }}>▼</Text>
                      </Pressable>
                      {showBucketPicker ? (
                        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }}>
                          {BUCKETS.map((c) => {
                            const active = c === bucket;
                            return (
                              <Pressable
                                key={c}
                                onPress={() => {
                                  setBucket(c);
                                  setShowBucketPicker(false);
                                }}
                                style={({ pressed }) => ({
                                  paddingVertical: 12,
                                  paddingHorizontal: 12,
                                  backgroundColor: pressed || active ? theme.colors.surfaceAlt : 'transparent'
                                })}
                              >
                                <Text style={{ color: theme.colors.text, fontWeight: active ? '900' : '700' }}>{bucketLabel(c)}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                {selectedBudgetId ? (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Mini budget</Text>
                    <Text style={{ color: theme.colors.textMuted, fontWeight: '700', marginTop: 4, fontSize: 12 }}>
                      Shows mini budgets under: {bucketLabel(bucket)}
                    </Text>
                    <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
                      <Pressable
                        onPress={() => {
                          if (miniBudgetsForBucket.length === 0) return;
                          setShowMiniBudgetPicker((v) => !v);
                        }}
                        style={({ pressed }) => ({ paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: pressed ? 0.9 : 1 })}
                      >
                        <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
                          {miniBudgetsForBucket.length === 0
                            ? `No mini budgets for ${bucketLabel(bucket)}`
                            : selectedMiniBudgetId
                              ? miniBudgetsForBucket.find((m) => m.id === selectedMiniBudgetId)?.name ?? 'Selected mini budget'
                              : 'None'}
                        </Text>
                        {miniBudgetsForBucket.length > 0 ? <Text style={{ color: theme.colors.textMuted }}>▼</Text> : null}
                      </Pressable>

                      {showMiniBudgetPicker ? (
                        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }}>
                          <Pressable
                            onPress={() => {
                              setSelectedMiniBudgetId(null);
                              setShowMiniBudgetPicker(false);
                            }}
                            style={({ pressed }) => ({
                              paddingVertical: 12,
                              paddingHorizontal: 12,
                              backgroundColor: pressed || !selectedMiniBudgetId ? theme.colors.surfaceAlt : 'transparent'
                            })}
                          >
                            <Text style={{ color: theme.colors.text, fontWeight: !selectedMiniBudgetId ? '900' : '700' }}>None</Text>
                          </Pressable>
                          {miniBudgetsForBucket.map((m) => {
                            const active = m.id === selectedMiniBudgetId;
                            return (
                              <Pressable
                                key={m.id}
                                onPress={() => {
                                  setSelectedMiniBudgetId(m.id);
                                  setShowMiniBudgetPicker(false);
                                }}
                                style={({ pressed }) => ({
                                  paddingVertical: 12,
                                  paddingHorizontal: 12,
                                  backgroundColor: pressed || active ? theme.colors.surfaceAlt : 'transparent'
                                })}
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

                <View style={{ marginTop: 10 }}>
                  <TextField label="Note (optional)" value={description} onChangeText={setDescription} placeholder="Optional note…" />
                </View>
              </>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title={isSaving ? 'Saving…' : isDirty ? 'Save changes' : 'Edit'}
                  onPress={() => {
                    if (!isEditing) {
                      setIsEditing(true);
                      return;
                    }
                    if (isDirty) {
                      void handleSave();
                      return;
                    }
                    setIsEditing(false);
                  }}
                  disabled={isSaving}
                />
              </View>
              <View style={{ flex: 1 }}>
                <SecondaryButton title={isEditing ? 'Cancel' : 'Delete'} onPress={isEditing ? () => { setIsEditing(false); void load(); } : confirmDelete} />
              </View>
            </View>
          </Card>
        </View>
      ) : null}

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
                    style={({ pressed }) => ({ paddingVertical: 8, paddingHorizontal: 10, opacity: pressed ? 0.85 : 1 })}
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
                    style={({ pressed }) => ({ paddingVertical: 8, paddingHorizontal: 10, opacity: pressed ? 0.85 : 1 })}
                  >
                    <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>›</Text>
                  </Pressable>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
                    <Text key={d} style={{ width: 36, textAlign: 'center', color: theme.colors.textMuted, fontWeight: '800' }}>{d}</Text>
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
                          style={({ pressed }) => ({
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isSelected ? theme.colors.primary : pressed ? theme.colors.surfaceAlt : 'transparent'
                          })}
                        >
                          <Text style={{ color: isSelected ? '#fff' : theme.colors.text, fontWeight: isSelected ? '900' : '700' }}>{day}</Text>
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
