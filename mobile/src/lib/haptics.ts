import * as Haptics from 'expo-haptics';

/** A light buzz for small wins. Phones without haptics simply ignore it. */
export const haptic = {
  tap: () => void Haptics.selectionAsync().catch(() => undefined),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined)
};
