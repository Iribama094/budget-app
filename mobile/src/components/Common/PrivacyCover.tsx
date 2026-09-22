import React, { useEffect, useState } from 'react';
import { AppState, Image, StyleSheet, View } from 'react-native';

/**
 * Covers the app whenever it is not in front.
 *
 * The phone takes a picture of the app for the app switcher as it leaves the screen, and that picture shows
 * whatever was open: a balance, a salary, a statement. Anyone glancing at the switcher, or holding the phone
 * for a moment, sees it. This swaps the screen for the brand mark just before that picture is taken.
 */
export function PrivacyCover() {
  const [hidden, setHidden] = useState(AppState.currentState !== 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setHidden(state !== 'active'));
    return () => sub.remove();
  }, []);

  if (!hidden) return null;
  return (
    <View style={styles.cover} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={require('../../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { ...StyleSheet.absoluteFill, backgroundColor: '#0D2B26', alignItems: 'center', justifyContent: 'center', zIndex: 9999, elevation: 9999 },
  logo: { width: 88, height: 88 }
});
