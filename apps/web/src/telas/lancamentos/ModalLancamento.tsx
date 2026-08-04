import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  categoriasDe,
  centrosDe,
  cliforDe,
  useOpcoes,
} from '../../dados/opcoes'
import {
  useAtualizarLancamento,
  useCriarLancamento,
  type Lancamento,
  type NovoLancamento,
} from '../../dados/lancamentos'
import {
  centavosParaDecimal,
  decimalParaCentavos,
  mascaraDinheiro,
  paraCentavos,
} from '../../lib/formato'

type Props = {
  tipo: 'Receita' | 'Despesa'
  /** Presente = editando este lançamento avulso; ausente = criando um novo. */
  editando?: Lancamento
  aoFechar: () => void
  aoSalvar: () => void
}

const hoje = () => new Date().toISOString().slice(0, 10)

/**
 * Janela de receita ou despesa — cria ou edita, conforme `editando`.
 *
 * Só lançamentos de origem "Avulso" chegam aqui em modo de edição: os gerados
 * automaticamente (parcela de NF, receita de reserva…) se editam pela tela de
 * origem, para não dessincronizar do valor que os gerou.
 *
 * A situação usa linguagem comum ("Já recebi" / "Ainda vou receber") em vez de
 * Prevista/Realizada: quem usa o sistema não precisa aprender o vocabulário do
 * banco de dados.
 */
export function ModalLancamento({ tipo, editando, aoFechar, aoSalvar }: Props) {
  const opcoes = useOpcoes()
  const criar = useCriarLancamento()
  const atualizar = useAtualizarLancamento()
  const salvando = editando ? atualizar : criar
  const receita = tipo === 'Receita'

  const [descricao, setDescricao] = useState(editando?.descricao ?? '')
  const [valor, setValor] = useState(() =>
    editando ? mascaraDinheiro(String(decimalParaCentavos(editando.valor))) : '',
  )
  const [jaAconteceu, setJaAconteceu] = useState(editando?.situacao !== 'Prevista')
  const [data, setData] = useState(
    editando ? (editando.data_pagamento ?? editando.data_vencimento) : hoje(),
  )
  const [contaId, setContaId] = useState(editando?.conta_id ?? '')
  const [categoriaId, setCategoriaId] = useState(editando?.categoria_id ?? '')
  const [centroId, setCentroId] = useState(editando?.centro_id ?? '')
  const [cliforId, setCliforId] = useState(editando?.clifor_id ?? '')
  const [observacao, setObservacao] = useState(editando?.observacao ?? '')
  const [erro, setErro] = useState<string | null>(null)

  const categorias = useMemo(() => categoriasDe(opcoes.data, tipo), [opcoes.data, tipo])
  const centros = useMemo(() => centrosDe(opcoes.data, tipo), [opcoes.data, tipo])
  const pessoas = useMemo(() => cliforDe(opcoes.data, tipo), [opcoes.data, tipo])
  const contas = opcoes.data?.contas ?? []

  // Pré-seleciona quando há uma opção só: menos um clique no caso comum. Só
  // faz sentido ao criar — ao editar, os campos já vêm preenchidos.
  useEffect(() => {
    if (!editando && contas.length === 1) setContaId(contas[0].id)
  }, [editando, contas])
  useEffect(() => {
    if (!editando) setCategoriaId(categorias.length === 1 ? categorias[0].id : '')
  }, [editando, categorias])
  useEffect(() => {
    if (!editando) setCentroId(centros.length === 1 ? centros[0].id : '')
  }, [editando, centros])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  const faltaCadastro =
    !opcoes.isPending && (!contas.length || !categorias.length || !centros.length)

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    const centavos = paraCentavos(valor)
    if (!descricao.trim()) return setErro('Informe a descrição.')
    if (centavos <= 0) return setErro('Informe um valor maior que zero.')
    if (!contaId) return setErro('Escolha a conta bancária.')
    if (!categoriaId) return setErro('Escolha a categoria.')
    if (!centroId) return setErro('Escolha o centro de custo/receita.')

    const campos: NovoLancamento = {
      tipo,
      situacao: jaAconteceu ? 'Realizada' : 'Prevista',
      descricao: descricao.trim(),
      valor: centavosParaDecimal(centavos),
      // Lançamento avulso tem uma data só; quando já aconteceu, ela vale para
      // vencimento e pagamento. Parcelas de NF, que nascem com vencimento e são
      // pagas depois, são criadas pelo próprio banco.
      data_vencimento: data,
      data_pagamento: jaAconteceu ? data : null,
      conta_id: contaId,
      categoria_id: categoriaId,
      centro_id: centroId,
      clifor_id: cliforId || null,
      observacao: observacao.trim() || null,
    }

    if (editando) {
      atualizar.mutate({ id: editando.id, ...campos }, { onSuccess: aoSalvar })
    } else {
      criar.mutate(campos, { onSuccess: aoSalvar })
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(10,14,6,0.72)] px-4 py-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar()
      }}
    >
      <form
        onSubmit={enviar}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-[560px] rounded-card border border-borda bg-card p-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <h2 className="font-serif text-[22px] text-texto">
          {editando ? (receita ? 'Editar receita' : 'Editar despesa') : receita ? 'Nova receita' : 'Nova despesa'}
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-texto-3">
          {receita
            ? 'Dinheiro que entra: diárias, venda de café, outros recebimentos.'
            : 'Dinheiro que sai: insumos, serviços, manutenção, mão de obra.'}
        </p>

        {faltaCadastro ? (
          <div className="mt-5 rounded-campo border border-terracota-escura bg-terracota-escura/10 p-4">
            <p className="text-[13.5px] text-terracota-clara">
              Faltam cadastros básicos para lançar.
            </p>
            <ul className="mt-2 ml-4 list-disc text-[13px] text-texto-2">
              {!contas.length && <li>nenhuma conta bancária</li>}
              {!categorias.length && (
                <li>nenhuma categoria de {receita ? 'receita' : 'despesa'}</li>
              )}
              {!centros.length && <li>nenhum centro de custo/receita</li>}
            </ul>
            <Link
              to="/cadastros"
              className="mt-3 inline-block text-[13px] text-primaria-clara hover:underline"
            >
              Ir para Cadastros →
            </Link>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-3.5">
            <Campo rotulo="Descrição" obrigatorio>
              <input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder={
                  receita ? 'Ex.: Reserva Júlia — Rifugio' : 'Ex.: Adubo NPK — 40 sacas'
                }
                className={ENTRADA}
                autoFocus
              />
            </Campo>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Campo rotulo="Valor (R$)" obrigatorio>
                <input
                  value={valor}
                  inputMode="numeric"
                  onChange={(e) => setValor(mascaraDinheiro(e.target.value))}
                  placeholder="0,00"
                  className={ENTRADA}
                />
              </Campo>

              <Campo rotulo={jaAconteceu ? 'Data' : 'Vence em'} obrigatorio>
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className={ENTRADA}
                />
              </Campo>
            </div>

            <Campo rotulo="Situação">
              <div className="flex gap-1.5 rounded-campo border border-borda-campo p-1">
                {[
                  { valor: true, rotulo: receita ? 'Já recebi' : 'Já paguei' },
                  { valor: false, rotulo: receita ? 'Ainda vou receber' : 'Ainda vou pagar' },
                ].map((o) => (
                  <button
                    key={String(o.valor)}
                    type="button"
                    onClick={() => setJaAconteceu(o.valor)}
                    className={`flex-1 rounded-[7px] px-3 py-2 text-[13px] transition-colors ${
                      jaAconteceu === o.valor
                        ? 'bg-primaria/15 font-medium text-verde-suave'
                        : 'text-texto-3 hover:text-texto-2'
                    }`}
                  >
                    {o.rotulo}
                  </button>
                ))}
              </div>
              <span className="mt-1 block text-[11.5px] text-apagado">
                {jaAconteceu
                  ? 'Entra no saldo da conta e poderá ser conciliado com o extrato.'
                  : 'Fica como compromisso previsto e não altera o saldo até ser pago.'}
              </span>
            </Campo>

            <Campo rotulo="Conta bancária" obrigatorio>
              <Selecao valor={contaId} aoMudar={setContaId} opcoes={contas} />
            </Campo>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Campo rotulo="Categoria" obrigatorio>
                <Selecao valor={categoriaId} aoMudar={setCategoriaId} opcoes={categorias} />
              </Campo>
              <Campo rotulo="Centro de custo/receita" obrigatorio>
                <Selecao valor={centroId} aoMudar={setCentroId} opcoes={centros} />
              </Campo>
            </div>

            <Campo rotulo={receita ? 'Cliente (opcional)' : 'Fornecedor (opcional)'}>
              <Selecao valor={cliforId} aoMudar={setCliforId} opcoes={pessoas} vazio="—" />
            </Campo>

            <Campo rotulo="Observação (opcional)">
              <input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className={ENTRADA}
              />
            </Campo>
          </div>
        )}

        {(erro || salvando.isError) && (
          <p className="mt-4 rounded-campo border border-terracota-escura bg-terracota-escura/15 px-3 py-2.5 text-[13px] text-terracota-clara">
            {erro ?? (salvando.error as Error).message}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-campo border border-borda-campo px-4 py-2.5 text-[13.5px] text-texto-2 transition-colors hover:text-texto"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando.isPending || faltaCadastro}
            className={`rounded-campo px-5 py-2.5 text-[13.5px] font-semibold text-fundo transition-colors ${
              salvando.isPending || faltaCadastro
                ? 'bg-primaria/55'
                : 'bg-primaria hover:bg-primaria-clara'
            }`}
          >
            {salvando.isPending ? 'Salvando…' : editando ? 'Salvar alterações' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}

const ENTRADA =
  'box-border w-full min-w-0 rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 ' +
  'text-[14px] text-texto placeholder:text-apagado outline-none focus:border-primaria'

function Campo({
  rotulo,
  obrigatorio,
  children,
}: {
  rotulo: string
  obrigatorio?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] tracking-[0.06em] text-texto-3 uppercase">
        {rotulo}
        {obrigatorio && <span className="text-primaria"> *</span>}
      </span>
      {children}
    </label>
  )
}

function Selecao({
  valor,
  aoMudar,
  opcoes,
  vazio = 'Selecione…',
}: {
  valor: string
  aoMudar: (v: string) => void
  opcoes: { id: string; nome: string }[]
  vazio?: string
}) {
  return (
    <select value={valor} onChange={(e) => aoMudar(e.target.value)} className={ENTRADA}>
      <option value="">{vazio}</option>
      {opcoes.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nome}
        </option>
      ))}
    </select>
  )
}
