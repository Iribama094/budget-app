import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, ScrollView, Switch, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardPaste, Delete, PieChart, Plus, Receipt, Sparkles, Wallet, X } from 'lucide-react-native';

import { createTransaction, listBudgets, listGoals, listMiniBudgets, listMiniBudgetsInSpace, listTransactions, type ApiBudget, type ApiGoal } from '../api/endpoints';
import { addMoneyToGoal } from '../api/business';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { IconButton, InlineError, ListCard, PrimaryButton, Screen, SegmentedControl, TextField, formatAmount } from '../components/Common/ui';
import { useToast } from '../components/Common/Toast';
import { useSync } from '../contexts/SyncContext';
import { bucketColor } from '../theme/theme';
import { fonts, type as typo } from '../theme/typography';
import { useCategories } from '../contexts/CategoriesContext';
import { suggestCategory } from '../api/personal';
import { BUCKETS, bucketDisplayName, normalizeBucket, type Bucket } from '../theme/buckets';
import { guessIconKey, iconForKey } from '../lib/categoryIcons';
import { currencySymbol, formatNumberInput, formatShortDate, toIsoDate, toIsoDateTime } from '../utils/format';


export function AddTransactionScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId, activeSpace } = useSpace();
  const toast = useToast();
  const { saveTransaction } = useSync();

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
  const [budgetTxnType, setBudgetTxnType] = useState<Bucket>('Needs');
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
    (key: string) => bucketDisplayName(key, isBusiness),
    [isBusiness]
  );
  const { expense: expenseCategories, income: incomeCategories, create: createCategory } = useCategories();
  const categoryItems = type === 'expense' ? expenseCategories : incomeCategories;
  const categories = useMemo(() => categoryItems.map((c) => c.name), [categoryItems]);

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

  const budgetCategoryLabel: string = budgetTxnType;

  const budgetCategoryDisplay = useMemo(() => {
    return bucketLabel(budgetCategoryLabel);
  }, [bucketLabel, budgetCategoryLabel]);

  const selectedBudget = useMemo(() => {
    if (!selectedBudgetId) return null;
    return budgets.find((b) => String(b.id) === String(selectedBudgetId)) ?? null;
  }, [budgets, selectedBudgetId]);

  const requiresBudget = type === 'expense' || (type === 'income' && applyToBudget);

  const allowedBudgetTypes = useMemo(() => {
    const present = new Set(Object.keys(selectedBudget?.categories ?? {}).map((k) => normalizeBucket(k)));
    const list = BUCKETS.some((b) => present.has(b)) ? BUCKETS.filter((b) => present.has(b)) : [...BUCKETS];
    return list.map((b) => ({ key: b, label: bucketLabel(b) }));
  }, [bucketLabel, selectedBudget?.categories]);

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

  const resolvedCategory = category.trim();

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

      const result = await saveTransaction({
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
        try {
          // The expense above already records the Savings budget entry. This only links its goal progress.
          await addMoneyToGoal(String(selectedGoalId), { amount: parsedAmount, occurredOn: date, recordInBudget: false });
        } catch (e) {
          toast.show(e instanceof Error ? e.message : 'Saved transaction but failed to update goal', 'error');
        }
      }
      if (result.status === 'queued') toast.show('Saved on this phone. It will sync when you’re back online.', 'info', 4000);
      else toast.show(type === 'expense' ? 'Expense saved' : 'Income saved', 'success');
      nav.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this transaction. Check your connection and try again.');
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

  // Suggest a category from the note, learned from this person's past choices.
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [suggested, setSuggested] = useState<string | null>(null);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatBucket, setNewCatBucket] = useState<Bucket>('Wants');
  const [savingCat, setSavingCat] = useState(false);
  React.useEffect(() => {
    const text = description.trim();
    if (categoryTouched || text.length < 3) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      suggestCategory(text, type, spacesEnabled ? activeSpaceId : 'personal')
        .then((hit) => {
          if (cancelled || !hit || !categories.includes(hit.category)) return;
          setCategory(hit.category);
          setSuggested(hit.category);
        })
        .catch(() => undefined);
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeSpaceId, categories, categoryTouched, description, spacesEnabled, type]);

  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const glyph = currencySymbol(user?.currency);
  const [showBudgetSheet, setShowBudgetSheet] = useState(false);
  const [bucketSpent, setBucketSpent] = useState<number | null>(null);

  // Details read from a pasted bank alert (see BankAlertScreen).
  React.useEffect(() => {
    const p = route.params?.prefill;
    if (!p) return;
    const nextType = p.type === 'income' ? 'income' : 'expense';
    setType(nextType);
    setApplyToBudget(nextType === 'expense');
    if (Number(p.amount) > 0) setAmount(formatNumberInput(String(p.amount)));
    if (p.description) setDescription(String(p.description).slice(0, 120));
    if (p.occurredAt) setDate(toIsoDate(new Date(p.occurredAt)));
    // Let the type change settle before choosing a category from that type's list.
    setTimeout(() => p.category && setCategory(String(p.category)), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.prefill]);

  // Quick actions on Home can open this screen straight into Income.
  React.useEffect(() => {
    if (route.params?.type === 'income') {
      setType('income');
      setApplyToBudget(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Picking a category pre-selects the budget bucket it usually belongs to.
  React.useEffect(() => {
    if (type !== 'expense' || !category) return;
    const guess = normalizeBucket(categoryItems.find((x) => x.name === category)?.bucket);
    if (guess && allowedBudgetTypes.some((t) => t.key === guess)) setBudgetTxnType(guess);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, type]);

  // How much of the chosen bucket is already spent, for the impact preview.
  React.useEffect(() => {
    setBucketSpent(null);
    if (!selectedBudget || type !== 'expense') return;
    let cancelled = false;
    (async () => {
      try {
        const start = parseIsoDateLocal(selectedBudget.startDate) ?? new Date();
        start.setHours(0, 0, 0, 0);
        const end = parseIsoDateLocal(selectedBudget.endDate ?? null) ?? new Date(start.getFullYear(), start.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        let cursor: string | undefined;
        let spent = 0;
        for (let page = 0; page < 5; page++) {
          const res = await listTransactions({
            start: toIsoDateTime(start),
            end: toIsoDateTime(end),
            limit: 200,
            cursor,
            type: 'expense',
            budgetId: String(selectedBudget.id),
            spaceId: spacesEnabled ? activeSpaceId : undefined
          });
          for (const t of res.items || []) {
            if (String(t.budgetCategory ?? '') === budgetCategoryLabel) spent += Number(t.amount) || 0;
          }
          if (!res.nextCursor) break;
          cursor = res.nextCursor;
        }
        if (!cancelled) setBucketSpent(spent);
      } catch {
        if (!cancelled) setBucketSpent(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBudget?.id, budgetCategoryLabel, type, activeSpaceId, spacesEnabled]);

  const bucketBudgeted = Number((selectedBudget?.categories as any)?.[budgetCategoryLabel]?.budgeted ?? 0) || 0;
  const impact =
    type === 'expense' && requiresBudget && bucketBudgeted > 0 && bucketSpent != null && Number.isFinite(parsedAmount) && parsedAmount > 0
      ? { used: (bucketSpent + parsedAmount) / bucketBudgeted, left: bucketBudgeted - bucketSpent - parsedAmount, before: bucketSpent / bucketBudgeted }
      : null;

  const onKey = (key: string) => {
    const raw = amount.replace(/,/g, '');
    let next = raw;
    if (key === 'back') next = raw.slice(0, -1);
    else if (key === '.') next = raw.includes('.') ? raw : `${raw || '0'}.`;
    else {
      const [int, frac] = raw.split('.');
      if (frac != null && frac.length >= 2) return;
      if (frac == null && (int ?? '').replace(/^0+/, '').length >= 12) return;
      next = raw === '0' ? key : raw + key;
    }
    setAmount(formatNumberInput(next));
  };

  const todayIso = toIsoDate(new Date());
  const yesterdayIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toIsoDate(d);
  })();
  const dateLabel = date === todayIso ? 'Today' : date === yesterdayIso ? 'Yesterday' : formatShortDate(date);
  const selectedMini = miniBudgetsForCategory.find((m) => m.id === selectedMiniBudgetId) ?? null;
  const budgetName = selectedBudget ? selectedBudget.name.replace(/^My Budget \((.*)\)$/, '$1') : null;

  const blocker = !(Number.isFinite(parsedAmount) && parsedAmount > 0)
    ? 'Enter an amount'
    : !resolvedCategory
      ? 'Pick a category'
      : requiresBudget && !selectedBudgetId
        ? type === 'expense'
          ? 'Create a budget first to track this expense'
          : 'Choose a budget, or turn off “Count toward a budget”'
        : null;

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];

  return (
    <Screen scrollable={false} style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Close" onPress={() => nav.goBack()}>
          <X color={theme.colors.text} size={20} />
        </IconButton>
        <SegmentedControl
          options={[
            { key: 'expense', label: 'Expense' },
            { key: 'income', label: 'Income' }
          ]}
          value={type}
          onChange={(k) => {
            setType(k);
            setCategory('');
            setCategoryTouched(false);
            setSuggested(null);
            if (k === 'expense') {
              setApplyToBudget(true);
            } else {
              setApplyToBudget(false);
              setSelectedMiniBudgetId(null);
            }
          }}
          style={{ width: 200 }}
        />
        <IconButton accessibilityLabel="Paste a bank alert" onPress={() => nav.navigate('BankAlertImport')}>
          <ClipboardPaste color={theme.colors.text} size={19} />
        </IconButton>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.amountWrap} accessible accessibilityLabel={`Amount ${amount || '0'}`}>
          <Text style={[styles.amountGlyph, { color: theme.colors.textMuted }]}>{glyph}</Text>
          <Text style={[styles.amount, { color: amount ? theme.colors.text : theme.colors.textMuted }]} numberOfLines={1} adjustsFontSizeToFit>
            {amount || '0'}
          </Text>
        </View>
        <Text style={[typo.caption, { color: theme.colors.textMuted, textAlign: 'center' }]}>
          {[spacesEnabled ? `${activeSpace?.name ?? 'Personal'} space` : null, requiresBudget && budgetName ? `${budgetName} budget` : null].filter(Boolean).join(' · ') ||
            (type === 'income' ? 'Not counted toward a budget' : ' ')}
        </Text>

        {error ? (
          <View style={{ marginTop: 12 }}>
            <InlineError message={error} />
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          {categoryItems.map((c) => {
            const active = category === c.name;
            const Icon = iconForKey(c.icon);
            return (
              <Pressable
                key={c.id}
                onPress={() => {
                  setCategory(c.name);
                  setCategoryTouched(true);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.chip,
                  styles.chipRow,
                  { backgroundColor: active ? theme.colors.primary : theme.colors.surface, borderColor: active ? theme.colors.primary : theme.colors.border }
                ]}
              >
                {Icon ? <Icon color={active ? theme.colors.onPrimary : theme.colors.textMuted} size={14} /> : null}
                <Text style={[typo.smallStrong, { color: active ? theme.colors.onPrimary : theme.colors.text }]}>{c.name}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setShowNewCategory(true)}
            accessibilityRole="button"
            accessibilityLabel="Add a category"
            style={[styles.chip, styles.chipRow, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primarySoft }]}
          >
            <Plus color={theme.colors.primary} size={14} />
            <Text style={[typo.smallStrong, { color: theme.colors.primary }]}>New</Text>
          </Pressable>
        </ScrollView>
        {suggested && suggested === category ? (
          <View style={styles.suggested}>
            <Sparkles color={theme.colors.primary} size={13} />
            <Text style={[typo.caption, { color: theme.colors.primary, fontFamily: fonts.semibold }]}>Suggested from your past spending</Text>
          </View>
        ) : null}

        <ListCard>
          <View style={styles.row}>
            <Receipt color={theme.colors.textMuted} size={18} />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Add a note, like the shop name"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.noteInput, { color: theme.colors.text }]}
              returnKeyType="done"
            />
          </View>
          <View style={styles.row}>
            <CalendarDays color={theme.colors.textMuted} size={18} />
            <Text style={[typo.body, { color: theme.colors.text, flex: 1 }]}>{dateLabel}</Text>
            {[
              { label: 'Today', iso: todayIso },
              { label: 'Yesterday', iso: yesterdayIso }
            ]
              .filter((d) => d.iso !== date)
              .map((d) => (
                <Pressable key={d.label} onPress={() => setDate(d.iso)} style={[styles.miniChip, { backgroundColor: theme.colors.surfaceAlt }]}>
                  <Text style={[typo.caption, { color: theme.colors.text, fontFamily: fonts.semibold }]}>{d.label}</Text>
                </Pressable>
              ))}
            <Pressable
              onPress={() => {
                const current = parseIsoDateLocal(date) ?? new Date();
                setCalendarCursor(new Date(current.getFullYear(), current.getMonth(), 1));
                setShowDatePicker(true);
              }}
              style={[styles.miniChip, { backgroundColor: theme.colors.surfaceAlt }]}
              accessibilityLabel="Pick a date"
            >
              <Text style={[typo.caption, { color: theme.colors.primary, fontFamily: fonts.semibold }]}>Pick</Text>
            </Pressable>
          </View>
          {type === 'income' ? (
            <View style={styles.row}>
              <Wallet color={theme.colors.textMuted} size={18} />
              <Text style={[typo.body, { color: theme.colors.text, flex: 1 }]}>Count toward a budget</Text>
              <Switch
                value={applyToBudget}
                onValueChange={(v) => {
                  setApplyToBudget(v);
                  if (!v) setSelectedMiniBudgetId(null);
                }}
                trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                thumbColor="#FFFFFF"
              />
            </View>
          ) : null}
          {requiresBudget ? (
            <Pressable onPress={() => setShowBudgetSheet(true)} style={styles.row} accessibilityRole="button">
              <PieChart color={theme.colors.textMuted} size={18} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[typo.body, { color: theme.colors.text }]}>
                  {budgets.length === 0 ? 'No budget yet' : `${budgetCategoryDisplay}${selectedMini ? ` · ${selectedMini.name}` : ''}`}
                </Text>
                {budgetName ? <Text style={[typo.caption, { color: theme.colors.textMuted }]}>{budgetName}</Text> : null}
              </View>
              <ChevronRight color={theme.colors.textMuted} size={17} />
            </Pressable>
          ) : null}
        </ListCard>

        {showGoalLink && goals.length > 0 ? (
          <View style={{ marginTop: 12 }}>
            <Text style={[typo.caption, { color: theme.colors.textMuted, marginBottom: 6 }]}>Also add this to a goal?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {[{ id: null as string | null, label: 'No' }, ...goals.map((g) => ({ id: String(g.id), label: `${g.emoji ? `${g.emoji} ` : ''}${g.name}` }))].map((g) => {
                const active = String(selectedGoalId) === String(g.id);
                return (
                  <Pressable
                    key={String(g.id)}
                    onPress={() => setSelectedGoalId(g.id)}
                    style={[styles.chip, { backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface, borderColor: active ? theme.colors.primary : theme.colors.border }]}
                  >
                    <Text style={[typo.smallStrong, { color: active ? theme.colors.primary : theme.colors.text }]}>{g.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {impact ? (
          <View style={[styles.impact, { backgroundColor: impact.used > 1 ? theme.colors.errorSoft : impact.used > 0.8 ? theme.colors.brassSoft : theme.colors.primarySoft }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[typo.caption, { color: theme.colors.text, fontFamily: fonts.semibold }]}>{budgetCategoryDisplay} after this</Text>
              <Text style={[typo.caption, { color: impact.left < 0 ? theme.colors.error : theme.colors.text }]}>
                {Math.round(impact.used * 100)}% used · {impact.left < 0 ? `over by ${formatAmount(Math.abs(impact.left), glyph)}` : `${formatAmount(impact.left, glyph)} left`}
              </Text>
            </View>
            <View style={[styles.impactTrack, { backgroundColor: theme.colors.surface }]}>
              <View style={{ width: `${Math.min(100, impact.before * 100)}%`, backgroundColor: bucketColor(theme, budgetCategoryLabel) }} />
              <View style={{ width: `${Math.max(0, Math.min(100, impact.used * 100) - Math.min(100, impact.before * 100))}%`, backgroundColor: theme.colors.brass }} />
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.keys}>
        {keys.map((k) => (
          <Pressable
            key={k}
            onPress={() => onKey(k)}
            onLongPress={k === 'back' ? () => setAmount('') : undefined}
            accessibilityRole="button"
            accessibilityLabel={k === 'back' ? 'Delete digit' : k === '.' ? 'Decimal point' : k}
            style={({ pressed }) => [styles.key, { backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent' }]}
          >
            {k === 'back' ? <Delete color={theme.colors.text} size={22} /> : <Text style={[styles.keyText, { color: theme.colors.text }]}>{k}</Text>}
          </Pressable>
        ))}
      </View>

      {blocker && (amount || category) ? <Text style={[typo.caption, { color: theme.colors.textMuted, textAlign: 'center', marginBottom: 6 }]}>{blocker}</Text> : null}
      <PrimaryButton title={type === 'expense' ? 'Save expense' : 'Save income'} onPress={submit} disabled={!canSubmit} loading={isSaving} />

      <Modal transparent visible={showDatePicker} animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={() => setShowDatePicker(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
            <View style={styles.sheetHeader}>
              <Pressable
                hitSlop={10}
                onPress={() => setCalendarCursor(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1))}
                accessibilityLabel="Previous month"
              >
                <ChevronLeft color={theme.colors.text} size={20} />
              </Pressable>
              <Text style={[typo.title, { color: theme.colors.text }]}>{monthLabel}</Text>
              <Pressable
                hitSlop={10}
                onPress={() => setCalendarCursor(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1))}
                accessibilityLabel="Next month"
              >
                <ChevronRight color={theme.colors.text} size={20} />
              </Pressable>
            </View>
            <View style={styles.weekRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <Text key={`${d}${i}`} style={[typo.caption, styles.dayCell, { color: theme.colors.textMuted }]}>
                  {d}
                </Text>
              ))}
            </View>
            {calendarGrid.map((row, r) => (
              <View key={r} style={styles.weekRow}>
                {row.map((day, c) => {
                  if (!day) return <View key={c} style={styles.dayCell} />;
                  const iso = toIsoDate(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), day));
                  const selected = iso === date;
                  const future = iso > todayIso;
                  return (
                    <Pressable
                      key={c}
                      disabled={future}
                      onPress={() => {
                        setDate(iso);
                        setDateManual(false);
                        setShowDatePicker(false);
                      }}
                      style={[styles.dayCell, styles.dayBtn, { backgroundColor: selected ? theme.colors.primary : 'transparent', opacity: future ? 0.3 : 1 }]}
                    >
                      <Text style={[typo.bodyStrong, { color: selected ? theme.colors.onPrimary : theme.colors.text }]}>{day}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent visible={showBudgetSheet} animationType="slide" onRequestClose={() => setShowBudgetSheet(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={() => setShowBudgetSheet(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
            <Text style={[typo.title, { color: theme.colors.text }]}>Budget</Text>
            {budgets.length === 0 ? (
              <View style={{ marginTop: 12 }}>
                <Text style={[typo.body, { color: theme.colors.textMuted }]}>You don’t have a budget yet. Create one to track spending against a plan.</Text>
                <PrimaryButton
                  title="Create a budget"
                  style={{ marginTop: 14 }}
                  onPress={() => {
                    setShowBudgetSheet(false);
                    nav.navigate('Main', { screen: 'Budget' });
                  }}
                />
              </View>
            ) : (
              <>
                <Text style={[typo.caption, styles.sheetLabel, { color: theme.colors.textMuted }]}>Which budget</Text>
                <View style={styles.wrap}>
                  {budgets.map((b) => {
                    const active = String(b.id) === String(selectedBudgetId);
                    return (
                      <Pressable
                        key={String(b.id)}
                        onPress={() => setSelectedBudgetId(String(b.id))}
                        style={[styles.chip, { backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface, borderColor: active ? theme.colors.primary : theme.colors.border }]}
                      >
                        <Text style={[typo.smallStrong, { color: active ? theme.colors.primary : theme.colors.text }]}>{b.name.replace(/^My Budget \((.*)\)$/, '$1')}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[typo.caption, styles.sheetLabel, { color: theme.colors.textMuted }]}>Bucket</Text>
                <View style={styles.wrap}>
                  {allowedBudgetTypes.map((opt) => {
                    const active = budgetTxnType === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        onPress={() => setBudgetTxnType(opt.key)}
                        style={[styles.chip, { backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface, borderColor: active ? theme.colors.primary : theme.colors.border }]}
                      >
                        <Text style={[typo.smallStrong, { color: active ? theme.colors.primary : theme.colors.text }]}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {miniBudgetsForCategory.length > 0 ? (
                  <>
                    <Text style={[typo.caption, styles.sheetLabel, { color: theme.colors.textMuted }]}>Mini budget (optional)</Text>
                    <View style={styles.wrap}>
                      {[{ id: null as string | null, name: 'None' }, ...miniBudgetsForCategory].map((m) => {
                        const active = (selectedMiniBudgetId ?? null) === m.id;
                        return (
                          <Pressable
                            key={String(m.id)}
                            onPress={() => setSelectedMiniBudgetId(m.id)}
                            style={[styles.chip, { backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface, borderColor: active ? theme.colors.primary : theme.colors.border }]}
                          >
                            <Text style={[typo.smallStrong, { color: active ? theme.colors.primary : theme.colors.text }]}>{m.name}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : null}
                <PrimaryButton title="Done" onPress={() => setShowBudgetSheet(false)} style={{ marginTop: 18 }} />
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent visible={showNewCategory} animationType="slide" onRequestClose={() => setShowNewCategory(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={() => setShowNewCategory(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
            <Text style={[typo.title, { color: theme.colors.text, marginBottom: 12 }]}>New {type === 'expense' ? 'spending' : 'income'} category</Text>
            <TextField
              label="Name"
              value={newCatName}
              onChangeText={setNewCatName}
              placeholder={type === 'expense' ? 'e.g. Generator fuel, Hair, Contributions' : 'e.g. Rent from tenants'}
              maxLength={40}
              autoCapitalize="words"
              autoFocus
            />
            {type === 'expense' ? (
              <>
                <Text style={[typo.smallStrong, { color: theme.colors.text, marginBottom: 8 }]}>Counts as</Text>
                <SegmentedControl options={BUCKETS.map((b) => ({ key: b, label: bucketDisplayName(b, isBusiness) }))} value={newCatBucket} onChange={setNewCatBucket} />
              </>
            ) : null}
            <PrimaryButton
              title="Add category"
              style={{ marginTop: 18 }}
              disabled={!newCatName.trim()}
              loading={savingCat}
              onPress={async () => {
                setSavingCat(true);
                try {
                  const created = await createCategory({
                    name: newCatName.trim(),
                    type,
                    bucket: type === 'expense' ? newCatBucket : null,
                    icon: guessIconKey(newCatName, type === 'income')
                  });
                  setCategory(created.name);
                  setCategoryTouched(true);
                  if (type === 'expense' && created.bucket && allowedBudgetTypes.some((t) => t.key === created.bucket)) setBudgetTxnType(created.bucket);
                  setNewCatName('');
                  setShowNewCategory(false);
                } catch (e) {
                  toast.show(e instanceof Error ? e.message : 'Could not add that category', 'error');
                } finally {
                  setSavingCat(false);
                }
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  amountWrap: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', marginTop: 14, paddingHorizontal: 12 },
  amountGlyph: { fontFamily: fonts.medium, fontSize: 26, marginTop: 8, marginRight: 4 },
  amount: { fontFamily: fonts.display, fontSize: 52, lineHeight: 62, letterSpacing: -2, fontVariant: ['tabular-nums'] },
  chipsScroll: { marginHorizontal: -20, marginTop: 16, marginBottom: 12, flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 20 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50 },
  noteInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, paddingVertical: 12 },
  miniChip: { height: 28, paddingHorizontal: 10, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chipRow: { flexDirection: 'row', gap: 6 },
  suggested: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4, marginBottom: 10 },
  impact: { marginTop: 12, borderRadius: 14, padding: 12 },
  impactTrack: { flexDirection: 'row', height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 8 },
  keys: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, marginBottom: 8 },
  key: { width: '33.333%', height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  keyText: { fontFamily: fonts.displayRegular, fontSize: 24 },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetLabel: { marginTop: 16, marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  dayCell: { width: 40, height: 40, textAlign: 'center', textAlignVertical: 'center', lineHeight: 40 },
  dayBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: 12 }
});
