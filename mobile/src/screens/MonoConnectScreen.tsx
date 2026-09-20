import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Landmark, Lock } from 'lucide-react-native';

import { connectMonoAccount } from '../api/features';
import { useAuth } from '../contexts/AuthContext';
import { useSpace } from '../contexts/SpaceContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { Card, IconTile, InlineError, PrimaryButton, Screen, ScreenHeader, SecondaryButton } from '../components/Common/ui';
import { type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';

const MONO_PUBLIC_KEY = process.env.EXPO_PUBLIC_MONO_PUBLIC_KEY ?? '';

function connectHtml(key: string, customer: { name: string; email: string }) {
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<script src="https://connect.withmono.com/connect.js"></script>
</head>
<body style="margin:0;background:transparent">
<script>
  function send(m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  window.onload = function () {
    try {
      var connect = new Connect({
        key: ${JSON.stringify(key)},
        scope: 'auth',
        data: { customer: ${JSON.stringify(customer)} },
        onSuccess: function (data) { send({ type: 'success', code: data && data.code }); },
        onClose: function () { send({ type: 'close' }); },
        onLoad: function () { send({ type: 'loaded' }); }
      });
      connect.setup();
      connect.open();
    } catch (e) {
      send({ type: 'error', message: String((e && e.message) || e) });
    }
  };
</script>
</body>
</html>`;
}

type Phase = 'intro' | 'connecting' | 'saving' | 'failed';

/** Links a real Nigerian bank account through Mono Connect, then imports recent transactions for review. */
export default function MonoConnectScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>('intro');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const html = useMemo(
    () => connectHtml(MONO_PUBLIC_KEY, { name: user?.name || user?.email || 'BudgetFriendly user', email: user?.email || '' }),
    [user?.email, user?.name]
  );

  const onMessage = async (event: WebViewMessageEvent) => {
    let msg: any;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'loaded') setLoaded(true);
    if (msg.type === 'close') setPhase('intro');
    if (msg.type === 'error') {
      setError(`Mono Connect couldn’t start: ${msg.message}`);
      setPhase('failed');
    }
    if (msg.type === 'success' && msg.code) {
      setPhase('saving');
      try {
        const res = await connectMonoAccount(String(msg.code), spacesEnabled ? activeSpaceId : undefined);
        toast.show(
          res.imported
            ? `${res.link.bankName} connected. ${res.imported} transaction${res.imported === 1 ? '' : 's'} ready to review.`
            : `${res.link.bankName} connected.`,
          'success',
          4500
        );
        if (res.imported) nav.replace('PendingTransactions');
        else goBackOrHome(nav);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Your bank was linked at Mono but we couldn’t save it. Try again.');
        setPhase('failed');
      }
    }
  };

  if (!MONO_PUBLIC_KEY) {
    return (
      <Screen bottomInset={48}>
        <ScreenHeader title="Connect a bank" onBack={() => goBackOrHome(nav)} />
        <Card style={{ marginTop: 16 }}>
          <Text style={[type.bodyStrong, { color: theme.colors.text }]}>Live bank connections aren’t set up in this build</Text>
          <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 6 }]}>
            Add EXPO_PUBLIC_MONO_PUBLIC_KEY to the app and MONO_SECRET_KEY to the server to link real accounts. You can try the demo connection meanwhile.
          </Text>
          <PrimaryButton title="Use the demo connection" onPress={() => nav.replace('BankConnectForm')} style={{ marginTop: 14 }} />
        </Card>
      </Screen>
    );
  }

  if (phase === 'connecting') {
    return (
      <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>
        {!loaded ? <ActivityIndicator color={theme.colors.primary} style={StyleSheet.absoluteFill} /> : null}
        <WebView
          source={{ html, baseUrl: 'https://connect.withmono.com' }}
          originWhitelist={['*']}
          onMessage={(e) => void onMessage(e)}
          javaScriptEnabled
          domStorageEnabled
          style={styles.fill}
        />
      </View>
    );
  }

  return (
    <Screen bottomInset={48}>
      <ScreenHeader title="Connect a bank" onBack={() => goBackOrHome(nav)} />
      <View style={{ alignItems: 'flex-start', marginTop: 20 }}>
        <IconTile bg={theme.colors.primarySoft} size={52}>
          <Landmark color={theme.colors.primary} size={24} />
        </IconTile>
      </View>
      <Text style={[type.h2, { color: theme.colors.text, marginTop: 14 }]}>Import transactions from your bank</Text>
      <Text style={[type.body, { color: theme.colors.textMuted, marginTop: 8 }]}>
        We use Mono, a licensed open-banking provider, to read your account history. Nothing moves out of your account, and you can disconnect at any time.
      </Text>

      {error ? (
        <View style={{ marginTop: 14 }}>
          <InlineError message={error} />
        </View>
      ) : null}

      <View style={{ marginTop: 18, gap: 10 }}>
        {['Choose your bank and sign in on Mono’s secure page', 'We import the last 90 days for you to review', 'New transactions arrive automatically each day'].map((line, i) => (
          <View key={line} style={styles.step}>
            <Text style={[type.smallStrong, styles.stepNum, { color: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]}>{i + 1}</Text>
            <Text style={[type.body, { color: theme.colors.text, flex: 1 }]}>{line}</Text>
          </View>
        ))}
      </View>

      <PrimaryButton
        title={phase === 'saving' ? 'Saving your connection…' : 'Continue to Mono'}
        loading={phase === 'saving'}
        onPress={() => {
          setError(null);
          setLoaded(false);
          setPhase('connecting');
        }}
        style={{ marginTop: 24 }}
      />
      <SecondaryButton title="Not now" onPress={() => goBackOrHome(nav)} style={{ marginTop: 10 }} />
      <View style={styles.privacy}>
        <Lock color={theme.colors.textMuted} size={13} />
        <Text style={[type.caption, { color: theme.colors.textMuted, flex: 1 }]}>BudgetFriendly never sees your bank password.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNum: { width: 26, height: 26, borderRadius: 13, textAlign: 'center', lineHeight: 26, overflow: 'hidden' },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 }
});
