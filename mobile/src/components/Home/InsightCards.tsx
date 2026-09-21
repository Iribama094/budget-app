import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AlertTriangle, CircleCheck, Lightbulb, X } from '../../icons';
import { useTheme } from '../../contexts/ThemeContext';
import { Card, IconTile, SectionHeader } from '../Common/ui';
import { dismissInsight, listInsights, type ApiInsight } from '../../api/personal';
import { type } from '../../theme/typography';

/** "For you": suggestions the API learns from this person's own spending, plan and budget. */
export function InsightCards({ spaceId }: { spaceId: 'personal' | 'business' }) {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const [items, setItems] = useState<ApiInsight[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listInsights(spaceId)
        .then((list) => !cancelled && setItems(list))
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, [spaceId])
  );

  if (!items.length) return null;

  const tone = (t: ApiInsight['tone']) =>
    t === 'warning'
      ? { Icon: AlertTriangle, bg: theme.colors.brassSoft, fg: theme.colors.brass }
      : t === 'positive'
        ? { Icon: CircleCheck, bg: theme.colors.successSoft, fg: theme.colors.success }
        : { Icon: Lightbulb, bg: theme.colors.primarySoft, fg: theme.colors.primary };

  return (
    <View>
      <SectionHeader title="For you" actionLabel="Ask Flux" onAction={() => nav.navigate('AssistantModal')} />
      <View style={{ gap: 10 }}>
        {items.slice(0, 3).map((i) => {
          const { Icon, bg, fg } = tone(i.tone);
          return (
            <Card key={i.key}>
              <View style={styles.row}>
                <IconTile bg={bg} size={36}>
                  <Icon color={fg} size={18} />
                </IconTile>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.bodyStrong, { color: theme.colors.text }]}>{i.title}</Text>
                  <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 3 }]}>{i.body}</Text>
                  {i.action ? (
                    <Pressable onPress={() => nav.navigate(i.action!.screen, i.action!.params)} hitSlop={8} style={{ marginTop: 8, alignSelf: 'flex-start' }} accessibilityRole="button">
                      <Text style={[type.smallStrong, { color: theme.colors.primary }]}>{i.action.label}</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => {
                    setItems((list) => list.filter((x) => x.key !== i.key));
                    dismissInsight(i.key).catch(() => undefined);
                  }}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss"
                >
                  <X color={theme.colors.textMuted} size={16} />
                </Pressable>
              </View>
            </Card>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }
});
