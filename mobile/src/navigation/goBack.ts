import { anySheetOpen } from '../components/Common/AppModal';
import { afterSheetCloses } from '../lib/afterSheetCloses';

type Nav = { canGoBack?: () => boolean; goBack: () => void; navigate: (name: string, params?: any) => void };

/**
 * Going back, safely. A screen opened from a notification, a deep link or right after the plan setup reset can
 * be the only screen on the stack; calling goBack() there does nothing and React Navigation warns that the
 * GO_BACK action was not handled. In that case we land on the main tabs instead.
 */
export function goBackOrHome(nav: Nav): void {
  // Leaving while a sheet is still sliding away takes two layers down at once, which can leave the app frozen
  // until it is reloaded. Waiting for the sheet costs a moment and only happens when one is actually open.
  if (anySheetOpen()) {
    afterSheetCloses(() => leave(nav));
    return;
  }
  leave(nav);
}

function leave(nav: Nav): void {
  if (typeof nav.canGoBack !== 'function' || nav.canGoBack()) {
    nav.goBack();
    return;
  }
  nav.navigate('Main');
}
