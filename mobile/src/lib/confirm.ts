import { Alert } from 'react-native';

import { afterSheetCloses } from './afterSheetCloses';

/**
 * Asks before something that cannot be undone: deleting, removing someone, logging out.
 *
 * Cancel is always first and is what a tap outside chooses, and the action carries the phone's warning colour,
 * which is what people already expect from the rest of the app.
 *
 * `fromSheet` is for a confirm that starts inside a sheet and then navigates or opens another sheet. The next
 * thing waits for the sheet to slide away first, because asking the phone to do both at once freezes it (see
 * lib/afterSheetCloses.ts).
 */
export function confirmDestructive(options: {
  title: string;
  body?: string;
  /** The word on the button that does it, for example "Delete", "Remove", "Log out". */
  action?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  fromSheet?: boolean;
}) {
  const { title, body, action = 'Delete', onConfirm, onCancel, fromSheet } = options;
  const go = fromSheet ? () => afterSheetCloses(onConfirm) : onConfirm;
  Alert.alert(title, body, [
    { text: 'Cancel', style: 'cancel', onPress: onCancel },
    { text: action, style: 'destructive', onPress: go }
  ]);
}
