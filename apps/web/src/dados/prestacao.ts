import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { decimalParaCentavos } from '../lib/formato'
import { limitesDoMes } from '../lib/periodo'
import { traduzirErro } from './cadastros'

export type ParteSocio = {
  socio_id: string
  nome_completo: string
  cota: string
  valor: string
}

export type Fechamento = {
  id: string
  competencia: string
  status: 'Fechado' | 'Reaberto'
  total_receitas: string
  total_despesas: string
  resultado: string
  fechado_em: string
  reaberto_em: string | null
  motivo_reabertura: string | null
  fechamento_socios: ParteSocio[]
}

/** O fechamento de uma competência, se já houver. */
export function useFechamento(competencia: string) {
  return useQuery({
    queryKey: ['fechamento', competencia],
    queryFn: async (): Promise<Fechamento | null> => {
      const { data, error } = await supabase
        .from('fechamentos')
        .select(
          `id, competencia, status, total_receitas, total_despesas, resultado,
           fechado_em, reaberto_em, motivo_reabertura,
           fechamento_socios ( socio_id, nome_completo, cota, valor )`,
        )
        .eq('competencia', competencia)
        .maybeSingle()
      if (error) throw new Error(traduzirErro(error))
      return (data ?? null) as unknown as Fechamento | null
    },
  })
}

export function useFechamentos() {
  return useQuery({
    queryKey: ['fechamentos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fechamentos')
        .select('id, competencia, status, resultado, fechado_em')
        .order('competencia', { ascending: false })
      if (error) throw new Error(traduzirErro(error))
      return data ?? []
    },
  })
}

export type MovimentoDoMes = {
  id: string
  tipo: string
  valor: string
  descricao: string
  data_pagamento: string
  conciliado: boolean
  categorias: { nome: string } | null
  centros_custo: { nome: string } | null
}

/**
 * Os movimentos realizados da competência — a matéria-prima do relatório.
 *
 * Vêm crus e são agrupados na tela, e não somados pelo banco, porque o mesmo
 * conjunto alimenta três recortes diferentes (por centro, por categoria e a
 * lista de pendências). Uma consulta por recorte seria três vezes o trabalho
 * para o mesmo dado.
 */
export function useMovimentosDoMes(competencia: string) {
  const { inicio, fim } = limitesDoMes(competencia)

  return useQuery({
    queryKey: ['movimentos-do-mes', competencia],
    queryFn: async (): Promise<MovimentoDoMes[]> => {
      const { data, error } = await supabase
        .from('lancamentos')
        .select(
          `id, tipo, valor, descricao, data_pagamento, conciliado,
           categorias!categoria_id ( nome ), centros_custo!centro_id ( nome )`,
        )
        .eq('ativo', true)
        .eq('situacao', 'Realizada')
        .gte('data_pagamento', inicio)
        .lt('data_pagamento', fim)
        .order('data_pagamento')
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as unknown as MovimentoDoMes[]
    },
  })
}

/**
 * Notas fiscais do mês ainda sem documento anexado — o outro impedimento ao
 * fechamento, além da conciliação. Buscado à parte para que a tela possa
 * avisar antes do clique, em vez de devolver o erro do banco depois.
 */
export function useNotasSemAnexoNoMes(competencia: string) {
  return useQuery({
    queryKey: ['notas-sem-anexo-mes', competencia],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notas_fiscais_sem_anexo')
        .select('id, numero, emitente, valor_total')
        .eq('competencia', competencia)
      if (error) throw new Error(traduzirErro(error))
      return data ?? []
    },
  })
}

/** Fecha a competência. O banco recusa se houver pendência. */
export function useFecharPeriodo() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (competencia: string) => {
      const { error } = await supabase.rpc('fechar_periodo', { p_competencia: competencia })
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fechamento'] })
      qc.invalidateQueries({ queryKey: ['fechamentos'] })
    },
  })
}

/** Reabre a competência. Só o sócio autorizado consegue, e o motivo é exigido. */
export function useReabrirPeriodo() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ competencia, motivo }: { competencia: string; motivo: string }) => {
      const { error } = await supabase.rpc('reabrir_periodo', {
        p_competencia: competencia,
        p_motivo: motivo,
      })
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fechamento'] })
      qc.invalidateQueries({ queryKey: ['fechamentos'] })
    },
  })
}

// -----------------------------------------------------------------------------
// Aportes
// -----------------------------------------------------------------------------

export type SaldoAporte = {
  socio_id: string
  nome_curto: string
  nome_completo: string
  saldo_em_aberto: string
}

export type Aporte = {
  id: string
  tipo: 'Aporte' | 'Devolução'
  valor: string
  data: string
  observacao: string | null
  socios: { nome_curto: string } | null
  contas_bancarias: { banco: string; apelido: string } | null
}

/** Quanto cada sócio ainda tem a receber de volta do que aportou. */
export function useSaldoAportes() {
  return useQuery({
    queryKey: ['saldo-aportes'],
    queryFn: async (): Promise<SaldoAporte[]> => {
      const { data, error } = await supabase
        .from('saldo_aportes')
        .select('socio_id, nome_curto, nome_completo, saldo_em_aberto')
        .order('nome_curto')
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as SaldoAporte[]
    },
  })
}

export function useAportes() {
  return useQuery({
    queryKey: ['aportes'],
    queryFn: async (): Promise<Aporte[]> => {
      const { data, error } = await supabase
        .from('aportes')
        .select(
          `id, tipo, valor, data, observacao,
           socios!socio_id ( nome_curto ),
           contas_bancarias!conta_id ( banco, apelido )`,
        )
        .eq('ativo', true)
        .order('data', { ascending: false })
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as unknown as Aporte[]
    },
  })
}

export type NovoAporte = {
  socio_id: string
  tipo: 'Aporte' | 'Devolução'
  valor: string
  data: string
  conta_id: string
  observacao: string | null
}

/**
 * Registra o aporte ou a devolução. O lançamento que mexe no saldo da conta é
 * criado pelo banco — aporte entra no caixa mas não é receita, e é isso que o
 * mantém fora do resultado do mês.
 */
export function useCriarAporte() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (novo: NovoAporte) => {
      const { error } = await supabase.from('aportes').insert(novo)
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aportes'] })
      qc.invalidateQueries({ queryKey: ['saldo-aportes'] })
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      qc.invalidateQueries({ queryKey: ['saldos'] })
    },
  })
}

// -----------------------------------------------------------------------------
// Agrupamentos do relatório
// -----------------------------------------------------------------------------

export type Agrupado = { nome: string; receitas: number; despesas: number; resultado: number }

/** Soma receitas e despesas por centro de custo ou por categoria, em centavos. */
export function agrupar(
  movimentos: MovimentoDoMes[],
  por: 'centro' | 'categoria',
): Agrupado[] {
  const mapa = new Map<string, Agrupado>()

  for (const m of movimentos) {
    if (m.tipo !== 'Receita' && m.tipo !== 'Despesa') continue

    const nome =
      (por === 'centro' ? m.centros_custo?.nome : m.categorias?.nome) ?? 'Sem classificação'
    const atual = mapa.get(nome) ?? { nome, receitas: 0, despesas: 0, resultado: 0 }
    const centavos = decimalParaCentavos(m.valor)

    if (m.tipo === 'Receita') atual.receitas += centavos
    else atual.despesas += centavos
    atual.resultado = atual.receitas - atual.despesas

    mapa.set(nome, atual)
  }

  return [...mapa.values()].sort((a, b) => b.receitas - b.despesas - (a.receitas - a.despesas))
}

/** Totais do mês, em centavos, a partir dos movimentos realizados. */
export function totaisDoMes(movimentos: MovimentoDoMes[]) {
  let receitas = 0
  let despesas = 0
  let aportes = 0
  let devolucoes = 0

  for (const m of movimentos) {
    const centavos = decimalParaCentavos(m.valor)
    if (m.tipo === 'Receita') receitas += centavos
    else if (m.tipo === 'Despesa') despesas += centavos
    else if (m.tipo === 'Aporte') aportes += centavos
    else if (m.tipo === 'Devolução') devolucoes += centavos
  }

  return { receitas, despesas, resultado: receitas - despesas, aportes, devolucoes }
}
