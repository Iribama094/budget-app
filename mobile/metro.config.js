// Learn more: https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * src/icons.ts imports each icon from its own file so the dev bundle carries the ~116 icons the app uses
 * rather than all ~1,670. lucide's package.json "exports" does not list those files, so Metro would warn on
 * every one and fall back; this sends them straight to the file instead.
 */
const LUCIDE = 'lucide-react-native/dist/';
// The package exports neither package.json nor dist/, so find its folder from the main entry, dist/cjs/*.js.
const lucideRoot = path.resolve(path.dirname(require.resolve('lucide-react-native')), '..', '..');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(LUCIDE)) {
    const rest = moduleName.slice(LUCIDE.length);
    return { type: 'sourceFile', filePath: path.join(lucideRoot, 'dist', rest.endsWith('.js') ? rest : `${rest}.js`) };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
