import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetSnapshot } from '../lib/widgetData';

const INK = '#0D2B26';
const TEXT = '#EAF4F1';
const MUTED = '#A9C9C0';

const STATUS: Record<WidgetSnapshot['status'], { label: string; color: `#${string}` }> = {
  onPace: { label: 'On pace', color: '#8FD6C3' },
  hot: { label: 'Spending fast', color: '#E2B65C' },
  over: { label: 'Over budget', color: '#F07565' },
  none: { label: '', color: '#8FD6C3' }
};

/** Android home-screen widget: today's safe-to-spend and budget pace. Tapping opens the app. */
export function SafeToSpendWidget({ snapshot }: { snapshot: WidgetSnapshot | null }) {
  const status = snapshot?.status ?? 'none';
  const hasBudget = status !== 'none';

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: INK,
        borderRadius: 24,
        padding: 16
      }}
    >
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        <TextWidget text={hasBudget ? (status === 'over' ? 'OVER BUDGET BY' : 'SAFE TO SPEND TODAY') : 'BUDGETFRIENDLY'} style={{ fontSize: 11, color: MUTED }} />
        {hasBudget ? (
          <TextWidget text={snapshot!.safeToday} style={{ fontSize: 30, color: TEXT, fontWeight: '600', marginTop: 4 }} maxLines={1} />
        ) : (
          <TextWidget text="Set a budget to see what’s safe to spend each day." style={{ fontSize: 14, color: TEXT, marginTop: 6 }} maxLines={3} />
        )}
        {hasBudget ? (
          <TextWidget
            text={`${snapshot!.left} left · ${snapshot!.daysLeft} day${snapshot!.daysLeft === 1 ? '' : 's'} to go`}
            style={{ fontSize: 12, color: MUTED, marginTop: 2 }}
            maxLines={1}
          />
        ) : null}
      </FlexWidget>
      {hasBudget ? (
        <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent' }}>
          <TextWidget text={snapshot!.label} style={{ fontSize: 11, color: MUTED }} maxLines={1} />
          <TextWidget text={STATUS[status].label} style={{ fontSize: 12, color: STATUS[status].color, fontWeight: '600' }} />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}
