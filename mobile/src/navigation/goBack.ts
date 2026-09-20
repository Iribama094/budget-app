type Nav = { canGoBack?: () => boolean; goBack: () => void; navigate: (name: string, params?: any) => void };

/**
 * Going back, safely. A screen opened from a notification, a deep link or right after the plan setup reset can
 * be the only screen on the stack; calling goBack() there does nothing and React Navigation warns that the
 * GO_BACK action was not handled. In that case we land on the main tabs instead.
 */
export function goBackOrHome(nav: Nav): void {
  if (typeof nav.canGoBack !== 'function' || nav.canGoBack()) {
    nav.goBack();
    return;
  }
  nav.navigate('Main');
}
