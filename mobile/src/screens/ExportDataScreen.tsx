import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Download, FileText, Mail } from 'lucide-react-native';

import { Screen, H1, P, Card, PrimaryButton } from '../components/Common/ui';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';

export default function ExportDataScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const toast = useToast();

  const comingSoon = (label: string) => {
    toast.show(`${label} is coming soon.`, 'info', 3000);
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={() => nav.goBack()}
          style={({ pressed }) => [{
            width: 44,
            height: 44,
            borderRadius: 18,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.92 : 1
          }]}
        >
          <ArrowLeft color={theme.colors.text} size={20} />
        </Pressable>
        <View style={{ marginLeft: 12, flex: 1 }}>
          <H1 style={{ marginBottom: 0 }}>Data & exports</H1>
          <P style={{ marginTop: 4 }}>Download your data or request statements.</P>
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Export your data</Text>
          <P style={{ marginTop: 6 }}>Choose how you’d like to export your budgets and transactions.</P>

          <View style={{ marginTop: 12 }}>
            <PrimaryButton
              title="Export transactions as CSV"
              onPress={() => comingSoon('Exporting transactions as CSV')}
            />
            <View style={{ height: 10 }} />
            <PrimaryButton
              title="Export budget summary as PDF"
              onPress={() => comingSoon('Exporting budget summary as PDF')}
            />
          </View>
        </Card>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Request statements</Text>
          <P style={{ marginTop: 6 }}>Prefer a bank-style statement? Request one directly from here.</P>

          <View style={{ marginTop: 12 }}>
            <PrimaryButton
              title="Request monthly statement"
              onPress={() => comingSoon('Requesting monthly statement')}
            />
          </View>
        </Card>
      </View>
    </Screen>
  );
}
