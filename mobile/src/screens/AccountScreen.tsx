import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigation } from '@react-navigation/native';

export default function AccountScreen() {
  const { theme } = useTheme();
  const nav = useNavigation<any>();

  useEffect(() => {
    // Redirect to Profile directly — the list view was removed per design
    nav.navigate('Profile');
  }, [nav]);

  return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
}
