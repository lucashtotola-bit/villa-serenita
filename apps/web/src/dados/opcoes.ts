import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { traduzirErro } from './cadastros'

export type Opcao = { id: string; nome: string }
export type OpcaoTipada = Opcao & { tipo: string }
export type OpcaoConta = { id: string; nome: string }
export type OpcaoClifor = Opcao & { relacao: string }

export type Opcoes = {
  categorias: OpcaoTipada[]
  centros: OpcaoTipada[]
  contas: OpcaoConta[]
  clifor: OpcaoClifor[]
}

/**
 * Listas que alimentam os campos de seleção dos formulários.
 *
 * Buscadas juntas e guardadas em cache: mudam raramente, e assim abrir uma
 * janela de lançamento não dispara quatro consultas ao banco.
 */
export function useOpcoes() {
  return useQuery({
    queryKey: ['opcoes'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Opcoes> => {
      const [cat, cen, con, cli] = await Promise.all([
        supabase.from('categorias').select('id, nome, tipo').eq('ativo', true).order('nome'),
        supabase.from('centros_custo').select('id, nome, tipo').eq('ativo', true).order('nome'),
        supabase
          .from('contas_bancarias')
          .select('id, banco, apelido')
          .eq('ativo', true)
          .order('banco'),
        supabase
          .from('clientes_fornecedores')
          .select('id, nome, relacao')
          .eq('ativo', true)
          .order('nome'),
      ])

      for (const r of [cat, cen, con, cli]) {
        if (r.error) throw new Error(traduzirErro(r.error))
      }

      return {
        categorias: (cat.data ?? []) as OpcaoTipada[],
        centros: (cen.data ?? []) as OpcaoTipada[],
        contas: ((con.data ?? []) as { id: string; banco: string; apelido: string }[]).map(
          (c) => ({ id: c.id, nome: `${c.banco} · ${c.apelido}` }),
        ),
        clifor: (cli.data ?? []) as OpcaoClifor[],
      }
    },
  })
}

/** Categorias que servem para um lançamento de receita ou de despesa. */
export function categoriasDe(opcoes: Opcoes | undefined, tipo: 'Receita' | 'Despesa') {
  return (opcoes?.categorias ?? []).filter((c) => c.tipo === tipo)
}

/** Centros que aceitam aquele tipo de movimento. */
export function centrosDe(opcoes: Opcoes | undefined, tipo: 'Receita' | 'Despesa') {
  return (opcoes?.centros ?? []).filter(
    (c) => c.tipo === 'Receita e despesa' || c.tipo === tipo,
  )
}

/**
 * Quem aparece no campo de vínculo, conforme a regra do projeto: despesa vem
 * de fornecedor, receita vai para cliente. Hóspedes nunca entram aqui — eles
 * se ligam ao financeiro através da reserva.
 */
export function cliforDe(opcoes: Opcoes | undefined, tipo: 'Receita' | 'Despesa') {
  const alvo = tipo === 'Receita' ? 'Cliente' : 'Fornecedor'
  return (opcoes?.clifor ?? []).filter(
    (c) => c.relacao === alvo || c.relacao === 'Cliente e fornecedor',
  )
}
