import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUp, Sparkles, X } from 'lucide-react-native';

import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useNotificationBadges } from '../contexts/NotificationBadgeContext';
import { IconButton, IconTile } from '../components/Common/ui';
import { ChoiceChip } from '../components/Plan/ChoiceChip';
import { assistantChat, type ChatTurn } from '../api/endpoints';
import { fonts, type } from '../theme/typography';

const ASSISTANT_NAME = 'Flux';

const STARTERS = ['Will my money last until payday?', 'Where is most of my money going?', 'How can I save a little more this month?', 'Is my plan realistic?'];

type Message = ChatTurn & { id: string; failed?: boolean };

/** Flux, the AI money coach. Answers use a summary of the person's own plan, budget and spending. */
export default function AssistantScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { setHasAssistantUnread } = useNotificationBadges();
  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] || null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setHasAssistantUnread(false);
  }, [setHasAssistantUnread]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || sending) return;
    const history: ChatTurn[] = messages.filter((m) => !m.failed).map(({ role, text: t }) => ({ role, text: t }));
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', text }]);
    setQuery('');
    setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const res = await assistantChat(text, history);
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: 'assistant', text: res.reply }]);
      setUnavailable(null);
    } catch (e) {
      const status = (e as { status?: number })?.status;
      const message = e instanceof Error ? e.message : 'Flux couldn’t answer just now. Try again.';
      if (status === 501) setUnavailable(message);
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: 'assistant', text: message, failed: true }]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <IconTile bg={theme.colors.primarySoft} size={40}>
          <Sparkles color={theme.colors.primary} size={20} />
        </IconTile>
        <View style={{ flex: 1 }}>
          <Text style={[type.title, { color: theme.colors.text }]}>{ASSISTANT_NAME}</Text>
          <Text style={[type.caption, { color: theme.colors.textMuted }]}>Your money coach</Text>
        </View>
        <IconButton accessibilityLabel="Close" onPress={() => nav.goBack()}>
          <X color={theme.colors.text} size={20} />
        </IconButton>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.thread} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.bubble, styles.left, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[type.body, { color: theme.colors.text }]}>
              {firstName ? `Hi ${firstName}! ` : 'Hi! '}I’m {ASSISTANT_NAME}. Ask me anything about your money. I look at your plan, budget and recent spending to answer.
            </Text>
          </View>

          {messages.length === 0 ? (
            <View style={styles.starters}>
              {STARTERS.map((s) => (
                <ChoiceChip key={s} label={s} active={false} onPress={() => void send(s)} />
              ))}
            </View>
          ) : null}

          {messages.map((m) => {
            const mine = m.role === 'user';
            return (
              <View
                key={m.id}
                style={[
                  styles.bubble,
                  mine ? styles.right : styles.left,
                  mine
                    ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                    : { backgroundColor: m.failed ? theme.colors.errorSoft : theme.colors.surface, borderColor: m.failed ? theme.colors.errorSoft : theme.colors.border }
                ]}
              >
                <Text style={[type.body, { color: mine ? theme.colors.onPrimary : m.failed ? theme.colors.error : theme.colors.text }]}>{m.text}</Text>
              </View>
            );
          })}

          {sending ? (
            <View style={[styles.bubble, styles.left, styles.typing, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <ActivityIndicator color={theme.colors.primary} size="small" />
              <Text style={[type.small, { color: theme.colors.textMuted }]}>{ASSISTANT_NAME} is thinking…</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10), borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          <View style={[styles.inputWrap, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={unavailable ? 'Flux isn’t switched on yet' : `Ask ${ASSISTANT_NAME} about your money`}
              placeholderTextColor={theme.colors.textMuted}
              multiline
              maxLength={2000}
              style={[styles.input, { color: theme.colors.text }]}
              onSubmitEditing={() => void send(query)}
              blurOnSubmit
              returnKeyType="send"
            />
            <Pressable
              onPress={() => void send(query)}
              disabled={!query.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={[styles.send, { backgroundColor: query.trim() && !sending ? theme.colors.primary : theme.colors.border }]}
            >
              <ArrowUp color={theme.colors.onPrimary} size={18} strokeWidth={2.6} />
            </Pressable>
          </View>
          <Text style={[type.caption, { color: theme.colors.textMuted, textAlign: 'center', marginTop: 6 }]}>
            {ASSISTANT_NAME} uses a summary of your BudgetFriendly data and can make mistakes. It isn’t financial advice.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
  thread: { paddingHorizontal: 20, paddingVertical: 12, gap: 10 },
  bubble: { maxWidth: '86%', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10 },
  left: { alignSelf: 'flex-start', borderTopLeftRadius: 6 },
  right: { alignSelf: 'flex-end', borderTopRightRadius: 6 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  starters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  composer: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  inputWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderWidth: 1, borderRadius: 22, paddingLeft: 14, paddingRight: 5, paddingVertical: 5 },
  input: { flex: 1, maxHeight: 120, fontFamily: fonts.regular, fontSize: 15, paddingVertical: 8 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }
});
