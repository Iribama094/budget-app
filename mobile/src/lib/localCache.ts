import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Small per-phone memory: the last Home numbers (so Home opens instantly instead of on a spinner), recent
 * entries and the logging streak. Everything lives under one prefix so logging out wipes it in one go.
 */
const PREFIX = 'bf_cache_v1:';

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown): void {
  AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)).catch(() => undefined);
}

/** Called on logout so the next person on this phone never sees someone else's numbers. */
export async function clearCaches(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(PREFIX));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch {
    // Nothing to clear is fine.
  }
}
