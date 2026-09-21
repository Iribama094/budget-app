import * as Haptics from 'expo-haptics';
import { isLite } from './lite';

/** A light buzz for small wins. Phones without haptics simply ignore it, and "Save data and battery" turns it off. */
export const haptic = {
  tap: () => void (isLite() ? undefined : Haptics.selectionAsync().catch(() => undefined)),
  success: () => void (isLite() ? undefined : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined))
};
