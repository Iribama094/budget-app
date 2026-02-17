import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearTokens, getTokens, setTokens } from '../api/storage';
import { getMe, login as apiLogin, logout as apiLogout, register as apiRegister, type ApiUser } from '../api/endpoints';

type AuthState = {
  user: ApiUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    const tokens = await getTokens();
    if (!tokens) {
      setUser(null);
      return;
    }
    try {
      const me = await getMe();
      setUser(me);
    } catch {
      await clearTokens();
      setUser(null);
    }
  };

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await refreshUser();
      setIsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    await setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
    setUser(res.user);
  };

  const register = async (email: string, password: string, name?: string) => {
    const res = await apiRegister(email, password, name);
    await setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
    setUser(res.user);
  };

  const logout = async () => {
    const tokens = await getTokens();
    if (tokens?.refreshToken) {
      try {
        await apiLogout(tokens.refreshToken);
      } catch {
        // ignore
      }
    }
    await clearTokens();
    setUser(null);
  };

  const value = useMemo<AuthState>(() => ({ user, isLoading, login, register, logout, refreshUser }), [user, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
