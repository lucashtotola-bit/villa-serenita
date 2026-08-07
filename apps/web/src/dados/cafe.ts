import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { traduzirErro } from './cadastros'

export const TIPOS_CAFE = ['Coco', 'Cereja descascado', 'Beneficiado'] as const
export type TipoCafe = (typeof TIPOS_CAFE)[number]

export type SaldoEstoque = { tipo_cafe: TipoCafe; sacas: string }

export type Movimento = {
  id: string
  data: string
  tipo_movimento: string
  tipo_cafe: TipoCafe
  sentido: 'Entrada' | 'Saída'
  sacas: string
  conversao_id: string | null
  observacao: string | null
}

export type Rendimento = {
  conversao_id: string
  data: string
  tipo_origem: TipoCafe
  sacas_origem: string
  tipo_resultado: TipoCafe
  sacas_resultado: string
  rendimento_pct: string
}

export type VendaCafe = {
  id: string
  data: string
  tipo_cafe: TipoCafe
  sacas: string
  preco_saca: string
  valor_total: string
  observacao: string | null
  clientes_fornecedores: { nome: string } | null
  lancamentos: { situacao: string; conciliado: boolean } | null
}

/** Saldo de sacas por tipo, calculado pelo banco a partir dos movimentos. */
export function useEstoqueCafe(safraId: string | undefined) {
  return useQuery({
    queryKey: ['estoque-cafe', safraId],
    enabled: !!safraId,
    queryFn: async (): Promise<SaldoEstoque[]> => {
      const { data, error } = await supabase
        .from('estoque_cafe')
        .select('tipo_cafe, sacas')
        .eq('safra_id', safraId!)
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as SaldoEstoque[]
    },
  })
}

export function useMovimentosCafe(safraId: string | undefined) {
  return useQuery({
    queryKey: ['movimentos-cafe', safraId],
    enabled: !!safraId,
    queryFn: async (): Promise<Movimento[]> => {
      const { data, error } = await supabase
        .from('cafe_estoque_movimentos')
        .select('id, data, tipo_movimento, tipo_cafe, sentido, sacas, conversao_id, observacao')
        .eq('safra_id', safraId!)
        .order('data', { ascending: false })
        .order('criado_em', { ascending: false })
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as Movimento[]
    },
  })
}

export function useRendimentos(safraId: string | undefined) {
  return useQuery({
    queryKey: ['rendimentos-cafe', safraId],
    enabled: !!safraId,
    queryFn: async (): Promise<Rendimento[]> => {
      const { data, error } = await supabase
        .from('rendimento_beneficiamento')
        .select(
          'conversao_id, data, tipo_origem, sacas_origem, tipo_resultado, sacas_resultado, rendimento_pct',
        )
        .eq('safra_id', safraId!)
        .order('data', { ascending: false })
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as Rendimento[]
    },
  })
}

export function useVendasCafe(safraId: string | undefined) {
  return useQuery({
    queryKey: ['vendas-cafe', safraId],
    enabled: !!safraId,
    queryFn: async (): Promise<VendaCafe[]> => {
      const { data, error } = await supabase
        .from('cafe_vendas')
        .select(
          `id, data, tipo_cafe, sacas, preco_saca, valor_total, observacao,
           clientes_fornecedores!cliente_id ( nome ),
           lancamentos!lancamento_id ( situacao, conciliado )`,
        )
        .eq('safra_id', safraId!)
        .eq('ativo', true)
        .order('data', { ascending: false })
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as unknown as VendaCafe[]
    },
  })
}

function invalidarCafe(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['estoque-cafe'] })
  qc.invalidateQueries({ queryKey: ['movimentos-cafe'] })
  qc.invalidateQueries({ queryKey: ['rendimentos-cafe'] })
}

export type NovoMovimento = {
  safra_id: string
  data: string
  tipo_movimento: 'Colheita' | 'Venda' | 'Perda' | 'Ajuste'
  tipo_cafe: TipoCafe
  sentido: 'Entrada' | 'Saída'
  sacas: string
  observacao: string | null
}

/** Colheita, perda ou ajuste de inventário — movimentos avulsos, de uma ponta só. */
export function useRegistrarMovimento() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (novo: NovoMovimento) => {
      const { error } = await supabase.from('cafe_estoque_movimentos').insert(novo)
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => invalidarCafe(qc),
  })
}

export type NovoBeneficiamento = {
  safra_id: string
  data: string
  tipo_origem: TipoCafe
  sacas_origem: string
  tipo_resultado: TipoCafe
  sacas_resultado: string
  observacao: string | null
}

/**
 * Beneficiar é como transferir entre contas: uma saída de um tipo e uma
 * entrada de outro, ligadas pelo mesmo `conversao_id`. A diferença entre as
 * duas quantidades é o rendimento da lavoura — por isso as duas pontas
 * precisam existir, e o banco recusa um beneficiamento sem par.
 *
 * As duas linhas vão numa única chamada, e a saída vem primeiro: assim, se o
 * estoque de origem não bastar, a operação falha antes de creditar qualquer
 * saca do resultado.
 */
export function useBeneficiar() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (b: NovoBeneficiamento) => {
      const conversao = crypto.randomUUID()
      const comum = {
        safra_id: b.safra_id,
        data: b.data,
        tipo_movimento: 'Beneficiamento' as const,
        conversao_id: conversao,
        observacao: b.observacao,
      }

      const { error } = await supabase.from('cafe_estoque_movimentos').insert([
        { ...comum, tipo_cafe: b.tipo_origem, sentido: 'Saída', sacas: b.sacas_origem },
        { ...comum, tipo_cafe: b.tipo_resultado, sentido: 'Entrada', sacas: b.sacas_resultado },
      ])
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => invalidarCafe(qc),
  })
}

export type NovaVenda = {
  safra_id: string
  cliente_id: string
  data: string
  tipo_cafe: TipoCafe
  sacas: string
  preco_saca: string
  categoria_id: string
  centro_id: string
  conta_id: string
  observacao: string | null
}

/**
 * Registra a venda. O total, a receita no financeiro e a baixa do estoque
 * são feitos pelo banco — a aplicação não tem como esquecer nenhum dos três,
 * nem fazer a conta diferente.
 */
export function useCriarVenda() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (nova: NovaVenda) => {
      const { error } = await supabase.from('cafe_vendas').insert(nova)
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => {
      invalidarCafe(qc)
      qc.invalidateQueries({ queryKey: ['vendas-cafe'] })
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      qc.invalidateQueries({ queryKey: ['saldos'] })
    },
  })
}

/**
 * Arquiva uma venda lançada por engano.
 *
 * Não existe editar: mudar as sacas ou o preço aqui deixaria a receita e a
 * baixa de estoque apontando para outro número (migração 0016). Arquivar
 * desfaz as duas pontas — a receita é arquivada e as sacas voltam ao estoque
 * por um movimento de Ajuste, porque movimento de estoque é histórico e não
 * se apaga. Recusado se a receita já estiver conciliada.
 */
export function useArquivarVendaCafe() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cafe_vendas').update({ ativo: false }).eq('id', id)
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => {
      invalidarCafe(qc)
      qc.invalidateQueries({ queryKey: ['vendas-cafe'] })
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      qc.invalidateQueries({ queryKey: ['saldos'] })
    },
  })
}

/** '48.000' -> '48'; '12.500' -> '12,5'. Sacas não são dinheiro. */
export function formatarSacas(valor: string | number): string {
  const n = Number(valor)
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}
