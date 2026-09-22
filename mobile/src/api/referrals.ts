import { apiFetch } from './client';

/**
 * Invite friends. `joined` signed up with your code, `counted` have also confirmed their email and recorded
 * something, and `waitlist` used it on the waitlist and aren't in the app yet.
 */
export type ApiReferrals = {
  code: string;
  link: string;
  message: string;
  joined: number;
  counted: number;
  waitlist: number;
  invitedBy: string | null;
  canEnterCode: boolean;
};

export const getReferrals = (): Promise<ApiReferrals> => apiFetch('/v1/referrals', { method: 'GET' });
export const claimReferral = (code: string): Promise<{ invitedBy: string }> =>
  apiFetch('/v1/referrals/claim', { method: 'POST', body: JSON.stringify({ code }) });
