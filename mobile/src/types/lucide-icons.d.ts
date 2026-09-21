// The per-icon files src/icons.ts imports ship without their own type declarations. Each one is a single
// LucideIcon, the same type the package's main entry gives it.
declare module 'lucide-react-native/dist/esm/icons/*' {
  import type { LucideIcon } from 'lucide-react-native';
  const Icon: LucideIcon;
  export default Icon;
}
