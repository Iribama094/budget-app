import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * An invite code typed on the sign-up screen: a friend's, or a business's. It waits here until the new account
 * has confirmed its email, then components/Business/PendingInvite works out which kind it is and uses it.
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
