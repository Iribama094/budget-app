import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setBusinessOwner } from '../api/client';
import { getTeam, joinTeam, type ApiTeam, type Membership, type TeamRole } from '../api/team';
import { useAuth } from './AuthContext';
import { useSpace } from './SpaceContext';

/**
 * Which business the Business space shows: your own, or one you're on the team of. The switcher at the top
 * still just says Personal / Business; this only changes whose business "Business" means. Chosen in Settings,
 * "Your businesses", which appears only when there is more than one to choose from.
 */
type TeamState = {
  team: ApiTeam | null;
  /** The business you're working in when it isn't your own; null means your own. */
  active: Membership | null;
  /** Your role there, or null in your own business. */
  role: TeamRole | null;
  /** The name of the business the Business space is showing. */
  businessName: string | null;
  /** More than one business to choose from (your own counts once it's in use). */
  canChoose: boolean;
  choose: (ownerId: string | null) => Promise<void>;
  join: (code: string) => Promise<Membership>;
  refresh: () => Promise<void>;
};

const TeamContext = createContext<TeamState>({
  team: null,
  active: null,
  role: null,
  businessName: null,
  canChoose: false,
  choose: async () => undefined,
  join: async () => {
    throw new Error('Not ready');
  },
  refresh: async () => undefined
});

export const useTeam = () => useContext(TeamContext);

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { activeSpaceId, setSpacesEnabled, setActiveSpaceId } = useSpace();
  const [team, setTeam] = useState<ApiTeam | null>(null);
  const [activeOwnerId, setActiveOwnerId] = useState<string | null>(null);
  const key = user ? `bf_active_business_v1:${user.id}` : null;

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      setTeam(await getTeam());
    } catch {
      // Offline or signed out: keep what we have.
    }
  }, [user]);

  useEffect(() => {
    setTeam(null);
    setActiveOwnerId(null);
    if (!key) return;
    AsyncStorage.getItem(key)
      .then((v) => setActiveOwnerId(v || null))
      .catch(() => undefined)
      .finally(() => void refresh());
  }, [key, refresh]);

  const memberships = team?.businesses ?? [];
  // Your saved choice if you're still on that team; with no business of your own, the first one you're in.
  const active = memberships.find((m) => m.ownerId === activeOwnerId) ?? (team && !team.own.active && memberships[0] ? memberships[0] : null);

  // Set before any screen asks the server for anything, so no request goes to the wrong business.
  setBusinessOwner(activeSpaceId === 'business' && active ? active.ownerId : null);

  const choose = useCallback(
    async (ownerId: string | null) => {
      setActiveOwnerId(ownerId);
      if (key) await AsyncStorage.setItem(key, ownerId ?? '').catch(() => undefined);
    },
    [key]
  );

  const join = useCallback(
    async (code: string) => {
      const res = await joinTeam(code);
      const fresh = await getTeam();
      setTeam(fresh);
      const m = fresh.businesses.find((b) => b.ownerId === res.ownerId) ?? { id: '', ownerId: res.ownerId, name: res.businessName, role: res.role, roleLabel: res.roleLabel };
      await choose(res.ownerId);
      // Straight into the business they joined.
      setSpacesEnabled(true);
      setActiveSpaceId('business');
      return m;
    },
    [choose, setActiveSpaceId, setSpacesEnabled]
  );

  const value = useMemo<TeamState>(
    () => ({
      team,
      active,
      role: active?.role ?? null,
      businessName: active ? active.name : team?.own.name ?? null,
      canChoose: memberships.length + (team?.own.active ? 1 : 0) > 1,
      choose,
      join,
      refresh
    }),
    [active, choose, join, memberships.length, refresh, team]
  );
  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}
