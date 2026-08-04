/// <reference types="vite/client" />

// Declara as variáveis do .env para o TypeScript avisar em tempo de edição
// se alguma for usada com nome errado.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
