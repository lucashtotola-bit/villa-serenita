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
  | 'Distribuição'

/**
 * As origens que nascem como compromisso a pagar/receber — as únicas que podem
 * voltar a "previsto".
 *
 * Transferência, aporte, café e distribuição nascem realizados: já houve
 * movimento no banco. Estornar um deles desfaria só metade da operação (sairia
 * do saldo, mas continuaria em `saldo_aportes`, `estoque_cafe` ou
 * `distribuido_por_socio`), então quem desfaz é a tela de origem. O banco
 * recusa desde a migração 0014; aqui a tela apenas não oferece o botão.
 */
const ORIGENS_ESTORNAVEIS: OrigemLancamento[] = [
  'Avulso',
  'Nota fiscal',
  'Dívida',
  'Reserva',
]

export function podeEstornar(l: Lancamento): boolean {
  return (
    l.situacao === 'Realizada' &&
    !l.conciliado &&
    ORIGENS_ESTORNAVEIS.includes(l.origem)
  )
}

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
  juros: string
  multa: string
  desconto: string
  /** Compromisso antes dos acréscimos. Nulo = a baixa saiu pelo combinado. */
  valor_original: string | null
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
  conciliado, sentido, origem, juros, multa, desconto, valor_original,
  conta_id, categoria_id, centro_id, clifor_id, observacao,
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

/**
 * Dá baixa: o compromisso previsto vira realizado, com a data em que o
 * dinheiro de fato entrou ou saiu.
 *
 * Vale para lançamento de qualquer origem — uma parcela de nota fiscal
 * precisa ser baixada tanto quanto uma despesa avulsa, e marcar como paga não
 * mexe no valor que a nota garante. Só o valor continua travado na origem.
 *
 * A baixa em lote roda um `update` por lançamento em vez de um `in(ids)`
 * único: cada linha passa pelos gatilhos do banco (conciliado é somente
 * leitura, origem travada) e uma recusa isolada não pode derrubar as demais.
 * O retorno diz quantas passaram e quais falharam, para a tela ser honesta
 * sobre um sucesso parcial.
 */
export type Acrescimos = { juros: number; multa: number; desconto: number }

export function useBaixarLancamentos() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      ids,
      dataPagamento,
      contaId,
      acrescimos,
    }: {
      ids: string[]
      dataPagamento: string
      contaId?: string
      /** Em centavos, por lançamento. Ausente = baixa pelo valor combinado. */
      acrescimos?: Record<string, Acrescimos>
    }) => {
      const falhas: string[] = []

      for (const id of ids) {
        const a = acrescimos?.[id]
        // A conta (previsto + juros + multa − desconto) é feita pelo banco, e
        // não aqui: são quatro campos que precisam mudar juntos e coerentes.
        const { error } = await supabase.rpc('baixar_lancamento', {
          p_lancamento_id: id,
          p_data_pagamento: dataPagamento,
          p_juros: (a?.juros ?? 0) / 100,
          p_multa: (a?.multa ?? 0) / 100,
          p_desconto: (a?.desconto ?? 0) / 100,
          p_conta_id: contaId ?? null,
        })
        if (error) falhas.push(traduzirErro(error))
      }

      return { baixados: ids.length - falhas.length, falhas }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      qc.invalidateQueries({ queryKey: ['saldos'] })
      qc.invalidateQueries({ queryKey: ['compromissos'] })
      qc.invalidateQueries({ queryKey: ['contas-abertas'] })
      // Parcelas de NF e de dívida mudam de situação junto.
      qc.invalidateQueries({ queryKey: ['notas-fiscais'] })
      qc.invalidateQueries({ queryKey: ['dividas'] })
    },
  })
}

/**
 * Desfaz a baixa: volta a previsto. Serve para o engano do dia a dia —
 * baixou a parcela errada, ou a data estava errada. O banco recusa se o
 * lançamento já tiver sido conciliado com o extrato.
 */
export function useEstornarBaixa() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('estornar_baixa', { p_lancamento_id: id })
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      qc.invalidateQueries({ queryKey: ['saldos'] })
      qc.invalidateQueries({ queryKey: ['compromissos'] })
      qc.invalidateQueries({ queryKey: ['contas-abertas'] })
    },
  })
}

/**
 * Tudo o que está previsto e ainda não foi baixado — de qualquer mês.
 *
 * Diferente da tela de Lançamentos, aqui o recorte não é o mês: uma conta
 * vencida em maio continua sendo uma conta a pagar hoje, e sumir da lista
 * por causa do calendário é exatamente como uma conta é esquecida.
 */
export function useContasAbertas(tipo: 'Receita' | 'Despesa') {
  return useQuery({
    queryKey: ['contas-abertas', tipo],
    queryFn: async (): Promise<Lancamento[]> => {
      const { data, error } = await supabase
        .from('lancamentos')
        .select(CAMPOS)
        .eq('ativo', true)
        .eq('situacao', 'Prevista')
        .eq('tipo', tipo)
        .order('data_vencimento')
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as unknown as Lancamento[]
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
