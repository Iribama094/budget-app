import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ArrowLeft, Search } from 'lucide-react-native';
import { deleteTransaction, deleteTransactionInSpace, listTransactions, type ApiTransaction } from '../api/endpoints';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { SpaceSwitcher } from '../components/Common/SpaceSwitcher';
import { Card, InlineError, P, Screen, TextField, H1 } from '../components/Common/ui';
import { formatMoney, toIsoDateTime, categoryDotColor } from '../utils/format';
import { tokens } from '../theme/tokens';

export function TransactionsScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId, activeSpace } = useSpace();
  const [items, setItems] = useState<ApiTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');

  const range = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    return { start: toIsoDateTime(start), end: toIsoDateTime(end) };
  }, []);

  const load = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const data = await listTransactions({ start: range.start, end: range.end, limit: 50, spaceId: spacesEnabled ? activeSpaceId : undefined });
      setItems(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [activeSpaceId, spacesEnabled])
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items
      .filter((t) => (typeFilter === 'all' ? true : t.type === typeFilter))
      .filter((t) => {
        if (!s) return true;
        return (t.description || '').toLowerCase().includes(s) || (t.category || '').toLowerCase().includes(s);
      });
  }, [items, search, typeFilter]);

  const totals = useMemo(() => {
    const income = filtered.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = filtered.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    return { income, expense };
  }, [filtered]);

  const confirmDelete = (t: ApiTransaction) => {
    Alert.alert('Delete transaction?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (spacesEnabled) await deleteTransactionInSpace(t.id, activeSpaceId);
            else await deleteTransaction(t.id);
            await load();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to delete transaction');
          }
        }
      }
    ]);
  };

  return (
    <Screen scrollable={false}>
      <FlatList
        data={filtered}
        keyExtractor={(t) => t.id}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        refreshing={isLoading}
        onRefresh={load}
        contentContainerStyle={
          filtered.length
            ? { paddingBottom: 20 }
            : { paddingBottom: 20 }
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
                    opacity: pressed ? 0.92 : 1,
                    transform: [{ scale: pressed ? 0.985 : 1 }]
                  }
                ]}
              >
                <ArrowLeft color={theme.colors.text} size={20} />
              </Pressable>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <H1 style={{ marginBottom: 0 }}>Transactions</H1>
                {spacesEnabled ? (
                  <View
                    style={{
                      marginTop: 4,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>
                      Viewing: {activeSpace?.name ?? 'Personal'}
                    </Text>
                    <SpaceSwitcher />
                  </View>
                ) : null}
              </View>
            </View>

            <View style={{ marginTop: 14, flexDirection: 'row', gap: 10 }}>
              <Card style={{ flex: 1, paddingVertical: 12 }}>
                <Text style={{ color: theme.colors.success, fontWeight: '800' }}>Total Income</Text>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18, marginTop: 6 }}>
                  {formatMoney(totals.income, user?.currency ?? '₦')}
                </Text>
              </Card>
              <Card style={{ flex: 1, paddingVertical: 12 }}>
                <Text style={{ color: theme.colors.error, fontWeight: '800' }}>Total Expenses</Text>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18, marginTop: 6 }}>
                  {formatMoney(totals.expense, user?.currency ?? '₦')}
                </Text>
              </Card>
            </View>

            <View style={{ marginTop: 14 }}>
              {error ? <InlineError message={error} /> : null}
              {isLoading ? <ActivityIndicator color={theme.colors.primary} /> : null}
            </View>

            <View style={{ marginTop: 10, marginBottom: 14 }}>
              <Card style={{ paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Search color={theme.colors.textMuted} size={18} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <TextField
                      label="Search"
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Search transactions…"
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', marginTop: 6, gap: 10 }}>
                  {(['all', 'income', 'expense'] as const).map((key) => {
                    const active = typeFilter === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => setTypeFilter(key)}
                        style={({ pressed }) => [
                          {
                            flex: 1,
                            borderRadius: tokens.radius['2xl'],
                            paddingVertical: 10,
                            alignItems: 'center',
                            backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                            opacity: pressed ? 0.92 : 1,
                            transform: [{ scale: pressed ? 0.985 : 1 }]
                          }
                        ]}
                      >
                        <Text
                          style={{
                            color: active ? tokens.colors.white : theme.colors.text,
                            fontWeight: '800'
                          }}
                        >
                          {key === 'all' ? 'All' : key === 'income' ? 'Income' : 'Expenses'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            </View>
          </View>
        }
        ListEmptyComponent={!isLoading ? <P style={{ textAlign: 'center' }}>No transactions found.</P> : null}
        renderItem={({ item }) => {
          const sign = item.type === 'expense' ? '-' : '+';
          const dot = categoryDotColor(item.category);
          return (
            <Pressable
              onPress={() => nav.navigate('TransactionDetail', { id: item.id })}
              onLongPress={() => confirmDelete(item)}
              delayLongPress={450}
              style={({ pressed }) => ({ opacity: pressed ? 0.96 : 1 })}
            >
              <Card style={{ marginBottom: 10, paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                  <LinearGradient
                    colors={[theme.colors.primary, tokens.colors.secondary[400]]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={{ width: 8, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }}
                  />

                  <View style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: dot, marginRight: 10 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.colors.text, fontWeight: '900' }} numberOfLines={1}>
                            {item.description || '—'}
                          </Text>
                          <Text style={{ color: theme.colors.textMuted, marginTop: 4 }} numberOfLines={1}>
                            {item.category}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={{
                          fontWeight: '900',
                          color: item.type === 'expense' ? theme.colors.error : theme.colors.success
                        }}
                      >
                        {sign}
                        {formatMoney(item.amount, user?.currency ?? '₦')}
                      </Text>
                    </View>
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}
