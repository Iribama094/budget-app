import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Link as LinkIcon, RefreshCw, Link2Off } from 'lucide-react-native';

import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { useAuth } from '../contexts/AuthContext';
import { useSpace } from '../contexts/SpaceContext';
import { Screen, Card, H1, P, PrimaryButton, SecondaryButton } from '../components/Common/ui';
import { listBankLinks, deleteBankLink, type ApiBankLink } from '../api/endpoints';
import { formatMoney } from '../utils/format';
import { tokens } from '../theme/tokens';

export default function BankConnectionsScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const { spacesEnabled, activeSpaceId, activeSpace } = useSpace();

  const [links, setLinks] = useState<ApiBankLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listBankLinks(spacesEnabled ? { spaceId: activeSpaceId } : undefined);
      setLinks(res.items || []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load bank connections';
      toast.show(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeSpaceId, spacesEnabled, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const banks = links.length;
    const accounts = links.reduce((sum, l) => sum + (l.accounts?.length ?? 0), 0);
    return { banks, accounts };
  }, [links]);

  const handleDisconnect = async (id: string) => {
    if (disconnectingId) return;
    setDisconnectingId(id);
    try {
      await deleteBankLink(id, spacesEnabled ? { spaceId: activeSpaceId } : undefined);
      setLinks((prev) => prev.filter((l) => l.id !== id));
      toast.show('Bank disconnected.', 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to disconnect bank';
      toast.show(msg, 'error');
    } finally {
      setDisconnectingId(null);
    }
  };

  return (
    <Screen scrollable={false}>
      <FlatList
        data={links}
        keyExtractor={(l) => l.id}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onRefresh={load}
        refreshing={loading}
        contentContainerStyle={
          links.length
            ? { paddingBottom: 20 }
            : { flexGrow: 1, justifyContent: 'center', paddingBottom: 20 }
        }
        ListHeaderComponent={
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable
                onPress={() => nav.goBack()}
                style={({ pressed }) => [
                  {
                    width: 44,
                    height: 44,
                    borderRadius: 18,
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.92 : 1
                  }
                ]}
              >
                <ArrowLeft color={theme.colors.text} size={20} />
              </Pressable>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <H1 style={{ marginBottom: 0 }}>Bank connections</H1>
                {spacesEnabled ? (
                  <Text style={{ marginTop: 4, color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>
                    Viewing: {activeSpace?.name ?? 'Personal'}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={{ marginTop: 14 }}>
              <P>Manage your connected banks. You can disconnect at any time.</P>
            </View>

            <View style={{ marginTop: 14 }}>
              <Card>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Summary</Text>
                <Text style={{ color: theme.colors.textMuted, marginTop: 6 }}>
                  {summary.banks} connected bank{summary.banks === 1 ? '' : 's'} • {summary.accounts} account{summary.accounts === 1 ? '' : 's'}
                </Text>
              </Card>
            </View>

            <View style={{ marginTop: 14 }}>
              <PrimaryButton title="Connect Bank" onPress={() => nav.navigate('BankConnectTerms')} />
            </View>

            <View style={{ marginTop: 12 }}>{loading ? <ActivityIndicator color={theme.colors.primary} /> : null}</View>
          </View>
        }
        ListEmptyComponent={!loading ? (
          <View style={{ alignItems: 'center' }}>
            <P style={{ textAlign: 'center' }}>No bank connections yet.</P>
            <View style={{ marginTop: 10, width: '100%' }}>
              <PrimaryButton title="Connect Bank" onPress={() => nav.navigate('BankConnectTerms')} />
            </View>
          </View>
        ) : null}
        renderItem={({ item }) => {
          const totalBalance = (item.accounts || []).reduce((sum, acct) => sum + (acct.balance ?? 0), 0);
          const displayCurrency = item.accounts?.[0]?.currency ?? user?.currency ?? '₦';
          const isDisconnecting = disconnectingId === item.id;

          return (
            <Card style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: theme.colors.surfaceAlt,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 10
                    }}
                  >
                    <LinkIcon color={theme.colors.primary} size={20} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '900' }} numberOfLines={1}>
                      {item.bankName}
                    </Text>
                    <Text style={{ color: theme.colors.textMuted, marginTop: 4, fontSize: 12 }} numberOfLines={1}>
                      {item.accounts.length} linked account{item.accounts.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '800' }}>Total balance</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 4 }}>
                    {formatMoney(totalBalance, displayCurrency)}
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 12, gap: 8 }}>
                {(item.accounts || []).map((acct) => (
                  <View
                    key={acct.id}
                    style={{
                      padding: 10,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceAlt,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={{ color: theme.colors.text, fontWeight: '900' }} numberOfLines={1}>
                        {acct.name}
                      </Text>
                      <Text style={{ color: theme.colors.textMuted, marginTop: 4, fontSize: 12 }}>
                        {acct.type} • •••• {acct.mask}
                      </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '800' }}>Balance</Text>
                      <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 4 }}>
                        {formatMoney(acct.balance ?? 0, acct.currency ?? displayCurrency)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              <Pressable
                onPress={() => nav.navigate('PendingTransactions' as never)}
                style={({ pressed }) => [
                  {
                    marginTop: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 10,
                    borderRadius: tokens.radius['2xl'],
                    backgroundColor: theme.colors.surfaceAlt,
                    opacity: pressed ? 0.92 : 1
                  }
                ]}
              >
                <RefreshCw color={theme.colors.primary} size={16} />
                <Text style={{ color: theme.colors.primary, fontWeight: '800', marginLeft: 6 }}>
                  Review pending transactions
                </Text>
              </Pressable>

              <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'flex-end' }}>
                <Pressable
                  onPress={() => handleDisconnect(item.id)}
                  disabled={isDisconnecting}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={({ pressed }) => [
                    {
                      width: 40,
                      height: 40,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: theme.colors.surfaceAlt,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      opacity: isDisconnecting ? 0.5 : pressed ? 0.9 : 1
                    }
                  ]}
                >
                  <Link2Off color={theme.colors.error} size={18} />
                </Pressable>
              </View>
            </Card>
          );
        }}
      />
    </Screen>
  );
}
