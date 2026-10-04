import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { ArrowLeft } from '../icons';

import { Screen, H1, P, Card, PrimaryButton, SecondaryButton } from '../components/Common/ui';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { GuideAnchor } from '../components/Common/GuideAnchor';
import { goBackOrHome } from '../navigation/goBack';
import { exportEverything } from '../api/personal';

type Row = Record<string, unknown>;

/** One cell. A spreadsheet reads a leading =, + or - as a formula, so those are made plain first. */
function cell(value: unknown): string {
  const s = value == null ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function transactionsCsv(rows: Row[]): string {
  const head = ['Date', 'Space', 'Type', 'Amount', 'Category', 'Bucket', 'Description'];
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push(
      [
        cell(String(r.occurredAt ?? '').slice(0, 10)),
        cell(r.spaceId),
        cell(r.type),
        cell(r.amount),
        cell(r.category),
        cell(r.budgetCategory),
        cell(r.description)
      ].join(',')
    );
  }
  return lines.join('\r\n');
}

async function saveAndShare(name: string, body: string, mimeType: string) {
  const uri = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(uri, body);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: name });
    return true;
  }
  return false;
}

export default function ExportDataScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState<'csv' | 'json' | null>(null);

  const day = new Date().toISOString().slice(0, 10);

  const run = async (kind: 'csv' | 'json') => {
    if (busy) return;
    setBusy(kind);
    try {
      const data = (await exportEverything()) as { transactions?: Row[] };
      if (kind === 'csv') {
        const rows = Array.isArray(data.transactions) ? data.transactions : [];
        if (!rows.length) {
          toast.show('You have not recorded anything yet, so there is nothing to export.', 'info', 4000);
          return;
        }
        const shared = await saveAndShare(`budgetfriendly-transactions-${day}.csv`, transactionsCsv(rows), 'text/csv');
        toast.show(shared ? `${rows.length} transactions ready.` : 'Saved to this phone.', 'success', 4000);
      } else {
        const shared = await saveAndShare(`budgetfriendly-${day}.json`, JSON.stringify(data, null, 2), 'application/json');
        toast.show(shared ? 'Your records are ready.' : 'Saved to this phone.', 'success', 4000);
      }
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'We could not build the file. Try again in a moment.', 'error', 5000);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={() => goBackOrHome(nav)}
          accessibilityRole="button"
          accessibilityLabel="Go back"
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
          <H1 style={{ marginBottom: 0 }}>Your data</H1>
          <P style={{ marginTop: 4 }}>Take a copy of everything you have recorded.</P>
        </View>
      </View>

      <GuideAnchor id="export.actions" style={{ marginTop: 16 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontFamily: 'Figtree_700Bold', fontSize: 16 }}>For a spreadsheet</Text>
          <P style={{ marginTop: 6 }}>
            Every transaction as a CSV file: the date, what it was, how much and which bucket. Opens in Excel,
            Sheets or anything your accountant uses.
          </P>
          <View style={{ marginTop: 12 }}>
            <PrimaryButton
              title={busy === 'csv' ? 'Building your file…' : 'Export transactions as CSV'}
              onPress={() => void run('csv')}
              loading={busy === 'csv'}
              disabled={busy !== null}
            />
          </View>
        </Card>
      </GuideAnchor>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontFamily: 'Figtree_700Bold', fontSize: 16 }}>Everything</Text>
          <P style={{ marginTop: 6 }}>
            One file holding all of it: your plan, budgets, goals, bills, what you own and owe, and your
            business records if you have them. Keep it, or take it to another app.
          </P>
          <View style={{ marginTop: 12 }}>
            <SecondaryButton
              title={busy === 'json' ? 'Building your file…' : 'Export everything'}
              onPress={() => void run('json')}
              disabled={busy !== null}
            />
          </View>
          <P style={{ marginTop: 12, color: theme.colors.textMuted }}>
            Neither file holds your password or anything from your bank sign-in, because we never have them.
          </P>
        </Card>
      </View>
    </Screen>
  );
}
