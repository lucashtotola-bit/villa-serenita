import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { decimalParaCentavos } from '../lib/formato'
import { traduzirErro } from './cadastros'

export type StatusReserva = 'Pré-reserva' | 'Confirmada' | 'Concluída' | 'Cancelada'

export const CANAIS = ['Airbnb', 'WhatsApp', 'Instagram', 'Indicação', 'Direto'] as const

export type Acomodacao = {
  id: string
  nome: string
  cor: string
  capacidade: number | null
  diaria_padrao: string | null
}

export type ReservaAcomodacao = {
  id: string
  valor: string
  acomodacoes: { id: string; nome: string; cor: string } | null
}

export type Reserva = {
  id: string
  canal: string
  data_entrada: string
  data_saida: string
  numero_hospedes: number
  valor_total: string
  sinal: string
  status: StatusReserva
  motivo_cancelamento: string | null
  observacao: string | null
  hospede_id: string
  hospedes: { nome: string; contato: string | null } | null
  reserva_acomodacoes: ReservaAcomodacao[]
  /** As receitas geradas — sinal e saldo. Vazio enquanto não confirmada. */
  lancamentos: { id: string; descricao: string; valor: string; situacao: string }[]
}

const CAMPOS = `
  id, canal, data_entrada, data_saida, numero_hospedes, valor_total, sinal,
  status, motivo_cancelamento, observacao, hospede_id,
  hospedes!hospede_id ( nome, contato ),
  reserva_acomodacoes ( id, valor, acomodacoes!acomodacao_id ( id, nome, cor ) ),
  lancamentos ( id, descricao, valor, situacao )
`

/** As três casas da propriedade, na ordem em que aparecem no calendário. */
export function useAcomodacoes() {
  return useQuery({
    queryKey: ['acomodacoes'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Acomodacao[]> => {
      const { data, error } = await supabase
        .from('acomodacoes')
        .select('id, nome, cor, capacidade, diaria_padrao')
        .eq('ativo', true)
        .order('ordem')
      if (error) throw new Error(traduzirErro(error))
      return data ?? []
    },
  })
}

export function useHospedes() {
  return useQuery({
    queryKey: ['hospedes'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hospedes')
        .select('id, nome, contato')
        .eq('ativo', true)
        .order('nome')
      if (error) throw new Error(traduzirErro(error))
      return data ?? []
    },
  })
}

/**
 * Reservas que tocam o intervalo pedido — inclui as que começaram antes e as
 * que terminam depois, porque uma estadia atravessa a virada do mês e
 * precisa aparecer nos dois. Sem intervalo, traz tudo.
 */
export function useReservas(intervalo?: { inicio: string; fim: string }) {
  return useQuery({
    queryKey: ['reservas', intervalo?.inicio ?? 'todas', intervalo?.fim ?? ''],
    queryFn: async (): Promise<Reserva[]> => {
      let consulta = supabase.from('reservas').select(CAMPOS)
      if (intervalo) {
        consulta = consulta.lt('data_entrada', intervalo.fim).gt('data_saida', intervalo.inicio)
      }
      const { data, error } = await consulta.order('data_entrada', { ascending: false })
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as unknown as Reserva[]
    },
  })
}

export type NovaReserva = {
  hospede_id: string
  canal: string
  data_entrada: string
  data_saida: string
  numero_hospedes: number
  valor_total: string
  sinal: string
  categoria_id: string
  centro_id: string
  conta_id: string
  observacao: string | null
  /** Já confirmar na criação, em vez de deixar como pré-reserva. */
  confirmar: boolean
  acomodacoes: { acomodacao_id: string; valor: string }[]
}

/**
 * Grava a reserva, a divisão entre as casas e — se pedido — a confirmação,
 * tudo numa chamada só (migração 0015).
 *
 * A ordem interna continua importando e continua não sendo a óbvia: a reserva
 * nasce como Pré-reserva mesmo quando o usuário já quer confirmar, porque
 * confirmar dispara o gatilho que cria as receitas. Só que agora essa ordem é
 * assunto do banco.
 *
 * O que muda para quem usa: sumiu o estado "foi salva como pré-reserva mas a
 * confirmação falhou". Ou a reserva existe confirmada, ou não existe.
 */
export function useCriarReserva() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (nova: NovaReserva) => {
      const { acomodacoes, confirmar, ...campos } = nova

      const { data, error } = await supabase.rpc('criar_reserva', {
        p_hospede_id: campos.hospede_id,
        p_canal: campos.canal,
        p_data_entrada: campos.data_entrada,
        p_data_saida: campos.data_saida,
        p_numero_hospedes: campos.numero_hospedes,
        p_valor_total: campos.valor_total,
        p_sinal: campos.sinal,
        p_categoria_id: campos.categoria_id,
        p_centro_id: campos.centro_id,
        p_conta_id: campos.conta_id,
        p_observacao: campos.observacao,
        p_acomodacoes: acomodacoes,
        p_confirmar: confirmar,
      })
      if (error) throw new Error(traduzirErro(error))

      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservas'] })
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      qc.invalidateQueries({ queryKey: ['saldos'] })
    },
  })
}

/**
 * Muda o status. Confirmar gera as receitas previstas (sinal vencendo hoje,
 * saldo vencendo na chegada); cancelar desfaz o que ainda era só previsão,
 * preservando o que já foi recebido. Quem faz isso é o banco, por trigger.
 */
export function useMudarStatusReserva() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      status,
      motivo,
    }: {
      id: string
      status: StatusReserva
      motivo?: string
    }) => {
      const { error } = await supabase
        .from('reservas')
        .update({
          status,
          ...(status === 'Cancelada' ? { motivo_cancelamento: motivo ?? null } : {}),
        })
        .eq('id', id)
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservas'] })
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      qc.invalidateQueries({ queryKey: ['saldos'] })
    },
  })
}

/** Quantas diárias a estadia tem. A saída não conta: é dia de liberar a casa. */
export function noites(r: Pick<Reserva, 'data_entrada' | 'data_saida'>): number {
  const entrada = new Date(r.data_entrada + 'T00:00:00')
  const saida = new Date(r.data_saida + 'T00:00:00')
  return Math.round((saida.getTime() - entrada.getTime()) / 86_400_000)
}

/** Quanto da reserva ainda não foi recebido, em centavos. */
export function saldoAReceber(r: Reserva): number {
  return r.lancamentos
    .filter((l) => l.situacao !== 'Realizada')
    .reduce((soma, l) => soma + decimalParaCentavos(l.valor), 0)
}
