import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * "Save data and battery", for cheap phones and scarce data: no buzzes, no background re-checks, and screens
 * skip their animations. Kept on this phone only, since it's about the phone, not the person.
 */
const KEY = 'bf_lite_v1';
let lite = false;
const listeners = new Set<(on: boolean) => void>();

void AsyncStorage.getItem(KEY)
  .then((v) => {
    lite = v === '1';
    listeners.forEach((l) => l(lite));
  })
  .catch(() => undefined);

export const isLite = () => lite;

export function setLite(on: boolean) {
  lite = on;
  listeners.forEach((l) => l(on));
  void AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => undefined);
}

export function onLiteChange(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
