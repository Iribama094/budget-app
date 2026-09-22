/**
 * What makes a password acceptable, shared by sign up, change password and reset.
 *
 * Attackers do not guess at random. They try the passwords people pick most, and passwords leaked from other
 * sites, against thousands of accounts at once. Length alone does not stop that: "12345678" and "password"
 * are both eight characters. So as well as the length the server enforces, this asks for letters and numbers
 * together and turns away the handful of choices that fall first.
 */

export const MIN_PASSWORD = 8;

// The most tried passwords, plus the ones people here reach for. Compared after lower-casing.
const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', '12345678', '123456789', '1234567890',
  '87654321', '11111111', '00000000', '12341234', '11223344', 'abcd1234', 'abc12345', 'qwerty12', 'qwerty123',
  'qwertyuiop', '1q2w3e4r', 'iloveyou', 'iloveyou1', 'letmein1', 'welcome1', 'welcome123', 'admin123', 'football1',
  'princess1', 'sunshine1', 'nigeria1', 'nigeria123', 'naija123', 'lagos123', 'abuja123', 'jesus123', 'godisgood',
  'blessed1', 'blessing1', 'budgetfriendly', 'budget123', 'money123', 'moneyman1'
]);

/** The one thing wrong with a password, in words somebody can act on, or null when it is fine. */
export function passwordProblem(password: string, email?: string): string | null {
  if (!password) return null;
  if (password.length < MIN_PASSWORD) {
    const left = MIN_PASSWORD - password.length;
    return `${left} more character${left === 1 ? '' : 's'} to go`;
  }
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return 'That one is among the first passwords people try. Pick something only you would think of.';
  if (!/[a-z]/i.test(password) || !/[0-9]/.test(password)) return 'Mix letters and numbers.';
  const handle = (email ?? '').split('@')[0]?.toLowerCase();
  if (handle && handle.length >= 4 && lower.includes(handle)) return 'Leave your email out of your password.';
  return null;
}

export const PASSWORD_HINT = `At least ${MIN_PASSWORD} characters, with letters and numbers.`;
