import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, SectionList, Pressable, TextInput, StyleSheet } from 'react-native';
import { useHiddenIds } from '../lib/undoDelete';
import { GuideAnchor } from '../components/Common/GuideAnchor';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { ChevronLeft, ChevronRight, Search, Trash2, X } from 'lucide-react-native';
import { deleteTransaction, deleteTransactionInSpace, listTransactions, type ApiTransaction } from '../api/endpoints';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { useAmountVisibility } from '../contexts/AmountVisibilityContext';
import { SpaceSwitcher } from '../components/Common/SpaceSwitcher';
import { CategoryIcon } from '../components/Common/CategoryIcon';
import { useToast } from '../components/Common/Toast';
import { useSync } from '../contexts/SyncContext';
import { Amount, Card, EmptyState, IconButton, InlineError, Screen, ScreenHeader, Skeleton } from '../components/Common/ui';
import { currencySymbol, dayKey, formatDayHeader, formatRelativeDay, monthName, toIsoDateTime } from '../utils/format';
import { fonts, type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';

const UNDO_MS = 5000;
const MAX_PAGES = 10;

type Filter = 'all' | 'expense' | 'income';

export function TransactionsScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const { showAmounts } = useAmountVisibility();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const { queued, discard, flush, isOnline } = useSync();
  const [items, setItems] = useState<ApiTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<Filter>('all');
  const [monthOffset, setMonthOffset] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const glyph = currencySymbol(user?.currency);
  const pendingDeletes = useRef<Record<string, { timer: ReturnType<typeof setTimeout>; tx: ApiTransaction }>>({});

  // A visible month replaces the old hidden "last 30 days" window, so totals match Home and Insights.
  const period = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end: monthOffset === 0 ? now : monthEnd, label: `${monthName(start.getMonth(), true)} ${start.getFullYear()}` };
  }, [monthOffset]);

  const load = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const all: ApiTransaction[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await listTransactions({
          start: toIsoDateTime(period.start),
          end: toIsoDateTime(period.end),
          limit: 200,
          cursor,
          spaceId: spacesEnabled ? activeSpaceId : undefined
        });
        all.push(...(res.items || []));
        if (!res.nextCursor) break;
        cursor = res.nextCursor;
      }
      all.sort((a, b) => (Date.parse(b.occurredAt) || 0) - (Date.parse(a.occurredAt) || 0));
      setItems(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load transactions. Pull down to try again.');
    } finally {
      setIsLoading(false);
    }
  }, [activeSpaceId, period.end, period.start, spacesEnabled]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const commitDelete = useCallback(
    async (tx: ApiTransaction) => {
      delete pendingDeletes.current[tx.id];
      try {
        if (spacesEnabled) await deleteTransactionInSpace(tx.id, activeSpaceId);
        else await deleteTransaction(tx.id);
        setItems((prev) => prev.filter((x) => x.id !== tx.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not delete that transaction.');
      } finally {
        setHidden((h) => {
          const next = new Set(h);
          next.delete(tx.id);
          return next;
        });
      }
    },
    [activeSpaceId, spacesEnabled]
  );

  // Leaving the screen finalises any deletes still waiting on Undo.
  useEffect(() => {
    const pending = pendingDeletes.current;
    return () => {
      Object.values(pending).forEach(({ timer, tx }) => {
        clearTimeout(timer);
        void commitDelete(tx);
      });
    };
  }, [commitDelete]);

  const scheduleDelete = (tx: ApiTransaction) => {
    setHidden((h) => new Set(h).add(tx.id));
    const timer = setTimeout(() => void commitDelete(tx), UNDO_MS);
    pendingDeletes.current[tx.id] = { timer, tx };
    toast.show('Transaction deleted', 'info', UNDO_MS, {
      label: 'Undo',
      onPress: () => {
        const pending = pendingDeletes.current[tx.id];
        if (pending) clearTimeout(pending.timer);
        delete pendingDeletes.current[tx.id];
        setHidden((h) => {
          const next = new Set(h);
          next.delete(tx.id);
          return next;
        });
      }
    });
  };

  // Deleted from the detail screen and still inside its Undo window.
  const deletedElsewhere = useHiddenIds();
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items
      .filter((t) => !hidden.has(t.id) && !deletedElsewhere.has(String(t.id)))
      .filter((t) => (typeFilter === 'all' ? true : t.type === typeFilter))
      .filter((t) => !s || (t.description || '').toLowerCase().includes(s) || (t.category || '').toLowerCase().includes(s));
  }, [deletedElsewhere, hidden, items, search, typeFilter]);

  const totals = useMemo(() => {
    const income = filtered.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = filtered.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    return { income, expense, net: income - expense };
  }, [filtered]);

  const sections = useMemo(() => {
    const map = new Map<string, { date: Date; data: ApiTransaction[]; net: number }>();
    for (const t of filtered) {
      const key = dayKey(t.occurredAt);
      if (!map.has(key)) map.set(key, { date: new Date(t.occurredAt), data: [], net: 0 });
      const group = map.get(key)!;
      group.data.push(t);
      group.net += t.type === 'income' ? t.amount : -t.amount;
    }
    return Array.from(map.values()).map((g) => ({ title: formatDayHeader(g.date), net: g.net, data: g.data }));
  }, [filtered]);

  const filters: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'expense', label: 'Expenses' },
    { key: 'income', label: 'Income' }
  ];

  return (
    <Screen scrollable={false}>
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        refreshing={isLoading}
        onRefresh={load}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 48 }}
        ListHeaderComponent={
          <View>
            <ScreenHeader title="Transactions" onBack={() => goBackOrHome(nav)} />
            {spacesEnabled ? (
              <View style={{ marginTop: 6 }}>
                <SpaceSwitcher />
              </View>
            ) : null}

            <GuideAnchor id="transactions.search" style={[styles.search, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Search color={theme.colors.textMuted} size={18} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search merchant or category"
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="search"
                style={[styles.searchInput, { color: theme.colors.text }]}
              />
              {search ? (
                <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Clear search">
                  <X color={theme.colors.textMuted} size={18} />
                </Pressable>
              ) : null}
            </GuideAnchor>

            <View style={styles.filters}>
              {filters.map((f) => {
                const active = typeFilter === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => setTypeFilter(f.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.filter, { backgroundColor: active ? theme.colors.text : theme.colors.surfaceAlt }]}
                  >
                    <Text style={[type.smallStrong, { color: active ? theme.colors.background : theme.colors.text }]}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.periodRow}>
              <IconButton accessibilityLabel="Previous month" onPress={() => setMonthOffset((m) => m - 1)}>
                <ChevronLeft color={theme.colors.text} size={18} />
              </IconButton>
              <Text style={[type.title, { color: theme.colors.text }]}>{period.label}</Text>
              <View style={{ opacity: monthOffset >= 0 ? 0.35 : 1 }}>
                <IconButton accessibilityLabel="Next month" onPress={() => monthOffset < 0 && setMonthOffset((m) => m + 1)}>
                  <ChevronRight color={theme.colors.text} size={18} />
                </IconButton>
              </View>
            </View>

            <Card style={styles.summary}>
              <View style={styles.summaryCol}>
                <Text style={[type.caption, { color: theme.colors.textMuted }]}>In</Text>
                <Amount value={totals.income} currency={glyph} size="sm" signed color={theme.colors.success} hidden={!showAmounts} />
              </View>
              <View style={[styles.summaryCol, styles.summaryDivider, { borderLeftColor: theme.colors.border }]}>
                <Text style={[type.caption, { color: theme.colors.textMuted }]}>Out</Text>
                <Amount value={-totals.expense} currency={glyph} size="sm" hidden={!showAmounts} />
              </View>
              <View style={[styles.summaryCol, styles.summaryDivider, { borderLeftColor: theme.colors.border }]}>
                <Text style={[type.caption, { color: theme.colors.textMuted }]}>Net</Text>
                <Amount value={totals.net} currency={glyph} size="sm" signed hidden={!showAmounts} />
              </View>
            </Card>

            {queued.length ? (
              <Card style={{ marginTop: 12, borderColor: theme.colors.brass }}>
                <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{queued.length} waiting to sync</Text>
                <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                  {isOnline ? 'Saved on this phone and sending now.' : 'You’re offline. These save automatically when you reconnect.'}
                </Text>
                {queued.map((q) => (
                  <View key={q.clientId} style={styles.queuedRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[type.small, { color: theme.colors.text }]}>
                        {q.payload.description || q.payload.category}
                      </Text>
                      {q.lastError ? <Text style={[type.caption, { color: theme.colors.error }]}>{q.lastError}</Text> : null}
                    </View>
                    <Amount value={q.payload.type === 'expense' ? -q.payload.amount : q.payload.amount} currency={glyph} size="sm" signed={q.payload.type === 'income'} />
                    {q.lastError ? (
                      <Pressable onPress={() => void discard(q.clientId)} hitSlop={10} accessibilityLabel="Discard this transaction">
                        <X color={theme.colors.textMuted} size={16} />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                {isOnline ? (
                  <Pressable onPress={() => void flush()} hitSlop={8} style={{ marginTop: 10, alignSelf: 'flex-start' }}>
                    <Text style={[type.smallStrong, { color: theme.colors.primary }]}>Retry now</Text>
                  </Pressable>
                ) : null}
              </Card>
            ) : null}
            {error ? (
              <View style={{ marginTop: 12 }}>
                <InlineError message={error} />
              </View>
            ) : null}
            {sections.length > 0 ? (
              <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 10 }]}>Swipe left on a transaction to delete it.</Text>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text style={[type.eyebrow, { color: theme.colors.textMuted }]}>{section.title}</Text>
            <Amount
              value={section.net}
              currency={glyph}
              size="sm"
              signed={section.net > 0}
              hidden={!showAmounts}
              color={section.net > 0 ? theme.colors.success : theme.colors.textMuted}
              style={{ fontSize: 13 }}
            />
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const first = index === 0;
          const last = index === section.data.length - 1;
          return (
            <View
              style={[
                styles.rowWrap,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderTopWidth: first ? StyleSheet.hairlineWidth : 0,
                  borderTopLeftRadius: first ? 20 : 0,
                  borderTopRightRadius: first ? 20 : 0,
                  borderBottomLeftRadius: last ? 20 : 0,
                  borderBottomRightRadius: last ? 20 : 0
                }
              ]}
            >
              <Swipeable
                friction={2}
                rightThreshold={40}
                overshootRight={false}
                renderRightActions={() => (
                  <Pressable
                    onPress={() => scheduleDelete(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${item.description || item.category}`}
                    style={[styles.deleteAction, { backgroundColor: theme.colors.error }]}
                  >
                    <Trash2 color="#FFFFFF" size={18} />
                    <Text style={{ color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 12 }}>Delete</Text>
                  </Pressable>
                )}
              >
                <Pressable
                  onPress={() => nav.navigate('TransactionDetail', { id: item.id })}
                  accessibilityActions={[{ name: 'delete', label: 'Delete' }]}
                  onAccessibilityAction={(e) => e.nativeEvent.actionName === 'delete' && scheduleDelete(item)}
                  style={({ pressed }) => [styles.row, { backgroundColor: theme.colors.surface, opacity: pressed ? 0.75 : 1 }]}
                >
                  <CategoryIcon category={item.category} type={item.type} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[type.bodyStrong, { color: theme.colors.text }]}>
                      {item.description || item.category || 'Transaction'}
                    </Text>
                    <Text numberOfLines={1} style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                      {item.category} · {formatRelativeDay(item.occurredAt, new Date(item.occurredAt))}
                    </Text>
                  </View>
                  <Amount
                    value={item.type === 'expense' ? -item.amount : item.amount}
                    currency={glyph}
                    size="sm"
                    signed={item.type === 'income'}
                    hidden={!showAmounts}
                    color={item.type === 'income' ? theme.colors.success : theme.colors.text}
                  />
                </Pressable>
              </Swipeable>
              {!last ? <View style={[styles.separator, { backgroundColor: theme.colors.border }]} /> : null}
            </View>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <Skeleton rows={6} style={{ marginTop: 16 }} />
          ) : (
            <View style={{ marginTop: 18 }}>
              <EmptyState
                title={search ? 'No matches' : `Nothing in ${period.label}`}
                body={search ? `No transactions match “${search.trim()}”.` : 'Transactions you add or import will show up here.'}
                actionLabel={search ? undefined : 'Add transaction'}
                onAction={search ? undefined : () => nav.navigate('AddTransaction')}
              />
            </View>
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  queuedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, marginTop: 10 },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, paddingVertical: 0, letterSpacing: 0 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 12 },
  filter: { height: 34, paddingHorizontal: 14, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  summary: { flexDirection: 'row', marginTop: 12, paddingVertical: 12 },
  summaryCol: { flex: 1, gap: 3 },
  summaryDivider: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 12 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 8, paddingHorizontal: 4 },
  rowWrap: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 68 },
  deleteAction: { width: 84, alignItems: 'center', justifyContent: 'center', gap: 3 }
});
