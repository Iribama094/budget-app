import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AlertTriangle } from '../../icons';

import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Card, IconTile, InfoTip, PrimaryButton, SecondaryButton, formatAmount } from '../Common/ui';
import { gapRoutes } from '../../lib/billPriority';
import { currencySymbol } from '../../utils/format';
import { type } from '../../theme/typography';
import type { ApiPlan } from '../../api/personal';

/**
 * Shown while regular bills are bigger than income. Calm, not alarming: it names the gap and the two ways
 * to close it, and stays until the plan balances.
 */
export function ShortfallCard({ plan }: { plan: ApiPlan }) {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const glyph = currencySymbol(user?.currency);
  if (plan.status !== 'short' || plan.shortfall <= 0) return null;

  const routes = gapRoutes(plan.bills ?? [], plan.shortfall);
  const hint = routes.pause.total
    ? routes.pauseCovers
      ? `Pausing ${routes.pause.names} would close it on its own.`
      : `Pausing ${routes.pause.names} frees ${formatAmount(routes.pause.total, glyph)}; extra income can cover the rest.`
    : 'Trim a bill, or add income like a side hustle, and your plan will balance.';

  return (
    <Card style={[styles.card, { backgroundColor: theme.colors.brassSoft, borderColor: theme.colors.brassSoft }]}>
      <View style={styles.row}>
        <IconTile bg={theme.colors.surface} size={38}>
          <AlertTriangle color={theme.colors.warn} size={18} />
        </IconTile>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Your bills are {formatAmount(plan.shortfall, glyph)} more than you earn</Text>
          <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>{hint}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <SecondaryButton title="Trim a bill" onPress={() => nav.navigate('IncomeBills')} style={{ flex: 1 }} />
        <PrimaryButton title="Add income" onPress={() => nav.navigate('IncomeBills', { addIncome: true })} style={{ flex: 1 }} />
      </View>
      <InfoTip
        style={{ marginTop: 10 }}
        text="Your plan only counts money you actually have, so it never shows savings that aren’t there. While bills are bigger than income, we hold back the ‘you’re overspending’ nudges, because the budget was never coverable. Pay must-pay bills first, trim or pause the rest, and log any extra income you expect."
      >
        How we handle this
      </InfoTip>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 }
});
