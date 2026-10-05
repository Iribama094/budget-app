// Closing an account for good. Both app stores require this of any app you can sign up to, and the privacy
// notice promises it under the Nigeria Data Protection Act. It is deliberately slow: the person sees what
// they are about to lose in numbers, types the word, and gives their password.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AlertTriangle, ArrowLeft } from '../icons';

import { Screen, H1, P, Card, PrimaryButton, TextField } from '../components/Common/ui';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';
import { deleteAccount, deletionPreview, type DeletionSummary } from '../api/personal';

export default function DeleteAccountScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { logout } = useAuth();

  const [summary, setSummary] = useState<DeletionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [word, setWord] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    deletionPreview()
      .then((s) => alive && setSummary(s))
      .catch(() => alive && setSummary(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const canDelete = word.trim().toUpperCase() === 'DELETE' && password.length > 0 && !busy;

  const submit = async () => {
    if (!canDelete) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(password);
      setDone(true);
      // The session is dead on the server either way. Clearing it here takes the phone back to sign-in.
      await logout();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not delete the account. Try again.');
      setBusy(false);
    }
  };

  // A line only appears when there is something to say about it. Nobody needs "0 goals".
  const lines: string[] = [];
  if (summary) {
    if (summary.transactions) lines.push(`${summary.transactions.toLocaleString()} transaction${summary.transactions === 1 ? '' : 's'}`);
    if (summary.budgets) lines.push(`${summary.budgets} budget${summary.budgets === 1 ? '' : 's'}`);
    if (summary.goals) lines.push(`${summary.goals} goal${summary.goals === 1 ? '' : 's'}`);
  }

  if (done) {
    return (
      <Screen>
        <H1 style={{ marginTop: 24 }}>Your account is gone</H1>
        <P style={{ marginTop: 8 }}>
          Everything you recorded has been deleted. We have emailed you to confirm. Thank you for trying
          BudgetFriendly.
        </P>
      </Screen>
    );
  }

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
          <H1 style={{ marginBottom: 0 }}>Delete your account</H1>
          <P style={{ marginTop: 4 }}>This cannot be undone.</P>
        </View>
      </View>

      <Card style={{ marginTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <AlertTriangle color={theme.colors.error} size={20} />
          <Text style={[type.bodyStrong, { color: theme.colors.text, flex: 1 }]}>What goes</Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 14, alignSelf: 'flex-start' }} color={theme.colors.primary} />
        ) : (
          <>
            <P style={{ marginTop: 10 }}>
              {lines.length ? `${lines.join(', ')}, your plan, your bills and every phone signed in.` : 'Your plan, your settings and every phone signed in.'}
              {' '}We keep no copy, and we cannot bring any of it back.
            </P>

            {summary && summary.sharedBudgets > 0 ? (
              <P style={{ marginTop: 10, color: theme.colors.text }}>
                {summary.sharedBudgets === 1 ? 'A budget you share goes too' : `${summary.sharedBudgets} budgets you share go too`}, so the people you
                share with lose {summary.sharedBudgets === 1 ? 'it' : 'them'} as well.
              </P>
            ) : null}
            {summary && summary.teamMembers > 0 ? (
              <P style={{ marginTop: 10, color: theme.colors.text }}>
                {summary.teamMembers} {summary.teamMembers === 1 ? 'person' : 'people'} on your business team will lose access to the business.
              </P>
            ) : null}
            {summary && summary.helpers > 0 ? (
              <P style={{ marginTop: 10, color: theme.colors.text }}>
                {summary.helpers} {summary.helpers === 1 ? 'helper' : 'helpers'} will no longer see your money.
              </P>
            ) : null}

            <P style={{ marginTop: 12, color: theme.colors.textMuted }}>
              Want a copy first? Go back and use Export data. Once this is done there is nothing left to export.
            </P>
          </>
        )}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <TextField
          label="Type DELETE to confirm"
          value={word}
          onChangeText={setWord}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="DELETE"
        />
        <View style={{ height: 12 }} />
        <TextField
          label="Your password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          placeholder="Your password"
        />
        {error ? <Text style={[type.small, { color: theme.colors.error, marginTop: 10 }]}>{error}</Text> : null}
        <View style={{ marginTop: 16 }}>
          <PrimaryButton
            title={busy ? 'Deleting…' : 'Delete my account'}
            onPress={() => void submit()}
            disabled={!canDelete}
            loading={busy}
            style={{ backgroundColor: theme.colors.error }}
          />
        </View>
      </Card>
    </Screen>
  );
}
