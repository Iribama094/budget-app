import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { readWidgetSnapshot, WIDGET_NAME } from '../lib/widgetData';
import { SafeToSpendWidget } from './SafeToSpendWidget';

/** Runs in the background when Android adds, resizes or refreshes the widget. */
export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === 'WIDGET_DELETED' || widgetInfo.widgetName !== WIDGET_NAME) return;
  const snapshot = await readWidgetSnapshot();
  renderWidget(<SafeToSpendWidget snapshot={snapshot} />);
}
