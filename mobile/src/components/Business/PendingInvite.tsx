import { useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTeam } from '../../contexts/TeamContext';
import { useToast } from '../Common/Toast';
import { skipOnboarding } from '../../api/personal';
import { takePendingInvite } from '../../lib/pendingInvite';

/**
 * Finishes joining with a code typed at sign-up, once the account is ready. Someone who came to work in a
 * business skips the personal money setup (offered later, from Profile) and lands straight in the business.
 */
export function PendingInvite() {
  const { user, refreshUser } = useAuth();
  const { join } = useTeam();
  const toast = useToast();
  const tried = useRef(false);

  useEffect(() => {
    if (!user || user.emailVerified === false || tried.current) return;
    tried.current = true;
    void (async () => {
      const code = await takePendingInvite();
      if (!code) return;
      try {
        if (user.onboarding && !user.onboarding.completedAt && !user.onboarding.skippedAt) {
          await skipOnboarding().catch(() => undefined);
          await refreshUser();
        }
        const m = await join(code);
        toast.show(`Welcome to ${m.name}. You’re in as ${m.roleLabel}.`, 'success', 5000);
      } catch (e) {
        toast.show(e instanceof Error ? `${e.message} You can enter the code again in Settings, "Join a business".` : 'That code didn’t work.', 'error', 6000);
      }
    })();
  }, [join, refreshUser, toast, user]);

  return null;
}
