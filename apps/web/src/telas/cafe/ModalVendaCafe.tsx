import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { categoriasDe, centrosDe, cliforDe, useOpcoes } from '../../dados/opcoes'
import {
  TIPOS_CAFE,
  formatarSacas,
  useCriarVenda,
  type SaldoEstoque,
  type TipoCafe,
} from '../../dados/cafe'
import {
  centavosParaDecimal,
  formatarDinheiro,
  mascaraDinheiro,
  paraCentavos,
} from '../../lib/formato'

const hoje = () => new Date().toISOString().slice(0, 10)

const ENTRADA =
  'box-border w-full min-w-0 rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 ' +
  'text-[13.5px] text-texto placeholder:text-apagado outline-none focus:border-primaria'

export function ModalVendaCafe({
  safraId,
  estoque,
  aoFechar,
}: {
  safraId: string
  estoque: SaldoEstoque[]
  aoFechar: () => void
}) {
  const opcoes = useOpcoes()
  const criar = useCriarVenda()

  const [data, setData] = useState(hoje)
  const [clienteId, setClienteId] = useState('')
  const [tipoCafe, setTipoCafe] = useState<TipoCafe>('Beneficiado')
  const [sacas, setSacas] = useState('')
  const [precoSaca, setPrecoSaca] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [centroId, setCentroId] = useState('')
  const [contaId, setContaId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const clientes = useMemo(() => cliforDe(opcoes.data, 'Receita'), [opcoes.data])
  const categorias = useMemo(() => categoriasDe(opcoes.data, 'Receita'), [opcoes.data])
  const centros = useMemo(() => centrosDe(opcoes.data, 'Receita'), [opcoes.data])
  const contas = opcoes.data?.contas ?? []

  useEffect(() => {
    if (contas.length === 1) setContaId(contas[0].id)
  }, [contas])
  useEffect(() => {
    setCategoriaId(categorias.length === 1 ? categorias[0].id : '')
  }, [categorias])
  useEffect(() => {
    setCentroId(centros.length === 1 ? centros[0].id : '')
  }, [centros])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  const qtd = Number(sacas.replace(',', '.'))
  const precoCentavos = paraCentavos(precoSaca)
  const totalCentavos = Math.round(qtd * precoCentavos)
  const disponivel = Number(estoque.find((e) => e.tipo_cafe === tipoCafe)?.sacas ?? 0)
  const passaDoEstoque = qtd > disponivel

  const faltaCadastro =
    !opcoes.isPending && (!contas.length || !categorias.length || !centros.length || !clientes.length)

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    const faltando: string[] = []
    if (!clienteId) faltando.push('comprador')
    if (!(qtd > 0)) faltando.push('sacas')
    if (!precoCentavos) faltando.push('preço por saca')
    if (!categoriaId) faltando.push('categoria')
    if (!centroId) faltando.push('centro de custo')
    if (!contaId) faltando.push('conta bancária')
    if (faltando.length) return setErro(`Preencha: ${faltando.join(', ')}.`)

    if (passaDoEstoque) {
      return setErro(
        `Há ${formatarSacas(disponivel)} saca(s) de ${tipoCafe.toLowerCase()} em ` +
          'estoque. Registre a colheita ou o beneficiamento antes da venda.',
      )
    }

    criar.mutate(
      {
        safra_id: safraId,
        cliente_id: clienteId,
        data,
        tipo_cafe: tipoCafe,
        sacas: String(qtd),
        preco_saca: centavosParaDecimal(precoCentavos),
        categoria_id: categoriaId,
        centro_id: centroId,
        conta_id: contaId,
        observacao: observacao.trim() || null,
      },
      { onSuccess: aoFechar },
    )
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
        <h2 className="font-serif text-[22px] text-texto">Venda de café</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-texto-3">
          Baixa o estoque e lança a receita no financeiro, como receita a
          receber — quando o dinheiro cair, é só marcar como recebida.
        </p>

        {faltaCadastro ? (
          <div className="mt-5 rounded-campo border border-terracota-escura bg-terracota-escura/10 p-4">
            <p className="text-[13.5px] text-terracota-clara">
              Faltam cadastros básicos para registrar a venda.
            </p>
            <ul className="mt-2 ml-4 list-disc text-[13px] text-texto-2">
              {!clientes.length && <li>nenhum cliente cadastrado</li>}
              {!contas.length && <li>nenhuma conta bancária</li>}
              {!categorias.length && <li>nenhuma categoria de receita</li>}
              {!centros.length && <li>nenhum centro de custo</li>}
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
            <div className="grid grid-cols-2 gap-3.5">
              <Campo rotulo="Comprador" obrigatorio>
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className={ENTRADA}
                  autoFocus
                >
                  <option value="">Selecione…</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Data" obrigatorio>
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className={ENTRADA}
                />
              </Campo>
            </div>

            <div className="grid grid-cols-3 gap-3.5">
              <Campo rotulo="Tipo" obrigatorio>
                <select
                  value={tipoCafe}
                  onChange={(e) => {
                    setTipoCafe(e.target.value as TipoCafe)
                    setErro(null)
                  }}
                  className={ENTRADA}
                >
                  {TIPOS_CAFE.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Sacas" obrigatorio>
                <input
                  value={sacas}
                  inputMode="decimal"
                  onChange={(e) => {
                    setSacas(e.target.value.replace(/[^\d,.]/g, ''))
                    setErro(null)
                  }}
                  placeholder="0"
                  className={ENTRADA}
                />
              </Campo>
              <Campo rotulo="Preço por saca" obrigatorio>
                <input
                  value={precoSaca}
                  inputMode="numeric"
                  onChange={(e) => setPrecoSaca(mascaraDinheiro(e.target.value))}
                  placeholder="0,00"
                  className={ENTRADA}
                />
              </Campo>
            </div>

            <p
              className={`rounded-campo border px-3 py-2.5 text-[12.5px] ${
                passaDoEstoque
                  ? 'border-terracota-escura bg-terracota-escura/15 text-terracota-clara'
                  : 'border-borda bg-fundo text-texto-2'
              }`}
            >
              {passaDoEstoque ? (
                <>
                  Estoque de {tipoCafe.toLowerCase()}:{' '}
                  <strong>{formatarSacas(disponivel)} sacas</strong> — menos do que
                  as {formatarSacas(qtd)} desta venda.
                </>
              ) : (
                <>
                  Total da venda:{' '}
                  <strong className="text-texto">{formatarDinheiro(totalCentavos)}</strong>
                  {qtd > 0 && (
                    <span className="text-texto-3">
                      {' '}
                      · restam {formatarSacas(disponivel - qtd)} sacas em estoque
                    </span>
                  )}
                </>
              )}
            </p>

            <div className="grid grid-cols-2 gap-3.5">
              <Campo rotulo="Centro de custo" obrigatorio>
                <select
                  value={centroId}
                  onChange={(e) => setCentroId(e.target.value)}
                  className={ENTRADA}
                >
                  <option value="">Selecione…</option>
                  {centros.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Categoria" obrigatorio>
                <select
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  className={ENTRADA}
                >
                  <option value="">Selecione…</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>

            <Campo rotulo="Conta bancária (recebimento)" obrigatorio>
              <select
                value={contaId}
                onChange={(e) => setContaId(e.target.value)}
                className={ENTRADA}
              >
                <option value="">Selecione…</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo rotulo="Observação">
              <input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: entrega no armazém, pagamento em 30 dias"
                className={ENTRADA}
              />
            </Campo>
          </div>
        )}

        {(erro || criar.isError) && (
          <p className="mt-4 rounded-campo border border-terracota-escura bg-terracota-escura/15 px-3 py-2.5 text-[13px] text-terracota-clara">
            {erro ?? (criar.error as Error).message}
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
            disabled={criar.isPending || faltaCadastro}
            className={`rounded-campo px-5 py-2.5 text-[13.5px] font-semibold text-fundo transition-colors ${
              criar.isPending || faltaCadastro
                ? 'bg-primaria/55'
                : 'bg-primaria hover:bg-primaria-clara'
            }`}
          >
            {criar.isPending ? 'Salvando…' : 'Salvar venda'}
          </button>
        </div>
      </form>
    </div>
  )
}

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
