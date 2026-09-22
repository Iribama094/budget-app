import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ClipboardPaste, Landmark, RefreshCw, Upload } from '../icons';

import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { useAuth } from '../contexts/AuthContext';
import { useSpace } from '../contexts/SpaceContext';
import { Amount, Card, Chip, formatAmount, HeroCard, IconTile, PrimaryButton, Screen, ScreenHeader, SecondaryButton, Spinner } from '../components/Common/ui';
import { BankLogo } from '../components/Common/BankLogo';
import { listBankLinks, deleteBankLink, type ApiBankLink } from '../api/endpoints';
import { syncBankConnection } from '../api/features';
import { currencySymbol, formatRelativeDay } from '../utils/format';
import { GuideAnchor } from '../components/Common/GuideAnchor';
import { goBackOrHome } from '../navigation/goBack';
import { type } from '../theme/typography';
import { errorMessage } from '../lib/errorMessage';
import { confirmDestructive } from '../lib/confirm';

/** Banks this account imports from: what they hold, when they last synced, and what needs attention. */
export default function BankConnectionsScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const { spacesEnabled, activeSpaceId, activeSpace } = useSpace();
  const isBusiness = spacesEnabled && activeSpaceId === 'business';
  const glyph = currencySymbol(user?.currency);

  const [links, setLinks] = useState<ApiBankLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listBankLinks(spacesEnabled ? { spaceId: activeSpaceId } : undefined);
      setLinks(res.items || []);
    } catch (e) {
      toast.show(errorMessage(e, 'Could not load your banks'), 'error');
    } finally {
      setLoading(false);
    }
  }, [activeSpaceId, spacesEnabled, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const accounts = links.flatMap((l) => l.accounts ?? []);
    return {
      banks: links.length,
      accounts: accounts.length,
      balance: accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0),
      lastSynced: links.map((l) => l.lastSyncedAt).filter(Boolean).sort().at(-1) ?? null,
      needsAttention: links.filter((l) => l.status === 'reauth_required').length
    };
  }, [links]);

  const handleSync = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const { imported } = await syncBankConnection(id);
      toast.show(imported ? `${imported} new transaction${imported === 1 ? '' : 's'} to review` : 'You’re up to date', 'success');
      await load();
      if (imported) nav.navigate('PendingTransactions');
    } catch (e) {
      toast.show(errorMessage(e, 'Could not sync this bank'), 'error');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  // Disconnecting stops every future import, so it asks first and says what is kept.
  const confirmDisconnect = (link: ApiBankLink) => {
    confirmDestructive({
      title: `Disconnect ${link.bankName}?`,
      body: 'Nothing new will come in from this bank. Everything already logged stays in your records, and you can connect it again later.',
      action: 'Disconnect',
      onConfirm: async () => {
          setBusyId(link.id);
          try {
            await deleteBankLink(link.id, spacesEnabled ? { spaceId: activeSpaceId } : undefined);
            setLinks((prev) => prev.filter((l) => l.id !== link.id));
            toast.show(`${link.bankName} disconnected`, 'success');
          } catch (e) {
            toast.show(errorMessage(e, 'Could not disconnect this bank'), 'error');
          } finally {
            setBusyId(null);
          }
        }
    });
  };

  const otherWays = (
    <View style={{ marginTop: 22 }}>
      <Text style={[type.caption, { color: theme.colors.textMuted, textAlign: 'center', marginBottom: 12 }]}>Rather not connect? Two other ways in:</Text>
      <Pressable onPress={() => nav.navigate('BankAlertImport')} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
        <Card style={styles.wayCard}>
          <IconTile bg={theme.colors.primarySoft} size={36}>
            <ClipboardPaste color={theme.colors.primary} size={17} />
          </IconTile>
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Paste a bank alert</Text>
            <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>Copy the SMS, we do the rest.</Text>
          </View>
        </Card>
      </Pressable>
      {isBusiness ? (
        <Pressable onPress={() => nav.navigate('StatementImport')} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
          <Card style={[styles.wayCard, { marginTop: 10 }]}>
            <IconTile bg={theme.colors.primarySoft} size={36}>
              <Upload color={theme.colors.primary} size={17} />
            </IconTile>
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Upload a statement</Text>
              <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>Paystack, Moniepoint or a bank CSV.</Text>
            </View>
          </Card>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <Screen scrollable={false}>
      <ScreenHeader title="Linked banks" subtitle={spacesEnabled ? activeSpace?.name ?? 'Personal' : undefined} onBack={() => goBackOrHome(nav)} />
      <GuideAnchor id="banks.list" style={{ flex: 1 }}>
        <FlatList
          data={links}
          keyExtractor={(l) => l.id}
          showsVerticalScrollIndicator={false}
          onRefresh={load}
          refreshing={loading}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListHeaderComponent={
            links.length ? (
              <HeroCard style={{ marginTop: 8, marginBottom: 12 }}>
                <Text style={[type.eyebrow, { color: theme.colors.inkText, opacity: 0.72 }]}>Across your accounts</Text>
                <Amount value={summary.balance} currency={glyph} size="hero" color={theme.colors.inkText} style={{ marginTop: 6 }} />
                <Text style={[type.small, { color: theme.colors.inkText, opacity: 0.75, marginTop: 4 }]}>
                  {summary.banks} bank{summary.banks === 1 ? '' : 's'} · {summary.accounts} account{summary.accounts === 1 ? '' : 's'}
                  {summary.lastSynced ? ` · synced ${formatRelativeDay(summary.lastSynced)}` : ''}
                </Text>
                {summary.needsAttention > 0 ? (
                  <View style={{ flexDirection: 'row', marginTop: 12 }}>
                    <Chip tone="brass" label={`${summary.needsAttention} need${summary.needsAttention === 1 ? 's' : ''} reconnecting`} />
                  </View>
                ) : null}
              </HeroCard>
            ) : null
          }
          ListEmptyComponent={
            loading ? (
              <Spinner style={{ marginTop: 40 }} />
            ) : (
              <View style={{ paddingTop: 26 }}>
                <View style={{ alignItems: 'center' }}>
                  <IconTile bg={theme.colors.primarySoft} size={58}>
                    <Landmark color={theme.colors.primary} size={26} />
                  </IconTile>
                  <Text style={[type.h2, { color: theme.colors.text, marginTop: 14, textAlign: 'center' }]}>No bank connected yet</Text>
                  <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 8, textAlign: 'center', paddingHorizontal: 12 }]}>
                    {isBusiness
                      ? 'Connect your business account and your sales and costs log themselves. You confirm each one before it lands.'
                      : 'Connect one and your spending logs itself. You confirm each transaction before it touches your budget.'}
                  </Text>
                </View>
                <PrimaryButton title="Connect a bank" onPress={() => nav.navigate('BankConnectTerms')} style={{ marginTop: 20 }} />
                {otherWays}
              </View>
            )
          }
          ListFooterComponent={
            links.length ? <SecondaryButton title="Connect another bank" onPress={() => nav.navigate('BankConnectTerms')} style={{ marginTop: 4 }} /> : null
          }
          renderItem={({ item }) => {
            const accounts = item.accounts ?? [];
            const needsReauth = item.status === 'reauth_required';
            const busy = busyId === item.id;

            return (
              <Card style={{ marginBottom: 12 }}>
                <View style={styles.row}>
                  <BankLogo name={item.bankName} logoUrl={item.logoUrl} size={42} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[type.bodyStrong, { color: theme.colors.text, fontSize: 16 }]}>
                      {item.bankName}
                    </Text>
                    <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                      {accounts.length} account{accounts.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Chip tone={needsReauth ? 'brass' : 'positive'} label={needsReauth ? 'Action needed' : 'Active'} />
                </View>

                {accounts.length ? (
                  <View style={{ marginTop: 14, gap: 9 }}>
                    {accounts.map((acct) => (
                      <View key={acct.id} style={styles.row}>
                        <Text numberOfLines={1} style={[type.small, { color: theme.colors.textMuted, flex: 1 }]}>
                          {acct.name} ···· {acct.mask}
                        </Text>
                        <Text style={[type.smallStrong, { color: theme.colors.text }]}>{formatAmount(acct.balance ?? 0, currencySymbol(acct.currency ?? user?.currency))}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {needsReauth ? (
                  <View style={{ marginTop: 14 }}>
                    <Text style={[type.small, { color: theme.colors.textMuted }]}>
                      {item.bankName} has asked us to confirm access again. Nothing new comes in until you do.
                    </Text>
                    <PrimaryButton title={`Reconnect ${item.bankName}`} onPress={() => nav.navigate('MonoConnect', { start: true })} style={{ marginTop: 10 }} />
                  </View>
                ) : (
                  <View style={[styles.row, { marginTop: 14 }]}>
                    <Text style={[type.caption, { color: theme.colors.textMuted, flex: 1 }]}>
                      {item.lastSyncedAt ? `Synced ${formatRelativeDay(item.lastSyncedAt)}` : 'Not synced yet'}
                    </Text>
                    {item.provider === 'mono' ? (
                      <Pressable
                        onPress={() => void handleSync(item.id)}
                        disabled={busy}
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.action, { backgroundColor: theme.colors.primarySoft, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}
                      >
                        <RefreshCw color={theme.colors.primary} size={14} />
                        <Text style={[type.smallStrong, { color: theme.colors.primary }]}>{busy ? 'Syncing…' : 'Sync now'}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}

                <Pressable
                  onPress={() => confirmDisconnect(item)}
                  disabled={busy}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={({ pressed }) => ({ alignSelf: 'flex-start', marginTop: 12, opacity: busy ? 0.5 : pressed ? 0.7 : 1 })}
                >
                  <Text style={[type.smallStrong, { color: theme.colors.error }]}>Disconnect</Text>
                </Pressable>
              </Card>
            );
          }}
        />
      </GuideAnchor>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 11 },
  wayCard: { flexDirection: 'row', alignItems: 'center', gap: 12 }
});
