import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { getAnalyticsSummary, assistantChat } from '../api/endpoints';
import { useToast } from '../components/Common/Toast';
import { ScrollView, TextInput as RNTextInput } from 'react-native';
import { Screen, H1, P, Card } from '../components/Common/ui';
import { useAuth } from '../contexts/AuthContext';
import { useNotificationBadges } from '../contexts/NotificationBadgeContext';
import { useSpace } from '../contexts/SpaceContext';
import { formatMoney } from '../utils/format';
import { tokens } from '../theme/tokens';

// Assistant name
const ASSISTANT_NAME = 'Flux';

export default function AssistantScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [query, setQuery] = useState('');
  const toast = useToast();
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [sending, setSending] = useState(false);
  const scrollRef = React.useRef<ScrollView | null>(null);
  const { setHasAssistantUnread } = useNotificationBadges();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const end = new Date().toISOString().slice(0, 10);
        const s = await getAnalyticsSummary(start, end, spacesEnabled ? { spaceId: activeSpaceId } : undefined).catch(() => null);
        setSummary(s);
      } finally {
        setLoading(false);
      }
    })();
  }, [activeSpaceId, spacesEnabled]);

  // Opening the assistant marks any pending assistant messages as read
  useEffect(() => {
    setHasAssistantUnread(false);
  }, [setHasAssistantUnread]);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <H1>{ASSISTANT_NAME}</H1>
        <Pressable onPress={() => navigation.goBack()} style={{ padding: 8 }}>
          <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Close</Text>
        </Pressable>
      </View>
      <P style={{ marginTop: 6, fontSize: 13, color: theme.colors.textMuted }}>
        Ask questions about your budgets, goals, and spending.
      </P>

      {loading ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : (
        <View style={{ marginTop: 12 }}>
          <Card>
            <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>This month</Text>
            <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900', marginTop: 8 }}>
              {summary ? formatMoney(Number(summary.totalBalance) || 0, user?.currency ?? '₦') : '—'}
            </Text>
            <P style={{ marginTop: 8, fontSize: 13 }}>
              {summary
                ? `Income ${formatMoney(Number(summary.income) || 0, user?.currency ?? '₦')} • Expenses ${formatMoney(Number(summary.expenses) || 0, user?.currency ?? '₦')}`
                : 'No data available'}
            </P>

            <P style={{ marginTop: 10, fontSize: 13 }}>Try: “How much can I save this month?”</P>
          </Card>

          <View style={{ marginTop: 12 }}>
            <Card>
              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Chat</Text>
              <View style={{ marginTop: 8, maxHeight: 240 }}>
                <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 8 }}>
                  {messages.length === 0 ? (
                    <Text style={{ color: theme.colors.textMuted }}>Type a question to the assistant.</Text>
                  ) : (
                    messages.map((m, i) => {
                      const isAssistant = m.role === 'assistant';
                      return (
                        <View key={i} style={{ marginBottom: 10, alignItems: isAssistant ? 'flex-start' : 'flex-end' }}>
                          <Text style={{ color: theme.colors.textMuted, fontWeight: '800', fontSize: 11, marginBottom: 4 }}>
                            {isAssistant ? ASSISTANT_NAME : 'You'}
                          </Text>
                          <View
                            style={{
                              maxWidth: '88%',
                              borderRadius: 14,
                              paddingVertical: 10,
                              paddingHorizontal: 12,
                              backgroundColor: isAssistant ? theme.colors.surfaceAlt : theme.colors.primary,
                              borderWidth: isAssistant ? 1 : 0,
                              borderColor: isAssistant ? theme.colors.border : 'transparent'
                            }}
                          >
                            <Text style={{ color: isAssistant ? theme.colors.text : tokens.colors.white, fontWeight: '700', lineHeight: 20 }}>
                              {m.text}
                            </Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              </View>

              <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
                <RNTextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Ask the assistant..."
                  placeholderTextColor={theme.colors.textMuted}
                  style={{ flex: 1, padding: 10, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border }}
                />
                <Pressable
                  onPress={async () => {
                    if (!query.trim()) return;
                    const text = query.trim();
                    setMessages((m) => [...m, { role: 'user', text }]);
                    setQuery('');
                    setSending(true);
                    try {
                      const res = await assistantChat(text).catch((e) => {
                        throw e;
                      });
                      const reply = res?.reply || 'Sorry, no reply.';
                      setMessages((m) => [...m, { role: 'assistant', text: reply }]);
                      // Indicate there is a fresh assistant reply for other parts of the app
                      setHasAssistantUnread(true);
                      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : 'Assistant unavailable';
                      toast.show(msg, 'error', 4000);
                      setMessages((m) => [...m, { role: 'assistant', text: 'Assistant is currently unavailable. Try again later.' }]);
                    } finally {
                      setSending(false);
                    }
                  }}
                  style={({ pressed }) => [
                    {
                      marginLeft: 8,
                      padding: 10,
                      borderRadius: 10,
                      backgroundColor: theme.colors.primary,
                      opacity: pressed ? 0.92 : 1
                    }
                  ]}
                >
                  <Text style={{ color: tokens.colors.white, fontWeight: '900' }}>{sending ? '…' : 'Send'}</Text>
                </Pressable>
              </View>
            </Card>
          </View>
        </View>
      )}
    </Screen>
  );
}
