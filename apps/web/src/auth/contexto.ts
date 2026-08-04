import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Socio } from '../lib/tipos'

/**
 * Situação do usuário no aplicativo.
 *
 * Entrar pelo Google e ter acesso são coisas diferentes: o Google apenas
 * confirma quem a pessoa é. Quem decide se ela pode usar o sistema é a tabela
 * `socios` — por isso existe o estado `negado`, para quem se identificou mas
 * não está autorizado.
 */
export type SituacaoAuth =
  | 'carregando'
  | 'deslogado'
  | 'verificando'
  | 'autorizado'
  | 'negado'

export type ContextoAuth = {
  situacao: SituacaoAuth
  sessao: Session | null
  /** Preenchido apenas quando a situação é `autorizado`. */
  socio: Socio | null
  /** E-mail que o Google devolveu — usado na tela de acesso negado. */
  emailTentado: string | null
  erro: string | null
  entrarComGoogle: () => Promise<void>
  sair: () => Promise<void>
}

export const AuthContext = createContext<ContextoAuth | null>(null)

export function useAuth(): ContextoAuth {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth precisa estar dentro de <AuthProvider>.')
  }
  return ctx
}
