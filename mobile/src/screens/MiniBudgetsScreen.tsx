import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, FlatList, Text, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { X } from 'lucide-react-native';

import { createMiniBudget, createMiniBudgetInSpace, listBudgets, listMiniBudgets, listMiniBudgetsInSpace, type ApiMiniBudget } from '../api/endpoints';
import { useSpace } from '../contexts/SpaceContext';
import { useAuth } from '../contexts/AuthContext';
import { Screen, Card, TextField, H1, P, SecondaryButton, PrimaryButton, InlineError } from '../components/Common/ui';
import { useTheme } from '../contexts/ThemeContext';
import { formatMoney, formatNumberInput } from '../utils/format';
import { tokens } from '../theme/tokens';

export default function MiniBudgetsScreen({ route }: any) {
  const nav = useNavigation<any>();
  const { spacesEnabled, activeSpaceId, activeSpace } = useSpace();
  const { user } = useAuth();

  const { category: initialCategory = 'Essential', budgetId } = route.params || {};
  const { theme } = useTheme();

  const isBusiness = spacesEnabled && activeSpaceId === 'business';
  const bucketLabel = useCallback(
    (key: string) => {
      if (!isBusiness) return key;
      if (key === 'Essential') return 'Operating Costs';
      if (key === 'Savings') return 'Reserves';
      if (key === 'Free Spending') return 'Discretionary';
      if (key === 'Investments') return 'Growth';
      if (key === 'Miscellaneous') return 'Misc Ops';
      if (key === 'Debt Financing') return 'Loans & Credit';
      return key;
    },
    [isBusiness]
  );

  const CATEGORIES = useMemo(
    () => ['Essential', 'Free Spending', 'Savings', 'Investments', 'Miscellaneous', 'Debt Financing'] as const,
    []
  );

  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>(initialCategory);

  const [items, setItems] = useState<ApiMiniBudget[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budgetName, setBudgetName] = useState<string | null>(null);
  const [categoryBudgeted, setCategoryBudgeted] = useState<number | null>(null);

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');

  const load = useCallback(async () => {
    if (!budgetId) return;
    setError(null);
    setIsLoading(true);
    try {
      const [mini, budgetsRes] = await Promise.all([
        spacesEnabled ? listMiniBudgetsInSpace(String(budgetId), activeSpaceId) : listMiniBudgets(String(budgetId)),
        listBudgets({ spaceId: spacesEnabled ? activeSpaceId : undefined })
      ]);

      setItems((mini.items || []) as ApiMiniBudget[]);

      const b = (budgetsRes.items || []).find((x: any) => String(x.id) === String(budgetId)) ?? null;
      setBudgetName(b?.name ?? null);
      const budgeted = b?.categories?.[category]?.budgeted;
      setCategoryBudgeted(typeof budgeted === 'number' ? budgeted : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load mini budgets');
    } finally {
      setIsLoading(false);
    }
  }, [activeSpaceId, budgetId, category, spacesEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return items.filter((it) => (it.category ?? null) === category);
  }, [category, items]);

  const sumAllocated = useMemo(() => {
    return filtered.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
  }, [filtered]);

  const add = async () => {
    const a = Number(amount.replace(/,/g, '.')) || 0;
    if (!budgetId) return;
    if (!name.trim() || a <= 0) return;

    setError(null);
    setIsLoading(true);
    try {
      if (spacesEnabled) {
        await createMiniBudgetInSpace(String(budgetId), { name: name.trim(), amount: Math.round(a), category }, activeSpaceId);
      } else {
        await createMiniBudget(String(budgetId), { name: name.trim(), amount: Math.round(a), category });
      }
      setName('');
      setAmount('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create mini budget');
    } finally {
      setIsLoading(false);
    }
  };

  if (!budgetId) {
    return (
      <Screen>
        <H1 style={{ marginBottom: 6 }}>Mini Budgets</H1>
        <P style={{ marginBottom: 12 }}>Create a budget first, then add mini budgets under its categories.</P>
        <SecondaryButton title="Back" onPress={() => nav.goBack()} />
      </Screen>
    );
  }

  const handleClose = () => {
    try {
      if (typeof nav.canGoBack === 'function' && nav.canGoBack()) {
        nav.goBack();
        return;
      }
    } catch {
      // ignore
    }
    nav.navigate('Main', { screen: 'Budget' });
  };

  return (
    <Screen scrollable={false}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 10,
          backgroundColor: theme.colors.background
        }}
      >
        <View style={{ flex: 1, paddingRight: 10 }}>
          <H1 style={{ marginBottom: 2 }}>Mini Budgets</H1>
          <P numberOfLines={1} ellipsizeMode="tail">
            {budgetName ? `For: ${budgetName}` : 'For your current budget'}
            {spacesEnabled ? ` • ${activeSpace?.name ?? 'Personal'}` : ''}
          </P>
        </View>
        <Pressable
          onPress={handleClose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [
            {
              width: 44,
              height: 44,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              opacity: pressed ? 0.92 : 1
            }
          ]}
        >
          <X color={theme.colors.text} size={18} />
        </Pressable>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListHeaderComponent={
          <View style={{ backgroundColor: theme.colors.background, paddingBottom: 12 }}>
            <View style={{ marginTop: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORIES.map((c) => {
                const active = c === category;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCategory(c)}
                    style={({ pressed }) => [
                      {
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 999,
                        backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                        opacity: pressed ? 0.92 : 1
                      }
                    ]}
                  >
                    <Text style={{ color: active ? tokens.colors.white : theme.colors.text, fontWeight: '800', fontSize: 12 }}>
                      {bucketLabel(c)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Card style={{ marginTop: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>{bucketLabel(category)}</Text>
              <Text style={{ color: theme.colors.textMuted, fontWeight: '700', marginTop: 4, fontSize: 12 }}>
                Allocate mini budgets to keep spending intentional.
              </Text>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>Allocated</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 4 }}>{formatMoney(sumAllocated, user?.currency ?? undefined)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>Category budget</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 4 }}>
                    {categoryBudgeted != null ? formatMoney(categoryBudgeted, user?.currency ?? undefined) : '—'}
                  </Text>
                </View>
              </View>

              {categoryBudgeted != null && categoryBudgeted > 0 ? (
                <View
                  style={{
                    height: 10,
                    backgroundColor: theme.colors.surfaceAlt,
                    borderRadius: 999,
                    overflow: 'hidden',
                    marginTop: 12
                  }}
                >
                  <View
                    style={{
                      width: `${Math.min(100, Math.round((sumAllocated / categoryBudgeted) * 100))}%`,
                      height: '100%',
                      backgroundColor: sumAllocated > categoryBudgeted ? tokens.colors.warning[500] : theme.colors.primary
                    }}
                  />
                </View>
              ) : null}
            </Card>

            <View style={{ marginTop: 12 }}>
              {error ? <InlineError message={error} /> : null}
              {isLoading ? <ActivityIndicator color={theme.colors.primary} /> : null}
            </View>

            <Card style={{ marginTop: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Add a mini budget</Text>
              <P style={{ marginTop: 6 }}>Example: “Subscriptions”, “Groceries”, “Fuel”.</P>
              <View style={{ marginTop: 10 }}>
                <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Subscriptions" />
                <TextField
                  label="Amount (monthly)"
                  value={amount}
                  onChangeText={(v) => setAmount(formatNumberInput(v))}
                  keyboardType="numeric"
                  placeholder="0"
                />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                  <PrimaryButton
                    title="Add"
                    onPress={add}
                    disabled={isLoading || !name.trim() || !(Number(amount.replace(/,/g, '')) > 0)}
                  />
                </View>
              </View>
            </Card>
          </View>
        }
        ListEmptyComponent={<P style={{ marginTop: 12 }}>No mini budgets in {bucketLabel(category)} yet. Add one above.</P>}
        renderItem={({ item }) => (
          <Card style={{ marginTop: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }} numberOfLines={1}>
                  {item.name}
                </Text>
                <View
                  style={{
                    marginTop: 6,
                    alignSelf: 'flex-start',
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: theme.colors.surfaceAlt
                  }}
                >
                  <Text style={{ color: theme.colors.textMuted, fontWeight: '800', fontSize: 11 }}>{bucketLabel(category)}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>{formatMoney(item.amount, user?.currency ?? undefined)}</Text>
                <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12, marginTop: 2 }}>per month</Text>
              </View>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}
