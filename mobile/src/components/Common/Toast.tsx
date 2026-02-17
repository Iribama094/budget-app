import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import { Animated, View, Text, Pressable } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

type ToastType = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; type?: ToastType };

type ToastContextType = {
  show: (message: string, type?: ToastType, duration?: number) => void;
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

  const show = useCallback((message: string, type: ToastType = 'info', duration = 3000) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration);
  }, []);

  return <ToastContext.Provider value={{ show }}>{children}<ToastContainer toasts={toasts} /></ToastContext.Provider>;
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  const { theme } = useTheme();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 48, left: 12, right: 12, zIndex: 9999 }}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} theme={theme} />
      ))}
    </View>
  );
}

function ToastItem({ toast, theme }: { toast: Toast; theme: any }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 270, useNativeDriver: true }).start();
    return () => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    };
  }, [anim]);

  const bg = toast.type === 'error' ? theme.colors.error : toast.type === 'success' ? theme.colors.success : theme.colors.primary;

  return (
    <Animated.View style={{ transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }], opacity: anim, marginBottom: 8 }}>
      <View style={{ borderRadius: 12, padding: 12, backgroundColor: bg, shadowColor: '#000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12 }}>
        <Text style={{ color: '#fff', fontWeight: '800' }}>{toast.message}</Text>
      </View>
    </Animated.View>
  );
}
