import React from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Must match the Android widget `name` in app.json and the iOS widget `kind` in targets/widget/index.swift. */
export const WIDGET_NAME = 'SafeToSpend';
/** Must match ios.entitlements App Group in app.json. */
export const APP_GROUP = 'group.com.budgetfriendly.app';

const KEY = 'bf_widget_snapshot_v1';

export type WidgetSnapshot = {
  status: 'onPace' | 'hot' | 'over' | 'none';
  /** Pre-formatted, e.g. "₦14,640", or "••••" when amounts are hidden. */
  safeToday: string;
  left: string;
  daysLeft: number;
  label: string;
  updatedAt: string;
};

export const EMPTY_SNAPSHOT: WidgetSnapshot = { status: 'none', safeToday: '', left: '', daysLeft: 0, label: '', updatedAt: '' };

export async function readWidgetSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WidgetSnapshot) : null;
  } catch {
    return null;
  }
}

/**
 * Shares Home's numbers with the home-screen widgets. Widgets need a development or store build;
 * in Expo Go the native calls fail quietly.
 */
export async function publishWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  const { updatedAt: _ignored, ...comparable } = snapshot;
  const previous = await readWidgetSnapshot();
  if (previous) {
    const { updatedAt: _prev, ...prevComparable } = previous;
    if (JSON.stringify(prevComparable) === JSON.stringify(comparable)) return;
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(snapshot));

  if (Platform.OS === 'android') {
    try {
      const { requestWidgetUpdate } = require('react-native-android-widget');
      const { SafeToSpendWidget } = require('../widgets/SafeToSpendWidget');
      await requestWidgetUpdate({
        widgetName: WIDGET_NAME,
        renderWidget: () => React.createElement(SafeToSpendWidget, { snapshot })
      });
    } catch {
      // no widget support in this build
    }
  }

  if (Platform.OS === 'ios') {
    try {
      const { ExtensionStorage } = require('@bacons/apple-targets');
      const storage = new ExtensionStorage(APP_GROUP);
      storage.set('safeToSpend', {
        status: snapshot.status,
        safeToday: snapshot.safeToday,
        left: snapshot.left,
        daysLeft: snapshot.daysLeft,
        label: snapshot.label,
        updatedAt: snapshot.updatedAt
      });
      ExtensionStorage.reloadWidget(WIDGET_NAME);
    } catch {
      // no widget support in this build
    }
  }
}

export async function clearWidgetSnapshot(): Promise<void> {
  await publishWidgetSnapshot({ ...EMPTY_SNAPSHOT, updatedAt: new Date().toISOString() });
}
