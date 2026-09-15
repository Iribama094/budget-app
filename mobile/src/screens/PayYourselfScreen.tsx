import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Wallet } from 'lucide-react-native';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { Amount, Card, HeroCard, InlineError, ListCard, ListRow, PrimaryButton, Screen, ScreenHeader, SectionHeader, TextButton, formatAmount } from '../components/Common/ui';
import { LineItem, MoneyField, moneyText, parseMoney } from '../components/Business/parts';
import { getPayYourself, recordOwnerPay, type PayYourselfSuggestion } from '../api/business';
import { currencySymbol, formatShortDate, monthName } from '../utils/format';
import { type } from '../theme/typography';

/**
 * A suggested safe amount to pay yourself from the business this month. BudgetFriendly doesn't move money:
 * pay yourself from your business account, then record it here.
 */
export default function PayYourselfScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const glyph = currencySymbol(user?.currency);
  const inkText = theme.colors.inkText;
  const month = monthName(new Date().getMonth(), true);

  const [s, setS] = useState<PayYourselfSuggestion | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; amount: number; suggested: number | null; paidOn: string }>>([]);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await getPayYourself();
      setS(res.suggestion);
      setHistory(res.history);
      setAmount(moneyText(res.suggestion.suggested));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not work out a safe amount');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!s) {
    return (
      <Screen bottomInset={48}>
        <ScreenHeader title="Pay yourself" onBack={() => nav.goBack()} />
        {error ? <InlineError message={error} /> : <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />}
      </Screen>
    );
  }

  const reason =
    s.suggested > 0
      ? null
      : s.profit <= 0
        ? 'The business hasn’t made a profit yet this month.'
        : s.cash - s.buffer - s.openBills <= 0
          ? `Cash tracked doesn’t yet cover ${s.bufferMonths} month${s.bufferMonths === 1 ? '' : 's'} of costs plus the bills you still owe.`
          : 'You’ve already paid yourself the safe amount this month.';

  const record = async (value: number) => {
    setSaving(true);
    try {
      await recordOwnerPay({ amount: value });
      toast.show('Done ✅ Recorded as Owner’s pay in Business and as income in Personal.', 'success', 4000);
      await load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not record that', 'error');
    } finally {
      setSaving(false);
    }
  };

  const submit = () => {
    const value = parseMoney(amount);
    if (value <= 0) {
      toast.show('Enter how much you paid yourself', 'error');
      return;
    }
    if (value > s.suggested) {
      Alert.alert(
        'That’s more than the safe amount',
        `We suggested ${formatAmount(s.suggested, glyph)}. Paying more could leave the business short for costs or tax. Record it anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Record anyway', onPress: () => void record(value) }
        ]
      );
      return;
    }
    void record(value);
  };

  return (
    <Screen bottomInset={48} onRefresh={load} refreshing={false}>
      <ScreenHeader title="Pay yourself" onBack={() => nav.goBack()} />

      <HeroCard style={{ marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Wallet color="#E2B65C" size={16} />
          <Text style={[type.eyebrow, { color: inkText, opacity: 0.72 }]}>Safe to pay yourself in {month}</Text>
        </View>
        <Amount value={s.suggested} currency={glyph} size="hero" color={inkText} style={{ marginTop: 8 }} />
        <Text style={[type.small, { color: inkText, opacity: 0.78 }]}>
          {s.suggested > 0 ? 'Oga at the top 😎 This keeps the business safe and still pays you.' : `Boss, e no safe to pay yourself yet. ${reason}`}
        </Text>
        {s.alreadyPaid > 0 ? <Text style={[type.caption, { color: inkText, opacity: 0.7, marginTop: 8 }]}>You’ve already paid yourself {formatAmount(s.alreadyPaid, glyph)} this month.</Text> : null}
      </HeroCard>

      <SectionHeader title="How we worked it out" />
      <Card>
        <LineItem label="Profit this month" value={formatAmount(s.profit, glyph)} />
        <LineItem label="Tax set aside" value={`−${formatAmount(s.taxSetAside, glyph)}`} />
        <LineItem label="Business cash tracked" value={formatAmount(s.cash, glyph)} />
        <LineItem label={`Safety buffer (${s.bufferMonths} month${s.bufferMonths === 1 ? '' : 's'} of costs)`} value={`−${formatAmount(s.buffer, glyph)}`} />
        <LineItem label="Bills still to pay" value={`−${formatAmount(s.openBills, glyph)}`} />
        <LineItem label="Safe amount" value={formatAmount(s.suggested, glyph)} strong />
        <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 8 }]}>
          We take the smaller of two numbers: this month’s profit after tax, or the cash left after keeping your buffer and paying open bills. Then we subtract what you’ve already paid yourself.
        </Text>
        <TextButton title="Change buffer or tax %" onPress={() => nav.navigate('BusinessTax')} style={{ alignItems: 'flex-start', paddingBottom: 0 }} />
      </Card>

      <SectionHeader title="Record what you paid" />
      <MoneyField label="Amount you paid yourself" value={amount} onChange={setAmount} glyph={glyph} hint="Pay it from your business account first. We only record it." />
      <PrimaryButton title="I paid myself" onPress={submit} loading={saving} />
      <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 10 }]}>
        It shows as Owner’s pay in Business (not counted against profit) and as income in Personal, so both budgets stay true.
      </Text>

      {history.length ? (
        <>
          <SectionHeader title="Recent" />
          <ListCard>
            {history.map((h) => (
              <ListRow
                key={h.id}
                title={formatShortDate(h.paidOn)}
                subtitle={h.suggested != null ? (h.amount > h.suggested ? `Above the ${formatAmount(h.suggested, glyph)} suggested` : 'Within the safe amount') : undefined}
                right={<Amount value={h.amount} currency={glyph} size="sm" />}
              />
            ))}
          </ListCard>
        </>
      ) : null}
    </Screen>
  );
}
