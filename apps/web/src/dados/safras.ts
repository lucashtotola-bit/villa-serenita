import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { traduzirErro } from './cadastros'

export type SafraEtapa = {
  id: string
  nome: string
  ordem: number
  data_inicio: string
  data_fim: string
  observacao: string | null
}

export type Safra = {
  id: string
  ciclo: string
  area_hectares: string | null
  expectativa_sacas: string | null
  observacao: string | null
  ativa: boolean
  safra_etapas: SafraEtapa[]
}

const CAMPOS = `
  id, ciclo, area_hectares, expectativa_sacas, observacao, ativa,
  safra_etapas ( id, nome, ordem, data_inicio, data_fim, observacao )
`

/**
 * O ciclo do café atravessa o ano-calendário, então as etapas seguem esta
 * ordem sempre — da flor à saca pronta. Entram como sugestão ao criar uma
 * safra; nome e datas ficam editáveis, nada aqui é definitivo.
 */
export const ETAPAS_SUGERIDAS = [
  'Florada',
  'Granação',
  'Maturação',
  'Colheita',
  'Secagem',
  'Beneficiamento',
] as const

export function useSafras() {
  return useQuery({
    queryKey: ['safras'],
    queryFn: async (): Promise<Safra[]> => {
      const { data, error } = await supabase
        .from('safras')
        .select(CAMPOS)
        .order('ciclo', { ascending: false })
      if (error) throw new Error(traduzirErro(error))

      const safras = (data ?? []) as unknown as Safra[]
      // O banco não garante ordem dentro do embed; a linha do tempo depende dela.
      for (const s of safras) s.safra_etapas.sort((a, b) => a.ordem - b.ordem)
      return safras
    },
  })
}

export type NovaSafra = {
  ciclo: string
  area_hectares: string | null
  expectativa_sacas: string | null
  observacao: string | null
  etapas: { nome: string; ordem: number; data_inicio: string; data_fim: string }[]
}

/**
 * Cria a safra e suas etapas. Se as etapas falharem, a safra recém-criada é
 * desfeita — safra sem etapa nenhuma não mostra status na tela do Café, que
 * é justamente para o que ela serve.
 */
export function useCriarSafra() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (nova: NovaSafra) => {
      const { etapas, ...campos } = nova

      const { data: safra, error: erroSafra } = await supabase
        .from('safras')
        .insert(campos)
        .select('id')
        .single()
      if (erroSafra) throw new Error(traduzirErro(erroSafra))

      if (etapas.length) {
        const { error: erroEtapas } = await supabase
          .from('safra_etapas')
          .insert(etapas.map((e) => ({ ...e, safra_id: safra.id })))
        if (erroEtapas) {
          await supabase.from('safras').delete().eq('id', safra.id)
          throw new Error(traduzirErro(erroEtapas))
        }
      }

      return safra.id as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safras'] }),
  })
}

/**
 * Muda as datas de uma etapa. É a única fonte do status mostrado na tela do
 * Café: mexer aqui muda lá, sem nenhuma data repetida em outro lugar.
 */
export function useAtualizarEtapa() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      data_inicio,
      data_fim,
    }: {
      id: string
      data_inicio: string
      data_fim: string
    }) => {
      const { error } = await supabase
        .from('safra_etapas')
        .update({ data_inicio, data_fim })
        .eq('id', id)
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safras'] }),
  })
}

export type StatusEtapa = 'Concluída' | 'Em andamento' | 'A começar'

/** O status vem das datas, nunca de um campo digitado que possa envelhecer. */
export function statusEtapa(e: SafraEtapa, hoje: string): StatusEtapa {
  if (e.data_fim < hoje) return 'Concluída'
  if (e.data_inicio <= hoje) return 'Em andamento'
  return 'A começar'
}

/** Onde a safra está hoje — a etapa em andamento, ou a próxima a começar. */
export function etapaAtual(s: Safra, hoje: string): SafraEtapa | null {
  return (
    s.safra_etapas.find((e) => statusEtapa(e, hoje) === 'Em andamento') ??
    s.safra_etapas.find((e) => statusEtapa(e, hoje) === 'A começar') ??
    null
  )
}

/**
 * Quanto da etapa já passou, de 0 a 1. Serve para a barra de progresso da
 * linha do tempo — uma colheita que começou ontem não deve parecer igual a
 * uma que termina amanhã.
 */
export function progressoEtapa(e: SafraEtapa, hoje: string): number {
  if (hoje >= e.data_fim) return 1
  if (hoje <= e.data_inicio) return 0

  const inicio = new Date(e.data_inicio).getTime()
  const fim = new Date(e.data_fim).getTime()
  const agora = new Date(hoje).getTime()
  return (agora - inicio) / (fim - inicio)
}
