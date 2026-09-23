import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPlan, type ApiPlan } from '../api/personal';
import { bucketDescription, bucketDisplayName, normalizeBucket, type Bucket } from '../theme/buckets';
import { View, Text, Pressable, ActivityIndicator, ScrollView, Animated, useWindowDimensions, FlatList, TextInput, StyleSheet } from 'react-native';
import { Modal } from '../components/Common/AppModal';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBudget, listBudgets, listTransactions, patchBudget, patchBudgetInSpace, calcTax, type ApiBudget, type ApiTransaction, type BudgetPurpose } from '../api/endpoints';
import { ArrowRightLeft, CalendarDays, Check, ChevronLeft, ChevronRight, Eye, EyeOff, Minus, PartyPopper, Plus, Users, X } from '../icons';
import { applyRollover, getRollover, type RolloverPreview } from '../api/features';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  Amount,
  Card,
  Chip,
  EmptyState,
  IconButton,
  IconTile,
  InlineError,
  ListCard,
  ListRow,
  PrimaryButton,
  ProgressBar,
  Screen,
  ScreenHeader,
  SecondaryButton,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  formatAmount
} from '../components/Common/ui';
import { InfoTip, TextField } from '../components/Common/ui';
import { SelectField } from '../components/Common/SelectField';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { currencySymbol, formatMoney, monthName, toIsoDate, toIsoDateTime } from '../utils/format';
import { bucketColor } from '../theme/theme';
import { fonts, type } from '../theme/typography';
import { useToast } from '../components/Common/Toast';
import { useAmountVisibility } from '../contexts/AmountVisibilityContext';
import { useSpace } from '../contexts/SpaceContext';
import { SpaceSwitcher } from '../components/Common/SpaceSwitcher';
import { useTour, useTourAnchor } from '../contexts/TourContext';
import { useNudges } from '../contexts/NudgesContext';
import { NudgeTooltip } from '../components/Common/NudgeTooltip';
import { GuideAnchor } from '../components/Common/GuideAnchor';
import { MoveMoneySheet } from '../components/Budget/MoveMoneySheet';
import { TightMonthSheet } from '../components/Budget/TightMonthSheet';
import { BUDGET_TEMPLATES, type BudgetTemplate } from '../lib/budgetTemplates';
import { ChoiceChip } from '../components/Plan/ChoiceChip';
import { createMiniBudgetInSpace } from '../api/endpoints';

/** One model for every use case: your own plan, a household budget you share every month, or a one-off event or trip. */
const PURPOSE_OPTIONS: Array<{ value: BudgetPurpose; label: string; subtitle: string }> = [
  { value: 'personal', label: 'My monthly plan', subtitle: 'Your own budget for the month or pay period' },
  { value: 'household', label: 'Shared household', subtitle: 'With a partner, family or housemates; repeats every month' },
  { value: 'event', label: 'Event or trip', subtitle: 'A one-off like a wedding, trip or burial; runs alongside your plan' }
];

/** Whole percents as they are; a share set in naira shows one decimal, e.g. 53.8. */
const pctLabel = (pct: number) => (Number.isInteger(pct) ? String(pct) : pct.toFixed(1).replace(/\.0$/, ''));

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
      return bucketDisplayName(key, isBusiness);
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

  // The saved plan sets payday-to-payday dates and the smart split.
  const [plan, setPlan] = useState<ApiPlan | null>(null);
  const [payRange, setPayRange] = useState<{ start: string; end: string; label: string } | null>(null);

  const [showStartMonthPicker, setShowStartMonthPicker] = useState(false);
  const [showStartYearPicker, setShowStartYearPicker] = useState(false);
  const [showEndMonthPicker, setShowEndMonthPicker] = useState(false);
  const [showEndYearPicker, setShowEndYearPicker] = useState(false);

  const durationMonths = useMemo(() => {
    if (payRange) return 1;
    const s = new Date(startYearSel, startMonthSel, 1);
    const e = new Date(endYearSel, endMonthSel, 1);
    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
    return Math.max(1, months);
  }, [payRange, startMonthSel, startYearSel, endMonthSel, endYearSel]);

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
  /** Moving money between the running budget's buckets, e.g. covering a need that cost more than planned. */
  const [moveFor, setMoveFor] = useState<{ to?: string } | null>(null);
  const [tightOpen, setTightOpen] = useState(false);
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
  const [purpose, setPurpose] = useState<BudgetPurpose>('personal');
  const [budgetTitle, setBudgetTitle] = useState('');
  /** A project or pocket money starting point: fills the name and splits the total into stages. */
  const [template, setTemplate] = useState<BudgetTemplate | null>(null);

  // Category selection & percentages (including Debt Financing)
  // Only preselect core categories, not all
  const [includeEssential, setIncludeEssential] = useState(true);
  const [includeSavings, setIncludeSavings] = useState(true);
  const [includeFree, setIncludeFree] = useState(true);
  const [includeInvestments, setIncludeInvestments] = useState(false);
  const [includeMisc, setIncludeMisc] = useState(false);
  const [includeDebt, setIncludeDebt] = useState(false);

  const [essentialPct, setEssentialPct] = useState<number>(50);
  const [savingsPct, setSavingsPct] = useState<number>(20);
  const [freePct, setFreePct] = useState<number>(30);
  const [investmentsPct, setInvestmentsPct] = useState<number>(0);
  const [miscPct, setMiscPct] = useState<number>(0);
  const [debtPct, setDebtPct] = useState<number>(0);

  // Multi-step wizard for budget setup
  const [setupStep, setSetupStep] = useState<1 | 2 | 3 | 4>(1);
  const progressAnim = useRef(new Animated.Value(1 / 4)).current;
  const [allocTouched, setAllocTouched] = useState(false);
  const [toastShown, setToastShown] = useState(false);
  const lastAllocFullRef = React.useRef(false);
  const { height: windowHeight } = useWindowDimensions();
  const [showLegend, setShowLegend] = useState(true);

  const [smartBalanceEnabled, setSmartBalanceEnabled] = useState(false);

  useEffect(() => {
    getPlan().then(setPlan).catch(() => setPlan(null));
  }, [showSetup]);

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

      type Tally = { income: number; expenses: number; spentByCategory: Record<string, number> };
      const tally = (entry: Tally, t: ApiTransaction) => {
        if (t.type === 'income') {
          entry.income += t.amount;
          return;
        }
        entry.expenses += t.amount;
        const cat = (t.budgetCategory || (t as any).category || '').trim();
        if (cat) entry.spentByCategory[cat] = (entry.spentByCategory[cat] ?? 0) + t.amount;
      };

      const map: Record<string, Tally> = {};
      for (const b of items) {
        map[String(b.id)] = { income: 0, expenses: 0, spentByCategory: {} };
      }

      for (const t of all) {
        const bid = t.budgetId ? String(t.budgetId) : '';
        if (!bid || !map[bid]) continue;
        tally(map[bid], t);
      }

      // A shared budget also counts other members' transactions, which only come back when filtering by that budget.
      for (const b of items.filter((x) => x.isShared)) {
        const r = getBudgetRange(b);
        if (!r) continue;
        const start = new Date(r.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(r.end);
        end.setHours(23, 59, 59, 999);
        const entry: Tally = { income: 0, expenses: 0, spentByCategory: {} };
        let sharedCursor: string | null = null;
        do {
          const res = await listTransactions({
            start: toIsoDateTime(start),
            end: toIsoDateTime(end),
            limit: 200,
            cursor: sharedCursor ?? undefined,
            budgetId: String(b.id),
            spaceId: spacesEnabled ? activeSpaceId : undefined
          });
          for (const t of res.items || []) tally(entry, t);
          sharedCursor = res.nextCursor ?? null;
        } while (sharedCursor);
        map[String(b.id)] = entry;
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

    const sumBucket = (bucket: Bucket) => Object.keys(cats).filter((k) => normalizeBucket(k) === bucket).reduce((sum, k) => sum + getVal(k), 0);
    const valEssential = sumBucket('Needs');
    const valSavings = sumBucket('Savings');
    const valFree = sumBucket('Wants');
    const valInvestments = 0;
    const valMisc = 0;
    const valDebt = 0;

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
      setPayRange(start.getDate() !== 1 && b.endDate ? { start: b.startDate, end: b.endDate, label: b.name.replace(/^My Budget \((.*)\)$/, '$1') } : null);
      setPurpose(b.purpose ?? 'personal');
      setBudgetTitle(/^My Budget \(/.test(b.name) ? '' : b.name);
      setPeriod(b.period);
      setTotalBudget(String(Math.round(b.totalBudget)).replace(/\B(?=(\d{3})+(?!\d))/g, ','));

      const total = b.totalBudget > 0 ? b.totalBudget : 1;
      const cats = b.categories || {};

      const getPct = (key: string) => {
        const c = (cats as any)[key] as { budgeted?: number } | undefined;
        if (!c || typeof c.budgeted !== 'number') return 0;
        // Kept exact: rounding to whole percents would quietly undo money moved between buckets in naira.
        return (c.budgeted / total) * 100;
      };

      const pctFor = (bucket: Bucket) => Object.keys(cats).filter((k) => normalizeBucket(k) === bucket).reduce((sum, k) => sum + getPct(k), 0);
      const ePct = pctFor('Needs');
      const sPct = pctFor('Savings');
      const fPct = pctFor('Wants');
      const iPct = 0;
      const mPct = 0;
      const dPct = 0;

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

  // Home can open the setup straight away, e.g. "Create your budget" from the plan.
  useEffect(() => {
    if (!route.params?.startNew || showSetup) return;
    const requested = route.params?.purpose as BudgetPurpose | undefined;
    (nav as any).setParams?.({ startNew: undefined, purpose: undefined });
    openNewBudget(requested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.startNew]);

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

      if (includeEssential) categories.Needs = { budgeted: essentialAmt };
      if (includeFree) categories.Wants = { budgeted: freeAmt };
      if (includeSavings) categories.Savings = { budgeted: savingsAmt };

      const startDateObj = payRange ? new Date(`${payRange.start}T12:00:00`) : new Date(startYearSel, startMonthSel, 1);
      const endDateObj = payRange ? new Date(`${payRange.end}T12:00:00`) : new Date(endYearSel, endMonthSel + 1, 0);

      const nameForBudget = (() => {
        if (payRange) return `My Budget (${payRange.label})`;
        if (startYearSel === endYearSel && startMonthSel === endMonthSel) {
          return `My Budget (${MONTHS[startMonthSel]} ${startYearSel})`;
        }
        if (startYearSel === endYearSel) {
          return `My Budget (${MONTHS[startMonthSel]}-${MONTHS[endMonthSel]} ${startYearSel})`;
        }
        return `My Budget (${MONTHS[startMonthSel]} ${startYearSel}-${MONTHS[endMonthSel]} ${endYearSel})`;
      })();

      const baseInput = {
        name: purpose !== 'personal' && budgetTitle.trim() ? budgetTitle.trim() : purpose === 'household' ? 'Household budget' : nameForBudget,
        totalBudget: parsedTotal,
        period,
        startDate: toIsoDate(startDateObj),
        endDate: toIsoDate(endDateObj),
        categories,
        purpose: isBusiness ? ('personal' as BudgetPurpose) : purpose
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
      // A project template splits the total into stages people can change later.
      if (!editingBudgetId && created && template?.stages.length && template.purpose === purpose) {
        await Promise.all(
          template.stages.map(([name, share]) =>
            createMiniBudgetInSpace(String(created.id), { name, amount: Math.round((parsedTotal * share) / 100), category: 'Needs' }, spacesEnabled ? activeSpaceId : undefined).catch(() => undefined)
          )
        );
      }
      setTemplate(null);
      // A new shared budget is only useful once people are in it.
      if (!editingBudgetId && purpose === 'household' && created && !created.isShared) {
        toast.show('Shared budget created. Now invite your people 👇', 'success', 3500);
        (nav as any).navigate('ShareBudget', { budgetId: String(created.id), budgetName: created.name });
      }
      setEditingBudgetId(null);
      // reload list after creation
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save budget';
      if (/overlap an existing budget|already covers those dates/i.test(message)) {
        toast.show(purpose === 'household' ? 'You already have a shared budget for those dates.' : 'A budget already exists for that timeline.', 'error', 3500);
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
    return Math.max(0, budget.totalBudget + incomeApplied);
  }, [budget, incomeApplied]);

  const remaining = useMemo(() => {
    if (!budget) return 0;
    return effectiveTotal - used;
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

  const insets = useSafeAreaInsets();
  const glyph = currencySymbol(currency);
  const hide = !showAmounts;
  const [preset, setPreset] = useState<'smart' | 'history' | 'custom'>('custom');
  const [expandedBucket, setExpandedBucket] = useState<string | null>('Needs');
  /** A bucket amount being typed in naira; applied as a share of the total when the field is left. */
  const [amountDraft, setAmountDraft] = useState<{ key: string; text: string } | null>(null);
  const [monthSheet, setMonthSheet] = useState<null | 'start' | 'end'>(null);
  const [sheetYear, setSheetYear] = useState(now.getFullYear());
  const [rolloverFor, setRolloverFor] = useState<{ budget: ApiBudget; preview: RolloverPreview } | null>(null);
  const [rolloverSheet, setRolloverSheet] = useState(false);
  const [rollingOver, setRollingOver] = useState(false);

  // Offer to move leftover money from the most recent budget that has ended.
  useEffect(() => {
    const today = toIsoDate(new Date());
    const candidate = budgetsSorted.find((b) => b.role !== 'member' && !b.rollover && (getBudgetRange(b)?.endIso ?? today) < today);
    if (!candidate) {
      setRolloverFor(null);
      return;
    }
    let cancelled = false;
    getRollover(String(candidate.id))
      .then((preview) => !cancelled && setRolloverFor(preview.eligible ? { budget: candidate, preview } : null))
      .catch(() => !cancelled && setRolloverFor(null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetsSorted]);

  const doRollover = async (body: { destination: 'goal'; goalId: string } | { destination: 'next-budget' }) => {
    if (!rolloverFor || rollingOver) return;
    setRollingOver(true);
    try {
      const r = await applyRollover(String(rolloverFor.budget.id), body);
      toast.show(`${formatAmount(r.moved, glyph)} moved`, 'success');
      setRolloverSheet(false);
      setRolloverFor(null);
      await load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not move the money.', 'error');
    } finally {
      setRollingOver(false);
    }
  };

  // The setup flow is full screen: hide the tab bar while it's open.
  useEffect(() => {
    (nav as any).setOptions?.({ tabBarStyle: showSetup ? { display: 'none' } : undefined });
  }, [nav, showSetup]);

  const openNewBudget = (nextPurpose: BudgetPurpose = 'personal') => {
    setPurpose(nextPurpose);
    setBudgetTitle('');
    setTemplate(null);
    setShowSetup(true);
    setSetupStep(1);
    setBudget(null);
    setEditingBudgetId(null);
    const onPayday = plan?.period?.basis === 'payday';
    setPayRange(onPayday && plan ? { start: plan.period.start, end: plan.period.end, label: plan.period.label } : null);
    const suggested = plan && plan.monthlyIncome > 0 ? Math.round((plan.monthlyIncome * (onPayday ? plan.period.days / (365 / 12) : 1)) / 100) * 100 : 0;
    setTotalBudget(suggested ? String(suggested).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '');
    setStartMonthSel(now.getMonth());
    setStartYearSel(now.getFullYear());
    setEndMonthSel(now.getMonth());
    setEndYearSel(now.getFullYear());
    setPreset('custom');
  };

  const closeSetup = () => {
    setShowSetup(false);
    setSetupStep(1);
    setEditingBudgetId(null);
  };

  const markCustom = () => {
    setAllocTouched(true);
    setPreset('custom');
  };

  const bucketDefs = [
    { key: 'Needs', desc: bucketDescription('Needs', isBusiness), include: includeEssential, setInclude: setIncludeEssential, pct: essentialPct, setPct: setEssentialPct },
    { key: 'Wants', desc: bucketDescription('Wants', isBusiness), include: includeFree, setInclude: setIncludeFree, pct: freePct, setPct: setFreePct },
    { key: 'Savings', desc: bucketDescription('Savings', isBusiness), include: includeSavings, setInclude: setIncludeSavings, pct: savingsPct, setPct: setSavingsPct }
  ];

  const applySmartBalance = () => {
    // Use the split from the person's plan when there is one; otherwise the 50/30/20 guide.
    const fromPlan = plan && plan.monthlyIncome > 0 ? plan.percents : null;
    const needs = Math.min(100, fromPlan ? fromPlan.Needs : 50);
    const savings = Math.min(100 - needs, fromPlan ? fromPlan.Savings : durationMonths <= 1 ? 20 : 25);
    const wants = Math.max(0, 100 - needs - savings);
    setIncludeEssential(true);
    setIncludeSavings(savings > 0);
    setIncludeFree(wants > 0);
    setIncludeInvestments(false);
    setIncludeMisc(false);
    setIncludeDebt(false);
    setEssentialPct(needs);
    setSavingsPct(savings);
    setFreePct(wants);
    setInvestmentsPct(0);
    setMiscPct(0);
    setDebtPct(0);
    setAllocTouched(true);
    setSmartBalanceEnabled(true);
    setPreset('smart');
  };

  const startDateSel = new Date(startYearSel, startMonthSel, 1);
  const endDateSel = new Date(endYearSel, endMonthSel, 1);
  const datesInvalid = endDateSel < startDateSel;
  const periodName = payRange
    ? payRange.label
    : durationMonths > 1 ? `${monthName(startMonthSel)} – ${monthName(endMonthSel)} ${endYearSel}` : `${monthName(startMonthSel, true)} ${startYearSel}`;
  const unassignedPct = 100 - Math.round(allocatedPercent);
  const unassignedAmount = Number.isFinite(parsedTotal) ? Math.round((parsedTotal * unassignedPct) / 100) : 0;

  const applyQuickRange = (offset: number, months: number) => {
    setPayRange(null);
    const s = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const e = new Date(s.getFullYear(), s.getMonth() + months - 1, 1);
    setStartMonthSel(s.getMonth());
    setStartYearSel(s.getFullYear());
    setEndMonthSel(e.getMonth());
    setEndYearSel(e.getFullYear());
  };

  const nextDisabled =
    (setupStep === 1 && (datesInvalid || (purpose === 'event' && !budgetTitle.trim()))) ||
    (setupStep === 2 && (!Number.isFinite(parsedTotal) || parsedTotal <= 0)) ||
    ((setupStep === 3 || setupStep === 4) && !canSave);

  const displayName = (b: ApiBudget) => {
    if (!/^My Budget \(/.test(b.name)) return b.name;
    const r = getBudgetRange(b);
    if (!r) return b.name;
    const s = r.start;
    const e = r.end;
    if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) return `${monthName(s.getMonth(), true)} ${s.getFullYear()}`;
    if (s.getFullYear() === e.getFullYear()) return `${monthName(s.getMonth())} – ${monthName(e.getMonth())} ${s.getFullYear()}`;
    return `${monthName(s.getMonth())} ${s.getFullYear()} – ${monthName(e.getMonth())} ${e.getFullYear()}`;
  };

  /* ------------------------------------------------------------ setup flow */
  if (showSetup) {
    return (
      <Screen scrollable={false} style={{ paddingHorizontal: 0 }}>
        <View style={{ paddingHorizontal: 20 }}>
          <View style={styles.setupHeader}>
            <IconButton accessibilityLabel="Cancel" onPress={closeSetup}>
              <X color={theme.colors.text} size={20} />
            </IconButton>
            <Text style={[type.bodyStrong, { color: theme.colors.text, fontSize: 16 }]}>{editingBudgetId ? 'Edit budget' : 'New budget'}</Text>
            <Text style={[type.caption, { color: theme.colors.textMuted, width: 40, textAlign: 'right' }]}>{setupStep} of 4</Text>
          </View>
          <View style={styles.steps}>
            {[1, 2, 3, 4].map((n) => (
              <View key={n} style={[styles.step, { backgroundColor: n <= setupStep ? theme.colors.primary : theme.colors.border }]} />
            ))}
          </View>
        </View>

        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          bottomOffset={96}
        >
          {error ? <InlineError message={error} /> : null}

          {setupStep === 1 ? (
            <>
              {!isBusiness ? (
                <>
                  <SelectField
                    label="What’s this budget for?"
                    value={purpose}
                    options={PURPOSE_OPTIONS}
                    onChange={(p) => {
                      setPurpose(p);
                      setTemplate(null);
                    }}
                  />
                  {!editingBudgetId && purpose !== 'personal' ? (
                    <View style={[styles.wrap, { marginTop: -4, marginBottom: 14 }]}>
                      {BUDGET_TEMPLATES.filter((t) => t.purpose === purpose).map((t) => (
                        <ChoiceChip
                          key={t.key}
                          label={t.label}
                          active={template?.key === t.key}
                          onPress={() => {
                            const on = template?.key !== t.key;
                            setTemplate(on ? t : null);
                            if (on && (!budgetTitle.trim() || BUDGET_TEMPLATES.some((x) => x.title === budgetTitle))) setBudgetTitle(t.title);
                            if (on && t.period) setPeriod(t.period);
                          }}
                        />
                      ))}
                    </View>
                  ) : null}
                  {template?.stages.length ? (
                    <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: -6, marginBottom: 14 }]}>
                      We’ll split it into {template.stages.map(([n]) => n.toLowerCase()).join(', ')}. Change any of them later.
                    </Text>
                  ) : template?.key === 'pocket' ? (
                    <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: -6, marginBottom: 14 }]}>
                      A weekly budget you set, shared with your child’s own account so they can log what they spend.
                    </Text>
                  ) : null}
                  {purpose !== 'personal' ? (
                    <TextField
                      label={purpose === 'event' ? 'Name it' : 'Name (optional)'}
                      value={budgetTitle}
                      onChangeText={setBudgetTitle}
                      placeholder={purpose === 'event' ? 'e.g. Ada’s wedding, Easter trip' : 'e.g. Home budget, Flat 4B'}
                      maxLength={60}
                    />
                  ) : null}
                </>
              ) : null}
              <Text style={[type.eyebrow, { color: theme.colors.primary }]}>Dates</Text>
              <Text style={[type.h2, { color: theme.colors.text, marginTop: 6 }]}>When does this budget run?</Text>
              <View style={styles.wrap}>
                {plan?.period?.basis === 'payday' ? (
                  <Pressable
                    onPress={() => setPayRange({ start: plan.period.start, end: plan.period.end, label: plan.period.label })}
                    style={[styles.chip, { backgroundColor: payRange ? theme.colors.primarySoft : theme.colors.surface, borderColor: payRange ? theme.colors.primary : theme.colors.border }]}
                  >
                    <Text style={[type.smallStrong, { color: payRange ? theme.colors.primary : theme.colors.text }]}>Payday to payday · {plan.period.label}</Text>
                  </Pressable>
                ) : null}
                {[
                  { label: 'This month', offset: 0, months: 1 },
                  { label: 'Next month', offset: 1, months: 1 },
                  { label: 'Next 3 months', offset: 0, months: 3 }
                ].map((q) => (
                  <Pressable key={q.label} onPress={() => applyQuickRange(q.offset, q.months)} style={[styles.chip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <Text style={[type.smallStrong, { color: theme.colors.text }]}>{q.label}</Text>
                  </Pressable>
                ))}
              </View>
              {payRange ? (
                <Card style={{ marginTop: 16 }}>
                  <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{payRange.label}</Text>
                  <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 4 }]}>From your last payday to the day before the next one, so the money you get lasts the whole way.</Text>
                </Card>
              ) : (
                <ListCard style={{ marginTop: 16 }}>
                <ListRow
                  icon={<CalendarDays color={theme.colors.textMuted} size={18} />}
                  title={`${monthName(startMonthSel, true)} ${startYearSel}`}
                  subtitle="Starts"
                  onPress={() => {
                    setSheetYear(startYearSel);
                    setMonthSheet('start');
                  }}
                  chevron
                />
                <ListRow
                  icon={<CalendarDays color={theme.colors.textMuted} size={18} />}
                  title={`${monthName(endMonthSel, true)} ${endYearSel}`}
                  subtitle="Ends"
                  onPress={() => {
                    setSheetYear(endYearSel);
                    setMonthSheet('end');
                  }}
                  chevron
                />
              </ListCard>
              )}
              <Text style={[type.small, { color: datesInvalid ? theme.colors.error : theme.colors.textMuted, marginTop: 10 }]}>
                {datesInvalid ? 'The end month must be the same as or after the start month.' : `${durationMonths} month${durationMonths === 1 ? '' : 's'} · ${periodName}`}
              </Text>
            </>
          ) : null}

          {setupStep === 2 ? (
            <>
              <Text style={[type.eyebrow, { color: theme.colors.primary }]}>Amount</Text>
              <Text style={[type.h2, { color: theme.colors.text, marginTop: 6 }]}>How much can you spend in {periodName}?</Text>
              <View style={[styles.bigInput, { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface }]}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 24, color: theme.colors.textMuted }}>{glyph}</Text>
                <TextInput
                  value={totalBudget}
                  onChangeText={handleTotalBudgetChange}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={theme.colors.textMuted}
                  autoFocus
                  style={[styles.bigInputText, { color: theme.colors.text }]}
                  accessibilityLabel="Total budget"
                />
              </View>
              <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 10 }]}>
                {perMonthTotal != null ? `About ${formatAmount(Math.round(perMonthTotal), glyph)} a month across ${durationMonths} months.` : 'Everything you plan to spend or set aside this month.'}
              </Text>
              {user?.monthlyIncome ? (
                <Pressable
                  onPress={() => handleTotalBudgetChange(String(Math.round((user.monthlyIncome ?? 0) * durationMonths)))}
                  style={[styles.chip, { alignSelf: 'flex-start', marginTop: 12, backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primarySoft }]}
                >
                  <Text style={[type.smallStrong, { color: theme.colors.primary }]}>
                    Use my income · {formatAmount(Math.round((user.monthlyIncome ?? 0) * durationMonths), glyph)}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}

          {setupStep === 3 ? (
            <>
              <Text style={[type.eyebrow, { color: theme.colors.primary }]}>Allocate</Text>
              <Text style={[type.h2, { color: theme.colors.text, marginTop: 6 }]}>
                Split {formatAmount(Number.isFinite(parsedTotal) ? parsedTotal : 0, glyph)} across {periodName}
              </Text>

              <View style={[styles.allocBar, { backgroundColor: theme.colors.surfaceAlt }]}>
                {bucketDefs
                  .filter((b) => b.include && b.pct > 0)
                  .map((b) => (
                    <View key={b.key} style={{ width: `${Math.min(100, b.pct)}%`, backgroundColor: bucketColor(theme, b.key) }} />
                  ))}
              </View>
              <View style={[styles.rowBetween, { marginTop: 10 }]}>
                {unassignedPct === 0 ? (
                  <Chip tone="positive" label="100% allocated" icon={<Check color={theme.colors.success} size={12} strokeWidth={3} />} />
                ) : unassignedPct > 0 ? (
                  <Chip tone="brass" label={`${unassignedPct}% left to assign`} />
                ) : (
                  <Chip tone="negative" label={`${Math.abs(unassignedPct)}% over`} />
                )}
                <Text style={[type.caption, { color: theme.colors.textMuted }]}>
                  {unassignedPct >= 0 ? `${formatAmount(unassignedAmount, glyph)} unassigned` : `Reduce a bucket by ${formatAmount(Math.abs(unassignedAmount), glyph)}`}
                </Text>
              </View>

              <SegmentedControl
                options={[
                  { key: 'smart', label: 'Smart balance' },
                  ...(previousBudget ? [{ key: 'history' as const, label: 'Like last time' }] : []),
                  { key: 'custom', label: 'Custom' }
                ]}
                value={preset}
                onChange={(k) => {
                  if (k === 'smart') applySmartBalance();
                  else if (k === 'history') {
                    applyHistoryPreset();
                    setPreset('history');
                  } else setPreset('custom');
                }}
                style={{ marginTop: 18 }}
              />
              <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 8 }]}>
                {preset === 'smart'
                  ? plan && plan.monthlyIncome > 0
                    ? 'Uses the Needs, Wants and Savings split from your plan. Tap a bucket to fine-tune it.'
                    : 'Half for needs, 30% for wants and 20% for savings. Tap a bucket to fine-tune it.'
                  : preset === 'history'
                    ? 'Based on how you actually spent in your last budget.'
                    : 'Tick the buckets you want, then tap one to set its share.'}
              </Text>

              <Card style={{ marginTop: 14, paddingVertical: 4 }}>
                {bucketDefs.map((b, idx) => {
                  const color = bucketColor(theme, b.key);
                  const amountFor = Number.isFinite(parsedTotal) ? Math.round((parsedTotal * b.pct) / 100) : 0;
                  const expanded = expandedBucket === b.key && b.include;
                  return (
                    <View key={b.key} style={[styles.bucket, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border }]}>
                      <Pressable
                        onPress={() => {
                          if (!b.include) {
                            b.setInclude(true);
                            markCustom();
                          }
                          setExpandedBucket(expanded ? null : b.key);
                        }}
                        style={styles.row}
                        accessibilityRole="button"
                        accessibilityHint="Adjust this bucket's share"
                      >
                        <Pressable
                          onPress={() => {
                            b.setInclude(!b.include);
                            markCustom();
                          }}
                          hitSlop={10}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: b.include }}
                          accessibilityLabel={`Include ${bucketLabel(b.key)}`}
                          style={[styles.check, { borderColor: b.include ? color : theme.colors.border, backgroundColor: b.include ? color : 'transparent' }]}
                        >
                          {b.include ? <Check color="#FFFFFF" size={13} strokeWidth={3} /> : null}
                        </Pressable>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[type.bodyStrong, { color: b.include ? theme.colors.text : theme.colors.textMuted }]}>{bucketLabel(b.key)}</Text>
                          <Text numberOfLines={1} style={[type.caption, { color: theme.colors.textMuted }]}>
                            {b.desc}
                          </Text>
                        </View>
                        {b.include ? (
                          <View style={{ alignItems: 'flex-end' }}>
                            <Amount value={amountFor} currency={glyph} size="sm" />
                            <Text style={[type.caption, { color: theme.colors.textMuted }]}>{pctLabel(b.pct)}%</Text>
                          </View>
                        ) : (
                          <Text style={[type.caption, { color: theme.colors.textMuted }]}>Off</Text>
                        )}
                      </Pressable>
                      {expanded ? (
                        <View style={[styles.row, { marginTop: 10, gap: 8 }]}>
                          <Pressable
                            onPress={() => {
                              b.setPct(Math.max(0, b.pct - 5));
                              markCustom();
                            }}
                            accessibilityLabel={`Lower ${bucketLabel(b.key)} by 5 percent`}
                            style={[styles.stepper, { backgroundColor: theme.colors.surfaceAlt }]}
                          >
                            <Minus color={theme.colors.text} size={16} />
                          </Pressable>
                          <Slider
                            style={{ flex: 1, height: 36 }}
                            value={b.pct}
                            minimumValue={0}
                            maximumValue={100}
                            step={1}
                            onValueChange={(v) => {
                              b.setPct(Math.round(v));
                              markCustom();
                            }}
                            minimumTrackTintColor={color}
                            maximumTrackTintColor={theme.colors.border}
                            thumbTintColor={color}
                          />
                          <Pressable
                            onPress={() => {
                              b.setPct(Math.min(100, b.pct + 5));
                              markCustom();
                            }}
                            accessibilityLabel={`Raise ${bucketLabel(b.key)} by 5 percent`}
                            style={[styles.stepper, { backgroundColor: theme.colors.surfaceAlt }]}
                          >
                            <Plus color={theme.colors.text} size={16} />
                          </Pressable>
                        </View>
                      ) : null}
                      {expanded && Number.isFinite(parsedTotal) && parsedTotal > 0 ? (
                        <View style={[styles.row, { marginTop: 8, gap: 8 }]}>
                          <Text style={[type.caption, { color: theme.colors.textMuted, flex: 1 }]}>Or set an amount</Text>
                          <View style={[styles.row, styles.amountBox, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                            <Text style={[type.small, { color: theme.colors.textMuted }]}>{glyph}</Text>
                            <TextInput
                              value={amountDraft?.key === b.key ? amountDraft.text : amountFor.toLocaleString('en-NG')}
                              onFocus={() => setAmountDraft({ key: b.key, text: amountFor ? String(amountFor) : '' })}
                              onChangeText={(t) => setAmountDraft({ key: b.key, text: t.replace(/[^\d]/g, '') })}
                              onEndEditing={() => {
                                if (amountDraft?.key === b.key) {
                                  const typed = Number(amountDraft.text) || 0;
                                  b.setPct(Math.min(100, Math.max(0, (typed / parsedTotal) * 100)));
                                  markCustom();
                                }
                                setAmountDraft(null);
                              }}
                              keyboardType="number-pad"
                              returnKeyType="done"
                              accessibilityLabel={`${bucketLabel(b.key)} amount`}
                              style={[type.bodyStrong, styles.amountInput, { color: theme.colors.text }]}
                            />
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </Card>

              {showSavingsNudge ? (
                <Text style={[type.caption, { color: theme.colors.warn, marginTop: 10 }]}>Many people aim to save 10–20% of their budget. You’re below that.</Text>
              ) : null}
              {showDebtNudge ? (
                <Text style={[type.caption, { color: theme.colors.warn, marginTop: 6 }]}>A little more toward debt pays it down faster.</Text>
              ) : null}
            </>
          ) : null}

          {setupStep === 4 ? (
            <>
              <Text style={[type.eyebrow, { color: theme.colors.primary }]}>Review</Text>
              <Text style={[type.h2, { color: theme.colors.text, marginTop: 6 }]}>{periodName}</Text>
              <Amount value={Number.isFinite(parsedTotal) ? parsedTotal : 0} currency={glyph} size="lg" style={{ marginTop: 6 }} />
              <ListCard style={{ marginTop: 16 }}>
                {bucketDefs
                  .filter((b) => b.include && b.pct > 0)
                  .map((b) => {
                    const amt = Math.round(((Number.isFinite(parsedTotal) ? parsedTotal : 0) * b.pct) / 100);
                    return (
                      <ListRow
                        key={b.key}
                        icon={<View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: bucketColor(theme, b.key) }} />}
                        title={bucketLabel(b.key)}
                        subtitle={durationMonths > 1 ? `${pctLabel(b.pct)}% · about ${formatAmount(Math.round(amt / durationMonths), glyph)} a month` : `${pctLabel(b.pct)}% · ${b.desc}`}
                        right={<Amount value={amt} currency={glyph} size="sm" />}
                      />
                    );
                  })}
              </ListCard>
              <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 12 }]}>
                {editingBudgetId ? 'Save to update this budget.' : 'Create the budget and we’ll track spending against it as you add transactions.'}
              </Text>
            </>
          ) : null}
        </KeyboardAwareScrollView>

        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          <SecondaryButton
            title={setupStep === 1 ? 'Cancel' : 'Back'}
            onPress={() => (setupStep === 1 ? closeSetup() : setSetupStep((p) => (p > 1 ? ((p - 1) as 1 | 2 | 3 | 4) : p)))}
            style={{ flex: 1 }}
          />
          <PrimaryButton
            title={setupStep < 4 ? 'Continue' : editingBudgetId ? 'Save changes' : 'Create budget'}
            disabled={nextDisabled}
            loading={isSaving}
            style={{ flex: 2 }}
            onPress={async () => {
              if (setupStep < 4) {
                if (setupStep === 2 && preset === 'custom' && !allocTouched && !editingBudgetId) applySmartBalance();
                setSetupStep((p) => (p + 1) as 1 | 2 | 3 | 4);
                return;
              }
              await save();
              closeSetup();
              await load();
            }}
          />
        </View>
        </KeyboardStickyView>

        <Modal transparent visible={monthSheet != null} animationType="slide" onRequestClose={() => setMonthSheet(null)}>
          <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={() => setMonthSheet(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
              <View style={styles.rowBetween}>
                <Pressable hitSlop={10} onPress={() => setSheetYear((y) => y - 1)} accessibilityLabel="Previous year">
                  <ChevronLeft color={theme.colors.text} size={20} />
                </Pressable>
                <Text style={[type.title, { color: theme.colors.text }]}>
                  {monthSheet === 'end' ? 'Ends' : 'Starts'} · {sheetYear}
                </Text>
                <Pressable hitSlop={10} onPress={() => setSheetYear((y) => y + 1)} accessibilityLabel="Next year">
                  <ChevronRight color={theme.colors.text} size={20} />
                </Pressable>
              </View>
              <View style={[styles.wrap, { marginTop: 16 }]}>
                {Array.from({ length: 12 }, (_, m) => {
                  const selected =
                    monthSheet === 'end' ? m === endMonthSel && sheetYear === endYearSel : m === startMonthSel && sheetYear === startYearSel;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => {
                        if (monthSheet === 'end') {
                          setEndMonthSel(m);
                          setEndYearSel(sheetYear);
                        } else {
                          setStartMonthSel(m);
                          setStartYearSel(sheetYear);
                          if (new Date(sheetYear, m, 1) > endDateSel) {
                            setEndMonthSel(m);
                            setEndYearSel(sheetYear);
                          }
                        }
                        setMonthSheet(null);
                      }}
                      style={[styles.monthCell, { backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceAlt }]}
                    >
                      <Text style={[type.bodyStrong, { color: selected ? theme.colors.onPrimary : theme.colors.text }]}>{monthName(m)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </Screen>
    );
  }

  /* ------------------------------------------------------------- list view */
  // Your own plan leads. Shared budgets and events that are running get their own sections; the rest is history.
  const running = budgetsSorted.filter((b) => isBudgetCurrent(b));
  const current =
    running.find((b) => b.role !== 'member' && (b.purpose ?? 'personal') === 'personal') ?? running.find((b) => b.purpose !== 'event') ?? running[0] ?? null;
  const sharedRunning = running.filter((b) => b !== current && (b.purpose === 'household' || b.isShared) && b.purpose !== 'event');
  const eventsActive = budgetsSorted.filter((b) => b !== current && b.purpose === 'event' && (getBudgetRange(b)?.end.getTime() ?? 0) >= Date.now() - 86400000);
  const history = budgetsSorted.filter((b) => b !== current && !sharedRunning.includes(b) && !eventsActive.includes(b));
  const currentTx = current ? budgetTxByBudgetId[String(current.id)] ?? { income: 0, expenses: 0, spentByCategory: {} } : null;
  const currentRange = current ? getBudgetRange(current) : null;
  const currentPace = (() => {
    if (!current || !currentRange || !currentTx) return null;
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const elapsed = Math.min(currentRange.days, Math.max(1, Math.floor((today.getTime() - currentRange.start.getTime()) / 86400000) + 1));
    const spent = currentTx.expenses;
    const added = currentTx.income;
    const planned = current.totalBudget ?? 0;
    const total = planned + added;
    return {
      elapsed,
      days: currentRange.days,
      daysLeft: Math.max(0, currentRange.days - elapsed),
      spent,
      total,
      planned,
      added,
      left: total - spent,
      spentRatio: total > 0 ? spent / total : 0,
      timeRatio: elapsed / currentRange.days
    };
  })();

  return (
    <Screen scrollable={false}>
      <FlatList
        data={history}
        keyExtractor={(b) => String(b.id)}
        refreshing={isLoading || isSaving}
        onRefresh={handleRefresh}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 130 }}
        ListHeaderComponent={
          <View>
            <ScreenHeader
              title="Budgets"
              right={
                <View style={styles.row}>
                  {/* Shared budgets are for households; a business shares through its team instead. */}
                  {isBusiness ? null : (
                    <IconButton accessibilityLabel="Join a shared budget" onPress={() => (nav as any).navigate('ShareBudget')}>
                      <Users color={theme.colors.text} size={18} />
                    </IconButton>
                  )}
                  <IconButton accessibilityLabel={showAmounts ? 'Hide amounts' : 'Show amounts'} onPress={toggleShowAmounts}>
                    {showAmounts ? <EyeOff color={theme.colors.text} size={18} /> : <Eye color={theme.colors.text} size={18} />}
                  </IconButton>
                  <Pressable
                    ref={createBudgetAnchorRef as any}
                    onPress={() => openNewBudget()}
                    accessibilityRole="button"
                    accessibilityLabel="New budget"
                    style={({ pressed }) => [styles.newPill, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 }]}
                  >
                    <Plus color={theme.colors.onPrimary} size={16} strokeWidth={2.6} />
                    <Text style={[type.smallStrong, { color: theme.colors.onPrimary }]}>New</Text>
                  </Pressable>
                </View>
              }
            />
            {spacesEnabled ? (
              <View style={{ marginTop: 6 }}>
                <SpaceSwitcher />
              </View>
            ) : null}
            {error ? (
              <View style={{ marginTop: 12 }}>
                <InlineError message={error} />
              </View>
            ) : null}

            {current && currentPace ? (
              <Pressable onPress={() => (nav as any).navigate('BudgetDetail', { budgetId: String(current.id) })} accessibilityRole="button" style={{ marginTop: 12 }}>
                <Card>
                  <View style={styles.rowBetween}>
                    <Text style={[type.title, { color: theme.colors.text, flexShrink: 1 }]}>
                      {displayName(current)}
                      {current.isShared ? <Text style={{ color: theme.colors.primary }}> · Shared</Text> : null}
                    </Text>
                    <Chip tone="primary" label={`Current · ${currentPace.daysLeft} day${currentPace.daysLeft === 1 ? '' : 's'} left`} />
                  </View>
                  <View style={[styles.row, { alignItems: 'baseline', gap: 6, marginTop: 12 }]}>
                    {currentPace.left < 0 ? <Text style={[type.bodyStrong, { color: theme.colors.error }]}>Over by</Text> : null}
                    <Amount value={Math.abs(currentPace.left)} currency={glyph} size="lg" hidden={hide} color={currentPace.left < 0 ? theme.colors.error : theme.colors.text} />
                    {currentPace.left >= 0 ? (
                      <Text style={[type.small, { color: theme.colors.textMuted }]}>left of {hide ? '••••' : formatAmount(currentPace.total, glyph)}</Text>
                    ) : null}
                  </View>
                  {currentPace.added > 0 ? (
                    <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                      {hide
                        ? 'Includes money you added this period'
                        : `${formatAmount(currentPace.planned, glyph)} planned, plus ${formatAmount(currentPace.added, glyph)} you added`}
                    </Text>
                  ) : null}
                  <View style={{ marginTop: 12 }}>
                    <ProgressBar
                      value={currentPace.spentRatio}
                      marker={currentPace.timeRatio}
                      height={8}
                      color={currentPace.left < 0 ? theme.colors.error : currentPace.spentRatio > currentPace.timeRatio + 0.05 ? theme.colors.brass : theme.colors.primary}
                    />
                  </View>
                  <View style={[styles.rowBetween, { marginTop: 6 }]}>
                    <Text style={[type.caption, { color: theme.colors.textMuted }]}>{hide ? 'Spent' : `${formatAmount(currentPace.spent, glyph)} spent`}</Text>
                    <Text style={[type.caption, { color: theme.colors.textMuted }]}>
                      Day {currentPace.elapsed} of {currentPace.days}
                    </Text>
                  </View>
                  {/* Only when it's needed: over, or spending well ahead of the calendar. */}
                  {current.role !== 'member' && (currentPace.left < 0 || currentPace.spentRatio > currentPace.timeRatio + 0.1) ? (
                    <Pressable onPress={() => setTightOpen(true)} hitSlop={8} accessibilityRole="button" style={{ marginTop: 8 }}>
                      <Text style={[type.smallStrong, { color: theme.colors.primary }]}>Money tight? See what to do →</Text>
                    </Pressable>
                  ) : null}

                  {Object.keys(current.categories || {}).length ? (
                    <GuideAnchor id="budget.buckets">
                      <View style={[styles.hr, { backgroundColor: theme.colors.border }]} />
                      <View style={styles.rowBetween}>
                        <InfoTip
                          text="Needs are what you must pay, Wants can wait, Savings goes away first. If one runs over, Move money shifts some from another bucket; your total stays the same."
                          label="What are buckets?"
                        >
                          Buckets
                        </InfoTip>
                        {current.role !== 'member' && Object.keys(current.categories || {}).length > 1 ? (
                          <Pressable onPress={() => setMoveFor({})} hitSlop={10} accessibilityRole="button" style={[styles.row, { gap: 5 }]}>
                            <ArrowRightLeft color={theme.colors.primary} size={14} />
                            <Text style={[type.smallStrong, { color: theme.colors.primary }]}>Move money</Text>
                          </Pressable>
                        ) : null}
                      </View>
                      {Object.entries(current.categories || {}).map(([key, c]) => {
                        const spent = currentTx?.spentByCategory?.[key] ?? 0;
                        const budgeted = Number(c?.budgeted) || 0;
                        const ratio = budgeted > 0 ? spent / budgeted : 0;
                        const color = bucketColor(theme, key);
                        const over = spent > budgeted && budgeted > 0;
                        const hot = !over && ratio > currentPace.timeRatio + 0.1 && spent > 0;
                        return (
                          <View key={key} style={{ paddingVertical: 9 }}>
                            <View style={styles.rowBetween}>
                              <View style={[styles.row, { gap: 8 }]}>
                                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
                                <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{bucketLabel(key)}</Text>
                              </View>
                              <Text style={[type.small, { color: theme.colors.textMuted }]}>
                                <Text style={{ fontFamily: fonts.semibold, color: theme.colors.text }}>{hide ? '••••' : formatAmount(spent, glyph)}</Text>
                                {hide ? '' : ` / ${formatAmount(budgeted, glyph)}`}
                              </Text>
                            </View>
                            <View style={{ marginTop: 7 }}>
                              <ProgressBar value={ratio} color={over ? theme.colors.error : color} />
                            </View>
                            {over ? (
                              <View style={[styles.rowBetween, { marginTop: 5 }]}>
                                <Text style={[type.caption, { color: theme.colors.error, fontFamily: fonts.semibold }]}>
                                  Over by {hide ? '••••' : formatAmount(spent - budgeted, glyph)}
                                </Text>
                                {current.role !== 'member' && Object.keys(current.categories || {}).length > 1 ? (
                                  <Pressable onPress={() => setMoveFor({ to: key })} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Cover ${bucketLabel(key)} from another bucket`}>
                                    <Text style={[type.smallStrong, { color: theme.colors.primary }]}>Cover it</Text>
                                  </Pressable>
                                ) : null}
                              </View>
                            ) : hot ? (
                              <Text style={[type.caption, { color: theme.colors.warn, marginTop: 5, fontFamily: fonts.semibold }]}>
                                Running hot · {Math.round(ratio * 100)}% used, {Math.round(currentPace.timeRatio * 100)}% of the time gone
                              </Text>
                            ) : null}
                          </View>
                        );
                      })}
                    </GuideAnchor>
                  ) : null}
                </Card>
              </Pressable>
            ) : !isLoading ? (
              <View style={{ marginTop: 12 }}>
                <EmptyState
                  title={budgetsSorted.length ? 'No budget running right now' : 'Create your first budget'}
                  body="Plan what you’ll spend this month. We’ll track it as you add transactions and warn you before you overspend."
                  actionLabel="Create a budget"
                  onAction={() => openNewBudget()}
                />
              </View>
            ) : (
              <Skeleton rows={3} height={96} style={{ marginTop: 16 }} />
            )}

            {rolloverFor ? (
              <Card style={{ marginTop: 12, borderColor: theme.colors.brass }}>
                <View style={styles.row}>
                  <IconTile bg={theme.colors.brassSoft}>
                    <ArrowRightLeft color={theme.colors.brass} size={19} />
                  </IconTile>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{displayName(rolloverFor.budget)} ended with money left</Text>
                    <Text style={[type.caption, { color: theme.colors.textMuted }]}>
                      {hide ? 'Move it into a goal or your next budget' : `${formatAmount(rolloverFor.preview.unspent, glyph)} unspent. Put it to work.`}
                    </Text>
                  </View>
                </View>
                <PrimaryButton title="Move leftover money" onPress={() => setRolloverSheet(true)} style={{ marginTop: 12 }} />
              </Card>
            ) : null}

            {sharedRunning.length ? <SectionHeader title="Shared budgets" info="Budgets you run with a partner, family or housemates. Everyone logs what they spend, and you all see the same numbers. Your own plan stays yours." /> : null}
            {sharedRunning.map((b) => {
              const tx = budgetTxByBudgetId[String(b.id)] ?? { income: 0, expenses: 0, spentByCategory: {} };
              const left = (b.totalBudget ?? 0) - tx.expenses;
              const people = (b.members?.length ?? 0) + 1;
              return (
                <Pressable
                  key={String(b.id)}
                  onPress={() => (nav as any).navigate('BudgetDetail', { budgetId: String(b.id) })}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.historyRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.85 : 1 }]}
                >
                  <IconTile bg={theme.colors.primarySoft}>
                    <Users color={theme.colors.primary} size={18} />
                  </IconTile>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[type.bodyStrong, { color: theme.colors.text }]}>
                      {displayName(b)}
                    </Text>
                    <Text style={[type.caption, { color: theme.colors.textMuted }]}>
                      {people} {people === 1 ? 'person' : 'people'} · {b.role === 'member' ? 'shared with you' : 'you manage it'}
                    </Text>
                  </View>
                  <Chip tone={left < 0 ? 'negative' : 'primary'} label={hide ? (left < 0 ? 'Over' : 'Running') : left < 0 ? `Over by ${formatAmount(-left, glyph)}` : `${formatAmount(left, glyph)} left`} />
                </Pressable>
              );
            })}

            {eventsActive.length ? <SectionHeader title="Events & trips" info="One-off budgets for a wedding, a trip or a project. They run alongside your monthly plan, so spending on them doesn't eat into it." /> : null}
            {eventsActive.map((b) => {
              const tx = budgetTxByBudgetId[String(b.id)] ?? { income: 0, expenses: 0, spentByCategory: {} };
              const r = getBudgetRange(b);
              const upcoming = !!r && r.start.getTime() > Date.now();
              const left = (b.totalBudget ?? 0) - tx.expenses;
              return (
                <Pressable
                  key={String(b.id)}
                  onPress={() => (nav as any).navigate('BudgetDetail', { budgetId: String(b.id) })}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.historyRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.85 : 1 }]}
                >
                  <IconTile bg={theme.colors.brassSoft}>
                    <PartyPopper color={theme.colors.brass} size={18} />
                  </IconTile>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[type.bodyStrong, { color: theme.colors.text }]}>
                      {displayName(b)}
                    </Text>
                    <Text style={[type.caption, { color: theme.colors.textMuted }]}>
                      {r ? `${r.start.getDate()} ${monthName(r.start.getMonth())} – ${r.end.getDate()} ${monthName(r.end.getMonth())}` : ''}
                      {b.isShared ? ' · shared' : ''}
                    </Text>
                  </View>
                  {upcoming ? (
                    <Chip label="Upcoming" />
                  ) : (
                    <Chip tone={left < 0 ? 'negative' : 'brass'} label={hide ? (left < 0 ? 'Over' : 'On') : left < 0 ? `Over by ${formatAmount(-left, glyph)}` : `${formatAmount(left, glyph)} left`} />
                  )}
                </Pressable>
              );
            })}

            {history.length ? <SectionHeader title="Other budgets" info="Budgets that have ended or haven't started yet. Open one to see how it went, or start the next period from it." /> : null}
          </View>
        }
        renderItem={({ item }) => {
          const tx = budgetTxByBudgetId[String(item.id)] ?? { income: 0, expenses: 0, spentByCategory: {} };
          const total = item.totalBudget ?? 0;
          const spent = tx.expenses ?? 0;
          const r = getBudgetRange(item);
          const upcoming = !!r && r.start.getTime() > Date.now();
          const diff = total - spent;
          return (
            <Pressable
              onPress={() => (nav as any).navigate('BudgetDetail', { budgetId: String(item.id) })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.historyRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.85 : 1 }]}
            >
              <IconTile bg={theme.colors.surfaceAlt}>
                <CalendarDays color={theme.colors.textMuted} size={18} />
              </IconTile>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[type.bodyStrong, { color: theme.colors.text }]}>
                  {displayName(item)}
                </Text>
                <Text style={[type.caption, { color: theme.colors.textMuted }]}>
                  {hide ? 'Tap to view' : upcoming ? `${formatAmount(total, glyph)} planned` : `${formatAmount(spent, glyph)} of ${formatAmount(total, glyph)}`}
                </Text>
              </View>
              {upcoming ? (
                <Chip label="Upcoming" />
              ) : diff < 0 ? (
                <Chip tone="negative" label={hide ? 'Over' : `Over by ${formatAmount(Math.abs(diff), glyph)}`} />
              ) : (
                <Chip tone="positive" label={hide ? 'Under' : `Under by ${formatAmount(diff, glyph)}`} />
              )}
            </Pressable>
          );
        }}
      />

      <NudgeTooltip
        visible={!isTourActive && !seen['budget.create'] && !showSetup && !isLoading && !isSaving && !error && budgetsList.length === 0}
        targetRef={createBudgetAnchorRef}
        title="Quick tip"
        body="Tap New to create your first budget. We’ll track spent vs remaining automatically as you add transactions."
        onDismiss={() => markSeen('budget.create')}
      />

      <Modal transparent visible={rolloverSheet && !!rolloverFor} animationType="slide" onRequestClose={() => setRolloverSheet(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={() => setRolloverSheet(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
            {rolloverFor ? (
              <>
                <Text style={[type.title, { color: theme.colors.text }]}>Move {formatAmount(rolloverFor.preview.unspent, glyph)}</Text>
                <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 4 }]}>
                  From {displayName(rolloverFor.budget)}. Choose where it goes; you can only do this once.
                </Text>
                <ListCard style={{ marginTop: 14 }}>
                  {rolloverFor.preview.nextBudget ? (
                    <ListRow
                      icon={
                        <IconTile bg={theme.colors.primarySoft}>
                          <CalendarDays color={theme.colors.primary} size={18} />
                        </IconTile>
                      }
                      title="Savings in your next budget"
                      subtitle={rolloverFor.preview.nextBudget.name.replace(/^My Budget \((.*)\)$/, '$1')}
                      onPress={() => void doRollover({ destination: 'next-budget' })}
                      chevron
                    />
                  ) : null}
                  {rolloverFor.preview.goals.map((g) => (
                    <ListRow
                      key={g.id}
                      icon={
                        <IconTile bg={theme.colors.surfaceAlt}>
                          <Text style={{ fontSize: 18 }}>{g.emoji || '🎯'}</Text>
                        </IconTile>
                      }
                      title={g.name}
                      subtitle={`${formatAmount(g.remaining, glyph)} to go`}
                      onPress={() => void doRollover({ destination: 'goal', goalId: g.id })}
                      chevron
                    />
                  ))}
                </ListCard>
                {!rolloverFor.preview.nextBudget && !rolloverFor.preview.goals.length ? (
                  <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 12 }]}>Create a goal or next month’s budget first, then come back.</Text>
                ) : null}
                {rollingOver ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 12 }} /> : null}
                <SecondaryButton title="Not now" onPress={() => setRolloverSheet(false)} style={{ marginTop: 14 }} />
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {current && currentTx ? (
        <MoveMoneySheet
          visible={!!moveFor}
          onClose={() => setMoveFor(null)}
          budget={current}
          spent={currentTx.spentByCategory}
          to={moveFor?.to}
          glyph={glyph}
          isBusiness={isBusiness}
          onMoved={() => void load()}
        />
      ) : null}
      {current && currentPace ? (
        <TightMonthSheet
          visible={tightOpen}
          onClose={() => setTightOpen(false)}
          budget={current}
          spent={currentPace.spent}
          elapsed={currentPace.elapsed}
          glyph={glyph}
          onChanged={() => void load()}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  newPill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingLeft: 10, paddingRight: 14, borderRadius: 18 },
  hr: { height: StyleSheet.hairlineWidth, marginVertical: 14 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  setupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  steps: { flexDirection: 'row', gap: 6, marginTop: 8 },
  step: { flex: 1, height: 4, borderRadius: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  bigInput: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 16, marginTop: 18, minHeight: 72 },
  bigInputText: { flex: 1, fontFamily: fonts.display, fontSize: 34, letterSpacing: -1, paddingVertical: 10 },
  allocBar: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', marginTop: 16, gap: 2 },
  bucket: { paddingVertical: 12 },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepper: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  amountBox: { gap: 4, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, height: 40, minWidth: 140 },
  amountInput: { flex: 1, paddingVertical: 0, textAlign: 'right' },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20 },
  monthCell: { width: '31%', height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }
});
