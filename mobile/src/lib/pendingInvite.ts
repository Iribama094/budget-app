import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A business invite code typed on the sign-up screen. It waits here until the new account has confirmed its
 * email, then the app joins the business and opens straight into it (components/Business/PendingInvite).
 */
const KEY = 'bf_pending_team_code_v1';

export const savePendingInvite = (code: string) => AsyncStorage.setItem(KEY, code.trim().toUpperCase()).catch(() => undefined);
export const takePendingInvite = async (): Promise<string | null> => {
  try {
    const code = await AsyncStorage.getItem(KEY);
    if (code) await AsyncStorage.removeItem(KEY);
    return code || null;
  } catch {
    return null;
  }
};
