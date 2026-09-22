import { useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTeam } from '../../contexts/TeamContext';
import { useCode } from '../../api/join';
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
  const { enter, refresh } = useTeam();
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
        // Any other kind of code: a business, a shared budget, or someone's money to help with.
        const res = await useCode(code);
        if (res.kind === 'business' && res.ownerId) {
          await enter(res.ownerId);
          toast.show(`Welcome to ${res.name}. You’re in as ${res.roleLabel}.`, 'success', 5000);
        } else if (res.kind === 'helper') {
          toast.show(`You can now help with ${res.name}. It’s in Profile, People who help.`, 'success', 5000);
        } else {
          toast.show(`You’ve joined ${res.name}. It’s in Budgets.`, 'success', 5000);
        }
      } catch (e) {
        toast.show(
          e instanceof Error
            ? `${e.message} You can enter it again later: a friend’s code in Profile, "Invite friends", or any other code in Settings, "Join with a code".`
            : 'That code didn’t work.',
          'error',
          6000
        );
      }
      void refresh();
    })();
  }, [enter, refresh, refreshUser, toast, user]);

  return null;
}
