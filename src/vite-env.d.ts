/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_ROSTER_SHEET_ID?: string;
  readonly VITE_CALLOFF_SHEET_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
