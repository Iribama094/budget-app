/**
 * What to show someone when something failed.
 *
 * The API sends a sentence written for the person (`{ error: { message } }`), and api/client turns that into an
 * Error, so its message is nearly always the right thing to show. Anything else (no network, a bug) has no
 * message worth reading, so the caller's fallback is used instead.
 */
export function errorMessage(e: unknown, fallback = 'Could not load this'): string {
  return e instanceof Error && e.message.trim() ? e.message : fallback;
}
