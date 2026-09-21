import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { CalendarCheck, Plus, UserRound } from '../icons';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { useAmountVisibility } from '../contexts/AmountVisibilityContext';
import { Amount, Card, Chip, EmptyState, HeroCard, IconTile, InlineError, ListCard, ListRow, PrimaryButton, Screen, ScreenHeader, SecondaryButton, SectionHeader, SegmentedControl, TextField, formatAmount } from '../components/Common/ui';
import { LineItem, MoneyField, Sheet, moneyText, parseMoney } from '../components/Business/parts';
import { payslipMessage, sendOnWhatsApp, sharePayslipPdf } from '../lib/documents';
import { addStaff, getBusinessSettings, getPayroll, removeStaff, runPayroll, updateStaff, type BusinessSettings, type PayrollLine, type PayrollRun, type Staff } from '../api/business';
import { currencySymbol, formatShortDate, monthName } from '../utils/format';
import { type } from '../theme/typography';
import { GuideAnchor } from '../components/Common/GuideAnchor';
import { goBackOrHome } from '../navigation/goBack';

type Draft = { id: string | null; name: string; role: string; gross: string; active: boolean; pension: boolean; nhf: boolean };

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (key: string) => `${monthName(Number(key.slice(5)) - 1, true)} ${key.slice(0, 4)}`;

/** Staff, their estimated PAYE and take-home pay, and a record of each month's pay. */
export default function PayrollScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const { showAmounts } = useAmountVisibility();
  const glyph = currencySymbol(user?.currency);
  const hide = !showAmounts;
  const inkText = theme.colors.inkText;
  // Opened from Personal as "Household staff": no PAYE is withheld at home, and pay counts as a household need.
  const route = useRoute<any>();
  const home = route.params?.spaceId === 'personal';
  const staffSpace = home ? ('personal' as const) : undefined;

  const [staff, setStaff] = useState<Staff[]>([]);
  const [totals, setTotals] = useState({ gross: 0, paye: 0, net: 0 });
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const [period, setPeriod] = useState<'this' | 'last'>('this');
  const [busy, setBusy] = useState(false);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [business, setBusiness] = useState<BusinessSettings | null>(null);

  // Staff need something to show for payday, so each line of a pay run can be shared as a payslip.
  const sharePayslip = async (line: PayrollLine, run: PayrollRun) => {
    try {
      await sharePayslipPdf(line, run, business, user?.name || 'My business', glyph);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not create the payslip', 'error');
    }
  };

  const whatsappPayslip = async (line: PayrollLine, run: PayrollRun) => {
    const text = payslipMessage(line, run, business?.businessName || user?.name || 'your employer', glyph);
    try {
      await sendOnWhatsApp(null, text);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not open WhatsApp', 'error');
    }
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await getPayroll(staffSpace);
      setStaff(res.staff);
      setTotals(res.totals);
      setRuns(res.runs);
      // Business name and contacts go at the top of every payslip. At home it's the person's own name.
      if (!home)
        getBusinessSettings()
          .then(setBusiness)
          .catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load payroll');
    } finally {
      setLoading(false);
    }
  }, [home, staffSpace]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const periods = useMemo(() => {
    const now = new Date();
    return { this: monthKey(now), last: monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)) };
  }, []);
  const chosen = periods[period];
  const alreadyRun = runs.find((r) => r.period === chosen) ?? null;
  const active = staff.filter((s) => s.active);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Something went wrong', 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveStaff = () =>
    act(async () => {
      if (!draft) return;
      const monthlyGross = parseMoney(draft.gross);
      if (!draft.name.trim()) throw new Error('Enter their name');
      if (monthlyGross <= 0) throw new Error('Enter their monthly salary before tax');
      const payload = {
        name: draft.name.trim(),
        role: draft.role.trim() || null,
        monthlyGross,
        pensionEnabled: draft.pension,
        nhfEnabled: draft.nhf
      };
      if (draft.id) await updateStaff(draft.id, { ...payload, active: draft.active });
      else await addStaff(payload, staffSpace);
      setDraft(null);
      await load();
    });

  const remove = () => {
    if (!draft?.id) return;
    const id = draft.id;
    Alert.alert('Remove this person?', 'Past pay records stay. To keep them for later, switch them off instead.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          void act(async () => {
            await removeStaff(id);
            setDraft(null);
            await load();
          })
      }
    ]);
  };

  const recordPay = () =>
    act(async () => {
      const run = await runPayroll({ period: chosen }, staffSpace);
      setRunOpen(false);
      toast.show(
        run.totalPaye > 0
          ? `Pay for ${run.label} recorded ✅ ${formatAmount(run.totalPaye, glyph)} PAYE added to Bills, due by the 10th.`
          : `Pay for ${run.label} recorded ✅`,
        'success',
        4500
      );
      await load();
    });

  return (
    <Screen bottomInset={48} onRefresh={load} refreshing={false}>
      <ScreenHeader
        title={home ? 'Household staff' : 'Staff & payroll'}
        onBack={() => goBackOrHome(nav)}
        right={
          <Pressable
            onPress={() => setDraft({ id: null, name: '', role: '', gross: '', active: true, pension: false, nhf: false })}
            accessibilityRole="button"
            accessibilityLabel="Add staff"
            style={({ pressed }) => [styles.newPill, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Plus color={theme.colors.onPrimary} size={16} strokeWidth={2.6} />
            <Text style={[type.smallStrong, { color: theme.colors.onPrimary }]}>Add</Text>
          </Pressable>
        }
      />
      {error ? <InlineError message={error} /> : null}

      <HeroCard style={{ marginTop: 8 }}>
        <Text style={[type.eyebrow, { color: inkText, opacity: 0.72 }]}>Monthly payroll</Text>
        <Amount value={totals.gross} currency={glyph} size="hero" color={inkText} hidden={hide} style={{ marginTop: 8 }} />
        <View style={[styles.split, { borderTopColor: 'rgba(255,255,255,0.12)' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[type.caption, { color: inkText, opacity: 0.7 }]}>Take-home</Text>
            <Amount value={totals.net} currency={glyph} size="sm" color={inkText} hidden={hide} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.caption, { color: inkText, opacity: 0.7 }]}>{home ? 'People' : 'PAYE (estimate)'}</Text>
            {home ? (
              <Text style={[type.bodyStrong, { color: inkText }]}>{active.length}</Text>
            ) : (
              <Amount value={totals.paye} currency={glyph} size="sm" color={inkText} hidden={hide} />
            )}
          </View>
        </View>
      </HeroCard>

      {active.length ? (
        <GuideAnchor id="payroll.run">
          <PrimaryButton title="Record this month’s pay" iconLeft={<CalendarCheck color={theme.colors.onPrimary} size={18} />} onPress={() => setRunOpen(true)} style={{ marginTop: 14 }} />
        </GuideAnchor>
      ) : null}

      <SectionHeader title="Team" />
      {loading ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : staff.length ? (
        <ListCard>
          {staff.map((s) => (
            <ListRow
              key={s.id}
              icon={
                <IconTile bg={s.active ? theme.colors.brassSoft : theme.colors.surfaceAlt} size={40}>
                  <UserRound color={s.active ? theme.colors.brass : theme.colors.textMuted} size={19} />
                </IconTile>
              }
              title={s.name}
              subtitle={s.active ? `${s.role ? `${s.role} · ` : ''}takes home ≈ ${hide ? '••••' : formatAmount(s.netEstimate, glyph)}` : 'Not on payroll right now'}
              right={<Amount value={s.monthlyGross} currency={glyph} size="sm" hidden={hide} color={s.active ? theme.colors.text : theme.colors.textMuted} />}
              onPress={() => setDraft({ id: s.id, name: s.name, role: s.role ?? '', gross: moneyText(s.monthlyGross), active: s.active, pension: s.pensionEnabled, nhf: s.nhfEnabled })}
              chevron
            />
          ))}
        </ListCard>
      ) : (
        <EmptyState
          title={home ? 'Add the people who work in your home' : 'Add your team'}
          body={
            home
              ? 'A driver, a nanny, a cook, security. Add what you pay each one a month, record it on payday, and send them a payslip.'
              : 'Add each person’s monthly salary before tax. We estimate their PAYE and take-home pay, and remind you to remit PAYE by the 10th.'
          }
          actionLabel="Add staff"
          onAction={() => setDraft({ id: null, name: '', role: '', gross: '', active: true, pension: false, nhf: false })}
        />
      )}

      {runs.length ? (
        <>
          <SectionHeader title="Pay history" />
          <ListCard>
            {runs.map((r) => (
              <View key={r.id}>
                <ListRow
                  title={r.label}
                  subtitle={`Paid ${formatShortDate(r.paidOn)} · ${r.lines.length} ${r.lines.length === 1 ? 'person' : 'people'}${home ? '' : ` · PAYE ${hide ? '••••' : formatAmount(r.totalPaye, glyph)}`}`}
                  right={<Amount value={r.totalGross} currency={glyph} size="sm" hidden={hide} />}
                  onPress={() => setOpenRun((id) => (id === r.id ? null : r.id))}
                  chevron
                />
                {openRun === r.id
                  ? r.lines.map((l) => (
                      <View key={l.staffId} style={styles.payslipRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={[type.smallStrong, { color: theme.colors.text }]}>
                            {l.name}
                          </Text>
                          <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 1 }]}>
                            Take home {hide ? '••••' : formatAmount(l.net, glyph)}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => void sharePayslip(l, r)}
                          accessibilityRole="button"
                          style={({ pressed }) => [styles.payslipBtn, { backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.85 : 1 }]}
                        >
                          <Text style={[type.caption, { color: theme.colors.text, fontWeight: '700' }]}>Payslip PDF</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => void whatsappPayslip(l, r)}
                          accessibilityRole="button"
                          style={({ pressed }) => [styles.payslipBtn, { backgroundColor: theme.colors.primarySoft, opacity: pressed ? 0.85 : 1 }]}
                        >
                          <Text style={[type.caption, { color: theme.colors.primary, fontWeight: '700' }]}>Send</Text>
                        </Pressable>
                      </View>
                    ))
                  : null}
              </View>
            ))}
          </ListCard>
        </>
      ) : null}

      {home ? null : (
        <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 14 }]}>
          PAYE figures are estimates from the app’s tax tables, not a payslip. Confirm with your accountant or the tax office.
        </Text>
      )}

      <Sheet visible={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit staff' : 'Add staff'}>
        {draft ? (
          <>
            <TextField label="Name" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="e.g. Tunde Bakare" />
            <TextField label="Role (optional)" value={draft.role} onChangeText={(v) => setDraft({ ...draft, role: v })} placeholder="e.g. Chef" />
            <MoneyField label={home ? 'Monthly pay' : 'Monthly salary before tax'} value={draft.gross} onChange={(v) => setDraft({ ...draft, gross: v })} glyph={glyph} />
            <ListCard>
              <ListRow
                title="Pension"
                subtitle="Employee's 8% share, taken off their pay"
                right={<Switch value={draft.pension} onValueChange={(v) => setDraft({ ...draft, pension: v })} trackColor={{ true: theme.colors.primary, false: theme.colors.border }} thumbColor="#FFFFFF" />}
              />
              <ListRow
                title="NHF"
                subtitle="National Housing Fund, 2.5% of pay"
                right={<Switch value={draft.nhf} onValueChange={(v) => setDraft({ ...draft, nhf: v })} trackColor={{ true: theme.colors.primary, false: theme.colors.border }} thumbColor="#FFFFFF" />}
              />
            </ListCard>
            {draft.id ? (
              <ListCard style={{ marginBottom: 14 }}>
                <ListRow
                  title="On payroll"
                  subtitle="Switch off for someone on leave or who has left"
                  right={<Switch value={draft.active} onValueChange={(v) => setDraft({ ...draft, active: v })} trackColor={{ true: theme.colors.primary, false: theme.colors.border }} thumbColor="#FFFFFF" />}
                />
              </ListCard>
            ) : null}
            <PrimaryButton title="Save" onPress={saveStaff} loading={busy} />
            {draft.id ? <SecondaryButton title="Remove" onPress={remove} style={{ marginTop: 10 }} /> : null}
          </>
        ) : null}
      </Sheet>

      <Sheet visible={runOpen} onClose={() => setRunOpen(false)} title="Record pay" subtitle="Log it after you’ve paid your team">
        <SegmentedControl
          options={[
            { key: 'this', label: monthLabel(periods.this) },
            { key: 'last', label: monthLabel(periods.last) }
          ]}
          value={period}
          onChange={setPeriod}
        />
        {alreadyRun ? (
          <Card style={{ marginTop: 14 }}>
            <Chip tone="positive" label="Already recorded" />
            <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 8 }]}>Pay for {alreadyRun.label} was recorded on {formatShortDate(alreadyRun.paidOn)}.</Text>
          </Card>
        ) : (
          <>
            <Card style={{ marginTop: 14 }}>
              {active.map((s) => (
                <LineItem key={s.id} label={s.name} value={formatAmount(s.netEstimate, glyph)} />
              ))}
              <LineItem label="Take-home, total" value={formatAmount(totals.net, glyph)} strong />
              {home ? null : <LineItem label="PAYE to remit by the 10th" value={formatAmount(totals.paye, glyph)} />}
            </Card>
            <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 10 }]}>
              {home
                ? 'Each person’s pay is recorded as Household staff in your budget.'
                : 'Each person’s take-home pay is recorded as a Payroll cost. The PAYE goes into Bills so you don’t forget to remit it.'}
            </Text>
            <PrimaryButton title={`Record pay for ${monthLabel(chosen)}`} onPress={recordPay} loading={busy} style={{ marginTop: 14 }} />
          </>
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  payslipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingLeft: 12 },
  payslipBtn: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 10 },
  newPill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingLeft: 10, paddingRight: 14, borderRadius: 18 },
  split: { flexDirection: 'row', marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth }
});
