import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Socio } from '../lib/tipos'
import { AuthContext, type ContextoAuth, type SituacaoAuth } from './contexto'

/**
 * Controla quem está logado e se essa pessoa pode usar o sistema.
 *
 * São duas perguntas separadas:
 *   1. Quem é você?      -> responde o Google, via Supabase Auth
 *   2. Você pode entrar? -> responde o banco, pela tabela `socios`
 *
 * A segunda pergunta não é feita "por educação": mesmo que alguém burlasse
 * esta tela, as regras (RLS) do banco continuariam recusando os dados. A
 * verificação aqui existe para dar uma mensagem clara em vez de uma tela vazia.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [sessaoCarregada, setSessaoCarregada] = useState(false)
  const [socio, setSocio] = useState<Socio | null>(null)
  const [socioVerificado, setSocioVerificado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Sessão atual + acompanhamento de entradas e saídas.
  useEffect(() => {
    let ativo = true

    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return
      setSessao(data.session)
      setSessaoCarregada(true)
    })

    const { data: inscricao } = supabase.auth.onAuthStateChange((_evento, nova) => {
      // Só guarda a sessão aqui. Consultar o banco dentro deste retorno de
      // chamada pode travar o cliente do Supabase, então a checagem do sócio
      // fica no efeito abaixo.
      setSessao(nova)
      setSessaoCarregada(true)
    })

    return () => {
      ativo = false
      inscricao.subscription.unsubscribe()
    }
  }, [])

  // Com sessão em mãos, pergunta ao banco se este e-mail está autorizado.
  useEffect(() => {
    if (!sessaoCarregada) return

    if (!sessao) {
      setSocio(null)
      setSocioVerificado(true)
      return
    }

    let ativo = true
    setSocioVerificado(false)

    const email = sessao.user.email?.toLowerCase() ?? ''

    supabase
      .from('socios')
      .select(
        'id, nome_completo, nome_curto, email, cota, pode_entrar, ' +
          'pode_receber_nf, pode_desfazer_conciliacao, ativo',
      )
      .eq('email', email)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!ativo) return
        // Sem linha não é falha: as regras do banco simplesmente não devolvem
        // nada para quem não está autorizado.
        if (error) setErro(error.message)
        setSocio((data as Socio | null) ?? null)
        setSocioVerificado(true)
      })

    return () => {
      ativo = false
    }
  }, [sessao, sessaoCarregada])

  const entrarComGoogle = useCallback(async () => {
    setErro(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        // Deixa a pessoa escolher a conta, em vez de reaproveitar a última.
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) setErro(error.message)
  }, [])

  const sair = useCallback(async () => {
    setErro(null)
    await supabase.auth.signOut()
    setSocio(null)
  }, [])

  const situacao: SituacaoAuth = useMemo(() => {
    if (!sessaoCarregada) return 'carregando'
    if (!sessao) return 'deslogado'
    if (!socioVerificado) return 'verificando'
    return socio ? 'autorizado' : 'negado'
  }, [sessaoCarregada, sessao, socioVerificado, socio])

  const valor: ContextoAuth = useMemo(
    () => ({
      situacao,
      sessao,
      socio,
      emailTentado: sessao?.user.email ?? null,
      erro,
      entrarComGoogle,
      sair,
    }),
    [situacao, sessao, socio, erro, entrarComGoogle, sair],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}
