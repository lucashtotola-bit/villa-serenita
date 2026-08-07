import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { limitesDoMes } from '../lib/periodo'
import { traduzirErro } from './cadastros'

export type Acao = 'INSERT' | 'UPDATE' | 'DELETE'

export type RegistroHistorico = {
  id: number
  criado_em: string
  tabela: string
  registro_id: string | null
  acao: Acao
  autor: string
  entidade: string
  /** No UPDATE, apenas os campos que mudaram (migração 0017). */
  dados_antes: Record<string, unknown> | null
  dados_depois: Record<string, unknown> | null
}

/**
 * O histórico de um mês, do mais recente para o mais antigo.
 *
 * Recortado por mês e com teto de linhas porque o log cresce sem parar: sem
 * limite, abrir a tela um ano depois puxaria a base inteira para o navegador.
 */
export function useHistorico(opcoes: { competencia: string; entidade?: string }) {
  const { competencia, entidade } = opcoes
  const { inicio, fim } = limitesDoMes(competencia)

  return useQuery({
    queryKey: ['historico', competencia, entidade ?? 'tudo'],
    queryFn: async (): Promise<RegistroHistorico[]> => {
      let consulta = supabase
        .from('historico')
        .select('id, criado_em, tabela, registro_id, acao, autor, entidade, dados_antes, dados_depois')
        .gte('criado_em', inicio)
        .lt('criado_em', fim)
        .order('criado_em', { ascending: false })
        .limit(500)

      if (entidade) consulta = consulta.eq('tabela', entidade)

      const { data, error } = await consulta
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as RegistroHistorico[]
    },
  })
}

/**
 * Os tipos de registro que aparecem no mês, para montar o filtro.
 *
 * Vem do próprio período em vez de uma lista fixa: um filtro que oferece
 * "Venda de café" num mês sem nenhuma só produz tela vazia.
 */
export function useEntidadesDoMes(competencia: string) {
  const { inicio, fim } = limitesDoMes(competencia)

  return useQuery({
    queryKey: ['historico-entidades', competencia],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('historico')
        .select('tabela, entidade')
        .gte('criado_em', inicio)
        .lt('criado_em', fim)
        .limit(2000)
      if (error) throw new Error(traduzirErro(error))

      const mapa = new Map<string, string>()
      for (const r of data ?? []) mapa.set(r.tabela as string, r.entidade as string)
      return [...mapa].map(([tabela, rotulo]) => ({ tabela, rotulo }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
    },
  })
}

// -----------------------------------------------------------------------------
// Tradução dos campos
// -----------------------------------------------------------------------------

/**
 * Nome de coluna vira nome de campo. O que não estiver aqui é exibido com a
 * primeira letra maiúscula e os sublinhados trocados por espaço — errar o
 * rótulo é menos grave do que esconder que o campo mudou.
 */
const CAMPOS: Record<string, string> = {
  ativo: 'Arquivado',
  apelido: 'Apelido',
  banco: 'Banco',
  canal: 'Canal',
  categoria_id: 'Categoria',
  centro_id: 'Centro de custo',
  clifor_id: 'Cliente ou fornecedor',
  conciliado: 'Conciliado',
  conta_id: 'Conta',
  cota: 'Cota',
  data: 'Data',
  data_emissao: 'Emissão',
  data_entrada: 'Entrada',
  data_pagamento: 'Pagamento',
  data_saida: 'Saída',
  data_vencimento: 'Vencimento',
  desconto: 'Desconto',
  descricao: 'Descrição',
  drive_status: 'Status no Drive',
  juros: 'Juros',
  motivo_cancelamento: 'Motivo do cancelamento',
  motivo_reabertura: 'Motivo da reabertura',
  multa: 'Multa',
  nome: 'Nome',
  numero: 'Número',
  observacao: 'Observação',
  preco_saca: 'Preço da saca',
  sacas: 'Sacas',
  sinal: 'Sinal',
  situacao: 'Situação',
  status: 'Status',
  tipo: 'Tipo',
  valor: 'Valor',
  valor_original: 'Valor previsto',
  valor_total: 'Valor total',
  vencimento: 'Vencimento',
}

/** Campos que não dizem nada a quem lê: identificadores e carimbos internos. */
const OCULTOS = new Set([
  'id',
  'criado_em',
  'atualizado_em',
  'criado_por',
  'data_referencia',
  'lancamento_id',
  'movimento_id',
  'transferencia_id',
  'conciliado_em',
  'conciliado_por',
])

export function rotuloCampo(campo: string): string {
  return (
    CAMPOS[campo] ??
    campo.replace(/_id$/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
  )
}

export type Mudanca = { campo: string; rotulo: string; antes: string; depois: string }

/**
 * As mudanças de um registro, prontas para exibir.
 *
 * O `ativo` é invertido de propósito: no banco `false` significa arquivado, e
 * mostrar "Arquivado: verdadeiro → falso" faria o leitor traduzir de cabeça.
 */
export function mudancas(r: RegistroHistorico): Mudanca[] {
  const chaves = new Set([
    ...Object.keys(r.dados_depois ?? {}),
    ...Object.keys(r.dados_antes ?? {}),
  ])

  const saida: Mudanca[] = []
  for (const campo of chaves) {
    if (OCULTOS.has(campo)) continue
    const antes = valorLegivel(campo, r.dados_antes?.[campo])
    const depois = valorLegivel(campo, r.dados_depois?.[campo])
    if (antes === depois) continue
    saida.push({ campo, rotulo: rotuloCampo(campo), antes, depois })
  }

  return saida.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
}

function valorLegivel(campo: string, v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (campo === 'ativo') return v === false ? 'sim' : 'não'
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [a, m, d] = v.split('-')
    return `${d}/${m}/${a}`
  }
  return String(v)
}
