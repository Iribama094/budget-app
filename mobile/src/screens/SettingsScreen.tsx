import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CreditCard, Download } from 'lucide-react-native';

import { Screen, H1, P, Card } from '../components/Common/ui';
import { useTheme } from '../contexts/ThemeContext';
import { tokens } from '../theme/tokens';
import { listBankLinks } from '../api/endpoints';
import { useSpace } from '../contexts/SpaceContext';

export default function SettingsScreen() {
  const nav = useNavigation<any>();
  const { theme, preference, setMode } = useTheme();
  const { spacesEnabled, activeSpaceId } = useSpace();

  const [bankSummary, setBankSummary] = useState<{ banks: number; accounts: number } | null>(null);

  const loadBankSummary = useCallback(async () => {
    try {
      const res = await listBankLinks(spacesEnabled ? { spaceId: activeSpaceId } : undefined);
      const banks = res.items?.length ?? 0;
      const accounts = (res.items || []).reduce((sum, l: any) => sum + (l.accounts?.length ?? 0), 0);
      setBankSummary({ banks, accounts });
    } catch {
      setBankSummary(null);
    }
  }, [activeSpaceId, spacesEnabled]);

  useEffect(() => {
    void loadBankSummary();
  }, [loadBankSummary]);

  const capped = useMemo(() => {
    const banks = Math.min(bankSummary?.banks ?? 0, 6);
    const accounts = Math.min(bankSummary?.accounts ?? 0, 12);
    return { banks, accounts };
  }, [bankSummary?.accounts, bankSummary?.banks]);

  const opts: { key: 'light' | 'dark' | 'system'; label: string }[] = [
    { key: 'light', label: 'Light' },
    { key: 'dark', label: 'Dark' },
    { key: 'system', label: 'System' }
  ];

  return (
    <Screen>
      <H1>Settings</H1>
      <P style={{ marginTop: 6 }}>App preferences</P>

      <View style={{ marginTop: 18 }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Data</Text>
            {bankSummary ? (
              <Text style={{ color: theme.colors.textMuted, fontWeight: '800', fontSize: 12 }}>
                {capped.banks} connected bank{capped.banks === 1 ? '' : 's'} • {capped.accounts} account{capped.accounts === 1 ? '' : 's'}
              </Text>
            ) : null}
          </View>
          <P style={{ marginTop: 8 }}>Connect and manage your bank data.</P>

          <View style={{ marginTop: 12, gap: 10 }}>
            <Pressable
              onPress={() => nav.navigate('BankConnectTerms')}
              style={({ pressed }) => [
                {
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 14,
                  backgroundColor: theme.colors.surfaceAlt,
                  opacity: pressed ? 0.92 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, paddingRight: 10 }}>
                <CreditCard color={theme.colors.primary} size={18} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Connect Bank</Text>
                  <Text style={{ color: theme.colors.textMuted, marginTop: 2, fontSize: 12 }} numberOfLines={1}>
                    Add a new bank connection
                  </Text>
                </View>
              </View>
              <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>→</Text>
            </Pressable>

            <Pressable
              onPress={() => nav.navigate('BankConnections')}
              style={({ pressed }) => [
                {
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 14,
                  backgroundColor: theme.colors.surfaceAlt,
                  opacity: pressed ? 0.92 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, paddingRight: 10 }}>
                <CreditCard color={theme.colors.primary} size={18} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Manage your connections</Text>
                  <Text style={{ color: theme.colors.textMuted, marginTop: 2, fontSize: 12 }} numberOfLines={1}>
                    View and disconnect connected banks
                  </Text>
                </View>
              </View>
              <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>→</Text>
            </Pressable>

            <Pressable
              onPress={() => nav.navigate('ExportData')}
              style={({ pressed }) => [
                {
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 14,
                  backgroundColor: theme.colors.surfaceAlt,
                  opacity: pressed ? 0.92 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, paddingRight: 10 }}>
                <Download color={theme.colors.primary} size={18} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Export data</Text>
                  <Text style={{ color: theme.colors.textMuted, marginTop: 2, fontSize: 12 }} numberOfLines={1}>
                    Download your transactions
                  </Text>
                </View>
              </View>
              <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>→</Text>
            </Pressable>
          </View>
        </Card>
      </View>

      <View style={{ marginTop: 18 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Theme</Text>
          <P style={{ marginTop: 8 }}>Choose app appearance</P>

          <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
            {opts.map((opt) => {
              const active = preference === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setMode(opt.key)}
                  style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt, opacity: pressed ? 0.9 : 1 }]}
                >
                  <Text style={{ color: active ? tokens.colors.white : theme.colors.text, fontWeight: '800' }}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      </View>
    </Screen>
  );
}
