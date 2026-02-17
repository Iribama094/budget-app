import React, { createContext, useContext, useMemo, useState } from 'react';

export type AmountVisibilityState = {
  showAmounts: boolean;
  setShowAmounts: (value: boolean) => void;
  toggleShowAmounts: () => void;
};

const AmountVisibilityContext = createContext<AmountVisibilityState | undefined>(undefined);

export function AmountVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [showAmounts, setShowAmounts] = useState(true);

  const value = useMemo<AmountVisibilityState>(
    () => ({
      showAmounts,
      setShowAmounts,
      toggleShowAmounts: () => setShowAmounts((v) => !v)
    }),
    [showAmounts]
  );

  return <AmountVisibilityContext.Provider value={value}>{children}</AmountVisibilityContext.Provider>;
}

export function useAmountVisibility(): AmountVisibilityState {
  const ctx = useContext(AmountVisibilityContext);
  if (!ctx) throw new Error('useAmountVisibility must be used within AmountVisibilityProvider');
  return ctx;
}
