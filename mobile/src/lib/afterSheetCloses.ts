/**
 * Runs `next` once a sheet (a React Native Modal) has finished sliding away.
 *
 * On iPhone, closing a sheet and in the same moment opening another sheet, or going to a screen that opens as a
 * full-page modal (Add transaction), can leave the app frozen until it is reloaded: the phone is still taking
 * the first one down when it's asked to put the next one up. Waiting for the close animation avoids that.
 * Use it whenever a button inside a sheet closes the sheet and then opens something else.
 */
const SHEET_CLOSE_MS = 380;

export function afterSheetCloses(next: () => void) {
  setTimeout(next, SHEET_CLOSE_MS);
}
