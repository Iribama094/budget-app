import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUp, Mic, Sparkles, Square, X } from 'lucide-react-native';

import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useNotificationBadges } from '../contexts/NotificationBadgeContext';
import { IconButton, IconTile, InfoTip, PrimaryButton, SecondaryButton, formatAmount } from '../components/Common/ui';
import { useVoiceNote } from '../lib/voice';
import { ChoiceChip } from '../components/Plan/ChoiceChip';
import { assistantChat, createTransaction, listBudgets, type ApiBudget, type ChatTurn, type EntryDraft } from '../api/endpoints';
import { suggestCategory } from '../api/personal';
import { useCategories } from '../contexts/CategoriesContext';
import { useSpace } from '../contexts/SpaceContext';
import { currencySymbol, formatShortDate, toIsoDate } from '../utils/format';
import { fonts, type } from '../theme/typography';

const ASSISTANT_NAME = 'Flux';

const STARTERS = ['I spent 5k on fuel', 'Will my money last until payday?', 'Where is most of my money going?', 'How can I save a little more this month?'];

type Message = ChatTurn & { id: string; failed?: boolean; draft?: EntryDraft; saved?: boolean };

/** Flux, the AI money coach. Answers use a summary of the person's own plan, budget and spending. */
export default function AssistantScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { setHasAssistantUnread } = useNotificationBadges();
  const { spacesEnabled, activeSpaceId } = useSpace();
  const { all: categories } = useCategories();
  const spaceId = spacesEnabled ? activeSpaceId : undefined;
  const glyph = currencySymbol(user?.currency);
  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] || null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Talk instead of typing: the words land in the box so you can fix them before sending.
  const voice = useVoiceNote((text) => setQuery((q) => (q.trim() ? `${q.trim()} ${text}` : text)));

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
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: 'assistant', text: res.reply, draft: res.draft }]);
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

  /** The budget a date falls into, preferring the plan Home shows. Events never take spending automatically. */
  const budgetForDate = async (dateIso: string): Promise<ApiBudget | null> => {
    const res = await listBudgets(spaceId ? { spaceId } : undefined).catch(() => ({ items: [] as ApiBudget[] }));
    const endOf = (b: ApiBudget) => {
      if (b.endDate) return b.endDate;
      const d = new Date(`${b.startDate}T12:00:00`);
      if (b.period === 'weekly') d.setDate(d.getDate() + 6);
      else {
        d.setMonth(d.getMonth() + 1);
        d.setDate(0);
      }
      return toIsoDate(d);
    };
    const covering = (res.items ?? []).filter((b) => b.purpose !== 'event' && b.startDate <= dateIso && endOf(b) >= dateIso);
    const preferred =
      user?.homeBudget === 'shared'
        ? covering.find((b) => b.purpose === 'household' || b.isShared)
        : covering.find((b) => b.role !== 'member' && (b.purpose ?? 'personal') === 'personal');
    return preferred ?? covering[0] ?? null;
  };

  /** Records what Flux heard, with the category it suggests and the budget the date falls into. */
  const saveDraft = async (m: Message) => {
    const d = m.draft;
    if (!d || m.saved || savingId) return;
    setSavingId(m.id);
    try {
      const suggestion = await suggestCategory(d.description || (d.type === 'income' ? 'Income' : 'Spending'), d.type, spaceId ?? 'personal').catch(() => null);
      const category = suggestion?.category ?? (d.type === 'income' ? 'Other income' : 'Other');
      const bucket = categories.find((c) => c.name === category)?.bucket ?? 'Needs';
      const budget = d.type === 'expense' ? await budgetForDate(d.occurredOn) : null;
      await createTransaction({
        type: d.type,
        amount: d.amount,
        category,
        description: d.description,
        occurredAt: `${d.occurredOn}T12:00:00.000Z`,
        ...(budget ? { budgetId: budget.id, budgetCategory: bucket } : {}),
        ...(spaceId ? { spaceId } : {})
      });
      setMessages((list) => [
        ...list.map((x) => (x.id === m.id ? { ...x, saved: true } : x)),
        {
          id: `s${Date.now()}`,
          role: 'assistant',
          text: `Done ✅ Saved as ${category}${budget ? ` in your ${budget.name.replace(/^My Budget \((.*)\)$/, '$1')} budget` : ''}. You fit see am under Transactions.`
        }
      ]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e) {
      setMessages((list) => [...list, { id: `x${Date.now()}`, role: 'assistant', text: e instanceof Error ? e.message : 'Could not save that', failed: true }]);
    } finally {
      setSavingId(null);
    }
  };

  const editDraft = (d: EntryDraft) =>
    nav.navigate('AddTransaction', {
      prefill: { type: d.type, amount: d.amount, description: d.description, occurredAt: `${d.occurredOn}T12:00:00.000Z` }
    });

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
                {m.draft && !mine ? (
                  <View style={[styles.draft, { borderTopColor: theme.colors.border }]}>
                    <Text style={[type.caption, { color: theme.colors.textMuted }]}>{m.saved ? 'Saved' : 'Ready to save'}</Text>
                    <Text style={[type.bodyStrong, { color: theme.colors.text, marginTop: 2 }]}>
                      {`${m.draft.type === 'income' ? '+' : '−'}${formatAmount(m.draft.amount, glyph)}${m.draft.description ? ` · ${m.draft.description}` : ''}`}
                    </Text>
                    <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                      {formatShortDate(m.draft.occurredOn)} · {m.draft.type === 'income' ? 'money in' : 'money out'}
                    </Text>
                    {!m.saved ? (
                      <View style={styles.draftRow}>
                        <SecondaryButton title="Edit first" onPress={() => editDraft(m.draft as EntryDraft)} style={{ flex: 1 }} />
                        <PrimaryButton title="Save it" onPress={() => void saveDraft(m)} loading={savingId === m.id} style={{ flex: 1 }} />
                      </View>
                    ) : null}
                  </View>
                ) : null}
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
          {voice.state !== 'idle' || voice.error ? (
            <Text style={[type.caption, { color: voice.error ? theme.colors.error : theme.colors.primary, textAlign: 'center', marginBottom: 6 }]}>
              {voice.error ?? (voice.state === 'recording' ? 'Listening… tap the square when you’re done' : 'Turning that into words…')}
            </Text>
          ) : null}
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
              onPress={() => (voice.state === 'recording' ? void voice.stop() : void voice.start())}
              disabled={sending || voice.state === 'working'}
              accessibilityRole="button"
              accessibilityLabel={voice.state === 'recording' ? 'Stop and use what I said' : 'Say it instead of typing'}
              style={[styles.send, { backgroundColor: voice.state === 'recording' ? theme.colors.errorSoft : 'transparent' }]}
            >
              {voice.state === 'working' ? (
                <ActivityIndicator color={theme.colors.primary} size="small" />
              ) : voice.state === 'recording' ? (
                <Square color={theme.colors.error} size={16} fill={theme.colors.error} />
              ) : (
                <Mic color={theme.colors.textMuted} size={19} />
              )}
            </Pressable>
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
          <InfoTip
            style={{ marginTop: 6, alignSelf: 'center' }}
            text={`${ASSISTANT_NAME} answers using a summary of your plan, budget and recent spending. It can make mistakes, and it isn’t financial advice. Your data isn’t used to train anyone’s model.`}
          >
            {`${ASSISTANT_NAME} can make mistakes`}
          </InfoTip>
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
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  draft: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  draftRow: { flexDirection: 'row', gap: 8, marginTop: 10 }
});
