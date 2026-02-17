import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Switch, Modal, TouchableOpacity, ScrollView, Animated, useWindowDimensions, FlatList } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Slider from '@react-native-community/slider';

import { createBudget, listBudgets, listTransactions, patchBudget, patchBudgetInSpace, calcTax, type ApiBudget, type ApiTransaction } from '../api/endpoints';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus, Eye, EyeOff, ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Card, InlineError, P, PrimaryButton, SecondaryButton, Screen, TextField, H1 } from '../components/Common/ui';
import { formatMoney, toIsoDate, toIsoDateTime } from '../utils/format';
import { tokens } from '../theme/tokens';
import { useToast } from '../components/Common/Toast';
import { useAmountVisibility } from '../contexts/AmountVisibilityContext';
import { useSpace } from '../contexts/SpaceContext';
import { SpaceSwitcher } from '../components/Common/SpaceSwitcher';
import { useTour, useTourAnchor } from '../contexts/TourContext';
import { useNudges } from '../contexts/NudgesContext';
import { NudgeTooltip } from '../components/Common/NudgeTooltip';

export function BudgetScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId, activeSpace } = useSpace();
  const toast = useToast();
  const nav = useNavigation();
  const route = useRoute<any>();
  const { showAmounts, toggleShowAmounts } = useAmountVisibility();
  const { isTourActive } = useTour();
  const { seen, markSeen } = useNudges();
  const createBudgetAnchorRef = useTourAnchor('budget.create');
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

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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

  const formatIsoDateLocal = (value?: string | null) => {
    const d = parseIsoDateLocal(value);
    return d ? d.toLocaleDateString() : '';
  };

  const getBudgetRange = (b: ApiBudget | null) => {
    if (!b) return null;
    const start = parseIsoDateLocal(b.startDate) ?? new Date();
    let end = parseIsoDateLocal(b.endDate ?? null);
    if (!end) {
      if (b.period === 'weekly') {
        end = new Date(start);
        end.setDate(start.getDate() + 6);
      } else {
        end = new Date(start);
        end.setMonth(start.getMonth() + 1);
        end.setDate(0);
      }
    }
    const msPerDay = 1000 * 60 * 60 * 24;
    const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1);
    const weeks = Math.max(1, Math.ceil(days / 7));
    const months = Math.max(
      1,
      (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
    );
    return {
      start,
      end,
      startIso: toIsoDate(start),
      endIso: toIsoDate(end),
      days,
      weeks,
      months
    };
  };

  const formatBudgetTitle = (b: ApiBudget, range: { start: Date; end: Date }) => {
    const s = range.start;
    const e = range.end;
    const sameYear = s.getFullYear() === e.getFullYear();
    const sameMonth = s.getMonth() === e.getMonth() && sameYear;
    if (sameMonth) return `My Budget (${MONTHS[s.getMonth()]} ${s.getFullYear()})`;
    if (sameYear) return `My Budget (${MONTHS[s.getMonth()]}-${MONTHS[e.getMonth()]} ${s.getFullYear()})`;
    return `My Budget (${MONTHS[s.getMonth()]} ${s.getFullYear()}-${MONTHS[e.getMonth()]} ${e.getFullYear()})`;
  };

  const now = new Date();
  const years = Array.from({ length: 11 }, (_v, i) => now.getFullYear() - 5 + i);

  const [startMonthSel, setStartMonthSel] = useState<number>(now.getMonth());
  const [startYearSel, setStartYearSel] = useState<number>(now.getFullYear());
  const [endMonthSel, setEndMonthSel] = useState<number>(now.getMonth());
  const [endYearSel, setEndYearSel] = useState<number>(now.getFullYear());

  const [showStartMonthPicker, setShowStartMonthPicker] = useState(false);
  const [showStartYearPicker, setShowStartYearPicker] = useState(false);
  const [showEndMonthPicker, setShowEndMonthPicker] = useState(false);
  const [showEndYearPicker, setShowEndYearPicker] = useState(false);

  const durationMonths = useMemo(() => {
    const s = new Date(startYearSel, startMonthSel, 1);
    const e = new Date(endYearSel, endMonthSel, 1);
    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
    return Math.max(1, months);
  }, [startMonthSel, startYearSel, endMonthSel, endYearSel]);

  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>(durationMonths > 1 ? 'monthly' : 'weekly');

  useEffect(() => {
    if (durationMonths > 1 && timeframe !== 'monthly') setTimeframe('monthly');
    if (durationMonths === 1 && timeframe === 'monthly') setTimeframe('weekly');
  }, [durationMonths]);

  const [isEstimating, setIsEstimating] = useState(false);
  const [lastTaxEstimate, setLastTaxEstimate] = useState<number | null>(null);
  const [lastTaxLabel, setLastTaxLabel] = useState<string | null>(null);

  const [budget, setBudget] = useState<ApiBudget | null>(null);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [budgetsList, setBudgetsList] = useState<ApiBudget[]>([]);

  const [budgetTxByBudgetId, setBudgetTxByBudgetId] = useState<
    Record<string, { income: number; expenses: number; spentByCategory: Record<string, number> }>
  >({});

  const lastEditRequestRef = useRef<string | null>(null);

  const [budgetTxSummary, setBudgetTxSummary] = useState<{
    income: number;
    expenses: number;
    spentByCategory: Record<string, number>;
  }>({ income: 0, expenses: 0, spentByCategory: {} });

  const [totalBudget, setTotalBudget] = useState('');
  // Format input with commas as user types (no decimals)
  const handleTotalBudgetChange = (val: string) => {
    // Keep digits only
    let cleaned = val.replace(/[^0-9]/g, '');
    // Remove leading zeros
    cleaned = cleaned.replace(/^0+(?!$)/, '');
    // Format with commas for thousands
    const intPart = cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    setTotalBudget(intPart);
  };
  const [period, setPeriod] = useState<'monthly' | 'weekly'>('monthly');

  // Category selection & percentages (including Debt Financing)
  // Only preselect core categories, not all
  const [includeEssential, setIncludeEssential] = useState(true);
  const [includeSavings, setIncludeSavings] = useState(false);
  const [includeFree, setIncludeFree] = useState(false);
  const [includeInvestments, setIncludeInvestments] = useState(false);
  const [includeMisc, setIncludeMisc] = useState(false);
  const [includeDebt, setIncludeDebt] = useState(false);

  const [essentialPct, setEssentialPct] = useState<number>(45);
  const [savingsPct, setSavingsPct] = useState<number>(15);
  const [freePct, setFreePct] = useState<number>(15);
  const [investmentsPct, setInvestmentsPct] = useState<number>(15);
  const [miscPct, setMiscPct] = useState<number>(5);
  const [debtPct, setDebtPct] = useState<number>(5);

  // Multi-step wizard for budget setup
  const [setupStep, setSetupStep] = useState<1 | 2 | 3 | 4>(1);
  const progressAnim = useRef(new Animated.Value(1 / 4)).current;
  const [allocTouched, setAllocTouched] = useState(false);
  const [toastShown, setToastShown] = useState(false);
  const lastAllocFullRef = React.useRef(false);
  const { height: windowHeight } = useWindowDimensions();
  const [showLegend, setShowLegend] = useState(true);

  const [smartBalanceEnabled, setSmartBalanceEnabled] = useState(false);

  const parsedTotal = useMemo(() => {
    const n = Number(totalBudget.replace(/,/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }, [totalBudget]);

  const perMonthTotal = useMemo(() => {
    if (!Number.isFinite(parsedTotal) || parsedTotal <= 0 || durationMonths <= 1) return null;
    return parsedTotal / durationMonths;
  }, [durationMonths, parsedTotal]);

  const allocatedPercent = useMemo(() => {
    return (
      (includeEssential ? essentialPct : 0) +
      (includeSavings ? savingsPct : 0) +
      (includeFree ? freePct : 0) +
      (includeInvestments ? investmentsPct : 0) +
      (includeMisc ? miscPct : 0) +
      (includeDebt ? debtPct : 0)
    );
  }, [
    debtPct,
    essentialPct,
    freePct,
    includeDebt,
    includeEssential,
    includeFree,
    includeInvestments,
    includeMisc,
    includeSavings,
    investmentsPct,
    miscPct,
    savingsPct
  ]);

  const showDebtNudge = useMemo(() => {
    if (!allocTouched) return false;
    if (!includeDebt) return false;
    return debtPct > 0 && debtPct < 5;
  }, [allocTouched, debtPct, includeDebt]);

  const showSavingsNudge = useMemo(() => {
    if (!allocTouched) return false;
    if (!includeSavings) return false;
    return savingsPct > 0 && savingsPct < 10;
  }, [allocTouched, includeSavings, savingsPct]);

  const canSave = useMemo(() => {
    if (!Number.isFinite(parsedTotal) || parsedTotal <= 0) return false;
    const anySelected = includeEssential || includeSavings || includeFree || includeInvestments || includeMisc || includeDebt;
    if (!anySelected) return false;
    return Math.round(allocatedPercent) === 100;
  }, [allocatedPercent, includeDebt, includeEssential, includeFree, includeInvestments, includeMisc, includeSavings, parsedTotal]);

  useEffect(() => {
    const full = Number.isFinite(parsedTotal) && parsedTotal > 0 && allocTouched && Math.round(allocatedPercent) === 100;
    if (full && !lastAllocFullRef.current) {
      toast.show("Nice! You're giving every naira a job.", 'success', 3000);
      lastAllocFullRef.current = true;
      setToastShown(true);
    }
    if (!full) {
      lastAllocFullRef.current = false;
    }
  }, [allocTouched, allocatedPercent, parsedTotal, toast]);

  const isBudgetCurrent = useCallback(
    (b: ApiBudget) => {
      const r = getBudgetRange(b);
      if (!r) return false;
      const d = new Date();
      // compare at midday to avoid DST / timezone edge cases
      const nowMid = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
      return nowMid >= r.start && nowMid <= r.end;
    },
    // getBudgetRange depends on parseIsoDateLocal and toIsoDate, but is declared inline.
    // Safe to omit from deps because it doesn't capture mutable state.
    []
  );

  const budgetsSorted = useMemo(() => {
    const items = [...budgetsList];
    items.sort((a, b) => {
      const ar = getBudgetRange(a);
      const br = getBudgetRange(b);
      const at = ar?.start?.getTime?.() ?? 0;
      const bt = br?.start?.getTime?.() ?? 0;
      return bt - at;
    });
    return items;
  }, [budgetsList]);

  const previousBudget = useMemo(() => {
    const now = new Date();
    const past = budgetsList
      .map((b) => ({ b, r: getBudgetRange(b) }))
      .filter((x) => !!x.r && x.r!.end.getTime() < now.getTime())
      .sort((a, b) => b.r!.end.getTime() - a.r!.end.getTime());
    return past[0]?.b ?? null;
  }, [budgetsList]);

  const loadBudgetTxSummaries = useCallback(
    async (items: ApiBudget[]) => {
      if (!items.length) {
        setBudgetTxByBudgetId({});
        return;
      }

      const ranges = items
        .map((b) => getBudgetRange(b))
        .filter(Boolean) as Array<{ start: Date; end: Date }>;
      if (!ranges.length) {
        setBudgetTxByBudgetId({});
        return;
      }

      const minStart = new Date(Math.min(...ranges.map((r) => r.start.getTime())));
      const maxEnd = new Date(Math.max(...ranges.map((r) => r.end.getTime())));
      minStart.setHours(0, 0, 0, 0);
      maxEnd.setHours(23, 59, 59, 999);

      let cursor: string | null = null;
      const all: ApiTransaction[] = [];
      do {
        const res = await listTransactions({
          start: toIsoDateTime(minStart),
          end: toIsoDateTime(maxEnd),
          limit: 200,
          cursor: cursor ?? undefined,
          spaceId: spacesEnabled ? activeSpaceId : undefined
        });
        all.push(...(res.items || []));
        cursor = res.nextCursor ?? null;
      } while (cursor);

      const map: Record<string, { income: number; expenses: number; spentByCategory: Record<string, number> }> = {};
      for (const b of items) {
        map[String(b.id)] = { income: 0, expenses: 0, spentByCategory: {} };
      }

      for (const t of all) {
        const bid = t.budgetId ? String(t.budgetId) : '';
        if (!bid || !map[bid]) continue;

        if (t.type === 'income') {
          map[bid].income += t.amount;
          continue;
        }

        map[bid].expenses += t.amount;
        const cat = (t.budgetCategory || (t as any).category || '').trim();
        if (cat) map[bid].spentByCategory[cat] = (map[bid].spentByCategory[cat] ?? 0) + t.amount;
      }

      setBudgetTxByBudgetId(map);
    },
    [activeSpaceId, spacesEnabled]
  );

  const load = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await listBudgets(spacesEnabled ? { spaceId: activeSpaceId } : undefined);
      const raw = (res.items || []) as ApiBudget[];
      const items = spacesEnabled
        ? raw.filter((b) => ((b.spaceId ?? 'personal') as 'personal' | 'business') === activeSpaceId)
        : raw;
      setBudgetsList(items);

      await loadBudgetTxSummaries(items);

      if (!showSetup) {
        // Pick a current budget if one exists.
        const current = items
          .filter((b) => isBudgetCurrent(b))
          .sort((a, b) => {
            const ar = getBudgetRange(a);
            const br = getBudgetRange(b);
            return (br?.start?.getTime?.() ?? 0) - (ar?.start?.getTime?.() ?? 0);
          })[0];
        setBudget(current ?? null);

        if (!current && user?.monthlyIncome && !totalBudget) {
          setTotalBudget(String(user.monthlyIncome));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load budgets');
    } finally {
      setIsLoading(false);
    }
  }, [activeSpaceId, isBudgetCurrent, loadBudgetTxSummaries, showSetup, spacesEnabled, totalBudget, user?.monthlyIncome]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // If the user switches spaces while staying on this screen, clear old data immediately.
  useEffect(() => {
    if (!spacesEnabled) return;
    setBudgetsList([]);
    setBudgetTxByBudgetId({});
    setBudget(null);
    setError(null);
  }, [activeSpaceId, spacesEnabled]);

  useEffect(() => {
    if (!budget) {
      setBudgetTxSummary({ income: 0, expenses: 0, spentByCategory: {} });
      return;
    }
    setBudgetTxSummary(budgetTxByBudgetId[String(budget.id)] ?? { income: 0, expenses: 0, spentByCategory: {} });
  }, [budget?.id, budgetTxByBudgetId]);

  const applyHistoryPreset = useCallback(() => {
    if (!previousBudget || !previousBudget.categories) return;
    const cats = previousBudget.categories as Record<string, { budgeted: number; spent?: number }>;
    const getVal = (key: string) => {
      const c = cats[key];
      if (!c) return 0;
      const base = typeof c.spent === 'number' && c.spent > 0 ? c.spent : c.budgeted;
      return Math.max(0, base || 0);
    };

    const valEssential = getVal('Essential');
    const valSavings = getVal('Savings');
    const valFree = getVal('Free Spending');
    const valInvestments = getVal('Investments');
    const valMisc = getVal('Miscellaneous');
    const valDebt = getVal('Debt Financing');

    const total = valEssential + valSavings + valFree + valInvestments + valMisc + valDebt;
    if (!total || total <= 0) return;

    const toPct = (v: number) => (v / total) * 100;
    let ePct = toPct(valEssential);
    let sPct = toPct(valSavings);
    let fPct = toPct(valFree);
    let iPct = toPct(valInvestments);
    let mPct = toPct(valMisc);
    let dPct = toPct(valDebt);

    const sum = ePct + sPct + fPct + iPct + mPct + dPct;
    const scale = sum > 0 ? 100 / sum : 1;

    ePct = Math.round(ePct * scale);
    sPct = Math.round(sPct * scale);
    fPct = Math.round(fPct * scale);
    iPct = Math.round(iPct * scale);
    mPct = Math.round(mPct * scale);
    dPct = Math.round(dPct * scale);

    setIncludeEssential(valEssential > 0);
    setIncludeSavings(valSavings > 0);
    setIncludeFree(valFree > 0);
    setIncludeInvestments(valInvestments > 0);
    setIncludeMisc(valMisc > 0);
    setIncludeDebt(valDebt > 0);

    setEssentialPct(ePct);
    setSavingsPct(sPct);
    setFreePct(fPct);
    setInvestmentsPct(iPct);
    setMiscPct(mPct);
    setDebtPct(dPct);
    setAllocTouched(true);
    toast.show('Adjusted categories based on your past spending.', 'success', 2500);
  }, [previousBudget, toast]);

  const prefillFromBudget = useCallback(
    (b: ApiBudget) => {
      const start = parseIsoDateLocal(b.startDate) ?? new Date();
      const end = parseIsoDateLocal(b.endDate ?? null) ?? (() => {
        if (b.period === 'weekly') {
          const d = new Date(start);
          d.setDate(d.getDate() + 6);
          return d;
        }
        const d = new Date(start);
        d.setMonth(d.getMonth() + 1);
        d.setDate(0);
        return d;
      })();

      setStartMonthSel(start.getMonth());
      setStartYearSel(start.getFullYear());
      setEndMonthSel(end.getMonth());
      setEndYearSel(end.getFullYear());
      setPeriod(b.period);
      setTotalBudget(String(Math.round(b.totalBudget)).replace(/\B(?=(\d{3})+(?!\d))/g, ','));

      const total = b.totalBudget > 0 ? b.totalBudget : 1;
      const cats = b.categories || {};

      const getPct = (key: string) => {
        const c = (cats as any)[key] as { budgeted?: number } | undefined;
        if (!c || typeof c.budgeted !== 'number') return 0;
        return Math.round((c.budgeted / total) * 100);
      };

      const ePct = getPct('Essential');
      const sPct = getPct('Savings');
      const fPct = getPct('Free Spending');
      const iPct = getPct('Investments');
      const mPct = getPct('Miscellaneous');
      const dPct = getPct('Debt Financing');

      setIncludeEssential(ePct > 0);
      setIncludeSavings(sPct > 0);
      setIncludeFree(fPct > 0);
      setIncludeInvestments(iPct > 0);
      setIncludeMisc(mPct > 0);
      setIncludeDebt(dPct > 0);

      setEssentialPct(ePct || 0);
      setSavingsPct(sPct || 0);
      setFreePct(fPct || 0);
      setInvestmentsPct(iPct || 0);
      setMiscPct(mPct || 0);
      setDebtPct(dPct || 0);
      // Editing should not trigger the "every naira a job" toast until the user actually changes allocations.
      setAllocTouched(false);
      lastAllocFullRef.current = false;
      setToastShown(false);
    },
    [parseIsoDateLocal]
  );

  // Allow other screens to jump straight into the edit flow.
  useEffect(() => {
    const requestedId = route.params?.editBudgetId ? String(route.params.editBudgetId) : null;
    if (!requestedId) return;
    if (showSetup) return;
    if (lastEditRequestRef.current === requestedId) return;

    const target = budgetsList.find((x) => String(x.id) === requestedId);
    if (!target) return;

    lastEditRequestRef.current = requestedId;
    setEditingBudgetId(target.id);
    prefillFromBudget(target);
    setShowSetup(true);
    setSetupStep(1);

    // Clear the param so we don't reopen on subsequent re-renders.
    (nav as any).setParams?.({ editBudgetId: undefined });
  }, [budgetsList, nav, prefillFromBudget, route.params?.editBudgetId, showSetup]);

  const save = async () => {
    if (!canSave) return;
    setError(null);
    setIsSaving(true);
    try {
      const categories: Record<string, { budgeted: number }> = {};
      const gross = Number.isFinite(parsedTotal) ? parsedTotal : 0;
      const essentialAmt = Math.round((gross * essentialPct) / 100);
      const savingsAmt = Math.round((gross * savingsPct) / 100);
      const freeAmt = Math.round((gross * freePct) / 100);
      const investmentsAmt = Math.round((gross * investmentsPct) / 100);
      const miscAmt = Math.round((gross * miscPct) / 100);
      const debtAmt = Math.round((gross * debtPct) / 100);

      if (includeEssential && essentialAmt > 0) categories['Essential'] = { budgeted: essentialAmt };
      if (includeSavings && savingsAmt > 0) categories['Savings'] = { budgeted: savingsAmt };
      if (includeFree && freeAmt > 0) categories['Free Spending'] = { budgeted: freeAmt };
      if (includeInvestments && investmentsAmt > 0) categories['Investments'] = { budgeted: investmentsAmt };
      if (includeMisc && miscAmt > 0) categories['Miscellaneous'] = { budgeted: miscAmt };
      if (includeDebt && debtAmt > 0) categories['Debt Financing'] = { budgeted: debtAmt };

      const startDateObj = new Date(startYearSel, startMonthSel, 1);
      const endDateObj = new Date(endYearSel, endMonthSel + 1, 0);

      const nameForBudget = (() => {
        if (startYearSel === endYearSel && startMonthSel === endMonthSel) {
          return `My Budget (${MONTHS[startMonthSel]} ${startYearSel})`;
        }
        if (startYearSel === endYearSel) {
          return `My Budget (${MONTHS[startMonthSel]}-${MONTHS[endMonthSel]} ${startYearSel})`;
        }
        return `My Budget (${MONTHS[startMonthSel]} ${startYearSel}-${MONTHS[endMonthSel]} ${endYearSel})`;
      })();

      const baseInput = {
        name: nameForBudget,
        totalBudget: parsedTotal,
        period,
        startDate: toIsoDate(startDateObj),
        endDate: toIsoDate(endDateObj),
        categories
      };

      const created = editingBudgetId
        ? (spacesEnabled
            ? await patchBudgetInSpace(editingBudgetId, baseInput, activeSpaceId)
            : await patchBudget(editingBudgetId, baseInput))
        : await createBudget({
            ...baseInput,
            ...(spacesEnabled ? { spaceId: activeSpaceId } : {})
          });
      setBudget(created);
      setEditingBudgetId(null);
      // reload list after creation
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save budget';
      if (/Budget dates overlap an existing budget/i.test(message)) {
        toast.show('A budget already exists for that timeline.', 'error', 3500);
        return;
      }
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const incomeApplied = useMemo(() => {
    if (!budget) return 0;
    return budgetTxSummary.income || 0;
  }, [budget, budgetTxSummary.income]);

  const used = useMemo(() => {
    if (!budget) return 0;
    return budgetTxSummary.expenses || 0;
  }, [budget, budgetTxSummary.expenses]);

  const effectiveTotal = useMemo(() => {
    if (!budget) return 0;
    return Math.max(0, budget.totalBudget);
  }, [budget]);

  const remaining = useMemo(() => {
    if (!budget) return 0;
    return Math.max(0, effectiveTotal - used);
  }, [budget, effectiveTotal, used]);

  const progress = useMemo(() => {
    if (!budget || effectiveTotal <= 0) return 0;
    return Math.min(1, Math.max(0, used / effectiveTotal));
  }, [budget, effectiveTotal, used]);

  const budgetRange = useMemo(() => {
    return budget ? getBudgetRange(budget) : null;
  }, [budget?.id, budget?.startDate, budget?.endDate, budget?.period]);

  // Shared animation factor for dashboard progress bars
  const progressBarsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progressBarsAnim.setValue(0);
    Animated.timing(progressBarsAnim, {
      toValue: 1,
      duration: 450,
      useNativeDriver: false
    }).start();
  }, [budget?.id, used, budgetsList.length, progressBarsAnim]);

  const handleRefresh = async () => {
    try {
      await load();
    } catch {
      // ignore
    }
  };

  const headerTitle = showSetup ? (editingBudgetId ? 'Edit Budget' : 'Budget Setup') : 'Your Budgets';

  return (
    <Screen scrollable={showSetup} onRefresh={handleRefresh} refreshing={isLoading || isSaving}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 10, elevation: 10 }}>
        <H1 style={{ marginBottom: 0 }}>{headerTitle}</H1>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {!showSetup && (
            <Pressable
              onPress={toggleShowAmounts}
              accessibilityRole="button"
              accessibilityLabel={showAmounts ? 'Hide amounts' : 'Show amounts'}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={({ pressed }) => [
                {
                  width: 44,
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1
                }
              ]}
            >
              {showAmounts ? (
                <EyeOff color={theme.colors.textMuted} size={18} />
              ) : (
                <Eye color={theme.colors.textMuted} size={18} />
              )}
            </Pressable>
          )}

          <Pressable
            ref={createBudgetAnchorRef as any}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => {
              // open setup view to create a new budget
              setShowSetup(true);
              setSetupStep(1);
              setBudget(null);
              setEditingBudgetId(null);
              setTotalBudget('');
              setStartMonthSel(now.getMonth());
              setStartYearSel(now.getFullYear());
              setEndMonthSel(now.getMonth());
              setEndYearSel(now.getFullYear());
            }}
            style={({ pressed }) => [
              {
                width: 44,
                height: 44,
                borderRadius: 999,
                backgroundColor: theme.colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOpacity: 0.12,
                shadowOffset: { width: 0, height: 6 },
                shadowRadius: 12,
                opacity: pressed ? 0.92 : 1
              }
            ]}
          >
            <Plus color={tokens.colors.white} size={18} />
          </Pressable>
        </View>
      </View>

      {spacesEnabled ? (
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>
            Viewing: {activeSpace?.name ?? 'Personal'}
          </Text>
          <SpaceSwitcher />
        </View>
      ) : null}

      <View style={{ marginTop: 14 }}>
        {error ? <InlineError message={error} /> : null}
        {isLoading || isSaving ? <ActivityIndicator color={theme.colors.primary} /> : null}
      </View>

      <NudgeTooltip
        visible={!isTourActive && !seen['budget.create'] && !showSetup && !isLoading && !isSaving && !error && budgetsList.length === 0}
        targetRef={createBudgetAnchorRef}
        title="Quick tip"
        body="Tap + to create your first budget. We’ll track spent vs remaining automatically as you add transactions."
        onDismiss={() => markSeen('budget.create')}
      />

      {showSetup ? (
        // Budget setup wizard (step-by-step)
        <View style={{ marginTop: 10 }}>
          <View>
            <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>
              Step {setupStep} of 4
            </Text>
            <View style={{ marginTop: 6, height: 4, borderRadius: 999, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden' }}>
              <Animated.View
                style={{
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: theme.colors.primary,
                  width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                }}
              />
            </View>
          </View>

          {/* Step 1: Date range */}
          {setupStep === 1 && (
            <>
              <P style={{ marginTop: 8 }}>Choose the start and end months for this budget.</P>

              {/* Date range selectors */}
              <View style={{ marginTop: 12, flexDirection: 'row', gap: 10 }}>
                <Card style={{ flex: 1, padding: 10 }}>
                  <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>Start</Text>
                  <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
                    <Pressable onPress={() => setShowStartMonthPicker(true)} style={({ pressed }) => [{ padding: 10, backgroundColor: theme.colors.surface, borderRadius: 8, flex: 1, opacity: pressed ? 0.9 : 1 }]}>
                      <Text style={{ color: theme.colors.text }}>{MONTHS[startMonthSel]}</Text>
                    </Pressable>
                    <Pressable onPress={() => setShowStartYearPicker(true)} style={({ pressed }) => [{ padding: 10, backgroundColor: theme.colors.surface, borderRadius: 8, width: 92, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.9 : 1 }]}>
                      <Text style={{ color: theme.colors.text }}>{startYearSel}</Text>
                    </Pressable>
                  </View>
                </Card>

                <Card style={{ flex: 1, padding: 10 }}>
                  <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>End</Text>
                  <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
                    <Pressable onPress={() => setShowEndMonthPicker(true)} style={({ pressed }) => [{ padding: 10, backgroundColor: theme.colors.surface, borderRadius: 8, flex: 1, opacity: pressed ? 0.9 : 1 }]}>
                      <Text style={{ color: theme.colors.text }}>{MONTHS[endMonthSel]}</Text>
                    </Pressable>
                    <Pressable onPress={() => setShowEndYearPicker(true)} style={({ pressed }) => [{ padding: 10, backgroundColor: theme.colors.surface, borderRadius: 8, width: 92, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.9 : 1 }]}>
                      <Text style={{ color: theme.colors.text }}>{endYearSel}</Text>
                    </Pressable>
                  </View>
                </Card>
              </View>

              {/* Month/year pickers (modals) */}
              {showStartMonthPicker ? (
                <Modal transparent animationType="fade" onRequestClose={() => setShowStartMonthPicker(false)}>
                  <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center' }}>
                    <View style={{ margin: 20, backgroundColor: theme.colors.background, borderRadius: 16, overflow: 'hidden' }}>
                      <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Select start month</Text>
                        <Pressable onPress={() => setShowStartMonthPicker(false)}>
                          <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Close</Text>
                        </Pressable>
                      </View>
                      <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ padding: 12 }}>
                        {MONTHS.map((m, idx) => (
                          <Pressable key={m} onPress={() => { setStartMonthSel(idx); setShowStartMonthPicker(false); }} style={({ pressed }) => [{ paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8, backgroundColor: pressed || idx === startMonthSel ? theme.colors.surfaceAlt : 'transparent' }]}>
                            <Text style={{ color: theme.colors.text }}>{m}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                </Modal>
              ) : null}

              {showEndMonthPicker ? (
                <Modal transparent animationType="fade" onRequestClose={() => setShowEndMonthPicker(false)}>
                  <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center' }}>
                    <View style={{ margin: 20, backgroundColor: theme.colors.background, borderRadius: 16, overflow: 'hidden' }}>
                      <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Select end month</Text>
                        <Pressable onPress={() => setShowEndMonthPicker(false)}>
                          <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Close</Text>
                        </Pressable>
                      </View>
                      <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ padding: 12 }}>
                        {MONTHS.map((m, idx) => (
                          <Pressable key={m} onPress={() => { setEndMonthSel(idx); setShowEndMonthPicker(false); }} style={({ pressed }) => [{ paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8, backgroundColor: pressed || idx === endMonthSel ? theme.colors.surfaceAlt : 'transparent' }]}>
                            <Text style={{ color: theme.colors.text }}>{m}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                </Modal>
              ) : null}

              {showStartYearPicker ? (
                <Modal transparent animationType="fade" onRequestClose={() => setShowStartYearPicker(false)}>
                  <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center' }}>
                    <View style={{ margin: 20, backgroundColor: theme.colors.background, borderRadius: 16, overflow: 'hidden' }}>
                      <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Select start year</Text>
                        <Pressable onPress={() => setShowStartYearPicker(false)}>
                          <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Close</Text>
                        </Pressable>
                      </View>
                      <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ padding: 12 }}>
                        {years.map((y) => (
                          <Pressable key={y} onPress={() => { setStartYearSel(y); setShowStartYearPicker(false); }} style={({ pressed }) => [{ paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8, backgroundColor: pressed || y === startYearSel ? theme.colors.surfaceAlt : 'transparent' }]}>
                            <Text style={{ color: theme.colors.text }}>{y}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                </Modal>
              ) : null}

              {showEndYearPicker ? (
                <Modal transparent animationType="fade" onRequestClose={() => setShowEndYearPicker(false)}>
                  <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center' }}>
                    <View style={{ margin: 20, backgroundColor: theme.colors.background, borderRadius: 16, overflow: 'hidden' }}>
                      <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Select end year</Text>
                        <Pressable onPress={() => setShowEndYearPicker(false)}>
                          <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Close</Text>
                        </Pressable>
                      </View>
                      <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ padding: 12 }}>
                        {years.map((y) => (
                          <Pressable key={y} onPress={() => { setEndYearSel(y); setShowEndYearPicker(false); }} style={({ pressed }) => [{ paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8, backgroundColor: pressed || y === endYearSel ? theme.colors.surfaceAlt : 'transparent' }]}>
                            <Text style={{ color: theme.colors.text }}>{y}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                </Modal>
              ) : null}
            </>
          )}

          {/* Step 2: Total budget amount */}
          {setupStep === 2 && (
            <>
              <P style={{ marginTop: 8 }}>Set how much you want to spend over this budget period.</P>

              {/* Total budget input (text) */}
              <View style={{ marginTop: 16 }}>
                <TextField
                  label={durationMonths > 1 ? `Total Budget (${durationMonths} months)` : 'Total Budget (this month)'}
                  value={totalBudget}
                  onChangeText={handleTotalBudgetChange}
                  keyboardType="numeric"
                  placeholder="0"
                />
                <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: -6 }}>
                  {durationMonths > 1
                    ? `Enter the total budget you want to use across these ${durationMonths} months.`
                    : 'Enter the total budget you want to use this month.'}
                </Text>
                {perMonthTotal != null && (
                  <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    ≈ {formatMoney(Math.round(perMonthTotal), user?.currency ?? '₦')} per month
                  </Text>
                )}
              </View>
            </>
          )}

          {/* Step 3: Category selection & allocation */}
          {setupStep === 3 && (
            <>
              <P style={{ marginTop: 8 }}>Allocate your total budget across categories.</P>

              {/* Allocation completion toast handled programmatically */}

              {/* Category selection toggles */}
              <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(
                  isBusiness
                    ? [
                        { key: 'Essential', label: bucketLabel('Essential'), active: includeEssential, setter: setIncludeEssential },
                        { key: 'Savings', label: bucketLabel('Savings'), active: includeSavings, setter: setIncludeSavings },
                        { key: 'Free', label: bucketLabel('Free Spending'), active: includeFree, setter: setIncludeFree },
                        { key: 'Investments', label: bucketLabel('Investments'), active: includeInvestments, setter: setIncludeInvestments },
                        { key: 'Debt', label: bucketLabel('Debt Financing'), active: includeDebt, setter: setIncludeDebt }
                      ]
                    : [
                        { key: 'Essential', label: bucketLabel('Essential'), active: includeEssential, setter: setIncludeEssential },
                        { key: 'Savings', label: bucketLabel('Savings'), active: includeSavings, setter: setIncludeSavings },
                        { key: 'Free', label: bucketLabel('Free Spending'), active: includeFree, setter: setIncludeFree },
                        { key: 'Investments', label: bucketLabel('Investments'), active: includeInvestments, setter: setIncludeInvestments },
                        { key: 'Misc', label: bucketLabel('Miscellaneous'), active: includeMisc, setter: setIncludeMisc },
                        { key: 'Debt', label: bucketLabel('Debt Financing'), active: includeDebt, setter: setIncludeDebt }
                      ]
                ).map((c) => (
                  <Pressable
                    key={c.key}
                    onPress={() => {
                      c.setter(!c.active);
                      setAllocTouched(true);
                    }}
                    style={({ pressed }) => [{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: c.active ? theme.colors.primary : theme.colors.border,
                      backgroundColor: c.active ? theme.colors.primary : theme.colors.surface,
                      opacity: pressed ? 0.9 : 1
                    }]}
                  >
                    <Text style={{ color: c.active ? tokens.colors.white : theme.colors.text, fontWeight: '700', fontSize: 12 }}>
                      {c.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Smart Balance */}
              <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Text style={{ color: theme.colors.primary }}>★</Text>
                  </View>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '800' }} numberOfLines={1}>
                      Smart Balance
                    </Text>
                    <P style={{ marginTop: 4 }} numberOfLines={2}>
                      Recommended budget allocation
                    </P>
                  </View>
                </View>
                <View style={{ padding: 6, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt }}>
                  <Switch
                    value={smartBalanceEnabled}
                    onValueChange={(val) => {
                      setSmartBalanceEnabled(val);
                      if (val) {
                        // Duration-aware balanced preset across currently selected categories only
                        let baseEssential = 45;
                        let baseSavings = 15;
                        let baseFree = 15;
                        let baseInvestments = 15;
                        let baseMisc = 5;
                        let baseDebt = 5;

                        if (durationMonths <= 1) {
                          // Short, single-month budget: slightly higher essentials and fun
                          baseEssential = 55;
                          baseSavings = 10;
                          baseFree = 20;
                          baseInvestments = 5;
                          baseMisc = 5;
                          baseDebt = 5;
                        } else if (durationMonths <= 3) {
                          // Medium horizon: stronger savings and some debt focus
                          baseEssential = 50;
                          baseSavings = 15;
                          baseFree = 15;
                          baseInvestments = 10;
                          baseMisc = 5;
                          baseDebt = 5;
                        } else {
                          // Longer-term plan: emphasise savings and investments
                          baseEssential = 45;
                          baseSavings = 20;
                          baseFree = 15;
                          baseInvestments = 10;
                          baseMisc = 5;
                          baseDebt = 5;
                        }

                        const totalSelected =
                          (includeEssential ? baseEssential : 0) +
                          (includeSavings ? baseSavings : 0) +
                          (includeFree ? baseFree : 0) +
                          (includeInvestments ? baseInvestments : 0) +
                          (includeMisc ? baseMisc : 0) +
                          (includeDebt ? baseDebt : 0);

                        const scale = totalSelected > 0 ? 100 / totalSelected : 0;

                        if (includeEssential) setEssentialPct(Math.round(baseEssential * scale));
                        if (includeSavings) setSavingsPct(Math.round(baseSavings * scale));
                        if (includeFree) setFreePct(Math.round(baseFree * scale));
                        if (includeInvestments) setInvestmentsPct(Math.round(baseInvestments * scale));
                        if (includeMisc) setMiscPct(Math.round(baseMisc * scale));
                        if (includeDebt) setDebtPct(Math.round(baseDebt * scale));
                        setAllocTouched(true);
                      }
                    }}
                  />
                </View>
              </View>

              {previousBudget && (
                <Pressable
                  onPress={applyHistoryPreset}
                  style={({ pressed }) => [{ marginTop: 8, alignSelf: 'flex-start', opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '700' }}>
                    Use my past spending pattern
                  </Text>
                </Pressable>
              )}

              {/* Allocation bar */}
              <View style={{ marginTop: 14 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Budget Allocation</Text>
                <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
                  <View style={{ flexDirection: 'row', height: 28, borderRadius: 999, overflow: 'hidden' }}>
                    {(() => {
                      const clampPct = (v: number) => Math.max(0, Math.min(100, v));
                      const segments = [
                        includeEssential ? { pct: clampPct(essentialPct), colors: [tokens.colors.primary[600], tokens.colors.primary[400]] } : null,
                        includeSavings ? { pct: clampPct(savingsPct), colors: [tokens.colors.secondary[500], tokens.colors.secondary[400]] } : null,
                        includeFree ? { pct: clampPct(freePct), colors: [tokens.colors.success[500], tokens.colors.success[400]] } : null,
                        includeInvestments ? { pct: clampPct(investmentsPct), colors: [tokens.colors.accent[500], tokens.colors.accent[400]] } : null,
                        includeMisc ? { pct: clampPct(miscPct), colors: [tokens.colors.warning[500], tokens.colors.warning[400]] } : null,
                        includeDebt ? { pct: clampPct(debtPct), colors: [tokens.colors.error[500], tokens.colors.error[400]] } : null
                      ].filter(Boolean) as Array<{ pct: number; colors: [string, string] }>;
                      return segments.map((s, i) => (
                        <LinearGradient key={i} colors={s.colors as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${s.pct}%`, height: '100%' }} />
                      ));
                    })()}
                  </View>

                  {showLegend ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16, marginBottom: 4, opacity: includeEssential ? 1 : 0.4 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: tokens.colors.primary[500], marginRight: 8 }} />
                        <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Essential</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16, marginBottom: 4, opacity: includeSavings ? 1 : 0.4 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: tokens.colors.secondary[500], marginRight: 8 }} />
                        <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Savings</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16, marginBottom: 4, opacity: includeFree ? 1 : 0.4 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: tokens.colors.success[500], marginRight: 8 }} />
                        <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Free Spend</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16, marginBottom: 4, opacity: includeInvestments ? 1 : 0.4 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: tokens.colors.accent[500], marginRight: 8 }} />
                        <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Investments</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16, marginBottom: 4, opacity: includeMisc ? 1 : 0.4 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: tokens.colors.warning[500], marginRight: 8 }} />
                        <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Misc</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16, marginBottom: 4, opacity: includeDebt ? 1 : 0.4 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: tokens.colors.error[500], marginRight: 8 }} />
                        <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Debt</Text>
                      </View>
                    </View>
                  ) : (
                    <Pressable onPress={() => setShowLegend(true)} style={({ pressed }) => [{ marginTop: 10, opacity: pressed ? 0.7 : 1 }] }>
                      <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '700' }}>Show color legend</Text>
                    </Pressable>
                  )}

                  {/* Slider-based allocation: one slider per category */}
                  <View style={{ marginTop: 12 }}>
                    {includeEssential && (
                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                          Essential — {essentialPct}%
                        </Text>
                        <Slider value={essentialPct} minimumValue={0} maximumValue={100} step={1} onValueChange={(v) => { setEssentialPct(v); setAllocTouched(true); }} style={{ marginTop: 8 }} minimumTrackTintColor={tokens.colors.primary[500]} />
                      </View>
                    )}

                    {includeSavings && (
                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                          Savings — {savingsPct}%
                        </Text>
                        <Slider value={savingsPct} minimumValue={0} maximumValue={100} step={1} onValueChange={(v) => { setSavingsPct(v); setAllocTouched(true); }} style={{ marginTop: 8 }} minimumTrackTintColor={tokens.colors.secondary[500]} />
                      </View>
                    )}

                    {includeFree && (
                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                          Free Spend — {freePct}%
                        </Text>
                        <Slider value={freePct} minimumValue={0} maximumValue={100} step={1} onValueChange={(v) => { setFreePct(v); setAllocTouched(true); }} style={{ marginTop: 8 }} minimumTrackTintColor={tokens.colors.success[500]} />
                      </View>
                    )}

                    {includeInvestments && (
                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                          Investments — {investmentsPct}%
                        </Text>
                        <Slider value={investmentsPct} minimumValue={0} maximumValue={100} step={1} onValueChange={(v) => { setInvestmentsPct(v); setAllocTouched(true); }} style={{ marginTop: 8 }} minimumTrackTintColor={tokens.colors.accent[500]} />
                      </View>
                    )}

                    {includeMisc && (
                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                          Miscellaneous — {miscPct}%
                        </Text>
                        <Slider value={miscPct} minimumValue={0} maximumValue={100} step={1} onValueChange={(v) => { setMiscPct(v); setAllocTouched(true); }} style={{ marginTop: 8 }} minimumTrackTintColor={tokens.colors.warning[500]} />
                      </View>
                    )}

                    {includeDebt && (
                      <View style={{ marginBottom: 4 }}>
                        <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                          Debt Financing — {debtPct}%
                        </Text>
                        <Slider value={debtPct} minimumValue={0} maximumValue={100} step={1} onValueChange={(v) => { setDebtPct(v); setAllocTouched(true); }} style={{ marginTop: 8 }} minimumTrackTintColor={tokens.colors.error[500]} />
                      </View>
                    )}

                    <View style={{ marginTop: 8 }}>
                      <Text
                        style={{
                          color: allocatedPercent > 100 ? tokens.colors.error[600] : theme.colors.textMuted,
                          fontWeight: '700',
                          fontSize: 13
                        }}
                      >
                        Allocated: {Math.round(allocatedPercent)}% of budget (max 100%)
                      </Text>
                      {(showDebtNudge || showSavingsNudge) && (
                        <View style={{ marginTop: 4 }}>
                          {showDebtNudge && (
                            <Text style={{ color: tokens.colors.warning[600], fontSize: 12, fontWeight: '600' }}>
                              Consider allocating a bit more to Debt Financing so you can pay down what you owe faster.
                            </Text>
                          )}
                          {showSavingsNudge && (
                            <Text style={{ color: tokens.colors.warning[600], fontSize: 12, fontWeight: '600', marginTop: 4 }}>
                              Many people aim to save around 10–20% of their budget. You’re currently below that.
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            </>
          )}

          {/* Step 4: Preview per-category amounts */}
          {setupStep === 4 && (
            <>
              <P style={{ marginTop: 8 }}>Here’s how your budget breaks down by category.</P>

              <View style={{ marginTop: 16 }}>
                {(() => {
                  const gross = Number.isFinite(parsedTotal) ? parsedTotal : 0;
                  const essentialAmt = Math.round((gross * essentialPct) / 100);
                  const savingsAmt = Math.round((gross * savingsPct) / 100);
                  const freeAmt = Math.round((gross * freePct) / 100);
                  const investmentsAmt = Math.round((gross * investmentsPct) / 100);
                  const miscAmt = Math.round((gross * miscPct) / 100);
                  const debtAmt = Math.round((gross * debtPct) / 100);
                  const remainingAmt = Math.max(0, Math.round((gross * (100 - allocatedPercent)) / 100));

                  return (
                    <>
                      {includeEssential && (
                        <Card style={{ marginBottom: 12 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flexShrink: 1, paddingRight: 8 }}>
                              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{isBusiness ? 'Operating Costs' : 'Essential Spending'}</Text>
                              <P style={{ marginTop: 4 }} numberOfLines={2}>{isBusiness ? 'Payroll, tools, bills' : 'Rent, utilities, groceries'}</P>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{formatMoney(essentialAmt, user?.currency ?? '₦')}</Text>
                              {durationMonths > 1 && (
                                <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                  ≈ {formatMoney(Math.round(essentialAmt / durationMonths), user?.currency ?? '₦')} / month
                                </Text>
                              )}
                            </View>
                          </View>
                        </Card>
                      )}

                      {includeSavings && (
                        <Card style={{ marginBottom: 12 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flexShrink: 1, paddingRight: 8 }}>
                              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{isBusiness ? 'Reserves' : 'Savings Goal'}</Text>
                              <P style={{ marginTop: 4 }} numberOfLines={2}>{isBusiness ? 'Cash buffer & runway' : 'Future investments'}</P>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{formatMoney(savingsAmt, user?.currency ?? '₦')}</Text>
                              {durationMonths > 1 && (
                                <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                  ≈ {formatMoney(Math.round(savingsAmt / durationMonths), user?.currency ?? '₦')} / month
                                </Text>
                              )}
                            </View>
                          </View>
                        </Card>
                      )}

                      {includeFree && (
                        <Card style={{ marginBottom: 12 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flexShrink: 1, paddingRight: 8 }}>
                              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{isBusiness ? 'Discretionary' : 'Free Spending'}</Text>
                              <P style={{ marginTop: 4 }} numberOfLines={2}>{isBusiness ? 'Nice-to-haves & perks' : 'Entertainment, dining out'}</P>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{formatMoney(freeAmt, user?.currency ?? '₦')}</Text>
                              {durationMonths > 1 && (
                                <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                  ≈ {formatMoney(Math.round(freeAmt / durationMonths), user?.currency ?? '₦')} / month
                                </Text>
                              )}
                            </View>
                          </View>
                        </Card>
                      )}

                      {includeInvestments && (
                        <Card style={{ marginBottom: 12 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flexShrink: 1, paddingRight: 8 }}>
                              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{isBusiness ? 'Growth' : 'Investments'}</Text>
                              <P style={{ marginTop: 4 }} numberOfLines={2}>{isBusiness ? 'Marketing, new hires, expansion' : 'Long-term wealth building'}</P>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{formatMoney(investmentsAmt, user?.currency ?? '₦')}</Text>
                              {durationMonths > 1 && (
                                <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                  ≈ {formatMoney(Math.round(investmentsAmt / durationMonths), user?.currency ?? '₦')} / month
                                </Text>
                              )}
                            </View>
                          </View>
                        </Card>
                      )}

                      {includeMisc && (
                        <Card style={{ marginBottom: 12 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flexShrink: 1, paddingRight: 8 }}>
                              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{isBusiness ? 'Misc Ops' : 'Miscellaneous'}</Text>
                              <P style={{ marginTop: 4 }} numberOfLines={2}>{isBusiness ? 'One-offs & incidentals' : 'One-off or unexpected costs'}</P>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{formatMoney(miscAmt, user?.currency ?? '₦')}</Text>
                              {durationMonths > 1 && (
                                <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                  ≈ {formatMoney(Math.round(miscAmt / durationMonths), user?.currency ?? '₦')} / month
                                </Text>
                              )}
                            </View>
                          </View>
                        </Card>
                      )}

                      {includeDebt && (
                        <Card style={{ marginBottom: 12 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flexShrink: 1, paddingRight: 8 }}>
                              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{isBusiness ? 'Loans & Credit' : 'Debt Financing'}</Text>
                              <P style={{ marginTop: 4 }} numberOfLines={2}>{isBusiness ? 'Loan repayments & credit cards' : 'Loans, credit payments'}</P>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{formatMoney(debtAmt, user?.currency ?? '₦')}</Text>
                              {durationMonths > 1 && (
                                <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                  ≈ {formatMoney(Math.round(debtAmt / durationMonths), user?.currency ?? '₦')} / month
                                </Text>
                              )}
                            </View>
                          </View>
                        </Card>
                      )}

                      <Card>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flexShrink: 1, paddingRight: 8 }}>
                            <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Remaining Balance</Text>
                            <P style={{ marginTop: 4 }} numberOfLines={2}>Still unallocated</P>
                          </View>
                          <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>{formatMoney(remainingAmt, user?.currency ?? '₦')}</Text>
                        </View>
                      </Card>
                    </>
                  );
                })()}
              </View>

              <Text style={{ marginTop: 12, color: theme.colors.textMuted, fontWeight: '700', fontSize: 13 }}>
                You’re all set! Review these amounts, then tap 
                <Text style={{ fontWeight: '900' }}> Create budget</Text> to save.
              </Text>
            </>
          )}

          {/* Step navigation buttons */}
          <View style={{ marginTop: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <SecondaryButton
                title={setupStep === 1 ? 'Cancel' : 'Back'}
                onPress={() => {
                  if (setupStep === 1) {
                    setShowSetup(false);
                    setSetupStep(1);
                    setEditingBudgetId(null);
                  } else {
                    setSetupStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3 | 4) : prev));
                  }
                }}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <PrimaryButton
                title={setupStep < 4 ? 'Next' : editingBudgetId ? 'Save changes' : 'Create budget'}
                disabled={
                  (setupStep === 2 && (!Number.isFinite(parsedTotal) || parsedTotal <= 0)) ||
                  ((setupStep === 3 || setupStep === 4) && !canSave)
                }
                onPress={async () => {
                  if (setupStep < 4) {
                    setSetupStep((prev) => (prev + 1) as 1 | 2 | 3 | 4);
                    return;
                  }
                  await save();
                  setShowSetup(false);
                  setSetupStep(1);
                  await load();
                }}
              />
            </View>
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 10, flex: 1 }}>
          {budgetsSorted.length > 0 ? (
            <FlatList
              data={budgetsSorted}
              keyExtractor={(b) => String(b.id)}
              style={{ flex: 1 }}
              refreshing={isLoading || isSaving}
              onRefresh={handleRefresh}
              contentContainerStyle={{ paddingBottom: 16 }}
              renderItem={({ item }) => {
                const r = getBudgetRange(item);
                const title = r ? formatBudgetTitle(item, r) : item.name;
                const current = isBudgetCurrent(item);
                const tx = budgetTxByBudgetId[String(item.id)] ?? { income: 0, expenses: 0, spentByCategory: {} };
                const effective = item.totalBudget ?? 0;
                const spent = tx.expenses ?? 0;
                const remainingList = Math.max(0, effective - spent);
                const pct = effective > 0 ? Math.min(1, Math.max(0, spent / effective)) : 0;

                return (
                  <Pressable
                    onPress={() => {
                      (nav as any).navigate('BudgetDetail', { budgetId: String(item.id) });
                    }}
                    style={({ pressed }) => ({ marginBottom: 12, opacity: pressed ? 0.95 : 1 })}
                  >
                    <Card style={{ padding: 0, overflow: 'hidden' }}>
                      <LinearGradient
                        colors={[tokens.colors.secondary[400], tokens.colors.primary[500]]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ padding: 14 }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                          <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text style={{ color: tokens.colors.white, fontWeight: '900', fontSize: 18 }} numberOfLines={2}>
                              {title}
                            </Text>
                          </View>

                          {current ? (
                            <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.28)' }}>
                              <Text style={{ color: tokens.colors.white, fontWeight: '900', fontSize: 11, letterSpacing: 0.4 }}>CURRENT</Text>
                            </View>
                          ) : null}
                        </View>
                      </LinearGradient>

                      <View style={{ padding: 14, backgroundColor: theme.colors.surface }}>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>Total</Text>
                            <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 4 }}>
                              {showAmounts ? formatMoney(effective, currency) : '••••'}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>Spent</Text>
                            <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 4 }}>
                              {showAmounts ? formatMoney(spent, currency) : '••••'}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>Remaining</Text>
                            <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 4 }}>
                              {showAmounts ? formatMoney(remainingList, currency) : '••••'}
                            </Text>
                          </View>
                        </View>

                        <View style={{ height: 10, backgroundColor: theme.colors.surfaceAlt, borderRadius: 999, overflow: 'hidden', marginTop: 12 }}>
                          <LinearGradient
                            colors={[theme.colors.primary, tokens.colors.secondary[400]]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={{ width: `${Math.round(pct * 100)}%`, height: '100%' }}
                          />
                        </View>

                        <Text style={{ color: theme.colors.textMuted, marginTop: 10, fontWeight: '700', fontSize: 12 }}>
                          Created {formatIsoDateLocal(item.createdAt)}
                        </Text>
                      </View>
                    </Card>
                  </Pressable>
                );
              }}
            />
          ) : (
            <View style={{ marginTop: 10, alignItems: 'center', paddingVertical: 24 }}>
              <Text style={{ color: theme.colors.textMuted, fontSize: 16 }}>No budgets yet.</Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 8 }}>Tap the + button to create your first budget.</Text>
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}
