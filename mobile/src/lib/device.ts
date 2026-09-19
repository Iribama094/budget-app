import * as Device from 'expo-device';
import { Platform } from 'react-native';

/** Shown in the signed-in devices list, e.g. "iPhone 15" or "Pixel 8". */
export function deviceLabel(): string {
  return Device.modelName || (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
}

/** Sent with API requests so the devices list can name this phone. Header values must be plain ASCII. */
export function deviceHeaders(): Record<string, string> {
  return {
    'x-device-name': deviceLabel().replace(/[^\x20-\x7E]/g, '').slice(0, 100) || 'Phone',
    'x-device-platform': Platform.OS
  };
}
