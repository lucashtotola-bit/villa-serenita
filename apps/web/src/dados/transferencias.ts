import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { limitesDoMes } from '../lib/periodo'
import { traduzirErro } from './cadastros'

type Conta = { banco: string; apelido: string }

export type Transferencia = {
  id: string
  data: string
  valor: string
  observacao: string | null
  conta_origem_id: string
  conta_destino_id: string
  conta_origem: Conta | null
  conta_destino: Conta | null
}

// Duas chaves apontam para a mesma tabela, então cada uma precisa dizer por
// qual coluna vem — sem isso o Supabase não sabe qual junção fazer.
const CAMPOS = `
  id, data, valor, observacao, conta_origem_id, conta_destino_id,
  conta_origem:contas_bancarias!conta_origem_id ( banco, apelido ),
  conta_destino:contas_bancarias!conta_destino_id ( banco, apelido )
`

export function useTransferencias(competencia: string, contaId?: string) {
  const { inicio, fim } = limitesDoMes(competencia)

  return useQuery({
    queryKey: ['transferencias', competencia, contaId ?? 'todas'],
    queryFn: async (): Promise<Transferencia[]> => {
      let consulta = supabase
        .from('transferencias')
        .select(CAMPOS)
        .eq('ativo', true)
        .gte('data', inicio)
        .lt('data', fim)
        .order('data', { ascending: false })

      // A conta pode estar em qualquer uma das duas pontas.
      if (contaId) {
        consulta = consulta.or(
          `conta_origem_id.eq.${contaId},conta_destino_id.eq.${contaId}`,
        )
      }

      const { data, error } = await consulta
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as unknown as Transferencia[]
    },
  })
}

export type NovaTransferencia = {
  data: string
  valor: string
  conta_origem_id: string
  conta_destino_id: string
  observacao: string | null
}

/**
 * Grava uma transferência. Os dois lançamentos (saída na origem, entrada no
 * destino) são criados pelo próprio banco, por trigger — a aplicação não tem
 * como esquecer uma das pontas.
 */
export function useCriarTransferencia() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (nova: NovaTransferencia) => {
      const { error } = await supabase.from('transferencias').insert(nova)
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transferencias'] })
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      qc.invalidateQueries({ queryKey: ['saldos'] })
    },
  })
}
