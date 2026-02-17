import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { tokens } from '../../theme/tokens';

type Rect = { x: number; y: number; width: number; height: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function NudgeTooltip({
  visible,
  targetRef,
  title,
  body,
  onDismiss,
  ctaLabel,
  onTargetPress
}: {
  visible: boolean;
  targetRef: React.RefObject<any> | null;
  title: string;
  body: string;
  onDismiss: () => void;
  ctaLabel?: string;
  onTargetPress?: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!visible) {
      setRect(null);
      return;
    }

    let alive = true;
    const measure = () => {
      const node: any = targetRef?.current;
      if (!node || typeof node.measureInWindow !== 'function') {
        if (alive) setRect(null);
        return;
      }
      node.measureInWindow((x: number, y: number, width: number, height: number) => {
        if (!alive) return;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
          setRect(null);
          return;
        }
        setRect({ x, y, width, height });
      });
    };

    measure();
    const t1 = setTimeout(measure, 120);
    const t2 = setTimeout(measure, 260);

    return () => {
      alive = false;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [visible, targetRef, title, body]);

  const bubble = useMemo(() => {
    if (!rect) {
      return {
        top: 120,
        left: 14,
        right: 14,
        arrowX: 40,
        placement: 'floating' as const
      };
    }

    const centerX = rect.x + rect.width / 2;
    const arrowX = clamp(centerX, 14 + 24, windowWidth - 14 - 24);

    const belowTop = rect.y + rect.height + 10;
    const aboveTop = rect.y - 10 - 140;

    const canShowAbove = aboveTop > 20 + insets.top;
    const placement = canShowAbove ? 'above' : 'below';
    const top = placement === 'above' ? aboveTop : belowTop;

    return {
      top: clamp(top, 14 + insets.top, 700),
      left: 14,
      right: 14,
      arrowX,
      placement
    };
  }, [rect, windowWidth, insets.top]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable onPress={onDismiss} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

      {/* Allow tapping the anchored target even while the modal is visible */}
      {rect && onTargetPress ? (
        <Pressable
          onPress={() => {
            onTargetPress();
            onDismiss();
          }}
          style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        />
      ) : null}

      <View
        style={{
          position: 'absolute',
          top: bubble.top,
          left: bubble.left,
          right: bubble.right
        }}
        pointerEvents="box-none"
      >
        {/* Arrow */}
        {bubble.placement !== 'floating' ? (
          <View
            pointerEvents="none"
            style={
              bubble.placement === 'below'
                ? {
                    position: 'absolute',
                    top: -10,
                    left: bubble.arrowX - 10,
                    width: 0,
                    height: 0,
                    borderLeftWidth: 10,
                    borderRightWidth: 10,
                    borderBottomWidth: 10,
                    borderLeftColor: 'transparent',
                    borderRightColor: 'transparent',
                    borderBottomColor: theme.colors.surface
                  }
                : {
                    position: 'absolute',
                    bottom: -10,
                    left: bubble.arrowX - 10,
                    width: 0,
                    height: 0,
                    borderLeftWidth: 10,
                    borderRightWidth: 10,
                    borderTopWidth: 10,
                    borderLeftColor: 'transparent',
                    borderRightColor: 'transparent',
                    borderTopColor: theme.colors.surface
                  }
            }
          />
        ) : null}

        <View
          style={{
            borderRadius: 18,
            padding: 12,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            shadowColor: '#000',
            shadowOpacity: 0.14,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 10 },
            elevation: 10
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{title}</Text>
          <Text style={{ color: theme.colors.textMuted, marginTop: 4, fontSize: 12, lineHeight: 17 }}>{body}</Text>

          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => ({
              alignSelf: 'flex-end',
              marginTop: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: theme.colors.primary,
              opacity: pressed ? 0.92 : 1
            })}
          >
            <Text style={{ color: tokens.colors.white, fontWeight: '900' }}>{ctaLabel ?? 'Got it'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
