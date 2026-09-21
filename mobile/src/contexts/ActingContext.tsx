import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setActingAs } from '../api/client';
import { useAuth } from './AuthContext';

/**
 * Helping someone with their money (item 16): while `acting` is set, every screen shows the owner's money and
 * the server allows only what their grant allows. Never saved to the phone: opening the app again always
 * starts in your own money.
 */
export type Acting = { ownerId: string; name: string; role: 'view' | 'record' };

type ActingState = { acting: Acting | null; start: (a: Acting) => void; stop: () => void };

const ActingContext = createContext<ActingState>({ acting: null, start: () => undefined, stop: () => undefined });

export const useActing = () => useContext(ActingContext);

export function ActingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [acting, setActing] = useState<Acting | null>(null);

  const start = useCallback((a: Acting) => {
    setActingAs(a.ownerId);
    setActing(a);
  }, []);
  const stop = useCallback(() => {
    setActingAs(null);
    setActing(null);
  }, []);

  // Signing out, or in as someone else, always ends it.
  useEffect(() => stop, [user?.id, stop]);

  const value = useMemo(() => ({ acting, start, stop }), [acting, start, stop]);
  return <ActingContext.Provider value={value}>{children}</ActingContext.Provider>;
}
