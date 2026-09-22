import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Where the sign-in session lives: the phone's keystore (Keychain on iOS, Keystore-backed storage on Android)
 * rather than plain app storage.
 *
 * The session holds a refresh token, which keeps somebody signed in for weeks. In plain storage it can be read
 * off a rooted phone or pulled out of a backup and used from anywhere. In the keystore it is encrypted and,
 * with THIS_DEVICE_ONLY, never leaves the phone, not even in an iCloud or Google backup.
 *
 * The keystore dislikes values over about 2 KB and a session is often bigger, so it is stored in pieces with
 * a count written last. A session already sitting in plain storage from an older version is moved across on
 * first read and then deleted, so nobody is signed out by the upgrade.
 */

const CHUNK = 1800;
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

/** The keystore only accepts letters, digits, dots, dashes and underscores in a key. */
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');
const countKey = (key: string) => `${safe(key)}.n`;
const partKey = (key: string, i: number) => `${safe(key)}.${i}`;

async function readParts(key: string): Promise<string | null> {
  const n = Number(await SecureStore.getItemAsync(countKey(key), OPTIONS));
  if (!n) return null;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const part = await SecureStore.getItemAsync(partKey(key, i), OPTIONS);
    // A missing piece means a write was interrupted. A partial session is worse than none.
    if (part == null) return null;
    parts.push(part);
  }
  return parts.join('');
}

async function removeParts(key: string): Promise<void> {
  const n = Number(await SecureStore.getItemAsync(countKey(key), OPTIONS)) || 0;
  await SecureStore.deleteItemAsync(countKey(key), OPTIONS).catch(() => undefined);
  for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(partKey(key, i), OPTIONS).catch(() => undefined);
}

async function writeParts(key: string, value: string): Promise<void> {
  const pieces: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK) pieces.push(value.slice(i, i + CHUNK));
  const before = Number(await SecureStore.getItemAsync(countKey(key), OPTIONS)) || 0;
  for (let i = 0; i < pieces.length; i++) await SecureStore.setItemAsync(partKey(key, i), pieces[i], OPTIONS);
  // The count goes last, so a reader never stitches together a half-written session.
  await SecureStore.setItemAsync(countKey(key), String(pieces.length), OPTIONS);
  for (let i = pieces.length; i < before; i++) await SecureStore.deleteItemAsync(partKey(key, i), OPTIONS).catch(() => undefined);
}

export const secureSessionStorage =
  Platform.OS === 'web'
    ? AsyncStorage
    : {
        async getItem(key: string): Promise<string | null> {
          const stored = await readParts(key);
          if (stored != null) return stored;
          const legacy = await AsyncStorage.getItem(key);
          if (legacy != null) {
            await writeParts(key, legacy);
            await AsyncStorage.removeItem(key);
          }
          return legacy;
        },
        async setItem(key: string, value: string): Promise<void> {
          await writeParts(key, value);
        },
        async removeItem(key: string): Promise<void> {
          await removeParts(key);
          await AsyncStorage.removeItem(key).catch(() => undefined);
        }
      };
