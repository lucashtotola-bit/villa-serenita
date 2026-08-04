import { createClient } from '@supabase/supabase-js'

/**
 * Conexão única com o Supabase, compartilhada por todo o aplicativo.
 *
 * A chave usada aqui é a *publicável*: ela apenas identifica o projeto. Quem
 * decide o que cada pessoa pode ler ou gravar são as regras (RLS) dentro do
 * banco — nenhum dado é liberado só por alguém ter esta chave.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !chave) {
  throw new Error(
    'Configuração ausente: crie o arquivo apps/web/.env a partir de .env.example ' +
      'e preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.',
  )
}

export const supabase = createClient(url, chave, {
  auth: {
    // Mantém a sessão salva no navegador e renova sozinha, para o usuário não
    // precisar entrar de novo a cada vez que abre o aplicativo.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
