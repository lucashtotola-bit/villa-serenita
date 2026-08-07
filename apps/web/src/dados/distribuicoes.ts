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
 * Grava a retirada e a divisão entre os sócios numa chamada só (migração 0015).
 * Se a divisão for recusada, nem a retirada é gravada — sem partes ela não
 * significa nada e ninguém receberia.
 *
 * O nome e a cota de cada parte são gravados pelo banco a partir de `socios`.
 * Eles são uma fotografia, para o registro de hoje continuar legível se o
 * cadastro mudar amanhã — e fotografia se tira da fonte, não do que esta aba
 * tinha em memória. Por isso vai só o `socio_id` e o valor.
 */
export function useCriarDistribuicao() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (nova: NovaDistribuicao) => {
      const { partes, ...campos } = nova

      const { data, error } = await supabase.rpc('criar_distribuicao', {
        p_data: campos.data,
        p_valor_total: campos.valor_total,
        p_competencia_referencia: campos.competencia_referencia,
        p_conta_id: campos.conta_id,
        p_observacao: campos.observacao,
        p_partes: partes.map((p) => ({ socio_id: p.socio_id, valor: p.valor })),
      })
      if (error) throw new Error(traduzirErro(error))

      return data as string
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

/**
 * Arquiva uma retirada lançada por engano.
 *
 * Não existe editar: alterar o total ou a divisão deixaria os lançamentos por
 * sócio apontando para outros números (migração 0016). Arquivar leva todos
 * eles junto — arquivar metade de uma partilha não é um estado que signifique
 * algo. Recusado se qualquer um já estiver conciliado.
 */
export function useArquivarDistribuicao() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('distribuicoes').update({ ativo: false }).eq('id', id)
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['distribuicoes'] })
      qc.invalidateQueries({ queryKey: ['distribuido-por-socio'] })
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      qc.invalidateQueries({ queryKey: ['saldos'] })
    },
  })
}
