import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { useSpace } from './SpaceContext';
import { useActing } from './ActingContext';
import { createCategory, deleteCategory, listCategories, updateCategory, type ApiCategory, type CategoryPatch } from '../api/personal';
import { defaultCategories } from '../lib/categoryDefaults';
import { BUCKETS, type Bucket } from '../theme/buckets';

type CategoriesState = {
  /** Every category in the active space, including hidden ones (for Settings). */
  all: ApiCategory[];
  /** Visible expense categories, grouped Needs → Wants → Savings. */
  expense: ApiCategory[];
  income: ApiCategory[];
  loading: boolean;
  refresh: () => Promise<void>;
  create: (input: { name: string; type: 'income' | 'expense'; bucket?: Bucket | null; icon?: string }) => Promise<ApiCategory>;
  update: (id: string, patch: CategoryPatch) => Promise<{ category: ApiCategory; moved: number }>;
  remove: (id: string) => Promise<void>;
  find: (name?: string | null, type?: 'income' | 'expense') => ApiCategory | undefined;
};

const sortVisible = (items: ApiCategory[], type: 'income' | 'expense') =>
  items
    .filter((c) => c.type === type && !c.hidden)
    .sort((a, b) => {
      const ab = a.bucket ? BUCKETS.indexOf(a.bucket) : 9;
      const bb = b.bucket ? BUCKETS.indexOf(b.bucket) : 9;
      return ab - bb || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
    });

function buildState(items: ApiCategory[], rest: Omit<CategoriesState, 'all' | 'expense' | 'income' | 'find'>): CategoriesState {
  const byName = new Map(items.map((c) => [`${c.type}:${c.name.toLowerCase()}`, c]));
  return {
    all: items,
    expense: sortVisible(items, 'expense'),
    income: sortVisible(items, 'income'),
    find: (name, type) => {
      const n = String(name ?? '').trim().toLowerCase();
      if (!n) return undefined;
      return type ? byName.get(`${type}:${n}`) : byName.get(`expense:${n}`) ?? byName.get(`income:${n}`);
    },
    ...rest
  };
}

const noop = async () => {
  throw new Error('Categories are not available here');
};

const CategoriesContext = createContext<CategoriesState>(
  buildState(defaultCategories('personal'), { loading: false, refresh: async () => undefined, create: noop, update: noop, remove: noop })
);

export function useCategories() {
  return useContext(CategoriesContext);
}

/** Loads the signed-in person's categories for the active space, cached on the phone for offline use. */
export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const space = spacesEnabled ? activeSpaceId : 'personal';
  const { acting } = useActing();
  // Someone else's categories while helping them, kept apart from your own.
  const cacheKey = user ? `bf_categories_v1:${acting?.ownerId ?? user.id}:${space}` : null;
  const [items, setItems] = useState<ApiCategory[]>(() => defaultCategories(space));
  const [loading, setLoading] = useState(false);

  const save = useCallback(
    (next: ApiCategory[]) => {
      setItems(next);
      if (cacheKey) AsyncStorage.setItem(cacheKey, JSON.stringify(next)).catch(() => undefined);
    },
    [cacheKey]
  );

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const fresh = await listCategories(space);
      if (fresh.length) save(fresh);
    } catch {
      // Offline or signed out: keep what we have.
    } finally {
      setLoading(false);
    }
  }, [save, space, user]);

  useEffect(() => {
    let cancelled = false;
    setItems(defaultCategories(space));
    if (!cacheKey) return;
    AsyncStorage.getItem(cacheKey)
      .then((raw) => {
        if (!cancelled && raw) setItems(JSON.parse(raw));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) void refresh();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, space]);

  const create = useCallback<CategoriesState['create']>(
    async (input) => {
      const created = await createCategory({ ...input, spaceId: space });
      save([...items.filter((c) => !c.id.startsWith('default:')), created]);
      void refresh();
      return created;
    },
    [items, refresh, save, space]
  );

  const update = useCallback<CategoriesState['update']>(
    async (id, patch) => {
      const result = await updateCategory(id, patch);
      save(items.map((c) => (c.id === id ? result.category : c)));
      return result;
    },
    [items, save]
  );

  const remove = useCallback<CategoriesState['remove']>(
    async (id) => {
      await deleteCategory(id);
      save(items.filter((c) => c.id !== id));
    },
    [items, save]
  );

  const value = useMemo(() => buildState(items, { loading, refresh, create, update, remove }), [create, items, loading, refresh, remove, update]);
  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}
