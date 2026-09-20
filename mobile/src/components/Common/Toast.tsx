import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import { Animated, View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import type { Theme } from '../../theme/theme';
import { fonts } from '../../theme/typography';

type ToastType = 'success' | 'error' | 'info';
type ToastAction = { label: string; onPress: () => void };
type Toast = { id: number; message: string; type?: ToastType; action?: ToastAction };

type ToastContextType = {
  show: (message: string, type?: ToastType, duration?: number, action?: ToastAction) => void;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (message: string, type: ToastType = 'info', duration?: number, action?: ToastAction) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, message, type, action }]);
      setTimeout(() => dismiss(id), duration ?? (action ? 5000 : 3000));
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    // Top of the screen, where phone notifications appear: clear of the thumb, the tab bar and the button just pressed.
    <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, zIndex: 9999 }}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} theme={theme} onDismiss={() => onDismiss(t.id)} />
      ))}
    </View>
  );
}

function ToastItem({ toast, theme, onDismiss }: { toast: Toast; theme: Theme; onDismiss: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [anim]);

  const dot = toast.type === 'error' ? '#F07565' : toast.type === 'success' ? '#45C28A' : '#8FD6C3';

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={{ transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }], opacity: anim, marginTop: 8 }}
    >
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss"><View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          borderRadius: 16,
          paddingVertical: 13,
          paddingHorizontal: 14,
          backgroundColor: theme.mode === 'dark' ? '#1E3531' : theme.colors.ink,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowOffset: { width: 0, height: 8 },
          shadowRadius: 16,
          elevation: 6
        }}
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
        <Text style={{ flex: 1, color: '#EAF4F1', fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 }}>{toast.message}</Text>
        {toast.action ? (
          <Pressable
            hitSlop={10}
            onPress={() => {
              toast.action?.onPress();
              onDismiss();
            }}
            accessibilityRole="button"
          >
            <Text style={{ color: '#E2B65C', fontFamily: fonts.semibold, fontSize: 14 }}>{toast.action.label}</Text>
          </Pressable>
        ) : null}
      </View></Pressable>
    </Animated.View>
  );
}
