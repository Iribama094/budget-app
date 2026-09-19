import { Platform } from 'react-native';
import { isRunningInExpoGo, registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Expo Go has no widget native module, and loading the library there throws, so widgets need a development or store build.
if (Platform.OS === 'android' && !isRunningInExpoGo()) {
  // Renders the home-screen widget in the background (react-native-android-widget).
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  registerWidgetTaskHandler(require('./src/widgets/widgetTaskHandler').widgetTaskHandler);
}
