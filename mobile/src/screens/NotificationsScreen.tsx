import React, { useEffect } from 'react';
import { View, Text, Pressable, FlatList, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Bell } from 'lucide-react-native';

import { Screen, H1, P } from '../components/Common/ui';
import { useTheme } from '../contexts/ThemeContext';
import { useNotificationBadges } from '../contexts/NotificationBadgeContext';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read?: boolean;
}

const SAMPLE_NOTIFICATIONS: NotificationItem[] = [
  {
    id: '1',
    title: 'Welcome to BudgetFriendly',
    body: 'Thanks for signing up! Start by creating your first budget.',
    createdAt: new Date().toISOString(),
    read: false
  },
  {
    id: '2',
    title: 'Budget check-in',
    body: 'You’ve used 40% of your budget and 35% of the month has passed.',
    createdAt: new Date().toISOString(),
    read: true
  }
];

export default function NotificationsScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { setHasUnreadNotifications } = useNotificationBadges();

  useEffect(() => {
    // User has viewed the notifications center; clear the unread badge.
    setHasUnreadNotifications(false);
  }, [setHasUnreadNotifications]);

  const hasUnread = SAMPLE_NOTIFICATIONS.some((n) => !n.read);

  return (
    <Screen scrollable={false}>
      <FlatList
        data={SAMPLE_NOTIFICATIONS}
        keyExtractor={(item) => item.id}
        style={{ flex: 1, marginTop: 16 }}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListHeaderComponent={
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable
                onPress={() => nav.goBack()}
                style={({ pressed }) => [
                  {
                    width: 44,
                    height: 44,
                    borderRadius: 18,
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.92 : 1
                  }
                ]}
              >
                <ArrowLeft color={theme.colors.text} size={20} />
              </Pressable>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <H1 style={{ marginBottom: 0 }}>Notifications</H1>
                <P style={{ marginTop: 4 }}>Stay up to date with what’s happening in your budget.</P>
              </View>
              {hasUnread && (
                <TouchableOpacity
                  onPress={() => {}}
                  style={{ marginLeft: 8, padding: 8, borderRadius: 8, backgroundColor: theme.colors.surfaceAlt }}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 13 }}>Mark all as read</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={<P style={{ textAlign: 'center', marginTop: 20 }}>No notifications yet.</P>}
        renderItem={({ item }) => {
          const isUnread = !item.read;
          return (
            <View
              style={{
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: theme.colors.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12
                  }}
                >
                  <Bell color={theme.colors.primary} size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>{item.title}</Text>
                    {isUnread ? (
                      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: theme.colors.primary }} />
                    ) : null}
                  </View>
                  <P style={{ marginTop: 4, fontSize: 12, color: theme.colors.textMuted }}>{item.body}</P>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 6 }}>
                    {new Date(item.createdAt).toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>
          );
        }}
      />
    </Screen>
  );
}
