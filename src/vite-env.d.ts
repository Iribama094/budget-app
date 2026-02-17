/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_USE_STUBS?: string;
  readonly VITE_ALWAYS_SHOW_ONBOARDING?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
