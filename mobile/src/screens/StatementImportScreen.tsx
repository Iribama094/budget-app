import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { CircleCheck, FileSpreadsheet, ShieldCheck } from '../icons';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSpace } from '../contexts/SpaceContext';
import { useToast } from '../components/Common/Toast';
import { Card, IconTile, InfoTip, InlineError, ListCard, ListRow, PrimaryButton, Screen, ScreenHeader, SecondaryButton, SectionHeader, SegmentedControl, formatAmount } from '../components/Common/ui';
import { ChoiceChip } from '../components/Plan/ChoiceChip';
import { LineItem } from '../components/Business/parts';
import { importStatement, type StatementSource } from '../api/business';
import { readStatement, type StatementPreview } from '../lib/statementCsv';
import { currencySymbol, formatShortDate } from '../utils/format';
import { type } from '../theme/typography';
import { GuideAnchor } from '../components/Common/GuideAnchor';
import { goBackOrHome } from '../navigation/goBack';

const SOURCES: Array<{ key: StatementSource; label: string; how: string }> = [
  { key: 'paystack', label: 'Paystack', how: 'In your Paystack dashboard, open Transactions and export them as CSV. Successful payments come in as sales.' },
  { key: 'moniepoint', label: 'Moniepoint', how: 'Download your transaction history or statement from Moniepoint as CSV. If you get Excel, open it and save as CSV.' },
  { key: 'bank', label: 'Bank statement', how: 'Most Nigerian banks let you download a statement from internet banking as CSV or Excel. Save it as CSV, then upload.' },
  { key: 'other', label: 'Other CSV', how: 'Any CSV with a date column and an amount (or credit and debit) column works.' }
];

const MAX_BYTES = 5 * 1024 * 1024;

/** Brings in sales and costs from a Paystack, Moniepoint or bank CSV export. Rows go to the review queue first. */
export default function StatementImportScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const toast = useToast();
  const glyph = currencySymbol(user?.currency);

  const [source, setSource] = useState<StatementSource>(route.params?.source ?? 'paystack');
  const [space, setSpace] = useState<'personal' | 'business'>(route.params?.spaceId ?? (spacesEnabled ? activeSpaceId : 'business'));
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ imported: number; duplicates: number; skipped: number } | null>(null);

  const how = SOURCES.find((s) => s.key === source)!.how;

  const choose = (next: StatementSource) => {
    setSource(next);
    setResult(null);
    if (file) setPreview(readStatement(file.text, next));
  };

  const pick = async () => {
    setError(null);
    setResult(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      if (asset.size && asset.size > MAX_BYTES) {
        setError('That file is over 5 MB. Export a shorter date range and try again.');
        return;
      }
      if (/\.(pdf|xlsx?)$/i.test(asset.name)) {
        setError('That looks like a PDF or Excel file. Save it as CSV first, then upload the CSV.');
        return;
      }
      const text = await FileSystem.readAsStringAsync(asset.uri);
      const parsed = readStatement(text, source);
      setFile({ name: asset.name, text });
      setPreview(parsed);
      if (!parsed.recognized) setError('We couldn’t find the date and amount columns in that file. Check it’s a transactions CSV export.');
      else if (!parsed.rows.length) setError('We read the file but found no completed transactions in it.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that file');
    }
  };

  const upload = async () => {
    if (!preview?.rows.length || !file) return;
    setUploading(true);
    setError(null);
    try {
      const totals = { imported: 0, duplicates: 0, skipped: preview.skipped };
      for (let i = 0; i < preview.rows.length; i += 1000) {
        const r = await importStatement({ source, fileName: file.name, spaceId: space, rows: preview.rows.slice(i, i + 1000) });
        totals.imported += r.imported;
        totals.duplicates += r.duplicates;
        totals.skipped += r.skipped;
      }
      setResult(totals);
      toast.show(totals.imported ? `${totals.imported} transaction${totals.imported === 1 ? '' : 's'} imported 📥` : 'Nothing new. You’d already uploaded these.', totals.imported ? 'success' : 'info');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const sample = preview?.rows.slice(0, 5) ?? [];

  return (
    <Screen bottomInset={48}>
      <ScreenHeader title="Upload a statement" subtitle="Paystack, Moniepoint or bank CSV" onBack={() => goBackOrHome(nav)} />

      <SectionHeader title="Where is it from?" style={{ marginTop: 8 }} />
      <View style={styles.wrap}>
        {SOURCES.map((s) => (
          <ChoiceChip key={s.key} label={s.label} active={source === s.key} onPress={() => choose(s.key)} />
        ))}
      </View>
      <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 10 }]}>{how}</Text>

      {spacesEnabled ? (
        <>
          <SectionHeader title="Add to" />
          <SegmentedControl
            options={[
              { key: 'business', label: 'Business' },
              { key: 'personal', label: 'Personal' }
            ]}
            value={space}
            onChange={setSpace}
          />
        </>
      ) : null}

      <GuideAnchor id="statement.upload">
        <PrimaryButton title={file ? 'Choose a different file' : 'Choose CSV file'} iconLeft={<FileSpreadsheet color={theme.colors.onPrimary} size={18} />} onPress={pick} style={{ marginTop: 18 }} />
      </GuideAnchor>

      {error ? (
        <View style={{ marginTop: 12 }}>
          <InlineError message={error} />
        </View>
      ) : null}

      {preview?.recognized && preview.rows.length && file ? (
        <>
          <SectionHeader title="What we found" />
          <Card>
            <Text style={[type.bodyStrong, { color: theme.colors.text }]} numberOfLines={1}>
              {file.name}
            </Text>
            <LineItem label={`${preview.credits.count} money in`} value={formatAmount(preview.credits.total, glyph)} color={theme.colors.success} />
            <LineItem label={`${preview.debits.count} money out`} value={formatAmount(preview.debits.total, glyph)} />
            {preview.skipped ? <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>{preview.skipped} line{preview.skipped === 1 ? '' : 's'} skipped (failed, pending or not a transaction).</Text> : null}
          </Card>
          <ListCard style={{ marginTop: 10 }}>
            {sample.map((r, i) => (
              <ListRow
                key={`${r.reference ?? ''}-${i}`}
                title={r.description || (r.direction === 'credit' ? 'Money in' : 'Money out')}
                subtitle={formatShortDate(r.date)}
                right={<Text style={[type.smallStrong, { color: r.direction === 'credit' ? theme.colors.success : theme.colors.text }]}>{`${r.direction === 'credit' ? '+' : '−'}${formatAmount(r.amount, glyph)}`}</Text>}
              />
            ))}
          </ListCard>
          {!result ? <PrimaryButton title={`Add ${preview.rows.length} to review`} onPress={upload} loading={uploading} style={{ marginTop: 14 }} /> : null}
        </>
      ) : null}

      {result ? (
        <Card style={{ marginTop: 14 }}>
          <View style={styles.row}>
            <IconTile bg={theme.colors.successSoft} size={38}>
              <CircleCheck color={theme.colors.success} size={19} />
            </IconTile>
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{result.imported} ready to review</Text>
              <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 2 }]}>
                {result.duplicates ? `${result.duplicates} already uploaded before, so we skipped them. ` : ''}Confirm the category for each and they’ll count in your {space} budget.
              </Text>
            </View>
          </View>
          <PrimaryButton title="Review them now" onPress={() => nav.navigate('PendingTransactions')} style={{ marginTop: 14 }} />
          <SecondaryButton title="Upload another" onPress={() => (setFile(null), setPreview(null), setResult(null))} style={{ marginTop: 10 }} />
        </Card>
      ) : null}

      <InfoTip
        style={{ marginTop: 18 }}
        text="Uploading a file never gives BudgetFriendly access to your Paystack, Moniepoint or bank account: we only read the file you pick. Uploading the same file twice won’t double anything, because we skip rows you’ve already imported. Live Paystack sync is coming."
      >
        Your accounts stay private, and uploading twice is safe.
      </InfoTip>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }
});
