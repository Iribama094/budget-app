import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { revokeSession, unregisterPushToken } from '../api/features';
import { getRememberedPushToken, rememberPushToken } from '../lib/notifications';
import { clearWidgetSnapshot } from '../lib/widgetData';
import { friendlyAuthError, sessionIdOf, supabase } from '../lib/supabase';
import { SUPABASE_URL } from '../config';
import {
  getBiometricEnabled,
  getBiometricPrompted,
  getLastUser,
  setBiometricEnabled as storeBiometricEnabled,
  setBiometricPrompted,
  setLastUser,
  type LastUser
} from '../api/storage';
import { forgotPassword, getMe, type ApiUser } from '../api/endpoints';

export type BiometricInfo = {
  /** Device has biometric hardware with at least one enrolled face or finger. */
  available: boolean;
  /** User turned on biometric sign-in in this app. */
  enabled: boolean;
  kind: 'face' | 'fingerprint' | 'generic';
  /** Human label: Face ID, Touch ID, Fingerprint, Biometrics. */
  label: string;
};

export type UnlockResult = 'unlocked' | 'cancelled' | 'failed' | 'expired';

type AuthState = {
  user: ApiUser | null;
  isLoading: boolean;
  /** A saved session exists but is waiting for biometric (or password) unlock. */
  isLocked: boolean;
  lastUser: LastUser | null;
  biometric: BiometricInfo;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<boolean>;
  unlockWithBiometrics: () => Promise<UnlockResult>;
  setBiometricEnabled: (enabled: boolean) => Promise<boolean>;
  requestPasswordReset: (email: string) => Promise<{ devCode?: string }>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
};

// Re-lock after the app has been in the background this long.
const LOCK_AFTER_MS = 5 * 60 * 1000;

// Where supabase-js keeps the session (sb-<project ref>-auth-token).
const SESSION_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

const AuthContext = createContext<AuthState | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

async function readBiometricSupport(): Promise<Omit<BiometricInfo, 'enabled'>> {
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync()
    ]);
    const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
    const ios = Platform.OS === 'ios';
    return {
      available: hasHardware && enrolled,
      kind: face ? 'face' : finger ? 'fingerprint' : 'generic',
      label: face ? (ios ? 'Face ID' : 'Face unlock') : finger ? (ios ? 'Touch ID' : 'Fingerprint') : 'Biometrics'
    };
  } catch {
    return { available: false, kind: 'generic', label: 'Biometrics' };
  }
}

async function currentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [lastUser, setLastUserState] = useState<LastUser | null>(null);
  const [biometric, setBiometric] = useState<BiometricInfo>({ available: false, enabled: false, kind: 'face', label: 'Face ID' });

  const userRef = useRef(user);
  const biometricRef = useRef(biometric);
  userRef.current = user;
  biometricRef.current = biometric;
  const backgroundedAt = useRef<number | null>(null);

  const rememberUser = useCallback(async (u: ApiUser) => {
    const lu = { email: u.email, name: u.name ?? null };
    setLastUserState(lu);
    try {
      await setLastUser(lu);
    } catch {
      // not critical
    }
  }, []);

  const refreshUser = useCallback(async (): Promise<boolean> => {
    if (!(await currentSession())) {
      setUser(null);
      return false;
    }
    try {
      const me = await getMe();
      setUser(me);
      void rememberUser(me);
      return true;
    } catch (e) {
      // A rejected session is gone for good; anything else (e.g. offline) keeps it for next time.
      if ((e as { status?: number })?.status === 401) await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      setUser(null);
      return false;
    }
  }, [rememberUser]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const [support, enabled, lu, session] = await Promise.all([readBiometricSupport(), getBiometricEnabled(), getLastUser(), currentSession()]);
      const bioOn = enabled && support.available;
      setBiometric({ ...support, enabled: bioOn });
      setLastUserState(lu);
      if (session && bioOn) {
        setIsLocked(true);
      } else {
        await refreshUser();
      }
      setIsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signed out elsewhere (e.g. this device was removed from another phone): return to sign-in.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsLocked(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Lock again when returning from a long background stint.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt.current = userRef.current ? Date.now() : null;
        return;
      }
      if (state === 'active' && backgroundedAt.current != null) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (away > LOCK_AFTER_MS && userRef.current && biometricRef.current.enabled) {
          setUser(null);
          setIsLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, []);

  const setBiometricEnabled = useCallback(async (enabled: boolean): Promise<boolean> => {
    if (!enabled) {
      await storeBiometricEnabled(false);
      setBiometric((b) => ({ ...b, enabled: false }));
      return true;
    }
    const support = await readBiometricSupport();
    if (!support.available) {
      Alert.alert('Biometrics not set up', 'Add a face or fingerprint in your phone settings, then try again.');
      return false;
    }
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: `Turn on ${support.label}`, cancelLabel: 'Cancel' });
    if (!result.success) return false;
    await storeBiometricEnabled(true);
    setBiometric({ ...support, enabled: true });
    return true;
  }, []);

  const offerBiometrics = useCallback(async () => {
    try {
      const [support, enabled, prompted] = await Promise.all([readBiometricSupport(), getBiometricEnabled(), getBiometricPrompted()]);
      if (!support.available || enabled || prompted) return;
      await setBiometricPrompted();
      setTimeout(() => {
        Alert.alert(`Sign in with ${support.label}?`, `Next time, unlock BudgetFriendly with ${support.label} instead of typing your password.`, [
          { text: 'Not now', style: 'cancel' },
          { text: 'Turn on', onPress: () => void setBiometricEnabled(true) }
        ]);
      }, 700);
    } catch {
      // optional nicety
    }
  }, [setBiometricEnabled]);

  /** Loads the profile for a fresh session and opens the app. */
  const finishAuth = useCallback(async () => {
    const me = await getMe();
    setUser(me);
    setIsLocked(false);
    void rememberUser(me);
    void offerBiometrics();
  }, [offerBiometrics, rememberUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const previous = await currentSession();
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error || !data.session) throw friendlyAuthError(error, 'Could not sign in. Try again.');
      // Signing in with a password while locked replaces the saved session; sign the old one out.
      const oldId = sessionIdOf(previous?.access_token);
      if (oldId && oldId !== sessionIdOf(data.session.access_token)) revokeSession(oldId).catch(() => undefined);
      await finishAuth();
    },
    [finishAuth]
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: name ? { name } : {} }
      });
      if (error) throw friendlyAuthError(error, 'Could not create your account. Try again.');
      if (!data.session) throw new Error('Check your email to confirm your account, then sign in.');
      await finishAuth();
    },
    [finishAuth]
  );

  const logout = useCallback(async () => {
    // Stop push notifications for this account on this phone.
    const pushToken = await getRememberedPushToken().catch(() => null);
    if (pushToken) {
      await unregisterPushToken(pushToken).catch(() => undefined);
      await rememberPushToken(null).catch(() => undefined);
    }
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    // Offline: the server session expires on its own; make sure this phone forgets it now.
    if (error) await AsyncStorage.removeItem(SESSION_STORAGE_KEY).catch(() => undefined);
    // Don’t leave balances on the home screen after signing out.
    void clearWidgetSnapshot().catch(() => undefined);
    setUser(null);
    setIsLocked(false);
  }, []);

  const unlockWithBiometrics = useCallback(async (): Promise<UnlockResult> => {
    const label = biometricRef.current.label;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: `Unlock BudgetFriendly`,
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use password'
    });
    if (!result.success) {
      const cancelled = ['user_cancel', 'system_cancel', 'app_cancel', 'user_fallback'].includes(String((result as any).error));
      return cancelled ? 'cancelled' : 'failed';
    }
    const ok = await refreshUser();
    setIsLocked(false);
    if (!ok) console.info(`[auth] ${label} succeeded but the saved session has expired`);
    return ok ? 'unlocked' : 'expired';
  }, [refreshUser]);

  const requestPasswordReset = useCallback(async (email: string) => {
    const res = await forgotPassword(email.trim().toLowerCase());
    return { devCode: res.devCode };
  }, []);

  const resetPassword = useCallback(
    async (email: string, code: string, newPassword: string) => {
      const verified = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: 'recovery' });
      if (verified.error || !verified.data.session) throw friendlyAuthError(verified.error, 'That code isn’t right or has expired.');
      const updated = await supabase.auth.updateUser({ password: newPassword });
      if (updated.error) throw friendlyAuthError(updated.error, 'Could not set your new password. Try again.');
      await finishAuth();
    },
    [finishAuth]
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      isLoading,
      isLocked,
      lastUser,
      biometric,
      login,
      register,
      logout,
      refreshUser,
      unlockWithBiometrics,
      setBiometricEnabled,
      requestPasswordReset,
      resetPassword
    }),
    [user, isLoading, isLocked, lastUser, biometric, login, register, logout, refreshUser, unlockWithBiometrics, setBiometricEnabled, requestPasswordReset, resetPassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
