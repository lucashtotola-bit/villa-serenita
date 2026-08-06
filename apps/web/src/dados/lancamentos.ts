import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { limitesDoMes } from '../lib/periodo'
import { traduzirErro } from './cadastros'

export type TipoLancamento =
  | 'Receita'
  | 'Despesa'
  | 'Transferência'
  | 'Aporte'
  | 'Devolução'

export type OrigemLancamento =
  | 'Avulso'
  | 'Nota fiscal'
  | 'Dívida'
  | 'Reserva'
  | 'Café'
  | 'Transferência'
  | 'Aporte'

export type Lancamento = {
  id: string
  tipo: TipoLancamento
  situacao: 'Prevista' | 'Realizada'
  descricao: string
  /** numeric(14,2) chega como texto, para não perder precisão no caminho. */
  valor: string
  data_vencimento: string
  data_pagamento: string | null
  data_referencia: string
  conciliado: boolean
  sentido: 'Entrada' | 'Saída' | null
  origem: OrigemLancamento
  conta_id: string
  categoria_id: string | null
  centro_id: string | null
  clifor_id: string | null
  observacao: string | null
  categorias: { nome: string } | null
  centros_custo: { nome: string } | null
  contas_bancarias: { banco: string; apelido: string } | null
  clientes_fornecedores: { nome: string } | null
}

export type SaldoConta = {
  conta_id: string
  banco: string
  apelido: string
  tipo: string
  saldo_inicial: string
  data_saldo_inicial: string
  saldo_atual: string
}

const CAMPOS = `
  id, tipo, situacao, descricao, valor,
  data_vencimento, data_pagamento, data_referencia,
  conciliado, sentido, origem, conta_id, categoria_id, centro_id, clifor_id, observacao,
  categorias ( nome ),
  centros_custo ( nome ),
  contas_bancarias ( banco, apelido ),
  clientes_fornecedores ( nome )
`

/** Lançamentos de um mês, opcionalmente de um tipo e de uma conta. */
export function useLancamentos(opcoes: {
  competencia: string
  tipo?: TipoLancamento
  contaId?: string
}) {
  const { competencia, tipo, contaId } = opcoes
  const { inicio, fim } = limitesDoMes(competencia)

  return useQuery({
    queryKey: ['lancamentos', competencia, tipo ?? 'todos', contaId ?? 'todas'],
    queryFn: async (): Promise<Lancamento[]> => {
      let consulta = supabase
        .from('lancamentos')
        .select(CAMPOS)
        .eq('ativo', true)
        .gte('data_referencia', inicio)
        .lt('data_referencia', fim)
        .order('data_referencia', { ascending: false })

      if (tipo) consulta = consulta.eq('tipo', tipo)
      if (contaId) consulta = consulta.eq('conta_id', contaId)

      const { data, error } = await consulta
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as unknown as Lancamento[]
    },
  })
}

export type NovoLancamento = {
  tipo: 'Receita' | 'Despesa'
  situacao: 'Prevista' | 'Realizada'
  descricao: string
  valor: string
  data_vencimento: string
  data_pagamento: string | null
  conta_id: string
  categoria_id: string
  centro_id: string
  clifor_id: string | null
  observacao: string | null
}

export function useCriarLancamento() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (novo: NovoLancamento) => {
      const { error } = await supabase.from('lancamentos').insert(novo)
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => {
      // O saldo das contas deriva dos lançamentos, então acompanha a gravação.
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      qc.invalidateQueries({ queryKey: ['saldos'] })
    },
  })
}

/**
 * Edita um lançamento não conciliado. O banco recusa alterações num
 * conciliado (migração 0003) e mudanças de tipo/origem num gerado (migração
 * 0011); a tela trava o valor dos gerados antes disso, para o erro nem
 * acontecer. A mensagem do Postgres já chega traduzida.
 */
export function useAtualizarLancamento() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...campos }: NovoLancamento & { id: string }) => {
      const { error } = await supabase.from('lancamentos').update(campos).eq('id', id)
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      qc.invalidateQueries({ queryKey: ['saldos'] })
    },
  })
}

/** Arquiva um lançamento avulso — nunca apaga. Recusado se já conciliado. */
export function useArquivarLancamento() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lancamentos').update({ ativo: false }).eq('id', id)
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      qc.invalidateQueries({ queryKey: ['saldos'] })
    },
  })
}

/** Saldo atual de cada conta — calculado pelo banco, nunca digitado. */
export function useSaldos() {
  return useQuery({
    queryKey: ['saldos'],
    queryFn: async (): Promise<SaldoConta[]> => {
      const { data, error } = await supabase
        .from('saldos_contas')
        .select('*')
        .order('banco')
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as SaldoConta[]
    },
  })
}
