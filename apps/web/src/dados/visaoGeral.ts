import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { adicionarDias, hojeISO, limitesDoMes } from '../lib/periodo'
import { traduzirErro } from './cadastros'

/**
 * Consultas específicas do painel inicial.
 *
 * O que a Visão geral precisa não é o mesmo que cada tela já busca: ela quer
 * poucos números de um recorte amplo (o mês inteiro, os próximos dias), e não
 * a lista completa de nada. Buscar aqui, com filtro do lado do banco, evita
 * puxar todos os lançamentos e todas as reservas só para contar quantos são.
 */

export type CompromissoAberto = {
  id: string
  tipo: 'Receita' | 'Despesa'
  descricao: string
  valor: string
  data_vencimento: string
  origem: string
}

/**
 * Contas a pagar e a receber que vencem até `dias` à frente — inclusive as
 * atrasadas, que são justamente as que mais importam. Alimenta os alertas.
 */
export function useCompromissos(dias = 14) {
  const hoje = hojeISO()
  const limite = adicionarDias(hoje, dias)

  return useQuery({
    queryKey: ['compromissos', hoje, dias],
    queryFn: async (): Promise<CompromissoAberto[]> => {
      const { data, error } = await supabase
        .from('lancamentos')
        .select('id, tipo, descricao, valor, data_vencimento, origem')
        .eq('ativo', true)
        .eq('situacao', 'Prevista')
        .lte('data_vencimento', limite)
        .in('tipo', ['Receita', 'Despesa'])
        .order('data_vencimento')
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as CompromissoAberto[]
    },
  })
}

/** Realizados do mês sem conciliar — o que impede o fechamento. */
export function useNaoConciliados(competencia: string) {
  const { inicio, fim } = limitesDoMes(competencia)

  return useQuery({
    queryKey: ['nao-conciliados', competencia],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('lancamentos')
        .select('id', { count: 'exact', head: true })
        .eq('ativo', true)
        .eq('situacao', 'Realizada')
        .eq('conciliado', false)
        .gte('data_pagamento', inicio)
        .lt('data_pagamento', fim)
      if (error) throw new Error(traduzirErro(error))
      return count ?? 0
    },
  })
}

export type ChegadaProxima = {
  id: string
  data_entrada: string
  data_saida: string
  status: string
  canal: string
  valor_total: string
  hospedes: { nome: string } | null
  reserva_acomodacoes: { acomodacoes: { nome: string; cor: string } | null }[]
}

/** As próximas chegadas, da mais iminente para a mais distante. */
export function useProximasChegadas(quantas = 5) {
  const hoje = hojeISO()

  return useQuery({
    queryKey: ['proximas-chegadas', hoje, quantas],
    queryFn: async (): Promise<ChegadaProxima[]> => {
      const { data, error } = await supabase
        .from('reservas')
        .select(
          `id, data_entrada, data_saida, status, canal, valor_total,
           hospedes!hospede_id ( nome ),
           reserva_acomodacoes ( acomodacoes!acomodacao_id ( nome, cor ) )`,
        )
        .neq('status', 'Cancelada')
        .gte('data_entrada', hoje)
        .order('data_entrada')
        .limit(quantas)
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as unknown as ChegadaProxima[]
    },
  })
}

/** Notas fiscais sem documento anexado, de qualquer mês. */
export function useNotasPendentes() {
  return useQuery({
    queryKey: ['notas-pendentes-todas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notas_fiscais_sem_anexo')
        .select('id, numero, emitente, dias_aguardando')
        .order('dias_aguardando', { ascending: false })
      if (error) throw new Error(traduzirErro(error))
      return data ?? []
    },
  })
}

export type AcumuladoNf = { socio_id: string; nome_curto: string; total: number; qtd: number }

/**
 * Quanto de nota fiscal cada sócio acumulou no ano.
 *
 * O sítio não tem CNPJ: as notas saem no CPF do Lucas ou do Michel, e o
 * acompanhamento desse acúmulo é o motivo de a informação estar no painel —
 * é ele que dá o aviso de que um dos dois está concentrando demais.
 */
export function useAcumuladoNf(ano: number) {
  return useQuery({
    queryKey: ['acumulado-nf', ano],
    queryFn: async (): Promise<AcumuladoNf[]> => {
      const { data, error } = await supabase
        .from('notas_fiscais')
        .select('valor_total, destinatario_socio_id, socios!destinatario_socio_id ( nome_curto )')
        .eq('ativo', true)
        .gte('data_emissao', `${ano}-01-01`)
        .lt('data_emissao', `${ano + 1}-01-01`)
      if (error) throw new Error(traduzirErro(error))

      const mapa = new Map<string, AcumuladoNf>()
      for (const nf of (data ?? []) as unknown as {
        valor_total: string
        destinatario_socio_id: string
        socios: { nome_curto: string } | null
      }[]) {
        const atual = mapa.get(nf.destinatario_socio_id) ?? {
          socio_id: nf.destinatario_socio_id,
          nome_curto: nf.socios?.nome_curto ?? '—',
          total: 0,
          qtd: 0,
        }
        atual.total += Math.round(Number(nf.valor_total) * 100)
        atual.qtd += 1
        mapa.set(nf.destinatario_socio_id, atual)
      }
      return [...mapa.values()].sort((a, b) => b.total - a.total)
    },
  })
}
