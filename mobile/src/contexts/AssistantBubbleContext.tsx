import React, { createContext, useContext, useState } from 'react';

interface AssistantBubbleContextValue {
  showAssistantBubble: boolean;
  setShowAssistantBubble: (value: boolean) => void;
}

const AssistantBubbleContext = createContext<AssistantBubbleContextValue | undefined>(undefined);

export function AssistantBubbleProvider({ children }: { children: React.ReactNode }) {
  const [showAssistantBubble, setShowAssistantBubble] = useState(true);

  return (
    <AssistantBubbleContext.Provider value={{ showAssistantBubble, setShowAssistantBubble }}>
      {children}
    </AssistantBubbleContext.Provider>
  );
}

export function useAssistantBubble() {
  const ctx = useContext(AssistantBubbleContext);
  if (!ctx) throw new Error('useAssistantBubble must be used within AssistantBubbleProvider');
  return ctx;
}
