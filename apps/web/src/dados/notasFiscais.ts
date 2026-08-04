import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { decimalParaCentavos } from '../lib/formato'
import { traduzirErro } from './cadastros'

export type ParcelaNf = {
  id: string
  numero: number
  vencimento: string
  valor: string
  lancamentos: { situacao: 'Prevista' | 'Realizada'; data_pagamento: string | null } | null
}

export type NotaFiscal = {
  id: string
  numero: string
  data_emissao: string
  valor_total: string
  destinatario_socio_id: string
  emitente: { nome: string } | null
  destinatario: { nome_curto: string } | null
  nf_parcelas: ParcelaNf[]
}

const CAMPOS = `
  id, numero, data_emissao, valor_total, destinatario_socio_id,
  emitente:clientes_fornecedores!emitente_id ( nome ),
  destinatario:socios!destinatario_socio_id ( nome_curto ),
  nf_parcelas ( id, numero, vencimento, valor, lancamentos ( situacao, data_pagamento ) )
`

/**
 * Todas as notas ativas, com parcelas e o estado de pagamento de cada uma.
 * Filtro por aba/destinatário é feito no cliente (useNotasFiltradas):
 * os KPIs precisam do conjunto inteiro, e o volume de notas é pequeno.
 */
export function useNotasFiscais() {
  return useQuery({
    queryKey: ['notas-fiscais'],
    queryFn: async (): Promise<NotaFiscal[]> => {
      const { data, error } = await supabase
        .from('notas_fiscais')
        .select(CAMPOS)
        .eq('ativo', true)
        .order('data_emissao', { ascending: false })
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as unknown as NotaFiscal[]
    },
  })
}

/** Quais notas ainda não têm anexo — calculado no banco (view). */
export function useNotasSemAnexo() {
  return useQuery({
    queryKey: ['notas-fiscais-sem-anexo'],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from('notas_fiscais_sem_anexo').select('id')
      if (error) throw new Error(traduzirErro(error))
      return new Set((data ?? []).map((r) => r.id as string))
    },
  })
}

/** Sócios que podem receber NF (Lucas e Michel) — para o formulário e os filtros. */
export function useDestinatariosNf() {
  return useQuery({
    queryKey: ['destinatarios-nf'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('socios')
        .select('id, nome_curto, nome_completo')
        .eq('pode_receber_nf', true)
        .order('nome_curto')
      if (error) throw new Error(traduzirErro(error))
      return data ?? []
    },
  })
}

export type ParcelaNova = { vencimento: string; valor: string }

export type NovaNotaFiscal = {
  numero: string
  data_emissao: string
  valor_total: string
  emitente_id: string
  destinatario_socio_id: string
  categoria_id: string
  centro_id: string
  conta_id: string
  parcelas: ParcelaNova[]
}

/**
 * Grava a nota e suas parcelas. São duas chamadas (duas transações), então em
 * caso de falha ao gravar as parcelas a nota recém-criada é desfeita — sem
 * isso, ficaria uma nota órfã, sem nenhuma parcela.
 */
export function useCriarNotaFiscal() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (nova: NovaNotaFiscal) => {
      const { parcelas, ...campos } = nova

      const { data: nf, error: erroNf } = await supabase
        .from('notas_fiscais')
        .insert(campos)
        .select('id')
        .single()
      if (erroNf) throw new Error(traduzirErro(erroNf))

      // Uma única chamada com todas as parcelas: a trava de "soma bate com o
      // total" é diferida até o fim desta transação, então todas as linhas
      // precisam entrar juntas — uma a uma, a primeira falharia sozinha.
      const { error: erroParc } = await supabase.from('nf_parcelas').insert(
        parcelas.map((p, i) => ({
          nota_fiscal_id: nf.id,
          numero: i + 1,
          vencimento: p.vencimento,
          valor: p.valor,
        })),
      )

      if (erroParc) {
        await supabase.from('notas_fiscais').delete().eq('id', nf.id)
        throw new Error(traduzirErro(erroParc))
      }

      return nf.id as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas-fiscais'] })
      qc.invalidateQueries({ queryKey: ['notas-fiscais-sem-anexo'] })
      // As parcelas geram despesas previstas automaticamente (trigger 0004).
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      qc.invalidateQueries({ queryKey: ['saldos'] })
    },
  })
}

/** Situação calculada da nota, a partir do estado de pagamento das parcelas. */
export function situacaoNf(nf: NotaFiscal): 'Quitada' | 'Vencida' | 'Aberta' {
  const hoje = new Date().toISOString().slice(0, 10)
  const pendentes = nf.nf_parcelas.filter((p) => p.lancamentos?.situacao !== 'Realizada')
  if (pendentes.length === 0) return 'Quitada'
  if (pendentes.some((p) => p.vencimento < hoje)) return 'Vencida'
  return 'Aberta'
}

/** Quanto ainda falta pagar, em centavos. */
export function saldoAbertoNf(nf: NotaFiscal): number {
  return nf.nf_parcelas
    .filter((p) => p.lancamentos?.situacao !== 'Realizada')
    .reduce((soma, p) => soma + decimalParaCentavos(p.valor), 0)
}

/** Próxima parcela não paga, ou null se a nota está quitada. */
export function proximaParcela(nf: NotaFiscal): ParcelaNf | null {
  const pendentes = nf.nf_parcelas
    .filter((p) => p.lancamentos?.situacao !== 'Realizada')
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
  return pendentes[0] ?? null
}
