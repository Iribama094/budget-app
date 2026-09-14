import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_KEY = 'bf_biometric_enabled_v1';
const BIOMETRIC_PROMPTED_KEY = 'bf_biometric_prompted_v1';
const LAST_USER_KEY = 'bf_last_user_v1';

export type LastUser = {
  email: string;
  name: string | null;
};

export async function getBiometricEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(BIOMETRIC_KEY)) === '1';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (enabled) await SecureStore.setItemAsync(BIOMETRIC_KEY, '1');
  else await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
}

export async function getBiometricPrompted(): Promise<boolean> {
  return (await SecureStore.getItemAsync(BIOMETRIC_PROMPTED_KEY)) === '1';
}

export async function setBiometricPrompted(): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_PROMPTED_KEY, '1');
}

export async function getLastUser(): Promise<LastUser | null> {
  try {
    const raw = await SecureStore.getItemAsync(LAST_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.email ? { email: String(parsed.email), name: parsed.name ?? null } : null;
  } catch {
    return null;
  }
}

export async function setLastUser(user: LastUser): Promise<void> {
  await SecureStore.setItemAsync(LAST_USER_KEY, JSON.stringify(user));
}
