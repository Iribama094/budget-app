import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { apiFetch } from '../api/client';
import { errorMessage } from './errorMessage';

const KEY = 'bf_offline_tx_queue_v1';

export type TransactionPayload = {
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description?: string;
  occurredAt: string;
  budgetId?: string;
  budgetCategory?: string;
  miniBudget?: string;
  spaceId?: 'personal' | 'business';
  /** VAT inside a business cost, claimed back against VAT charged on sales. */
  vatAmount?: number;
  /** Money that arrived in another currency; amount is what it came to at this rate. */
  fx?: { currency: string; amount: number; rate: number };
};

export type QueuedTransaction = {
  clientId: string;
  payload: TransactionPayload;
  queuedAt: string;
  attempts: number;
  /** Set when the server rejected it (not a connection problem). */
  lastError?: string | null;
};

export type AutoSaved = { goalId: string; name: string; amount: number };

export type FlushResult = { synced: number; rejected: number; remaining: number; autoSaved: AutoSaved[] };

export function newClientId(): string {
  return Crypto.randomUUID();
}

/** True when the request never reached the server, so retrying later makes sense. */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /network request failed|failed to fetch|network error|timed out|timeout|unauthorized|invalid or expired token|request failed \(5\d\d\)/i.test(msg);
}

export async function readQueue(): Promise<QueuedTransaction[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedTransaction[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

export async function enqueueTransaction(payload: TransactionPayload, clientId = newClientId()): Promise<QueuedTransaction> {
  const item: QueuedTransaction = { clientId, payload, queuedAt: new Date().toISOString(), attempts: 0, lastError: null };
  const q = await readQueue();
  if (!q.some((x) => x.clientId === clientId)) await writeQueue([...q, item]);
  return item;
}

export async function discardQueued(clientId: string): Promise<void> {
  const q = await readQueue();
  await writeQueue(q.filter((x) => x.clientId !== clientId));
}

export async function postTransaction(payload: TransactionPayload, clientId: string): Promise<{ transaction: any; autoSaved?: AutoSaved[]; duplicate?: boolean }> {
  return apiFetch('/v1/transactions', { method: 'POST', body: JSON.stringify({ ...payload, clientId }) });
}

let flushing: Promise<FlushResult> | null = null;

/**
 * Sends queued transactions in order. The server de-duplicates on clientId, so an item that
 * was saved but whose response was lost is safe to send again.
 */
export function flushQueue(): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    const snapshot = await readQueue();
    const keep: QueuedTransaction[] = [];
    const autoSaved: AutoSaved[] = [];
    let synced = 0;
    let rejected = 0;

    for (let i = 0; i < snapshot.length; i++) {
      const item = snapshot[i];
      try {
        const res = await postTransaction(item.payload, item.clientId);
        synced++;
        if (Array.isArray(res?.autoSaved)) autoSaved.push(...res.autoSaved);
      } catch (err) {
        if (isRetryableError(err)) {
          // Still offline (or signed out): keep this and everything after it for next time.
          keep.push(...snapshot.slice(i));
          break;
        }
        rejected++;
        keep.push({ ...item, attempts: item.attempts + 1, lastError: errorMessage(err, 'The server rejected this transaction') });
      }
    }

    // Keep anything queued while we were flushing.
    const latest = await readQueue();
    const seen = new Set(snapshot.map((x) => x.clientId));
    await writeQueue([...keep, ...latest.filter((x) => !seen.has(x.clientId))]);
    return { synced, rejected, remaining: keep.length, autoSaved };
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
