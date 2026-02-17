import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';

export type NudgeKey = 'dashboard.addTx' | 'budget.create' | 'analytics.timeframe' | 'goals.add' | 'space.switcher';

type NudgesState = Record<NudgeKey, boolean>;

type NudgesContextValue = {
  seen: NudgesState;
  markSeen: (key: NudgeKey) => void;
  resetAll: () => void;
};

const defaultState: NudgesState = {
  'dashboard.addTx': false,
  'budget.create': false,
  'analytics.timeframe': false,
  'goals.add': false,
  'space.switcher': false
};

const NudgesContext = createContext<NudgesContextValue | undefined>(undefined);

const NUDGES_KEY = 'bf_nudges_v1';

export function NudgesProvider({ children }: { children: ReactNode }) {
  const [seen, setSeen] = useState<NudgesState>(defaultState);

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(NUDGES_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<NudgesState>;
          setSeen((prev) => ({ ...prev, ...parsed }));
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const persist = async (next: NudgesState) => {
    try {
      await SecureStore.setItemAsync(NUDGES_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const markSeen = (key: NudgeKey) => {
    setSeen((prev) => {
      if (prev[key]) return prev;
      const next = { ...prev, [key]: true };
      void persist(next);
      return next;
    });
  };

  const resetAll = () => {
    setSeen(defaultState);
    void persist(defaultState);
  };

  return <NudgesContext.Provider value={{ seen, markSeen, resetAll }}>{children}</NudgesContext.Provider>;
}

export function useNudges(): NudgesContextValue {
  const ctx = useContext(NudgesContext);
  if (!ctx) throw new Error('useNudges must be used within a NudgesProvider');
  return ctx;
}
