import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { decimalParaCentavos } from '../lib/formato'
import { traduzirErro } from './cadastros'

export type ParcelaDivida = {
  id: string
  numero: number
  vencimento: string
  valor: string
  lancamentos: { situacao: 'Prevista' | 'Realizada'; data_pagamento: string | null } | null
}

export type ContratoDivida = {
  id: string
  descricao: string
  valor_contratado: string
  numero_parcelas: number
  primeiro_vencimento: string
  periodicidade: string
  juros: string | null
  credor: { nome: string } | null
  titular: { nome_curto: string } | null
  divida_parcelas: ParcelaDivida[]
}

const CAMPOS = `
  id, descricao, valor_contratado, numero_parcelas, primeiro_vencimento,
  periodicidade, juros,
  credor:clientes_fornecedores!credor_id ( nome ),
  titular:socios!titular_socio_id ( nome_curto ),
  divida_parcelas ( id, numero, vencimento, valor, lancamentos ( situacao, data_pagamento ) )
`

export function useDividas() {
  return useQuery({
    queryKey: ['dividas'],
    queryFn: async (): Promise<ContratoDivida[]> => {
      const { data, error } = await supabase
        .from('contratos_divida')
        .select(CAMPOS)
        .eq('ativo', true)
        .order('primeiro_vencimento', { ascending: false })
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as unknown as ContratoDivida[]
    },
  })
}

/** Todos os sócios ativos — o titular da dívida pode ser qualquer um deles. */
export function useSocios() {
  return useQuery({
    queryKey: ['socios'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('socios')
        .select('id, nome_curto, nome_completo')
        .eq('ativo', true)
        .order('nome_curto')
      if (error) throw new Error(traduzirErro(error))
      return data ?? []
    },
  })
}

export type ParcelaNova = { vencimento: string; valor: string }

export type NovoContratoDivida = {
  descricao: string
  credor_id: string
  titular_socio_id: string | null
  valor_contratado: string
  numero_parcelas: number
  primeiro_vencimento: string
  periodicidade: string
  juros: string | null
  categoria_id: string
  centro_id: string
  conta_id: string
  parcelas: ParcelaNova[]
}

/**
 * Grava o contrato e suas parcelas. Como na nota fiscal, são duas transações:
 * se as parcelas falharem, o contrato recém-criado é desfeito para não sobrar
 * um contrato sem nenhuma parcela.
 *
 * Diferente da nota fiscal, aqui não existe trava de soma — a soma das
 * parcelas supera o valor contratado por causa dos juros, e é assim mesmo.
 */
export function useCriarDivida() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (novo: NovoContratoDivida) => {
      const { parcelas, ...campos } = novo

      const { data: ct, error: erroCt } = await supabase
        .from('contratos_divida')
        .insert(campos)
        .select('id')
        .single()
      if (erroCt) throw new Error(traduzirErro(erroCt))

      const { error: erroParc } = await supabase.from('divida_parcelas').insert(
        parcelas.map((p, i) => ({
          contrato_id: ct.id,
          numero: i + 1,
          vencimento: p.vencimento,
          valor: p.valor,
        })),
      )

      if (erroParc) {
        await supabase.from('contratos_divida').delete().eq('id', ct.id)
        throw new Error(traduzirErro(erroParc))
      }

      return ct.id as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dividas'] })
      // Cada parcela vira uma despesa prevista (trigger da 0004).
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      qc.invalidateQueries({ queryKey: ['saldos'] })
    },
  })
}

/** Situação calculada do contrato, a partir do pagamento das parcelas. */
export function situacaoDivida(ct: ContratoDivida): 'Quitado' | 'Vencido' | 'Em dia' {
  const hoje = new Date().toISOString().slice(0, 10)
  const pendentes = ct.divida_parcelas.filter((p) => p.lancamentos?.situacao !== 'Realizada')
  if (pendentes.length === 0) return 'Quitado'
  if (pendentes.some((p) => p.vencimento < hoje)) return 'Vencido'
  return 'Em dia'
}

/** Quanto ainda falta pagar, em centavos. */
export function saldoDevedor(ct: ContratoDivida): number {
  return ct.divida_parcelas
    .filter((p) => p.lancamentos?.situacao !== 'Realizada')
    .reduce((soma, p) => soma + decimalParaCentavos(p.valor), 0)
}

/** Soma de todas as parcelas — contratado + juros. */
export function totalComJuros(ct: ContratoDivida): number {
  return ct.divida_parcelas.reduce((soma, p) => soma + decimalParaCentavos(p.valor), 0)
}

/** Próxima parcela não paga, ou null se o contrato está quitado. */
export function proximaParcelaDivida(ct: ContratoDivida): ParcelaDivida | null {
  const pendentes = ct.divida_parcelas
    .filter((p) => p.lancamentos?.situacao !== 'Realizada')
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
  return pendentes[0] ?? null
}
