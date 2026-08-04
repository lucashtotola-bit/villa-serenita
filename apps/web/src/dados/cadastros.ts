import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { DefinicaoCadastro } from '../telas/cadastros/definicoes'

export type Registro = Record<string, unknown> & { id: string }

/**
 * As travas de verdade estão no banco, então os erros chegam em linguagem de
 * Postgres. Aqui viram frases que o usuário entende — o nome da constraint é
 * o que identifica cada caso.
 */
const MENSAGENS: Record<string, string> = {
  categorias_nome_unico: 'Já existe uma categoria com esse nome.',
  centros_nome_unico: 'Já existe um centro com esse nome.',
  hospedes_cpf_unico: 'Já existe um hóspede cadastrado com esse CPF.',
  hospedes_cpf_valido: 'CPF inválido — informe os 11 dígitos.',
  clifor_documento_unico:
    'Já existe um cliente ou fornecedor com esse CNPJ/CPF.',
  clifor_documento_valido:
    'CNPJ/CPF inválido — informe 11 dígitos (CPF) ou 14 (CNPJ).',
  contas_banco_apelido_unico:
    'Já existe uma conta desse banco com esse apelido.',
  hospedes_origem_valida: 'Origem inválida.',
  categorias_tipo_valido: 'Tipo inválido.',
  centros_tipo_valido: 'Tipo inválido.',
  clifor_relacao_valida: 'Relação inválida.',
  contas_tipo_valido: 'Tipo de conta inválido.',
}

export function traduzirErro(erro: PostgrestError): string {
  const texto = `${erro.message} ${erro.details ?? ''}`
  for (const [constraint, frase] of Object.entries(MENSAGENS)) {
    if (texto.includes(constraint)) return frase
  }
  if (erro.code === '23505') return 'Já existe um registro igual a esse.'
  if (erro.code === '23514') return 'Algum campo está fora do formato esperado.'
  if (erro.code === '42501') {
    return 'Você não tem permissão para esta ação.'
  }
  return erro.message
}

/** Lista, cria e arquiva registros de uma aba de Cadastros. */
export function useCadastro(def: DefinicaoCadastro) {
  const qc = useQueryClient()
  const chave = ['cadastro', def.tabela]

  const lista = useQuery({
    queryKey: chave,
    queryFn: async (): Promise<Registro[]> => {
      const { data, error } = await supabase
        .from(def.tabela)
        .select('*')
        .eq('ativo', true)
        .order(def.ordenarPor)
      if (error) throw new Error(traduzirErro(error))
      return (data ?? []) as Registro[]
    },
  })

  const criar = useMutation({
    mutationFn: async (valores: Record<string, unknown>) => {
      const { error } = await supabase.from(def.tabela).insert(valores)
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
  })

  /**
   * Arquivar, nunca apagar: um lançamento de 2026 precisa continuar mostrando
   * a categoria correta mesmo depois que ela sai de uso. O banco recusa DELETE.
   */
  const arquivar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(def.tabela)
        .update({ ativo: false })
        .eq('id', id)
      if (error) throw new Error(traduzirErro(error))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
  })

  return { lista, criar, arquivar }
}
