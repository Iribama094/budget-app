import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { getMoney, getRates, type ApiDebt, type ApiHolding, type ApiMoney, type ApiRates } from '../api/money';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { useAmountVisibility } from '../contexts/AmountVisibilityContext';
import { Amount, InfoTip, InlineError, ListRow, Screen, ScreenHeader, formatAmount } from '../components/Common/ui';
import { AddLine, PlainHeader, PlainList } from '../components/Common/PlainList';
import { BankLogo } from '../components/Common/BankLogo';
import { DebtSheet, HAVE_KINDS, HoldingSheet, OWN_KINDS, PayDebtSheet, RatesSheet } from '../components/Money/MoneySheets';
import { currencySymbol, formatShortDate } from '../utils/format';
import { type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';
import { useT } from '../lib/i18n';
import { afterSheetCloses } from '../lib/afterSheetCloses';
import { errorMessage } from '../lib/errorMessage';

const kindLabel = (k: string) => [...HAVE_KINDS, ...OWN_KINDS].find((x) => x.key === k)?.label.replace(/ \(.*\)$/, '') ?? k;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/**
 * Your money: what you have, what you own, who owes you and who you owe, in one number and four short lists.
 * Balances are whatever you last said they were (linked banks fill in themselves). No double entry.
 */
export default function MoneyScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const { showAmounts } = useAmountVisibility();
  const hide = !showAmounts;
  const glyph = currencySymbol(user?.currency);
  const spaceId = spacesEnabled ? activeSpaceId : undefined;

  const [data, setData] = useState<ApiMoney | null>(null);
  const [rates, setRatesState] = useState<ApiRates | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holdingSheet, setHoldingSheet] = useState<{ group: 'have' | 'own'; holding: ApiHolding | null } | null>(null);
  const [debtSheet, setDebtSheet] = useState<{ direction: 'owe' | 'owed'; debt: ApiDebt | null } | null>(null);
  const [paying, setPaying] = useState<ApiDebt | null>(null);
  const [ratesOpen, setRatesOpen] = useState(false);
  const t = useT();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [money, r] = await Promise.all([getMoney(spaceId), getRates().catch(() => null)]);
      setData(money);
      setRatesState(r);
    } catch (e) {
      setError(errorMessage(e, 'Could not load your money'));
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const money = (n: number, currency?: string) => (hide ? '••••' : currency && data && currency !== data.home ? `${currency} ${n.toLocaleString('en-NG')}` : formatAmount(n, glyph));
  const have = data?.holdings.filter((h) => h.group === 'have') ?? [];
  const own = data?.holdings.filter((h) => h.group === 'own') ?? [];
  const owed = data?.debts.filter((d) => d.direction === 'owed') ?? [];
  const owe = useMemo(() => {
    const list = data?.debts.filter((d) => d.direction === 'owe') ?? [];
    const order = data?.payoffOrder ?? [];
    return [...list].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }, [data]);
  const foreign = useMemo(() => [...new Set((data?.holdings ?? []).map((h) => h.currency).filter((c) => data && c !== data.home))], [data]);

  const history = data?.history ?? [];
  const since = history.length >= 2 ? history[0] : null;
  const change = since && data ? data.totals.net - since.net : 0;

  const debtRow = (d: ApiDebt, first: boolean) => (
    <ListRow
      key={d.id}
      title={d.person}
      subtitle={[
        d.direction === 'owe' && first && owe.length > 1 ? 'Clear this one first' : null,
        d.dueDate ? `due ${formatShortDate(d.dueDate)}` : null,
        d.monthlyRate ? `${d.monthlyRate}% a month` : null,
        d.balance < d.amount ? `${money(d.amount - d.balance)} paid` : null
      ]
        .filter(Boolean)
        .join(' · ')}
      right={<Text style={[type.bodyStrong, { color: theme.colors.text }]}>{money(d.balance)}</Text>}
      onPress={() => setPaying(d)}
    />
  );

  return (
    <Screen onRefresh={load} refreshing={loading} bottomInset={48}>
      <ScreenHeader title={t('Your money')} subtitle={t('What you have, own and owe')} onBack={() => goBackOrHome(nav)} />

      {error ? <InlineError message={error} /> : null}
      {!data && loading ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 24 }} /> : null}

      {data ? (
        <>
          <View style={{ marginTop: 18 }}>
            <InfoTip text="Cash, accounts and wallets, plus what you own (land, a car, shares), plus what people owe you, minus what you owe. Your net worth. The numbers are what you last typed; linked banks update themselves.">
              All together
            </InfoTip>
            <Amount value={data.totals.net} currency={glyph} size="hero" hidden={hide} style={{ marginTop: 4 }} />
            <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 4 }]}>
              {since && !hide
                ? `${change >= 0 ? 'Up' : 'Down'} ${formatAmount(Math.abs(change), glyph)} since ${monthName(since.month)}`
                : 'What you have and own, minus what you owe. Update the numbers whenever they change.'}
            </Text>
            {data.missingRates.length ? (
              <Pressable onPress={() => setRatesOpen(true)} accessibilityRole="button">
                <Text style={[type.smallStrong, { color: theme.colors.warn, marginTop: 8 }]}>
                  Set a rate for {data.missingRates.join(', ')} so it counts here →
                </Text>
              </Pressable>
            ) : null}
          </View>

          <PlainHeader title={t('Cash and accounts')} right={money(data.totals.have)} />
          <PlainList>
            {data.bankAccounts.map((a) => (
              <ListRow
                key={a.id}
                icon={<BankLogo name={a.bankName} logoUrl={a.logoUrl} size={32} />}
                title={a.bankName}
                subtitle={`${a.name} · •••• ${a.mask} · updates itself`}
                right={<Text style={[type.bodyStrong, { color: theme.colors.text }]}>{money(a.balance, a.currency)}</Text>}
              />
            ))}
            {have.map((h) => (
              <ListRow
                key={h.id}
                title={h.name}
                subtitle={`${kindLabel(h.kind)} · updated ${formatShortDate(h.updatedAt.slice(0, 10))}`}
                right={<Text style={[type.bodyStrong, { color: theme.colors.text }]}>{money(h.balance, h.currency)}</Text>}
                onPress={() => setHoldingSheet({ group: 'have', holding: h })}
              />
            ))}
          </PlainList>
          <AddLine label="Add cash, a wallet or an account" onPress={() => setHoldingSheet({ group: 'have', holding: null })} />

          <PlainHeader title={t('Things you own')} right={own.length ? money(data.totals.own) : undefined} />
          <PlainList>
            {own.map((h) => (
              <ListRow
                key={h.id}
                title={h.name}
                subtitle={`${kindLabel(h.kind)} · valued ${formatShortDate(h.updatedAt.slice(0, 10))}`}
                right={<Text style={[type.bodyStrong, { color: theme.colors.text }]}>{money(h.balance, h.currency)}</Text>}
                onPress={() => setHoldingSheet({ group: 'own', holding: h })}
              />
            ))}
          </PlainList>
          <AddLine label="Add land, a car, shares or a pension" onPress={() => setHoldingSheet({ group: 'own', holding: null })} />

          <PlainHeader title={t('Owed to you')} right={owed.length ? money(data.totals.owedToYou) : undefined} />
          <PlainList>{owed.map((d) => debtRow(d, false))}</PlainList>
          <AddLine label={t('Someone owes me')} onPress={() => setDebtSheet({ direction: 'owed', debt: null })} />

          <PlainHeader title={t('You owe')} right={owe.length ? money(data.totals.owe) : undefined} />
          <PlainList>{owe.map((d, i) => debtRow(d, i === 0))}</PlainList>
          <AddLine label={t('I owe someone')} onPress={() => setDebtSheet({ direction: 'owe', debt: null })} />

          {foreign.length ? (
            <Pressable onPress={() => setRatesOpen(true)} accessibilityRole="button" style={{ marginTop: 24 }}>
              <Text style={[type.small, { color: theme.colors.textMuted }]}>
                {foreign.map((c) => (data.rates[c] ? `1 ${c} = ${formatAmount(data.rates[c], glyph)}` : `${c}: no rate`)).join(' · ')}{' '}
                <Text style={{ color: theme.colors.primary }}>Change</Text>
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {data ? (
        <>
          <HoldingSheet
            visible={!!holdingSheet}
            onClose={() => setHoldingSheet(null)}
            group={holdingSheet?.group ?? 'have'}
            holding={holdingSheet?.holding ?? null}
            home={data.home}
            glyph={glyph}
            spaceId={spaceId}
            onSaved={load}
          />
          <DebtSheet
            visible={!!debtSheet}
            onClose={() => setDebtSheet(null)}
            direction={debtSheet?.direction ?? 'owe'}
            debt={debtSheet?.debt ?? null}
            openOwe={owe.length}
            glyph={glyph}
            spaceId={spaceId}
            onSaved={load}
          />
          <PayDebtSheet
            visible={!!paying}
            onClose={() => setPaying(null)}
            debt={paying}
            glyph={glyph}
            onSaved={load}
            onEdit={() => {
              const d = paying;
              setPaying(null);
              // One sheet at a time: the edit sheet opens once this one has gone.
              if (d) afterSheetCloses(() => setDebtSheet({ direction: d.direction, debt: d }));
            }}
          />
          <RatesSheet visible={ratesOpen} onClose={() => setRatesOpen(false)} currencies={foreign} rates={data.rates} own={rates?.own ?? {}} onSaved={load} />
        </>
      ) : null}
    </Screen>
  );
}
