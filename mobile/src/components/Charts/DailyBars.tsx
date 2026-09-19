import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { fonts } from '../../theme/typography';

export type DailyBar = { label: string; value: number };

function niceCeil(v: number) {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

export function compactNumber(v: number) {
  const abs = Math.abs(v);
  const fmt = (n: number, digits: number) => n.toFixed(digits).replace(/\.0$/, '');
  if (abs >= 1e6) return `${fmt(v / 1e6, abs >= 1e7 ? 0 : 1)}m`;
  if (abs >= 1e3) return `${fmt(v / 1e3, abs >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(v));
}

/**
 * Bars on one shared scale (every bar is drawn against the same maximum),
 * with an optional dashed reference line; bars above it are highlighted.
 */
export function DailyBars({
  bars,
  reference,
  referenceLabel,
  height = 164,
  hidden
}: {
  bars: DailyBar[];
  reference?: number | null;
  referenceLabel?: string;
  height?: number;
  hidden?: boolean;
}) {
  const { theme } = useTheme();
  const [width, setWidth] = useState(0);

  const axisW = 32;
  const top = 18;
  const bottom = 22;
  const plotH = height - top - bottom;
  const maxVal = Math.max(1, ...bars.map((b) => b.value), reference ?? 0);
  const scaleMax = niceCeil(maxVal * 1.08);
  const plotW = Math.max(0, width - axisW);
  const slot = bars.length ? plotW / bars.length : 0;
  const barW = Math.min(22, slot * 0.56);
  const y = (v: number) => top + plotH - (v / scaleMax) * plotH;
  const ticks = [0, scaleMax / 2, scaleMax];

  const peakIndex = bars.reduce((best, b, i) => (b.value > (bars[best]?.value ?? 0) ? i : best), 0);
  const peak = bars[peakIndex];
  const hasRef = reference != null && reference > 0;
  const showPeakLabel = !hidden && !!peak && peak.value > 0 && (!hasRef || Math.abs(y(peak.value) - y(reference!)) > 14 || peakIndex > 2);
  const overCount = hasRef ? bars.filter((b) => b.value > reference!).length : 0;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Daily spending chart, ${bars.length} days${hasRef ? `, ${overCount} above your daily safe-to-spend` : ''}`}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {ticks.map((t) => (
            <G key={t}>
              <Line x1={axisW} x2={width} y1={y(t)} y2={y(t)} stroke={theme.colors.border} strokeWidth={1} />
              <SvgText x={axisW - 6} y={y(t) + 3} fontSize={9} fill={theme.colors.textMuted} textAnchor="end" fontFamily={fonts.medium}>
                {hidden && t > 0 ? '' : compactNumber(t)}
              </SvgText>
            </G>
          ))}

          {bars.map((b, i) => {
            const h = b.value > 0 ? Math.max(2, (b.value / scaleMax) * plotH) : 0;
            const x = axisW + i * slot + (slot - barW) / 2;
            const over = hasRef && b.value > reference!;
            const isLast = i === bars.length - 1;
            return (
              <G key={`${b.label}-${i}`}>
                <Rect x={x} y={top + plotH - h} width={barW} height={h} rx={Math.min(5, barW / 2)} fill={over ? theme.colors.brass : theme.colors.primary} />
                <SvgText
                  x={x + barW / 2}
                  y={height - 6}
                  fontSize={10}
                  fill={isLast ? theme.colors.text : theme.colors.textMuted}
                  textAnchor="middle"
                  fontFamily={isLast ? fonts.bold : fonts.medium}
                >
                  {b.label}
                </SvgText>
              </G>
            );
          })}

          {hasRef ? (
            <G>
              <Line x1={axisW} x2={width} y1={y(reference!)} y2={y(reference!)} stroke={theme.colors.text} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="3 3" />
              {referenceLabel ? (
                <SvgText x={axisW + 4} y={y(reference!) - 5} fontSize={9} fill={theme.colors.text} fontFamily={fonts.semibold}>
                  {referenceLabel}
                </SvgText>
              ) : null}
            </G>
          ) : null}

          {showPeakLabel ? (
            <SvgText
              x={axisW + peakIndex * slot + slot / 2}
              y={y(peak.value) - 5}
              fontSize={10}
              fill={theme.colors.text}
              textAnchor="middle"
              fontFamily={fonts.display}
            >
              {compactNumber(peak.value)}
            </SvgText>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}
