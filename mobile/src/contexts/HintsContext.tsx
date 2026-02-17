import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';

export type HintKey = 'dashboard' | 'budget' | 'analytics' | 'goals';

type HintsState = Record<HintKey, boolean>;

type HintsContextValue = {
  seen: HintsState;
  markSeen: (key: HintKey) => void;
  resetAll: () => void;
};

const defaultState: HintsState = {
  dashboard: false,
  budget: false,
  analytics: false,
  goals: false
};

const HintsContext = createContext<HintsContextValue | undefined>(undefined);

const HINTS_KEY = 'bf_hints_v1';

export function HintsProvider({ children }: { children: ReactNode }) {
  const [seen, setSeen] = useState<HintsState>(defaultState);

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(HINTS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<HintsState>;
          setSeen((prev) => ({ ...prev, ...parsed }));
        }
      } catch {
        // ignore, fall back to defaults
      }
    })();
  }, []);

  const persist = async (next: HintsState) => {
    try {
      await SecureStore.setItemAsync(HINTS_KEY, JSON.stringify(next));
    } catch {
      // ignore persistence errors
    }
  };

  const markSeen = (key: HintKey) => {
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

  return (
    <HintsContext.Provider value={{ seen, markSeen, resetAll }}>
      {children}
    </HintsContext.Provider>
  );
}

export function useHints(): HintsContextValue {
  const ctx = useContext(HintsContext);
  if (!ctx) {
    throw new Error('useHints must be used within a HintsProvider');
  }
  return ctx;
}
