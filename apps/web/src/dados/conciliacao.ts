import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { centavosParaDecimal, decimalParaCentavos } from '../lib/formato'
import { adicionarDias } from '../lib/periodo'
import type { ExtratoOfx } from '../lib/ofx'
import { traduzirErro } from './cadastros'

export type LinhaExtrato = {
  id: string
  data: string
  descricao: string
  valor: string
  identificador_banco: string
  lancamento_id: string | null
  ignorada: boolean
  lancamentos: { id: string; descricao: string; valor: string; data_referencia: string } | null
}

export type LancamentoAberto = {
  id: string
  descricao: string
  valor: string
  tipo: 'Receita' | 'Despesa' | 'Transferência'
  sentido: string | null
  data_referencia: string
}

/** Linhas do extrato de uma conta, das mais recentes para as mais antigas. */
export function useLinhasExtrato(contaId: string | undefined) {
  return useQuery({
    queryKey: ['extrato-linhas', contaId],
    enabled: !!contaId,
    queryFn: async (): Promise<LinhaExtrato[]> => {
      const { data, error } = await supabase
        .from('extrato_linhas')
        .select(
          `id, data, descricao, valor, identificador_banco, lancamento_id, ignorada,
           lancamentos!lancamento_id ( id, descricao, valor, data_referencia )`,
        )
        .eq('conta_id', contaId!)
        .order('data', { ascending: false })
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as unknown as LinhaExtrato[]
    },
  })
}

/**
 * Lançamentos daquela conta que ainda não foram conciliados — os candidatos a
 * casar com uma linha do extrato. Só os realizados: uma despesa ainda prevista
 * não passou pelo banco, logo não pode estar no extrato.
 */
export function useLancamentosAbertos(contaId: string | undefined) {
  return useQuery({
    queryKey: ['lancamentos-abertos', contaId],
    enabled: !!contaId,
    queryFn: async (): Promise<LancamentoAberto[]> => {
      const { data, error } = await supabase
        .from('lancamentos')
        .select('id, descricao, valor, tipo, sentido, data_referencia')
        .eq('conta_id', contaId!)
        .eq('ativo', true)
        .eq('situacao', 'Realizada')
        .eq('conciliado', false)
        .order('data_referencia', { ascending: false })
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as LancamentoAberto[]
    },
  })
}

export function useExtratosImportados(contaId: string | undefined) {
  return useQuery({
    queryKey: ['extratos-importados', contaId],
    enabled: !!contaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('extratos_importados')
        .select('id, arquivo_nome, periodo_inicio, periodo_fim, linhas_importadas, linhas_ignoradas, importado_em')
        .eq('conta_id', contaId!)
        .order('importado_em', { ascending: false })
      if (error) throw new Error(traduzirErro(error))
      return data ?? []
    },
  })
}

export type ResultadoImportacao = { importadas: number; ignoradas: number }

/**
 * Grava o extrato lido do arquivo.
 *
 * As linhas repetidas de importações anteriores não são filtradas aqui: quem
 * decide é o índice único (conta + identificador do banco) no próprio banco de
 * dados. Por isso as linhas entram uma a uma — uma inserção em bloco falharia
 * inteira por causa de uma única repetida, e reimportar um período sobreposto
 * precisa ser uma operação segura e corriqueira.
 */
export function useImportarExtrato() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      contaId,
      arquivoNome,
      extrato,
    }: {
      contaId: string
      arquivoNome: string
      extrato: ExtratoOfx
    }): Promise<ResultadoImportacao> => {
      const { data: cabecalho, error: erroCabecalho } = await supabase
        .from('extratos_importados')
        .insert({
          conta_id: contaId,
          arquivo_nome: arquivoNome,
          periodo_inicio: extrato.periodoInicio,
          periodo_fim: extrato.periodoFim,
        })
        .select('id')
        .single()
      if (erroCabecalho) throw new Error(traduzirErro(erroCabecalho))

      let importadas = 0
      let ignoradas = 0

      for (const m of extrato.movimentos) {
        const { error } = await supabase.from('extrato_linhas').insert({
          extrato_id: cabecalho.id,
          conta_id: contaId,
          data: m.data,
          descricao: m.descricao,
          valor: centavosParaDecimal(m.centavos),
          identificador_banco: m.identificador,
        })

        // 23505 = movimento que já tinha entrado antes. É o comportamento
        // esperado ao reimportar, não um erro a mostrar para o usuário.
        if (error) {
          if (error.code === '23505') ignoradas++
          else throw new Error(traduzirErro(error))
        } else {
          importadas++
        }
      }

      await supabase
        .from('extratos_importados')
        .update({ linhas_importadas: importadas, linhas_ignoradas: ignoradas })
        .eq('id', cabecalho.id)

      return { importadas, ignoradas }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['extrato-linhas'] })
      qc.invalidateQueries({ queryKey: ['extratos-importados'] })
    },
  })
}

function invalidarConciliacao(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['extrato-linhas'] })
  qc.invalidateQueries({ queryKey: ['lancamentos-abertos'] })
  qc.invalidateQueries({ queryKey: ['lancamentos'] })
}

/** Liga a linha a um lançamento existente. O banco confere valor e sentido. */
export function useConciliar() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ linhaId, lancamentoId }: { linhaId: string; lancamentoId: string }) => {
      const { error } = await supabase
        .from('extrato_linhas')
        .update({ lancamento_id: lancamentoId, conciliado_em: new Date().toISOString() })
        .eq('id', linhaId)
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => invalidarConciliacao(qc),
  })
}

/** Desfaz o vínculo — o lançamento volta a ser editável. */
export function useDesfazerConciliacao() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (linhaId: string) => {
      const { error } = await supabase
        .from('extrato_linhas')
        .update({ lancamento_id: null, conciliado_em: null, conciliado_por: null })
        .eq('id', linhaId)
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => invalidarConciliacao(qc),
  })
}

/**
 * Cria o lançamento a partir da linha e já concilia os dois, numa transação
 * só do lado do banco — as duas gravações nunca acontecem pela metade.
 */
export function useConciliarCriando() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      linhaId,
      categoriaId,
      centroId,
      descricao,
      cliforId,
    }: {
      linhaId: string
      categoriaId: string
      centroId: string
      descricao?: string
      cliforId?: string
    }) => {
      const { error } = await supabase.rpc('conciliar_criando_lancamento', {
        p_linha_id: linhaId,
        p_categoria_id: categoriaId,
        p_centro_id: centroId,
        p_descricao: descricao ?? null,
        p_clifor_id: cliforId ?? null,
      })
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => invalidarConciliacao(qc),
  })
}

/** Marca a linha como "não é para conciliar" — sem apagá-la. */
export function useIgnorarLinha() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ linhaId, ignorada }: { linhaId: string; ignorada: boolean }) => {
      const { error } = await supabase
        .from('extrato_linhas')
        .update({ ignorada })
        .eq('id', linhaId)
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => invalidarConciliacao(qc),
  })
}

/** Quantos dias de folga a sugestão aceita entre o extrato e o lançamento. */
const FOLGA_DIAS = 5

/**
 * Acha o lançamento que provavelmente corresponde à linha do extrato.
 *
 * Valor tem de bater exatamente — banco não arredonda, e valor aproximado
 * produziria sugestões erradas com cara de certas. A folga fica na data,
 * porque boleto e cartão compensam depois do dia da compra. Entre vários
 * candidatos, vence o de data mais próxima.
 */
export function sugerirLancamento(
  linha: LinhaExtrato,
  candidatos: LancamentoAberto[],
): LancamentoAberto | null {
  const centavosLinha = decimalParaCentavos(linha.valor)
  const entrada = centavosLinha > 0
  const inicio = adicionarDias(linha.data, -FOLGA_DIAS)
  const fim = adicionarDias(linha.data, FOLGA_DIAS)

  const compativeis = candidatos.filter((l) => {
    if (decimalParaCentavos(l.valor) !== Math.abs(centavosLinha)) return false
    if (l.data_referencia < inicio || l.data_referencia > fim) return false

    // Crédito no banco casa com entrada de dinheiro, e vice-versa. É a mesma
    // conferência que o banco de dados faz — checar aqui evita oferecer uma
    // sugestão que só seria recusada no clique.
    const ehEntrada = l.tipo === 'Receita' || (l.tipo === 'Transferência' && l.sentido === 'Entrada')
    return ehEntrada === entrada
  })

  if (!compativeis.length) return null

  const distancia = (iso: string) =>
    Math.abs(new Date(iso).getTime() - new Date(linha.data).getTime())

  return compativeis.reduce((melhor, l) =>
    distancia(l.data_referencia) < distancia(melhor.data_referencia) ? l : melhor,
  )
}
