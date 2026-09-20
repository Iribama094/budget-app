import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from './AuthContext';
import { getAppConfig, type AppConfig, type WrappedAvailability } from '../api/endpoints';
import { readCache, writeCache } from '../lib/localCache';

/**
 * What the staff console says this app should show. Asked for when the app opens, when it comes back to the
 * front, and every ten minutes, so switching a feature off reaches people within a minute without an app
 * update. The last answer is kept on the phone, so a cold start offline still behaves like last time.
 */
export type { WrappedAvailability };

type ConfigValue = {
  /** True while nothing is known yet: treat features as off rather than flashing them on screen. */
  loading: boolean;
  feature: (key: string) => boolean;
  /** Whether this space has a Wrapped to show today. Personal and business keep separate calendars. */
  wrappedFor: (space: 'personal' | 'business') => WrappedAvailability;
  refresh: () => void;
};

const OFF: WrappedAvailability = { available: false };

const ConfigContext = createContext<ConfigValue>({
  loading: true,
  feature: () => false,
  wrappedFor: () => OFF,
  refresh: () => undefined
});

export function useConfig() {
  return useContext(ConfigContext);
}

/** One line for the common case: is this part of the app switched on for me. */
export function useFeature(key: string): boolean {
  return useConfig().feature(key);
}

const REFRESH_MS = 10 * 60 * 1000;

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedAt = useRef(0);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const next = await getAppConfig();
      fetchedAt.current = Date.now();
      setConfig(next);
      writeCache(`config:${userId}`, next);
    } catch {
      // Offline, or the server is having a moment. Whatever we last knew stays in force.
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Start from the last answer so the first screen does not flicker, then check with the server.
  useEffect(() => {
    let cancelled = false;
    setConfig(null);
    setLoading(true);
    if (!userId) {
      setLoading(false);
      return;
    }
    readCache<AppConfig>(`config:${userId}`)
      .then((cached) => {
        if (!cancelled && cached) setConfig(cached);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) void load();
      });
    return () => {
      cancelled = true;
    };
  }, [userId, load]);

  useEffect(() => {
    if (!userId) return;
    const timer = setInterval(() => void load(), REFRESH_MS);
    const sub = AppState.addEventListener('change', (state) => {
      // Coming back to the front is the moment worth re-checking; a quick switch away should not re-ask.
      if (state === 'active' && Date.now() - fetchedAt.current > 60_000) void load();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [userId, load]);

  const value = useMemo<ConfigValue>(() => {
    const features = config?.features ?? {};
    return {
      loading: loading && !config,
      // Unknown means off. A feature appearing late is better than one appearing where it should not.
      feature: (key: string) => features[key] === true,
      wrappedFor: (space) => config?.wrapped?.[space] ?? OFF,
      refresh: () => void load()
    };
  }, [config, loading, load]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}
