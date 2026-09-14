import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { useToast } from '../components/Common/Toast';
import { formatAmount } from '../components/Common/ui';
import { runRecurring } from '../api/features';
import {
  discardQueued,
  enqueueTransaction,
  flushQueue,
  isRetryableError,
  newClientId,
  postTransaction,
  readQueue,
  type AutoSaved,
  type QueuedTransaction,
  type TransactionPayload
} from '../lib/offlineQueue';
import { currencySymbol, toIsoDate } from '../utils/format';

type SaveResult = { status: 'saved' | 'queued'; autoSaved: AutoSaved[]; transaction?: any };

type SyncState = {
  isOnline: boolean;
  queued: QueuedTransaction[];
  /** Saves now when possible; otherwise keeps it on the phone and syncs when back online. */
  saveTransaction: (payload: TransactionPayload) => Promise<SaveResult>;
  flush: () => Promise<void>;
  discard: (clientId: string) => Promise<void>;
};

const RECURRING_RUN_KEY = 'bf_recurring_last_run_v1';

const SyncContext = createContext<SyncState | undefined>(undefined);

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  const [isOnline, setIsOnline] = useState(true);
  const [queued, setQueued] = useState<QueuedTransaction[]>([]);
  const onlineRef = useRef(true);
  const userId = user?.id ?? null;
  const glyph = currencySymbol(user?.currency);

  const refreshQueue = useCallback(async () => setQueued(await readQueue()), []);

  const announceAutoSaved = useCallback(
    (items: AutoSaved[]) => {
      if (!items.length) return;
      const total = items.reduce((s, x) => s + x.amount, 0);
      toast.show(items.length === 1 ? `${formatAmount(total, glyph)} added to ${items[0].name}` : `${formatAmount(total, glyph)} added to your goals`, 'success');
    },
    [glyph, toast]
  );

  const flush = useCallback(async () => {
    if (!userId) return;
    const pending = await readQueue();
    if (!pending.length) {
      setQueued([]);
      return;
    }
    const result = await flushQueue();
    await refreshQueue();
    if (result.synced) toast.show(`${result.synced} offline transaction${result.synced === 1 ? '' : 's'} synced`, 'success');
    if (result.rejected) toast.show(`${result.rejected} couldn’t be saved. Open Transactions to review.`, 'error');
    announceAutoSaved(result.autoSaved);
  }, [announceAutoSaved, refreshQueue, toast, userId]);

  // Record due recurring transactions once a day when the app opens (the server cron also does this).
  const runRecurringOncePerDay = useCallback(async () => {
    if (!userId) return;
    const today = toIsoDate(new Date());
    try {
      if ((await AsyncStorage.getItem(RECURRING_RUN_KEY)) === `${userId}:${today}`) return;
      const { created } = await runRecurring();
      await AsyncStorage.setItem(RECURRING_RUN_KEY, `${userId}:${today}`);
      if (created) toast.show(`${created} recurring transaction${created === 1 ? '' : 's'} recorded`, 'info');
    } catch {
      // try again next time the app opens
    }
  }, [toast, userId]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected !== false && state.isInternetReachable !== false;
      const cameBack = online && !onlineRef.current;
      onlineRef.current = online;
      setIsOnline(online);
      if (cameBack) void flush();
    });
    return unsubscribe;
  }, [flush]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void flush();
        void runRecurringOncePerDay();
      }
    });
    return () => sub.remove();
  }, [flush, runRecurringOncePerDay]);

  useEffect(() => {
    void refreshQueue();
    if (!userId) return;
    void flush();
    void runRecurringOncePerDay();
  }, [flush, refreshQueue, runRecurringOncePerDay, userId]);

  const saveTransaction = useCallback(
    async (payload: TransactionPayload): Promise<SaveResult> => {
      const clientId = newClientId();
      if (!onlineRef.current) {
        await enqueueTransaction(payload, clientId);
        await refreshQueue();
        return { status: 'queued', autoSaved: [] };
      }
      try {
        const res = await postTransaction(payload, clientId);
        const autoSaved = res?.autoSaved ?? [];
        announceAutoSaved(autoSaved);
        return { status: 'saved', autoSaved, transaction: res?.transaction };
      } catch (err) {
        if (!isRetryableError(err)) throw err;
        await enqueueTransaction(payload, clientId);
        await refreshQueue();
        return { status: 'queued', autoSaved: [] };
      }
    },
    [announceAutoSaved, refreshQueue]
  );

  const discard = useCallback(
    async (clientId: string) => {
      await discardQueued(clientId);
      await refreshQueue();
    },
    [refreshQueue]
  );

  const value = useMemo<SyncState>(() => ({ isOnline, queued, saveTransaction, flush, discard }), [discard, flush, isOnline, queued, saveTransaction]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
