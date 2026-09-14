import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Device from 'expo-device';
import { unregisterPushToken } from '../api/features';
import { getRememberedPushToken, rememberPushToken } from '../lib/notifications';
import { clearWidgetSnapshot } from '../lib/widgetData';
import {
  clearTokens,
  getBiometricEnabled,
  getBiometricPrompted,
  getLastUser,
  getTokens,
  setBiometricEnabled as storeBiometricEnabled,
  setBiometricPrompted,
  setLastUser,
  setTokens,
  type LastUser
} from '../api/storage';
import {
  forgotPassword as apiForgotPassword,
  getMe,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  resetPassword as apiResetPassword,
  type ApiUser,
  type AuthResponse
} from '../api/endpoints';

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

const AuthContext = createContext<AuthState | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Shown in the signed-in devices list, e.g. "iPhone 15" or "Pixel 8". */
function deviceLabel(): string {
  return Device.modelName || (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
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
    const tokens = await getTokens();
    if (!tokens) {
      setUser(null);
      return false;
    }
    try {
      const me = await getMe();
      setUser(me);
      void rememberUser(me);
      return true;
    } catch {
      await clearTokens();
      setUser(null);
      return false;
    }
  }, [rememberUser]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const [support, enabled, lu, tokens] = await Promise.all([readBiometricSupport(), getBiometricEnabled(), getLastUser(), getTokens()]);
      const bioOn = enabled && support.available;
      setBiometric({ ...support, enabled: bioOn });
      setLastUserState(lu);
      if (tokens && bioOn) {
        setIsLocked(true);
      } else {
        await refreshUser();
      }
      setIsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const finishAuth = useCallback(
    async (res: AuthResponse) => {
      await setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
      setUser(res.user);
      setIsLocked(false);
      void rememberUser(res.user);
      void offerBiometrics();
    },
    [offerBiometrics, rememberUser]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const previous = await getTokens();
      const res = await apiLogin(email, password, deviceLabel());
      // Signing in with a password while locked replaces the saved session; revoke the old one.
      if (previous?.refreshToken && previous.refreshToken !== res.refreshToken) {
        apiLogout(previous.refreshToken).catch(() => undefined);
      }
      await finishAuth(res);
    },
    [finishAuth]
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const res = await apiRegister(email, password, name);
      await finishAuth(res);
    },
    [finishAuth]
  );

  const logout = useCallback(async () => {
    const tokens = await getTokens();
    // Stop push notifications for this account on this phone.
    const pushToken = await getRememberedPushToken().catch(() => null);
    if (pushToken && tokens) {
      await unregisterPushToken(pushToken).catch(() => undefined);
      await rememberPushToken(null).catch(() => undefined);
    }
    if (tokens?.refreshToken) {
      try {
        await apiLogout(tokens.refreshToken);
      } catch {
        // ignore
      }
    }
    await clearTokens();
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
    const res = await apiForgotPassword(email.trim().toLowerCase());
    return { devCode: res.devCode };
  }, []);

  const resetPassword = useCallback(
    async (email: string, code: string, newPassword: string) => {
      const res = await apiResetPassword(email.trim().toLowerCase(), code, newPassword, deviceLabel());
      await finishAuth(res);
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
