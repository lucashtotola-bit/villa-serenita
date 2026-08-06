import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { traduzirErro } from './cadastros'

export type ParteDistribuicao = {
  id: string
  socio_id: string
  nome_completo: string
  cota: string
  valor: string
  lancamento_id: string | null
}

export type Distribuicao = {
  id: string
  data: string
  valor_total: string
  competencia_referencia: string | null
  observacao: string | null
  contas_bancarias: { banco: string; apelido: string } | null
  distribuicao_socios: ParteDistribuicao[]
}

const CAMPOS = `
  id, data, valor_total, competencia_referencia, observacao,
  contas_bancarias!conta_id ( banco, apelido ),
  distribuicao_socios ( id, socio_id, nome_completo, cota, valor, lancamento_id )
`

/** As distribuições já feitas, da mais recente para a mais antiga. */
export function useDistribuicoes() {
  return useQuery({
    queryKey: ['distribuicoes'],
    queryFn: async (): Promise<Distribuicao[]> => {
      const { data, error } = await supabase
        .from('distribuicoes')
        .select(CAMPOS)
        .eq('ativo', true)
        .order('data', { ascending: false })
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as unknown as Distribuicao[]
    },
  })
}

/** Quanto de lucro cada sócio já retirou — não confundir com aporte em aberto. */
export function useDistribuidoPorSocio() {
  return useQuery({
    queryKey: ['distribuido-por-socio'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('distribuido_por_socio')
        .select('socio_id, nome_curto, nome_completo, total_recebido')
        .order('nome_curto')
      if (error) throw new Error(traduzirErro(error))
      return data ?? []
    },
  })
}

/** Os sócios com a cota de cada um — a base da sugestão de rateio. */
export function useSociosComCota() {
  return useQuery({
    queryKey: ['socios-com-cota'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('socios')
        .select('id, nome_curto, nome_completo, cota')
        .eq('ativo', true)
        .order('nome_curto')
      if (error) throw new Error(traduzirErro(error))
      return data ?? []
    },
  })
}

export type NovaDistribuicao = {
  data: string
  valor_total: string
  competencia_referencia: string | null
  conta_id: string
  observacao: string | null
  partes: { socio_id: string; nome_completo: string; cota: string; valor: string }[]
}

/**
 * Grava a retirada e a divisão entre os sócios.
 *
 * As partes entram numa única chamada porque a trava de "soma bate com o
 * total" é diferida até o fim da transação — uma a uma, a primeira falharia
 * sozinha. Se elas forem recusadas, a distribuição recém-criada é desfeita:
 * sem partes, ela não significa nada e ninguém receberia.
 */
export function useCriarDistribuicao() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (nova: NovaDistribuicao) => {
      const { partes, ...campos } = nova

      const { data: distribuicao, error: erroDist } = await supabase
        .from('distribuicoes')
        .insert(campos)
        .select('id')
        .single()
      if (erroDist) throw new Error(traduzirErro(erroDist))

      const { error: erroPartes } = await supabase
        .from('distribuicao_socios')
        .insert(partes.map((p) => ({ ...p, distribuicao_id: distribuicao.id })))

      if (erroPartes) {
        await supabase.from('distribuicoes').delete().eq('id', distribuicao.id)
        throw new Error(traduzirErro(erroPartes))
      }

      return distribuicao.id as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['distribuicoes'] })
      qc.invalidateQueries({ queryKey: ['distribuido-por-socio'] })
      // Cada parte virou uma saída de caixa.
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      qc.invalidateQueries({ queryKey: ['saldos'] })
    },
  })
}
