import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigation } from '@react-navigation/native';

export default function AccountScreen() {
  const { theme } = useTheme();
  const nav = useNavigation<any>();

  useEffect(() => {
    // The list this screen used to show was replaced by Profile. It takes Profile's place in the stack rather
    // than sitting under it, so going back from Profile lands on whatever opened it, not on this blank screen.
    if (typeof nav.replace === 'function') nav.replace('Profile');
    else nav.navigate('Profile');
  }, [nav]);

  return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
}
