/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'SafeToSpendWidget',
  displayName: 'Safe to spend',
  deploymentTarget: '17.0',
  colors: {
    $widgetBackground: '#0D2B26',
    $accent: '#3FA38F'
  },
  entitlements: {
    // Same App Group as the app, so the widget can read what Home publishes.
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups']
  }
});
