import React, { createContext, useContext, useState } from 'react';

interface NotificationBadgeContextValue {
  hasUnreadNotifications: boolean;
  setHasUnreadNotifications: (value: boolean) => void;
  hasAssistantUnread: boolean;
  setHasAssistantUnread: (value: boolean) => void;
}

const NotificationBadgeContext = createContext<NotificationBadgeContextValue | undefined>(undefined);

export function NotificationBadgeProvider({ children }: { children: React.ReactNode }) {
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(true); // show dot by default until user visits center
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
