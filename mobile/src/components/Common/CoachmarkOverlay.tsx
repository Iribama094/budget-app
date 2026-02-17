import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { tokens } from '../../theme/tokens';

type Rect = { x: number; y: number; width: number; height: number };

export type CoachmarkOverlayProps = {
  visible: boolean;
  targetRef?: React.RefObject<any> | null;
  title: string;
  body: string;
  stepLabel?: string;
  primaryLabel?: string;
  skipLabel?: string;
  backLabel?: string;
  showBack?: boolean;
  onPrimary?: () => void;
  onSkip?: () => void;
  onBack?: () => void;
  onRequestClose?: () => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function CoachmarkOverlay({
  visible,
  targetRef,
  title,
  body,
  stepLabel,
  primaryLabel = 'Next',
  skipLabel = 'Skip',
  backLabel = 'Back',
  showBack = false,
  onPrimary,
  onSkip,
  onBack,
  onRequestClose
}: CoachmarkOverlayProps) {
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

    // Try a few times: first render, then after layout settles.
    measure();
    const t1 = setTimeout(measure, 80);
    const t2 = setTimeout(measure, 220);

    return () => {
      alive = false;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [visible, targetRef, title, body]);

  const spotlight = useMemo(() => {
    if (!rect) return null;

    const pad = 10;
    const x = Math.max(0, rect.x - pad);
    const y = Math.max(0, rect.y - pad);
    const width = rect.width + pad * 2;
    const height = rect.height + pad * 2;

    return { x, y, width, height, radius: 18 };
  }, [rect]);

  const placement = useMemo<'below' | 'above' | 'floating'>(() => {
    // Default: bottom sheet-ish, but still anchored if we have a target.
    if (!spotlight) {
      return 'floating';
    }

    const preferredTop = spotlight.y + spotlight.height + 12;
    const preferredBottom = spotlight.y - 12;

    // Heuristic: if there isn't enough space below, render above.
    const renderAbove = preferredTop > 520 && preferredBottom > 120;
    return renderAbove ? 'above' : 'below';
  }, [spotlight, insets.top]);

  const bubbleStyle = useMemo((): ViewStyle => {
    const base: ViewStyle = {
      position: 'absolute',
      left: 14,
      right: 14,
      borderRadius: 20,
      padding: 14,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: '#000',
      shadowOpacity: 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12
    };

    if (placement === 'floating') {
      return {
        ...base,
        bottom: Math.max(14, 14 + insets.bottom + 80)
      };
    }

    if (!spotlight) {
      return {
        ...base,
        bottom: Math.max(14, 14 + insets.bottom + 80)
      };
    }

    const preferredTop = spotlight.y + spotlight.height + 12;
    const preferredBottom = spotlight.y - 12;

    if (placement === 'above') {
      return {
        ...base,
        top: clamp(preferredBottom - 168, 14 + insets.top, 680)
      };
    }

    return {
      ...base,
      top: clamp(preferredTop, 14 + insets.top, 680)
    };
  }, [placement, spotlight, theme.colors, insets.bottom, insets.top]);

  const arrow = useMemo(() => {
    if (!spotlight) return null;
    if (placement === 'floating') return null;

    const centerX = spotlight.x + spotlight.width / 2;
    const bubbleLeft = 14;
    const bubbleRight = windowWidth - 14;
    const arrowHalf = 10;
    const x = clamp(centerX, bubbleLeft + 18 + arrowHalf, bubbleRight - 18 - arrowHalf);

    return { x };
  }, [placement, spotlight, windowWidth]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onRequestClose}
    >
      <View style={{ flex: 1 }}>
        {/* Backdrop */}
        <Pressable
          onPress={onRequestClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }}
        />

        {/* Spotlight hole (approx using 4 overlays) */}
        {spotlight ? (
          <>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: spotlight.y, backgroundColor: 'rgba(0,0,0,0.55)' }} />
            <View style={{ position: 'absolute', left: 0, right: 0, top: spotlight.y + spotlight.height, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />
            <View style={{ position: 'absolute', left: 0, width: spotlight.x, top: spotlight.y, height: spotlight.height, backgroundColor: 'rgba(0,0,0,0.55)' }} />
            <View style={{ position: 'absolute', left: spotlight.x + spotlight.width, right: 0, top: spotlight.y, height: spotlight.height, backgroundColor: 'rgba(0,0,0,0.55)' }} />

            {/* Highlight ring */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: spotlight.x,
                top: spotlight.y,
                width: spotlight.width,
                height: spotlight.height,
                borderRadius: spotlight.radius,
                borderWidth: 2,
                borderColor: 'rgba(255,255,255,0.92)',
                shadowColor: theme.colors.primary,
                shadowOpacity: 0.28,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 10 }
              }}
            />
          </>
        ) : null}

        {/* Bubble */}
        <View style={bubbleStyle}>
          {arrow && placement === 'below' ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: -10,
                left: arrow.x - 10,
                width: 0,
                height: 0,
                borderLeftWidth: 10,
                borderRightWidth: 10,
                borderBottomWidth: 10,
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderBottomColor: theme.colors.surface
              }}
            />
          ) : null}

          {arrow && placement === 'above' ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                bottom: -10,
                left: arrow.x - 10,
                width: 0,
                height: 0,
                borderLeftWidth: 10,
                borderRightWidth: 10,
                borderTopWidth: 10,
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderTopColor: theme.colors.surface
              }}
            />
          ) : null}

          {stepLabel ? (
            <Text style={{ color: theme.colors.textMuted, fontWeight: '800', fontSize: 12, marginBottom: 6 }}>
              {stepLabel}
            </Text>
          ) : null}
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>{title}</Text>
          <Text style={{ color: theme.colors.textMuted, marginTop: 6, fontSize: 13, lineHeight: 19 }}>{body}</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {showBack ? (
                <Pressable
                  onPress={onBack}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    opacity: pressed ? 0.8 : 1
                  })}
                >
                  <Text style={{ color: theme.colors.textMuted, fontWeight: '900' }}>{backLabel}</Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={onSkip}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  opacity: pressed ? 0.8 : 1
                })}
              >
                <Text style={{ color: theme.colors.textMuted, fontWeight: '800' }}>{skipLabel}</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={onPrimary}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 999,
                backgroundColor: theme.colors.primary,
                opacity: pressed ? 0.92 : 1
              })}
            >
              <Text style={{ color: tokens.colors.white, fontWeight: '900' }}>{primaryLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
