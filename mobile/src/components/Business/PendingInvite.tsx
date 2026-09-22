import { useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTeam } from '../../contexts/TeamContext';
import { useToast } from '../Common/Toast';
import { skipOnboarding } from '../../api/personal';
import { takePendingInvite } from '../../lib/pendingInvite';
import { claimReferral } from '../../api/referrals';

/**
 * Finishes joining with a code typed at sign-up, once the account is ready. One field takes both kinds of code,
 * so a friend's code is tried first and then a business's. Someone who came to work in a business skips the
 * personal money setup (offered later, from Profile) and lands straight in the business.
 */
export function PendingInvite() {
  const { user, refreshUser } = useAuth();
  const { join, enter } = useTeam();
  const toast = useToast();
  const tried = useRef(false);

  useEffect(() => {
    if (!user || user.emailVerified === false || tried.current) return;
    tried.current = true;
    void (async () => {
      const code = await takePendingInvite();
      if (!code) return;
      try {
        const friend = await claimReferral(code);
        toast.show(`Welcome. ${friend.invitedBy} invited you.`, 'success', 4000);
        return;
      } catch {
        // Not a friend's code (or they already have one): try it as a business code.
      }
      try {
        if (user.onboarding && !user.onboarding.completedAt && !user.onboarding.skippedAt) {
          await skipOnboarding().catch(() => undefined);
          await refreshUser();
        }
        const m = await join(code);
        await enter(m.ownerId);
        toast.show(`Welcome to ${m.name}. You’re in as ${m.roleLabel}.`, 'success', 5000);
      } catch (e) {
        toast.show(
          e instanceof Error
            ? `${e.message} You can enter it again later: a friend’s code in Profile, "Invite friends", or a business code in Settings, "Join a business".`
            : 'That code didn’t work.',
          'error',
          6000
        );
      }
    })();
  }, [join, refreshUser, toast, user]);

  return null;
}
