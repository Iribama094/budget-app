import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { FileDown } from '../icons';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { Amount, Card, Chip, formatAmount, HeroCard, InlineError, ListCard, ListRow, PrimaryButton, Screen, ScreenHeader, SectionHeader, Spinner } from '../components/Common/ui';
import { ChoiceChip } from '../components/Plan/ChoiceChip';
import { LineItem } from '../components/Business/parts';
import { getBusinessReport, type BusinessReport } from '../api/business';
import { shareReportPdf } from '../lib/documents';
import { currencySymbol, formatShortDate, toIsoDate } from '../utils/format';
import { type } from '../theme/typography';
import { GuideAnchor } from '../components/Common/GuideAnchor';
import { goBackOrHome } from '../navigation/goBack';
import { errorMessage } from '../lib/errorMessage';

type RangeKey = 'month' | 'last' | 'quarter' | 'half' | 'year';
const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: 'month', label: 'This month' },
  { key: 'last', label: 'Last month' },
  { key: 'quarter', label: 'Last 3 months' },
  { key: 'half', label: 'Last 6 months' },
  { key: 'year', label: 'This year' }
];

function rangeFor(key: RangeKey): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case 'last':
      return { from: toIsoDate(new Date(y, m - 1, 1)), to: toIsoDate(new Date(y, m, 0)) };
    case 'quarter':
      return { from: toIsoDate(new Date(y, m - 2, 1)), to: toIsoDate(now) };
    case 'half':
      return { from: toIsoDate(new Date(y, m - 5, 1)), to: toIsoDate(now) };
    case 'year':
      return { from: toIsoDate(new Date(y, 0, 1)), to: toIsoDate(now) };
    default:
      return { from: toIsoDate(new Date(y, m, 1)), to: toIsoDate(now) };
  }
}

/** Profit and loss, cash flow and what's owed, ready to share as a PDF with a lender, partner or accountant. */
export default function BusinessReportsScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const glyph = currencySymbol(user?.currency);
  const inkText = theme.colors.inkText;

  const [range, setRange] = useState<RangeKey>('month');
  const [report, setReport] = useState<BusinessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const { from, to } = useMemo(() => rangeFor(range), [range]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getBusinessReport(from, to)
      .then((r) => !cancelled && setReport(r))
      .catch((e) => !cancelled && setError(errorMessage(e, 'Could not build the report')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const share = async () => {
    if (!report) return;
    setSharing(true);
    try {
      await shareReportPdf(report, glyph);
    } catch (e) {
      toast.show(errorMessage(e, 'Could not create the PDF'), 'error');
    } finally {
      setSharing(false);
    }
  };

  const pl = report?.profitAndLoss;
  const maxFlow = Math.max(1, ...(report?.cashFlow.months ?? []).map((mm) => Math.max(mm.moneyIn, mm.moneyOut)));

  return (
    <Screen bottomInset={48}>
      <ScreenHeader title="Reports" subtitle={`${formatShortDate(from)} – ${formatShortDate(to)}`} onBack={() => goBackOrHome(nav)} />

      <View style={styles.wrap}>
        {RANGES.map((r) => (
          <ChoiceChip key={r.key} label={r.label} active={range === r.key} onPress={() => setRange(r.key)} />
        ))}
      </View>

      {error ? (
        <View style={{ marginTop: 12 }}>
          <InlineError message={error} />
        </View>
      ) : null}

      {loading || !report || !pl ? (
        <Spinner style={{ marginTop: 40 }} />
      ) : (
        <>
          <HeroCard style={{ marginTop: 14 }}>
            <View style={styles.rowBetween}>
              <Text style={[type.eyebrow, { color: inkText, opacity: 0.72 }]}>{pl.netProfit < 0 ? 'Net loss' : 'Net profit'}</Text>
              {pl.margin != null ? <Chip tone="onInk" label={`${pl.margin}% margin`} /> : null}
            </View>
            <Amount value={Math.abs(pl.netProfit)} currency={glyph} size="hero" color={pl.netProfit < 0 ? '#F07565' : inkText} style={{ marginTop: 8 }} />
            <View style={[styles.split, { borderTopColor: 'rgba(255,255,255,0.12)' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[type.caption, { color: inkText, opacity: 0.7 }]}>Revenue</Text>
                <Amount value={pl.revenueTotal} currency={glyph} size="sm" color={inkText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.caption, { color: inkText, opacity: 0.7 }]}>Costs</Text>
                <Amount value={pl.costsTotal} currency={glyph} size="sm" color={inkText} />
              </View>
            </View>
          </HeroCard>

          <GuideAnchor id="reports.share">
            <PrimaryButton title="Share as PDF" iconLeft={<FileDown color={theme.colors.onPrimary} size={18} />} onPress={share} loading={sharing} style={{ marginTop: 14 }} />
          </GuideAnchor>

          <SectionHeader title="Revenue" />
          {pl.revenue.length ? (
            <ListCard>
              {pl.revenue.map((r) => (
                <ListRow key={r.category} title={r.category} subtitle={`${r.count} payment${r.count === 1 ? '' : 's'}`} right={<Amount value={r.amount} currency={glyph} size="sm" color={theme.colors.success} />} />
              ))}
            </ListCard>
          ) : (
            <Text style={[type.small, { color: theme.colors.textMuted }]}>No sales recorded in this period.</Text>
          )}

          <SectionHeader title="Costs" />
          {pl.costs.length ? (
            <ListCard>
              {pl.costs.map((r) => (
                <ListRow key={r.category} title={r.category} subtitle={pl.costsTotal > 0 ? `${Math.round((r.amount / pl.costsTotal) * 100)}% of costs` : undefined} right={<Amount value={r.amount} currency={glyph} size="sm" />} />
              ))}
            </ListCard>
          ) : (
            <Text style={[type.small, { color: theme.colors.textMuted }]}>No costs recorded in this period.</Text>
          )}

          <Card style={{ marginTop: 10 }}>
            <LineItem label="Net profit" value={formatAmount(pl.netProfit, glyph)} strong />
            <LineItem label="Owner’s pay" value={formatAmount(pl.ownerPay, glyph)} />
            <LineItem label="Kept in the business" value={formatAmount(pl.retained, glyph)} />
          </Card>

          <SectionHeader title="Cash flow" info="Money that actually came in and went out, including what you paid yourself. A month can show profit and still be short of cash, for example when customers haven't paid yet." />
          <Card>
            <LineItem label="Opening balance" value={formatAmount(report.cashFlow.openingBalance, glyph)} />
            {report.cashFlow.months.map((mm) => (
              <View key={mm.month} style={{ marginTop: 10 }}>
                <View style={styles.rowBetween}>
                  <Text style={[type.smallStrong, { color: theme.colors.text }]}>{mm.label}</Text>
                  <Text style={[type.smallStrong, { color: mm.net < 0 ? theme.colors.error : theme.colors.success }]}>{formatAmount(mm.net, glyph)}</Text>
                </View>
                <View style={[styles.flowBar, { backgroundColor: theme.colors.surfaceAlt }]}>
                  <View style={{ width: `${(mm.moneyIn / maxFlow) * 100}%`, height: 6, borderRadius: 3, backgroundColor: theme.colors.success }} />
                </View>
                <View style={[styles.flowBar, { backgroundColor: theme.colors.surfaceAlt }]}>
                  <View style={{ width: `${(mm.moneyOut / maxFlow) * 100}%`, height: 6, borderRadius: 3, backgroundColor: theme.colors.brass }} />
                </View>
              </View>
            ))}
            <View style={{ marginTop: 10 }}>
              <LineItem label="Closing balance" value={formatAmount(report.cashFlow.closingBalance, glyph)} strong />
            </View>
          </Card>

          <SectionHeader title="Position today" info="What customers still owe you and what you still owe suppliers, as of today." />
          <ListCard>
            <ListRow title="Customers owe you" subtitle={`${report.position.receivables.count} open invoice${report.position.receivables.count === 1 ? '' : 's'}`} right={<Amount value={report.position.receivables.total} currency={glyph} size="sm" />} onPress={() => nav.navigate('Invoices')} chevron />
            <ListRow title="You owe" subtitle={`${report.position.payables.count} open bill${report.position.payables.count === 1 ? '' : 's'}`} right={<Amount value={report.position.payables.total} currency={glyph} size="sm" />} onPress={() => nav.navigate('Bills')} chevron />
          </ListCard>

          <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 14 }]}>{report.note}</Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  split: { flexDirection: 'row', marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  flowBar: { height: 6, borderRadius: 3, marginTop: 5, overflow: 'hidden' }
});
