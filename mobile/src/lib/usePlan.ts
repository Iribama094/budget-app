import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { getPlan, type ApiPlan } from '../api/personal';

/** The person's plan, refreshed each time the screen comes into focus. Pass false to skip loading (e.g. in Business). */
export function usePlan(enabled = true): ApiPlan | null {
  const [plan, setPlan] = useState<ApiPlan | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      let cancelled = false;
      getPlan()
        .then((p) => !cancelled && setPlan(p))
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, [enabled])
  );
  return enabled ? plan : null;
}
