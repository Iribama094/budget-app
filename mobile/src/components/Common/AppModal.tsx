import React, { useEffect } from 'react';
import { Modal as RNModal, type ModalProps } from 'react-native';

/**
 * React Native's Modal, counting how many are open. The screen tips (GuideContext) wait while any sheet is up:
 * two full-screen layers opening over each other on an iPhone can freeze the app until it's reloaded.
 * Every sheet and picker in the app uses this instead of importing Modal from react-native.
 */
let open = 0;
export const anySheetOpen = () => open > 0;

export function Modal(props: ModalProps) {
  const visible = props.visible !== false;
  useEffect(() => {
    if (!visible) return;
    open += 1;
    return () => {
      open = Math.max(0, open - 1);
    };
  }, [visible]);
  return <RNModal {...props} />;
}
