import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellRing, Check, ChevronLeft, CircleDollarSign, Layers, ListChecks, Plus, Receipt, Sparkles, UserRound, Users, X } from '../icons';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { Amount, Card, Chip, HeroCard, IconTile, InlineError, PrimaryButton, SecondaryButton, SegmentedControl, TextButton, TextField } from '../components/Common/ui';
import { ChoiceChip } from '../components/Plan/ChoiceChip';
import { IncomeEditor } from '../components/Plan/IncomeEditor';
import { PlanSplit } from '../components/Plan/PlanSplit';
import {
  completeOnboarding,
  listIncomeSources,
  previewPlan,
  skipOnboarding,
  type ApiPlan,
  type BillInput,
  type BudgetMode,
  type IncomeInput,
  type PainPoint,
  type PlanInputs
} from '../api/personal';
import { BILL_PRESETS, blankBill, blankIncome, everydayPerDay, fromApiIncome, toBillInput, toIncomeInput, type DraftBill, type DraftIncome } from '../lib/planDrafts';
import { pickQuote } from '../lib/quotes';
import { QuoteLine } from '../components/Common/QuoteLine';
import { setDailyReminder } from '../lib/notifications';
import { currencySymbol, formatNumberInput, formatShortDate, toIsoDate } from '../utils/format';
import { fonts, type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';

const PAIN_OPTIONS: Array<{ key: PainPoint; title: string; body: string }> = [
  { key: 'runs_out', title: 'My money runs out before payday', body: 'We’ll show what’s safe to spend each day.' },
  { key: 'no_idea', title: 'I don’t know where my money goes', body: 'Logging takes seconds, and we’ll point out the leaks.' },
  { key: 'cant_save', title: 'I find it hard to save', body: 'Savings comes first in your plan, even small amounts.' },
  { key: 'debt', title: 'I’m paying off debt', body: 'Repayments are covered before wants.' },
  { key: 'irregular', title: 'My income isn’t steady', body: 'We’ll plan around a safe estimate.' }
];

const MODE_OPTIONS: Array<{ key: BudgetMode; title: string; body: string; Icon: typeof Users }> = [
  { key: 'solo', title: 'Just me', body: 'My own budget for my own money.', Icon: UserRound },
  { key: 'shared', title: 'Together with someone', body: 'One budget for the home, with a partner, family or housemates.', Icon: Users },
  { key: 'both', title: 'My own, plus a shared one', body: 'Keep your own plan and share a household budget too. Yours shows on Home.', Icon: Layers }
];

const REMINDERS = [
  { key: 'morning', label: 'Morning', time: '8:00 am', hour: 8 },
  { key: 'lunch', label: 'Lunchtime', time: '1:00 pm', hour: 13 },
  { key: 'evening', label: 'Evening', time: '8:00 pm', hour: 20 },
  { key: 'none', label: 'No reminder', time: 'I’ll remember myself', hour: -1 }
] as const;

type ReminderKey = (typeof REMINDERS)[number]['key'];
type StepKey = 'welcome' | 'who' | 'pain' | 'income' | 'bills' | 'plan' | 'left' | 'reminder';

const STEP_LABEL: Record<StepKey, string> = {
  welcome: 'Welcome',
  who: 'Who it’s for',
  pain: 'What you want help with',
  income: 'Your income',
  bills: 'Your regular bills',
  plan: 'Your plan',
  left: 'Until payday',
  reminder: 'Daily reminder'
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_DAYS = 365 / 12;

/** Whole days between two YYYY-MM-DD dates. */
const daysBetween = (from: string, to: string) => Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / DAY_MS);

const cleanCode = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

/**
 * The first-run plan: who the budget is for, what's hard right now, income and payday, regular bills, the plan
 * itself, and a daily reminder. Every step can be skipped, and everything can be changed later.
 */
export default function SetupPlanScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const fromHome = !!route.params?.fromHome;
  const { user, refreshUser } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const glyph = currencySymbol(user?.currency);
  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] || null;

  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<BudgetMode>(user?.budgetMode ?? 'solo');
  const [inviteCode, setInviteCode] = useState('');
  const [pains, setPains] = useState<PainPoint[]>((user?.onboarding?.painPoints as PainPoint[] | undefined) ?? []);
  const [incomes, setIncomes] = useState<DraftIncome[]>([blankIncome('salary')]);
  const [bills, setBills] = useState<DraftBill[]>([]);
  const [payday, setPayday] = useState(user?.budgetPeriod !== 'monthly');
  const [plan, setPlan] = useState<ApiPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [leftAmount, setLeftAmount] = useState('');
  const [leftEdited, setLeftEdited] = useState(false);

  // Someone joining a few days into their period has already spent some of this pay. Their first budget should
  // be what they actually have left, so they get one extra question. Only their own budget works this way.
  const today = toIsoDate(new Date());
  const joinedLate =
    !fromHome &&
    mode !== 'shared' &&
    !!plan &&
    plan.status !== 'no_income' &&
    daysBetween(plan.period.start, today) >= 3 &&
    plan.period.daysToPayday >= 2;
  const leftEstimate = plan ? Math.round(((plan.split.Needs + plan.split.Wants) * plan.period.daysToPayday) / MONTH_DAYS / 1000) * 1000 : 0;

  // Updating an existing plan skips "who is this for"; that lives in Settings.
  const order: StepKey[] = [
    'welcome',
    ...(fromHome ? [] : (['who'] as StepKey[])),
    'pain',
    'income',
    'bills',
    'plan',
    ...(joinedLate ? (['left'] as StepKey[]) : []),
    'reminder'
  ];
  const LAST_STEP = order.length - 1;
  const [reminder, setReminder] = useState<ReminderKey>('evening');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fade = useRef(new Animated.Value(1)).current;
  const key = order[step];

  // Updating an existing plan starts from what's saved.
  useEffect(() => {
    if (!fromHome) return;
    listIncomeSources()
      .then((items) => items.length && setIncomes(items.map(fromApiIncome)))
      .catch(() => undefined);
  }, [fromHome]);

  const inputs = (): PlanInputs => ({
    income: incomes.map(toIncomeInput).filter(Boolean) as IncomeInput[],
    bills: bills.map(toBillInput).filter(Boolean) as BillInput[],
    painPoints: pains,
    budgetPeriod: payday ? 'payday' : 'monthly'
  });

  useEffect(() => {
    if (key !== 'plan') return;
    let cancelled = false;
    setPlanLoading(true);
    setError(null);
    previewPlan(inputs())
      .then((p) => !cancelled && setPlan(p))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not build your plan. Check your connection.'))
      .finally(() => !cancelled && setPlanLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, payday]);

  // The payoff early: once there's an income, show roughly what a day of everyday spending looks like, and keep
  // it updated while bills are added. Same server maths as the plan step, fetched after typing pauses.
  const [livePlan, setLivePlan] = useState<ApiPlan | null>(null);
  const liveKey = key === 'income' || key === 'bills' ? JSON.stringify([incomes.map(toIncomeInput), bills.map(toBillInput), payday]) : '';
  useEffect(() => {
    if (!liveKey) return;
    const input = inputs();
    if (!input.income.length) {
      setLivePlan(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      previewPlan(input)
        .then((p) => !cancelled && setLivePlan(p))
        .catch(() => undefined);
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey]);

  // Start from an estimate so most people just confirm it. It follows plan changes until they type their own.
  useEffect(() => {
    if (key === 'left' && !leftEdited) setLeftAmount(leftEstimate > 0 ? formatNumberInput(String(leftEstimate)) : '');
  }, [key, leftEdited, leftEstimate]);

  const go = (next: number) => {
    setError(null);
    Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 90, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true })
    ]).start();
    setStep(next);
  };

  const leave = () => {
    if (fromHome && nav.canGoBack()) goBackOrHome(nav);
    else nav.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  // Skipping setup leaves Home without a plan, so it's a deliberate choice rather than an accidental tap.
  const confirmSkip = () => {
    if (fromHome) {
      // Updating from Profile: nothing is saved until Finish, so only ask once they've got past the intro.
      if (step <= 1) return void skip();
      Alert.alert('Leave without saving?', 'Your changes to the plan won’t be kept.', [
        { text: 'Leave', style: 'destructive', onPress: () => void skip() },
        { text: 'Stay', style: 'cancel' }
      ]);
      return;
    }
    Alert.alert(
      'Skip your plan?',
      'It takes about two minutes. Without it we can’t show what’s safe to spend each day, and Home stays empty until you set a budget. You can finish it later from Profile.',
      [
        { text: 'Skip anyway', style: 'destructive', onPress: () => void skip() },
        { text: 'Keep going', style: 'cancel' }
      ]
    );
  };

  /** Continue, but moving past an empty step asks once, with the helpful option as the default. */
  const advance = () => {
    const next = () => go(step + 1);
    const ask = (title: string, body: string, keep: string, anyway: string) =>
      Alert.alert(title, body, [
        { text: anyway, style: 'destructive', onPress: next },
        { text: keep, style: 'cancel' }
      ]);
    if (key === 'pain' && pains.length === 0) {
      ask('Skip this one?', 'Picking even one means the tips you get fit your life, not everyone’s.', 'Pick one', 'Continue anyway');
      return;
    }
    if (key === 'income' && !incomes.some((i) => toIncomeInput(i))) {
      ask(
        'Continue without your income?',
        'Your plan is built from what you earn. Without it we can’t split your money or show what’s safe to spend each day. A rough number is fine.',
        'Add my income',
        'Continue anyway'
      );
      return;
    }
    if (key === 'bills' && bills.length > 0 && bills.some((b) => !toBillInput(b))) {
      ask('Some bills have no amount', 'Bills without an amount are left out of your plan. A rough figure is better than none.', 'Add amounts', 'Leave them out');
      return;
    }
    if (key === 'bills' && bills.length === 0) {
      ask('No regular bills?', 'Rent, school fees, data, family support and ajo all count. Adding them now means they’re never a surprise later.', 'Add a bill', 'I have none');
      return;
    }
    next();
  };

  const skip = async () => {
    setBusy(true);
    try {
      if (!user?.onboarding?.completedAt) await skipOnboarding();
      await refreshUser();
    } catch {
      // Skipping should never block getting into the app.
    } finally {
      setBusy(false);
    }
    leave();
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    const code = mode === 'solo' ? '' : inviteCode.trim();
    try {
      const typedLeft = Number(leftAmount.replace(/,/g, ''));
      const leftUntilPayday = joinedLate ? (leftAmount.trim() && Number.isFinite(typedLeft) ? typedLeft : leftEstimate) : undefined;
      const res = await completeOnboarding({ ...inputs(), createBudget: true, mode, inviteCode: code || undefined, leftUntilPayday });
      const choice = REMINDERS.find((r) => r.key === reminder)!;
      if (choice.hour >= 0) {
        const ok = await setDailyReminder({ hour: choice.hour, minute: 0 }).catch(() => false);
        if (!ok) toast.show('Allow notifications in your phone settings to get the daily reminder.', 'info', 4000);
      } else {
        await setDailyReminder(null).catch(() => undefined);
      }
      await refreshUser();

      if (fromHome) {
        toast.show('Your plan is updated', 'success');
        leave();
        return;
      }
      if (mode === 'shared' && !code && res.sharedBudget) {
        // Configured for a shared household: the budget exists, so the next step is inviting people.
        toast.show('Your household budget is ready. Now invite your people 👇', 'success', 4000);
        nav.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'ShareBudget', params: { budgetId: res.sharedBudget.id, budgetName: res.sharedBudget.name } }] });
        return;
      }
      if (mode === 'both' && !code) {
        toast.show('Your plan is ready. Next, set up the budget you’ll share.', 'success', 4000);
        nav.reset({ index: 0, routes: [{ name: 'Main', params: { screen: 'Budget', params: { startNew: true, purpose: 'household' } } }] });
        return;
      }
      toast.show(res.sharedBudget && code ? `You’re in! ${res.sharedBudget.name.replace(/^My Budget \((.*)\)$/, '$1')} is ready 🎉` : 'Your plan is ready', 'success');
      leave();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save your plan. Check your connection and try again.';
      setError(message);
      // A bad code is fixed on the "who" step.
      if (code && /code/i.test(message)) go(order.indexOf('who'));
    } finally {
      setBusy(false);
    }
  };

  const hasPayDates = incomes.some((i) => (i.frequency === 'monthly' && i.payDay) || ((i.frequency === 'weekly' || i.frequency === 'biweekly') && i.payWeekday != null));
  const addedPresets = new Set(bills.map((b) => b.name));

  /* ------------------------------------------------------------ steps */

  const welcome = (
    <View>
      <HeroCard style={{ marginTop: 8 }}>
        <Text style={[type.eyebrow, { color: theme.colors.inkText, opacity: 0.72 }]}>Two minutes</Text>
        <Text style={[type.h1, { color: theme.colors.inkText, marginTop: 8, fontSize: 28, lineHeight: 34 }]}>
          {firstName ? `Hi ${firstName}, let’s make a plan that works for you` : 'Let’s make a plan that works for you'}
        </Text>
        <Text style={[type.body, { color: theme.colors.inkText, opacity: 0.8, marginTop: 10 }]}>
          Rough numbers are fine. There’s no judgement here, and you can change anything later.
        </Text>
      </HeroCard>
      {[
        { Icon: Users, title: 'Solo or together', body: 'Budget on your own, with your partner or housemates, or both.' },
        { Icon: CircleDollarSign, title: 'What you earn and when', body: 'So your budget runs from payday to payday.' },
        { Icon: Receipt, title: 'What you must pay', body: 'Rent, school fees, tithe, family support and more.' },
        { Icon: ListChecks, title: 'A plan you can follow', body: 'Split into Needs, Wants and Savings in plain numbers.' }
      ].map(({ Icon, title, body }) => (
        <View key={title} style={styles.point}>
          <IconTile bg={theme.colors.primarySoft} size={40}>
            <Icon color={theme.colors.primary} size={20} />
          </IconTile>
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{title}</Text>
            <Text style={[type.small, { color: theme.colors.textMuted }]}>{body}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  const whoStep = (
    <View>
      <Text style={[type.eyebrow, { color: theme.colors.primary }]}>Who it’s for</Text>
      <Text style={[type.h2, { color: theme.colors.text, marginTop: 6 }]}>Who are you budgeting for?</Text>
      <Text style={[type.body, { color: theme.colors.textMuted, marginTop: 6, marginBottom: 12 }]}>We’ll set the app up to match. You can change this later in Settings.</Text>
      {MODE_OPTIONS.map((o) => {
        const active = mode === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => setMode(o.key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            style={[styles.option, { borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface }]}
          >
            <IconTile bg={active ? theme.colors.surface : theme.colors.surfaceAlt} size={40}>
              <o.Icon color={active ? theme.colors.primary : theme.colors.textMuted} size={19} />
            </IconTile>
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{o.title}</Text>
              <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>{o.body}</Text>
            </View>
            {active ? <Check color={theme.colors.primary} size={18} strokeWidth={3} /> : null}
          </Pressable>
        );
      })}

      {mode !== 'solo' ? (
        <Card style={{ marginTop: 14 }}>
          <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Got an invite code?</Text>
          <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 4, marginBottom: 12 }]}>
            {mode === 'shared'
              ? 'If someone already started the budget, enter their code to join it. If not, leave this empty: we’ll create the household budget and you can invite them next.'
              : 'Joining someone’s budget? Enter their code. If not, leave it empty and you can start a shared budget right after setup.'}
          </Text>
          <TextField
            label="Invite code (optional)"
            value={inviteCode}
            onChangeText={(t) => setInviteCode(cleanCode(t))}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="e.g. K7PQ2M"
            // Spaced letters make a typed code easy to check, but they'd also stretch the "e.g." hint.
            style={inviteCode ? { fontFamily: fonts.display, letterSpacing: 4, fontSize: 18 } : undefined}
          />
          {mode === 'shared' ? (
            <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: -4 }]}>Your income and bills still help us suggest what you can put in.</Text>
          ) : null}
        </Card>
      ) : null}
    </View>
  );

  const painStep = (
    <View>
      <Text style={[type.eyebrow, { color: theme.colors.primary }]}>About you</Text>
      <Text style={[type.h2, { color: theme.colors.text, marginTop: 6 }]}>What’s hardest about money right now?</Text>
      <Text style={[type.body, { color: theme.colors.textMuted, marginTop: 6, marginBottom: 12 }]}>Pick any that sound like you. It shapes the tips you get.</Text>
      {PAIN_OPTIONS.map((o) => {
        const active = pains.includes(o.key);
        return (
          <Pressable
            key={o.key}
            onPress={() => setPains((p) => (active ? p.filter((x) => x !== o.key) : [...p, o.key]))}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active }}
            style={[styles.option, { borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface }]}
          >
            <View style={[styles.check, { borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: active ? theme.colors.primary : 'transparent' }]}>
              {active ? <Check color={theme.colors.onPrimary} size={14} strokeWidth={3} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{o.title}</Text>
              <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>{o.body}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  const validBills = bills.map(toBillInput).filter(Boolean) as BillInput[];
  const liveDaily = livePlan && livePlan.status !== 'no_income' ? everydayPerDay(livePlan, validBills) : null;
  const livePreview =
    liveDaily == null || !livePlan ? null : (
      <Card style={{ marginTop: 16, backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primarySoft }}>
        {livePlan.status === 'short' ? (
          <>
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Your bills are more than your income</Text>
            <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>Keep going. Your plan shows what to pay first.</Text>
          </>
        ) : (
          <>
            <Text style={[type.caption, { color: theme.colors.primary, fontFamily: fonts.semibold }]}>Everyday spending money</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <Amount value={liveDaily} currency={glyph} size="lg" />
              <Text style={[type.small, { color: theme.colors.textMuted }]}>a day</Text>
            </View>
            <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
              {validBills.length ? 'After your bills and savings.' : 'After savings. Add your bills next and we’ll adjust it.'}
            </Text>
          </>
        )}
      </Card>
    );
  const planDaily = plan && plan.status !== 'no_income' ? everydayPerDay(plan, validBills) : 0;

  const incomeStep = (
    <View>
      <Text style={[type.eyebrow, { color: theme.colors.primary }]}>Income</Text>
      <Text style={[type.h2, { color: theme.colors.text, marginTop: 6 }]}>How do you get paid?</Text>
      <Text style={[type.body, { color: theme.colors.textMuted, marginTop: 6 }]}>Add each way money comes in: salary, business, side hustle or allowance.</Text>
      {incomes.map((inc, i) => (
        <Card key={inc.key} style={{ marginTop: 14 }}>
          <IncomeEditor
            value={inc}
            glyph={glyph}
            title={incomes.length > 1 ? `Income ${i + 1}` : 'Income'}
            onChange={(next) => setIncomes((list) => list.map((x) => (x.key === inc.key ? next : x)))}
            onRemove={incomes.length > 1 ? () => setIncomes((list) => list.filter((x) => x.key !== inc.key)) : undefined}
          />
        </Card>
      ))}
      {incomes.length < 5 ? (
        <SecondaryButton
          title="Add another income"
          iconLeft={<Plus color={theme.colors.text} size={18} />}
          onPress={() => setIncomes((list) => [...list, blankIncome('side_hustle')])}
          style={{ marginTop: 12 }}
        />
      ) : null}
      {livePreview}
    </View>
  );

  const billsStep = (
    <View>
      <Text style={[type.eyebrow, { color: theme.colors.primary }]}>Bills</Text>
      <Text style={[type.h2, { color: theme.colors.text, marginTop: 6 }]}>What do you have to pay regularly?</Text>
      <Text style={[type.body, { color: theme.colors.textMuted, marginTop: 6 }]}>
        Tap the ones you have. Day-to-day spending like food and transport comes out of Needs, so you don’t need to add it here.
      </Text>
      <View style={styles.wrap}>
        {BILL_PRESETS.filter((p) => !addedPresets.has(p.name)).map((p) => (
          <ChoiceChip key={p.name} label={p.name} active={false} icon={<Plus color={theme.colors.textMuted} size={14} />} onPress={() => setBills((b) => [...b, blankBill(p)])} />
        ))}
        <ChoiceChip label="Something else" active={false} icon={<Plus color={theme.colors.textMuted} size={14} />} onPress={() => setBills((b) => [...b, blankBill()])} />
      </View>

      {bills.map((bill) => {
        const update = (patch: Partial<DraftBill>) => setBills((list) => list.map((x) => (x.key === bill.key ? { ...x, ...patch } : x)));
        return (
          <Card key={bill.key} style={{ marginTop: 12 }}>
            <View style={styles.rowBetween}>
              <TextInput
                value={bill.name}
                onChangeText={(t) => update({ name: t })}
                placeholder="Bill name"
                placeholderTextColor={theme.colors.textMuted}
                maxLength={60}
                style={[type.bodyStrong, { color: theme.colors.text, flex: 1, paddingVertical: 4, letterSpacing: 0 }]}
              />
              <Pressable onPress={() => setBills((list) => list.filter((x) => x.key !== bill.key))} hitSlop={10} accessibilityLabel={`Remove ${bill.name || 'bill'}`}>
                <X color={theme.colors.textMuted} size={18} />
              </Pressable>
            </View>
            <View style={[styles.input, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, marginTop: 8 }]}>
              <Text style={{ fontFamily: fonts.medium, fontSize: 16, color: theme.colors.textMuted }}>{glyph}</Text>
              <TextInput
                value={bill.amount}
                onChangeText={(t) => update({ amount: formatNumberInput(t.replace(/[^\d.,]/g, '')) })}
                keyboardType="number-pad"
                placeholder="How much?"
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.inputText, { color: theme.colors.text }]}
              />
            </View>
            <SegmentedControl
              options={[
                { key: 'monthly', label: 'Monthly' },
                { key: 'yearly', label: 'Yearly' },
                { key: 'weekly', label: 'Weekly' }
              ]}
              value={bill.frequency}
              onChange={(k) => update({ frequency: k })}
              style={{ marginTop: 10 }}
            />
            {bill.frequency === 'yearly' ? (
              <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 6 }]}>We’ll set aside a little each month so it’s ready when it’s due.</Text>
            ) : null}
          </Card>
        );
      })}
      {livePreview}
    </View>
  );

  const planStep = (
    <View>
      <Text style={[type.eyebrow, { color: theme.colors.primary }]}>Your plan</Text>
      <Text style={[type.h2, { color: theme.colors.text, marginTop: 6 }]}>{mode === 'shared' ? 'Here’s what you can bring to the household' : 'Here’s a plan built around you'}</Text>
      {planLoading || !plan ? (
        <View style={{ paddingVertical: 48, alignItems: 'center' }}>{planLoading ? <ActivityIndicator color={theme.colors.primary} /> : null}</View>
      ) : plan.status === 'no_income' ? (
        <Card style={{ marginTop: 14 }}>
          <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Add your income to see a plan</Text>
          <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 4 }]}>{plan.tips[0]}</Text>
          <TextButton title="Add income" onPress={() => go(order.indexOf('income'))} style={{ alignItems: 'flex-start' }} />
        </Card>
      ) : (
        <>
          <HeroCard style={{ marginTop: 14 }}>
            <View style={styles.rowBetween}>
              <Text style={[type.eyebrow, { color: theme.colors.inkText, opacity: 0.72 }]}>{planDaily > 0 ? 'Everyday spending' : 'Each month'}</Text>
              <Chip
                tone={plan.status === 'healthy' ? 'onInk' : 'brass'}
                label={plan.status === 'healthy' ? 'Looks good' : plan.status === 'tight' ? 'Tight but doable' : 'Bills are more than income'}
              />
            </View>
            {planDaily > 0 ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
                  <Amount value={planDaily} currency={glyph} size="hero" color={theme.colors.inkText} />
                  <Text style={[type.body, { color: theme.colors.inkText, opacity: 0.8 }]}>a day</Text>
                </View>
                <Text style={[type.small, { color: theme.colors.inkText, opacity: 0.75 }]}>
                  From {glyph}
                  {plan.monthlyIncome.toLocaleString()} a month, after bills and savings
                </Text>
              </>
            ) : (
              <>
                <Amount value={plan.monthlyIncome} currency={glyph} size="hero" color={theme.colors.inkText} style={{ marginTop: 8 }} />
                <Text style={[type.small, { color: theme.colors.inkText, opacity: 0.75 }]}>
                  {plan.committed > 0 ? `${glyph}${plan.committed.toLocaleString()} already goes to bills` : 'No regular bills added'}
                </Text>
              </>
            )}
          </HeroCard>
          <Card style={{ marginTop: 12 }}>
            <PlanSplit split={plan.split} percents={plan.percents} glyph={glyph} />
          </Card>
          {plan.status === 'short' && plan.shortfall > 0 ? (
            <Card style={{ marginTop: 12, backgroundColor: theme.colors.brassSoft, borderColor: theme.colors.brassSoft }}>
              <Text style={[type.bodyStrong, { color: theme.colors.text }]}>
                Your bills are {glyph}
                {Math.round(plan.shortfall).toLocaleString()} more than you earn
              </Text>
              <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 4 }]}>
                That’s common, and your plan never counts money you don’t have. After setup, Income & bills shows which bills to pay first and which to pause, and you can add extra income like a side hustle.
              </Text>
              <TextButton title="Add another income now" onPress={() => go(order.indexOf('income'))} style={{ alignItems: 'flex-start', paddingBottom: 0 }} />
            </Card>
          ) : null}
          {plan.status !== 'short' ? <QuoteLine quote={pickQuote(['planning'], user?.id ?? 'plan')} style={{ marginTop: 16, marginBottom: 4 }} /> : null}
          <Card style={{ marginTop: 12, gap: 10 }}>
            {plan.tips.map((tip) => (
              <View key={tip} style={styles.tip}>
                <Sparkles color={theme.colors.primary} size={15} style={{ marginTop: 3 }} />
                <Text style={[type.small, { color: theme.colors.text, flex: 1 }]}>{tip}</Text>
              </View>
            ))}
          </Card>
          <View style={[styles.switchRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Budget from payday to payday</Text>
              <Text style={[type.caption, { color: theme.colors.textMuted }]}>
                {payday && plan.period.basis === 'payday'
                  ? `This period: ${plan.period.label} · ${plan.period.daysToPayday} days to payday`
                  : hasPayDates
                    ? 'Or use calendar months instead'
                    : 'Add the day you’re paid to use this'}
              </Text>
            </View>
            <Switch
              value={payday}
              disabled={!hasPayDates}
              onValueChange={setPayday}
              trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
              thumbColor="#FFFFFF"
            />
          </View>
        </>
      )}
    </View>
  );

  const leftStep = plan ? (
    (() => {
      const days = plan.period.daysToPayday;
      const typed = Number(leftAmount.replace(/,/g, ''));
      const amount = leftAmount.trim() && Number.isFinite(typed) ? typed : 0;
      const fullPeriod = Math.round(((plan.split.Needs + plan.split.Wants + plan.split.Savings) * plan.period.days) / MONTH_DAYS / 100) * 100;
      const isPayday = plan.period.basis === 'payday';
      const until = isPayday ? 'payday' : 'the end of the month';
      return (
        <View>
          <Text style={[type.eyebrow, { color: theme.colors.primary }]}>{isPayday ? 'Until payday' : 'Until month end'}</Text>
          <Text style={[type.h2, { color: theme.colors.text, marginTop: 6 }]}>
            {`${isPayday ? 'Payday' : 'The month'} is ${days} day${days === 1 ? '' : 's'} away. How much do you have left until then?`}
          </Text>
          <Text style={[type.body, { color: theme.colors.textMuted, marginTop: 6, marginBottom: 14 }]}>
            Count what’s in your account and your cash for everyday spending. Leave out money you’ve already put aside to save.
          </Text>
          <View style={[styles.input, { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface, borderWidth: 1.5 }]}>
            <Text style={{ fontFamily: fonts.medium, fontSize: 20, color: theme.colors.textMuted }}>{glyph}</Text>
            <TextInput
              value={leftAmount}
              onChangeText={(t) => {
                setLeftEdited(true);
                setLeftAmount(formatNumberInput(t.replace(/[^\d.,]/g, '')));
              }}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel={`Money left until ${until}`}
              style={[styles.inputText, { color: theme.colors.text, fontSize: 22 }]}
            />
          </View>
          {!leftEdited && leftEstimate > 0 ? (
            <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 8 }]}>
              We guessed this from your income. Change it if you know better.
            </Text>
          ) : null}

          <Card style={{ marginTop: 16 }}>
            <Text style={[type.body, { color: theme.colors.text }]}>
              {amount > 0 ? (
                <>
                  Your first budget covers just these {days} days: about{' '}
                  <Text style={{ fontFamily: fonts.semibold }}>
                    {glyph}
                    {Math.floor(amount / days).toLocaleString()} a day
                  </Text>
                  .
                </>
              ) : (
                'Your first budget covers just these days, so it starts from what you really have.'
              )}
            </Text>
            <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 8 }]}>
              {`Your full plan of ${glyph}${fullPeriod.toLocaleString()} starts on ${formatShortDate(plan.period.nextPayday)}, and so does saving: straight from your ${isPayday ? 'pay' : 'income'}.`}
            </Text>
          </Card>
        </View>
      );
    })()
  ) : null;

  const reminderStep = (
    <View>
      <Text style={[type.eyebrow, { color: theme.colors.primary }]}>Stay on track</Text>
      <Text style={[type.h2, { color: theme.colors.text, marginTop: 6 }]}>When should we remind you to log spending?</Text>
      <Text style={[type.body, { color: theme.colors.textMuted, marginTop: 6, marginBottom: 12 }]}>
        A two-minute check-in each day is the habit that makes budgeting stick.
      </Text>
      {REMINDERS.map((r) => {
        const active = reminder === r.key;
        return (
          <Pressable
            key={r.key}
            onPress={() => setReminder(r.key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            style={[styles.option, { borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface }]}
          >
            <IconTile bg={active ? theme.colors.surface : theme.colors.surfaceAlt} size={36}>
              <BellRing color={active ? theme.colors.primary : theme.colors.textMuted} size={17} />
            </IconTile>
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{r.label}</Text>
              <Text style={[type.caption, { color: theme.colors.textMuted }]}>{r.time}</Text>
            </View>
            {active ? <Check color={theme.colors.primary} size={18} strokeWidth={3} /> : null}
          </Pressable>
        );
      })}
    </View>
  );

  const content = { welcome, who: whoStep, pain: painStep, income: incomeStep, bills: billsStep, plan: planStep, left: leftStep, reminder: reminderStep }[key];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        {step > 0 ? (
          <Pressable onPress={() => go(step - 1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={styles.headerBtn}>
            <ChevronLeft color={theme.colors.text} size={22} />
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
        <View style={styles.steps} accessibilityLabel={step > 0 ? `Step ${step} of ${LAST_STEP}` : undefined}>
          {step > 0
            ? Array.from({ length: LAST_STEP }).map((_, i) => (
                <View key={i} style={[styles.step, { backgroundColor: i < step ? theme.colors.primary : theme.colors.border }]} />
              ))
            : null}
          {step > 0 ? (
            <Text style={[type.caption, styles.stepLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
              {step} of {LAST_STEP} · {STEP_LABEL[key]}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={confirmSkip} disabled={busy} hitSlop={10} accessibilityRole="button">
          <Text style={[type.smallStrong, { color: theme.colors.textMuted }]}>{fromHome ? 'Close' : 'Skip for now'}</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {/* The field being typed in scrolls above the keyboard and the pinned buttons. */}
        <KeyboardAwareScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          bottomOffset={96}
          showsVerticalScrollIndicator={false}
        >
          {error ? <InlineError message={error} /> : null}
          <Animated.View style={{ opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>{content}</Animated.View>
        </KeyboardAwareScrollView>

        {/* Back and Continue ride on top of the keyboard instead of hiding behind it. */}
        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          {step === 0 ? (
            <PrimaryButton title="Let’s go" onPress={() => go(1)} style={{ flex: 1 }} />
          ) : (
            <>
              <SecondaryButton title="Back" onPress={() => go(step - 1)} style={{ flex: 1 }} />
              <PrimaryButton
                title={step === LAST_STEP ? 'Finish' : key === 'bills' && bills.length === 0 ? 'No bills, continue' : 'Continue'}
                onPress={() => (step === LAST_STEP ? finish() : advance())}
                loading={busy}
                disabled={key === 'plan' && planLoading}
                style={{ flex: 2 }}
              />
            </>
          )}
        </View>
        </KeyboardStickyView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, minHeight: 52 },
  headerBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  steps: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  stepLabel: { width: '100%', textAlign: 'center', marginTop: 2 },
  step: { flex: 1, height: 4, borderRadius: 2 },
  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 10 },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 48 },
  inputText: { flex: 1, fontFamily: fonts.medium, fontSize: 16, paddingVertical: 10, letterSpacing: 0 },
  tip: { flexDirection: 'row', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, marginTop: 12 },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth }
});
