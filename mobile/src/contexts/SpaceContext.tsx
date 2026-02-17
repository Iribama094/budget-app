import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export type SpaceId = 'personal' | 'business';

export type Space = {
  id: SpaceId;
  name: string;
};

type SpaceState = {
  isHydrated: boolean;
  spacesEnabled: boolean;
  spaces: Space[];
  activeSpaceId: SpaceId;
  setSpacesEnabled: (enabled: boolean) => void;
  setActiveSpaceId: (spaceId: SpaceId) => void;
  activeSpace: Space;
};

const SPACES_ENABLED_KEY = 'bf_spaces_enabled_v1';
const ACTIVE_SPACE_KEY = 'bf_active_space_v1';

const DEFAULT_SPACES: Space[] = [
  { id: 'personal', name: 'Personal' },
  { id: 'business', name: 'Business' }
];

const SpaceContext = createContext<SpaceState | undefined>(undefined);

export function useSpace() {
  const ctx = useContext(SpaceContext);
  if (!ctx) throw new Error('useSpace must be used within SpaceProvider');
  return ctx;
}

export function SpaceProvider({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [spacesEnabled, setSpacesEnabledState] = useState(false);
  const [activeSpaceId, setActiveSpaceIdState] = useState<SpaceId>('personal');

  useEffect(() => {
    (async () => {
      try {
        const enabledRaw = await SecureStore.getItemAsync(SPACES_ENABLED_KEY);
        const enabled = enabledRaw === '1';
        const activeRaw = (await SecureStore.getItemAsync(ACTIVE_SPACE_KEY)) as SpaceId | null;
        const active = activeRaw === 'business' ? 'business' : 'personal';

        setSpacesEnabledState(enabled);
        setActiveSpaceIdState(active);
      } catch {
        // ignore; defaults are fine
      } finally {
        setIsHydrated(true);
      }
    })();
  }, []);

  const setSpacesEnabled = (enabled: boolean) => {
    setSpacesEnabledState(enabled);
    void SecureStore.setItemAsync(SPACES_ENABLED_KEY, enabled ? '1' : '0');

    // When turning spaces off, always fall back to Personal to avoid "missing" data.
    if (!enabled) {
      setActiveSpaceIdState('personal');
      void SecureStore.setItemAsync(ACTIVE_SPACE_KEY, 'personal');
    }
  };

  const setActiveSpaceId = (spaceId: SpaceId) => {
    setActiveSpaceIdState(spaceId);
    void SecureStore.setItemAsync(ACTIVE_SPACE_KEY, spaceId);
  };

  const activeSpace = useMemo(() => {
    return DEFAULT_SPACES.find((s) => s.id === activeSpaceId) ?? DEFAULT_SPACES[0];
  }, [activeSpaceId]);

  const value = useMemo<SpaceState>(
    () => ({
      isHydrated,
      spacesEnabled,
      spaces: DEFAULT_SPACES,
      activeSpaceId,
      setSpacesEnabled,
      setActiveSpaceId,
      activeSpace
    }),
    [isHydrated, spacesEnabled, activeSpaceId, activeSpace]
  );

  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}
