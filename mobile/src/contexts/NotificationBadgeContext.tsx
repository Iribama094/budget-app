import React, { createContext, useContext, useState } from 'react';

interface NotificationBadgeContextValue {
  hasUnreadNotifications: boolean;
  setHasUnreadNotifications: (value: boolean) => void;
  hasAssistantUnread: boolean;
  setHasAssistantUnread: (value: boolean) => void;
}

const NotificationBadgeContext = createContext<NotificationBadgeContextValue | undefined>(undefined);

export function NotificationBadgeProvider({ children }: { children: React.ReactNode }) {
  // Set from the server feed by AppServices.
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const [hasAssistantUnread, setHasAssistantUnread] = useState(false);

  return (
    <NotificationBadgeContext.Provider
      value={{ hasUnreadNotifications, setHasUnreadNotifications, hasAssistantUnread, setHasAssistantUnread }}
    >
      {children}
    </NotificationBadgeContext.Provider>
  );
}

export function useNotificationBadges() {
  const ctx = useContext(NotificationBadgeContext);
  if (!ctx) throw new Error('useNotificationBadges must be used within NotificationBadgeProvider');
  return ctx;
}
