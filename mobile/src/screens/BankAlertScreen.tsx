import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { ClipboardPaste, Lock } from 'lucide-react-native';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Amount, Card, Chip, PrimaryButton, Screen, ScreenHeader, SecondaryButton } from '../components/Common/ui';
import { parseBankAlert } from '../utils/bankAlert';
import { currencySymbol, formatRelativeDay, formatShortDate } from '../utils/format';
import { fonts, type } from '../theme/typography';

const EXAMPLE = 'Acct: 0123****89\nAmt: NGN18,450.00 DR\nDesc: POS PURCHASE SHOPRITE LEKKI\nDate: 13-Sep-2026 08:52\nAvail Bal: NGN245,100.00';

export default function BankAlertScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const glyph = currencySymbol(user?.currency);
  const [text, setText] = useState('');

  const parsed = useMemo(() => (text.trim().length > 8 ? parseBankAlert(text) : null), [text]);

  const paste = async () => {
    const clip = await Clipboard.getStringAsync();
    if (clip) setText(clip);
  };

  const useIt = () => {
    if (!parsed) return;
    nav.navigate('AddTransaction', {
      prefill: {
        type: parsed.direction === 'credit' ? 'income' : 'expense',
        amount: parsed.amount,
        description: parsed.merchant,
        category: parsed.category,
        occurredAt: parsed.occurredAt,
        nonce: Date.now()
      }
    });
  };

  return (
    <Screen bottomInset={48}>
      <ScreenHeader title="Paste a bank alert" onBack={() => nav.goBack()} />
      <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 6 }]}>
        Copy the debit or credit SMS or email from your bank and paste it here. We’ll fill in the transaction for you to check.
      </Text>

      <View style={[styles.box, { backgroundColor: theme.colors.surface, borderColor: parsed ? theme.colors.primary : theme.colors.border }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder={EXAMPLE}
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { color: theme.colors.text }]}
          textAlignVertical="top"
          autoCorrect={false}
          accessibilityLabel="Bank alert text"
        />
      </View>
      <View style={styles.actions}>
        <SecondaryButton title="Paste" onPress={() => void paste()} iconLeft={<ClipboardPaste color={theme.colors.text} size={18} />} style={{ flex: 1 }} />
        {text ? <SecondaryButton title="Clear" onPress={() => setText('')} style={{ flex: 1 }} /> : null}
      </View>

      {text.trim().length > 8 && !parsed ? (
        <Card style={{ marginTop: 16 }}>
          <Text style={[type.bodyStrong, { color: theme.colors.text }]}>We couldn’t find an amount</Text>
          <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 4 }]}>Paste the whole alert, including the line with NGN or ₦ and the amount.</Text>
        </Card>
      ) : null}

      {parsed ? (
        <Card style={{ marginTop: 16 }}>
          <View style={styles.rowBetween}>
            <Chip tone={parsed.direction === 'credit' ? 'positive' : 'neutral'} label={parsed.direction === 'credit' ? 'Money in' : 'Money out'} />
            {parsed.confidence < 0.75 ? <Chip tone="brass" label="Check the details" /> : null}
          </View>
          <Amount
            value={parsed.direction === 'credit' ? parsed.amount : -parsed.amount}
            currency={glyph}
            size="lg"
            signed={parsed.direction === 'credit'}
            color={parsed.direction === 'credit' ? theme.colors.success : theme.colors.text}
            style={{ marginTop: 10 }}
          />
          <Text style={[type.bodyStrong, { color: theme.colors.text, marginTop: 6 }]}>{parsed.merchant}</Text>
          <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
            {parsed.category} · {formatShortDate(parsed.occurredAt)} {formatRelativeDay(parsed.occurredAt, new Date(parsed.occurredAt))}
          </Text>
          <PrimaryButton title="Review and save" onPress={useIt} style={{ marginTop: 16 }} />
        </Card>
      ) : null}

      <View style={styles.privacy}>
        <Lock color={theme.colors.textMuted} size={13} />
        <Text style={[type.caption, { color: theme.colors.textMuted, flex: 1 }]}>
          The alert is read on your phone. Only the transaction you choose to save is sent to BudgetFriendly.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 16, borderWidth: 1.5, borderRadius: 16, padding: 12, minHeight: 150 },
  input: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, minHeight: 126, letterSpacing: 0 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 18 }
});
