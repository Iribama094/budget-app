import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { CoachmarkOverlay } from '../components/Common/CoachmarkOverlay';
import { TourWelcomeModal } from '../components/Common/TourWelcomeModal';
import { navigationRef } from '../navigation/navigationRef';
import { useAuth } from './AuthContext';
import { useSpace } from './SpaceContext';
import { listBudgets, listGoals, listTransactions } from '../api/endpoints';

export type TourStep = {
  id: string;
  title: string;
  body: string;
  anchorId?: string;
  screen?: { name: string; params?: any };
  primaryLabel?: string;
  secondaryLabel?: string;
};

type TourContextValue = {
  startFirstRunTour: (opts?: { force?: boolean }) => void;
  isTourActive: boolean;
  resetTour: () => void;
  registerAnchor: (id: string, ref: React.RefObject<any>) => void;
  unregisterAnchor: (id: string) => void;
};

const TourContext = createContext<TourContextValue | undefined>(undefined);

const FIRST_RUN_TOUR_KEY = 'bf_tour_first_run_v2_done';

async function clearTourDoneFlag() {
  try {
    await SecureStore.deleteItemAsync(FIRST_RUN_TOUR_KEY);
  } catch {
    // ignore
  }
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { spacesEnabled, activeSpaceId } = useSpace();

  const anchors = useRef<Record<string, React.RefObject<any>>>({});
  const [anchorTick, setAnchorTick] = useState(0);
  const [active, setActive] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);

  const startedThisSession = useRef(false);

  const registerAnchor = useCallback((id: string, ref: React.RefObject<any>) => {
    anchors.current[id] = ref;
    setAnchorTick((v) => v + 1);
  }, []);

  const unregisterAnchor = useCallback((id: string) => {
    if (anchors.current[id]) delete anchors.current[id];
    setAnchorTick((v) => v + 1);
  }, []);

  const finish = useCallback(async () => {
    setActive(false);
    setWelcomeVisible(false);
    setSteps([]);
    setIndex(0);
    try {
      await SecureStore.setItemAsync(FIRST_RUN_TOUR_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  const skip = useCallback(() => {
    void finish();
  }, [finish]);

  const next = useCallback(() => {
    setIndex((prev) => {
      const n = prev + 1;
      if (n >= steps.length) {
        void finish();
        return prev;
      }
      return n;
    });
  }, [finish, steps.length]);

  const back = useCallback(() => {
    setIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const buildSteps = useCallback(
    (flags: { hasTransactions: boolean; hasBudgets: boolean; hasGoals: boolean; includeSpacesStep: boolean }) => {
      const s: TourStep[] = [];

      if (!flags.hasTransactions) {
        s.push({
          id: 'dashboard.addTx',
          title: 'Add your first transaction',
          body: 'Log spending manually (or after bank import). Everything else—budgets and insights—builds from your transactions.',
          anchorId: 'dashboard.addTx',
          screen: { name: 'Main', params: { screen: 'Dashboard' } },
          primaryLabel: 'Next'
        });
      }

      if (flags.includeSpacesStep) {
        s.push({
          id: 'space.switcher',
          title: 'Personal vs Business spaces',
          body: 'Switch spaces anytime. Budgets, transactions, analytics and bank imports stay separated per space.',
          anchorId: 'space.switcher',
          screen: { name: 'Main', params: { screen: 'Dashboard' } },
          primaryLabel: 'Next'
        });
      }

      if (!flags.hasBudgets) {
        s.push({
          id: 'budget.create',
          title: 'Create a budget that matches real life',
          body: 'Set a period, allocate categories, and track “spent vs remaining” automatically as you add transactions.',
          anchorId: 'budget.create',
          screen: { name: 'Main', params: { screen: 'Budget' } },
          primaryLabel: 'Next'
        });
      }

      // Analytics step is useful even if you already have data.
      s.push({
        id: 'analytics.timeframe',
        title: 'Explore trends, not guesswork',
        body: 'Switch between daily/weekly/monthly to spot noisy categories, spikes, and where your money actually goes.',
        anchorId: 'analytics.timeframe',
        screen: { name: 'Main', params: { screen: 'Analytics' } },
        primaryLabel: 'Next'
      });

      if (!flags.hasGoals) {
        s.push({
          id: 'goals.add',
          title: 'Turn budgets into progress',
          body: 'Create savings or payoff goals. We’ll help you see if your budget is realistic for the timeline you chose.',
          anchorId: 'goals.add',
          screen: { name: 'Main', params: { screen: 'Goals' } },
          primaryLabel: 'Done'
        });
      } else {
        // If they already have goals, end with a shorter wrap-up.
        s.push({
          id: 'goals.wrap',
          title: 'You’re set',
          body: 'That’s the core flow. If you want, connect a bank account next to import transactions and keep everything in sync.',
          anchorId: 'goals.add',
          screen: { name: 'Main', params: { screen: 'Goals' } },
          primaryLabel: 'Done'
        });
      }

      return s;
    },
    []
  );

  const startFirstRunTour = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!user) return;
      if (!opts?.force) {
        try {
          const done = await SecureStore.getItemAsync(FIRST_RUN_TOUR_KEY);
          if (done === '1') return;
        } catch {
          // ignore
        }
      }

      // Smart: look at existing data and skip irrelevant steps.
      let hasTransactions = false;
      let hasBudgets = false;
      let hasGoals = false;
      try {
        const [tx, b, g] = await Promise.all([
          listTransactions({ limit: 1, spaceId: spacesEnabled ? activeSpaceId : undefined }),
          listBudgets(spacesEnabled ? { spaceId: activeSpaceId } : undefined),
          listGoals(spacesEnabled ? { spaceId: activeSpaceId } : undefined)
        ]);
        hasTransactions = (tx?.items?.length ?? 0) > 0;
        hasBudgets = (b?.items?.length ?? 0) > 0;
        hasGoals = (g?.length ?? 0) > 0;
      } catch {
        // If checks fail, still run full flow.
      }

      const stepsToRun = buildSteps({
        hasTransactions,
        hasBudgets,
        hasGoals,
        includeSpacesStep: spacesEnabled
      });

      // If tour would be empty, mark as done.
      if (stepsToRun.length === 0) {
        void finish();
        return;
      }

      setSteps(stepsToRun);
      setIndex(0);
      if (opts?.force) setActive(true);
      else setWelcomeVisible(true);
    },
    [activeSpaceId, buildSteps, finish, spacesEnabled, user]
  );

  const resetTour = useCallback(() => {
    void clearTourDoneFlag();
    setActive(false);
    setWelcomeVisible(false);
    setSteps([]);
    setIndex(0);
    startedThisSession.current = false;
  }, []);

  // Auto-start on first login, once navigation is ready.
  useEffect(() => {
    if (!user) return;
    if (startedThisSession.current) return;

    let cancelled = false;
    const tryStart = async () => {
      try {
        const done = await SecureStore.getItemAsync(FIRST_RUN_TOUR_KEY);
        if (done === '1') return;
      } catch {
        // ignore
      }

      const interval = setInterval(() => {
        if (cancelled) return;
        if (!navigationRef.isReady()) return;
        clearInterval(interval);
        startedThisSession.current = true;
        void startFirstRunTour();
      }, 150);

      setTimeout(() => {
        // Safety: stop polling if we never become ready.
        clearInterval(interval);
      }, 6000);
    };

    void tryStart();

    return () => {
      cancelled = true;
    };
  }, [startFirstRunTour, user]);

  const current = steps[index];

  // Navigate to the right screen when step changes.
  useEffect(() => {
    if (!active) return;
    if (!current?.screen) return;
    if (!navigationRef.isReady()) return;

    try {
      (navigationRef as any).navigate(current.screen.name, current.screen.params);
    } catch {
      // ignore
    }
  }, [active, current]);

  const targetRef = useMemo(() => {
    if (!current?.anchorId) return null;
    return anchors.current[current.anchorId] ?? null;
  }, [current?.anchorId, anchorTick]);

  return (
    <TourContext.Provider value={{ startFirstRunTour: (o) => void startFirstRunTour(o), isTourActive: active, resetTour, registerAnchor, unregisterAnchor }}>
      {children}

      <TourWelcomeModal
        visible={welcomeVisible}
        onSkip={() => void finish()}
        onStart={() => {
          setWelcomeVisible(false);
          setActive(true);
        }}
      />

      <CoachmarkOverlay
        visible={active && !!current}
        targetRef={targetRef}
        title={current?.title ?? ''}
        body={current?.body ?? ''}
        stepLabel={current ? `Step ${index + 1} of ${steps.length}` : undefined}
        primaryLabel={current?.primaryLabel ?? (index + 1 === steps.length ? 'Done' : 'Next')}
        showBack={index > 0}
        backLabel="Back"
        skipLabel="Skip"
        onPrimary={() => {
          if (!current) return;
          if (index + 1 >= steps.length) void finish();
          else next();
        }}
        onBack={() => back()}
        onSkip={() => skip()}
        onRequestClose={skip}
      />
    </TourContext.Provider>
  );
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within a TourProvider');
  return ctx;
}

export function useTourAnchor(id: string) {
  const { registerAnchor, unregisterAnchor } = useTour();
  const ref = useRef<any>(null);

  useEffect(() => {
    registerAnchor(id, ref);
    return () => unregisterAnchor(id);
  }, [id, registerAnchor, unregisterAnchor]);

  return ref;
}
