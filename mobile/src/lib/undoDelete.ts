import { useSyncExternalStore } from 'react';
import { errorMessage } from './errorMessage';

/**
 * Delete now, with a few seconds to change your mind. The item disappears straight away on every screen that
 * uses useHiddenIds; the real delete runs when the Undo toast times out. If it fails, the item comes back.
 */
export const UNDO_MS = 5000;

type ToastLike = {
  show: (message: string, type?: 'success' | 'error' | 'info', duration?: number, action?: { label: string; onPress: () => void }) => void;
};

const hidden = new Set<string>();
let snapshot: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

const emit = () => {
  snapshot = new Set(hidden);
  listeners.forEach((l) => l());
};

export function deleteWithUndo({ id, message, commit, toast }: { id: string; message: string; commit: () => Promise<unknown>; toast: ToastLike }): void {
  hidden.add(id);
  emit();
  let undone = false;
  const timer = setTimeout(() => {
    if (undone) return;
    commit().catch((e) => {
      hidden.delete(id);
      emit();
      toast.show(errorMessage(e, 'Could not delete that. It’s back in your list.'), 'error');
    });
  }, UNDO_MS);
  toast.show(message, 'info', UNDO_MS, {
    label: 'Undo',
    onPress: () => {
      undone = true;
      clearTimeout(timer);
      hidden.delete(id);
      emit();
    }
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Ids deleted (or waiting on Undo) that lists should leave out. */
export function useHiddenIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => snapshot);
}
