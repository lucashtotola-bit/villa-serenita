import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { categoriasDe, centrosDe, cliforDe, useOpcoes } from '../../dados/opcoes'
import { useConciliarCriando, type LinhaExtrato } from '../../dados/conciliacao'
import { decimalParaCentavos, formatarDinheiro, formatarData } from '../../lib/formato'

const ENTRADA =
  'box-border w-full min-w-0 rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 ' +
  'text-[13.5px] text-texto placeholder:text-apagado outline-none focus:border-primaria'

/**
 * Cria o lançamento que faltava, a partir de uma linha do extrato.
 *
 * Data, valor e sentido vêm do banco e não são editáveis — mudá-los quebraria
 * a conciliação que está sendo feita no mesmo gesto. Ao usuário resta o que só
 * ele sabe: classificar.
 */
export function ModalCriarDaLinha({
  linha,
  aoFechar,
}: {
  linha: LinhaExtrato
  aoFechar: () => void
}) {
  const opcoes = useOpcoes()
  const criar = useConciliarCriando()

  const centavos = decimalParaCentavos(linha.valor)
  const tipo: 'Receita' | 'Despesa' = centavos > 0 ? 'Receita' : 'Despesa'

  const [descricao, setDescricao] = useState(linha.descricao)
  const [categoriaId, setCategoriaId] = useState('')
  const [centroId, setCentroId] = useState('')
  const [cliforId, setCliforId] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const categorias = useMemo(() => categoriasDe(opcoes.data, tipo), [opcoes.data, tipo])
  const centros = useMemo(() => centrosDe(opcoes.data, tipo), [opcoes.data, tipo])
  const clifor = useMemo(() => cliforDe(opcoes.data, tipo), [opcoes.data, tipo])

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

  const faltaCadastro = !opcoes.isPending && (!categorias.length || !centros.length)

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    const faltando: string[] = []
    if (!categoriaId) faltando.push('categoria')
    if (!centroId) faltando.push('centro de custo')
    if (faltando.length) return setErro(`Preencha: ${faltando.join(', ')}.`)

    criar.mutate(
      {
        linhaId: linha.id,
        categoriaId,
        centroId,
        descricao: descricao.trim() || undefined,
        cliforId: cliforId || undefined,
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
        className="w-full max-w-[520px] rounded-card border border-borda bg-card p-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <h2 className="font-serif text-[22px] text-texto">
          Criar {tipo.toLowerCase()} do extrato
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-texto-3">
          Este movimento apareceu no banco e não tinha lançamento. Ele nasce já
          conciliado — e, por isso, travado para edição.
        </p>

        <div className="mt-4 rounded-campo border border-borda bg-fundo px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[12.5px] text-texto-3">{formatarData(linha.data)}</span>
            <span
              className={`font-medium tabular-nums ${
                centavos > 0 ? 'text-verde-claro' : 'text-terracota-clara'
              }`}
            >
              {centavos > 0 ? '+' : '−'} {formatarDinheiro(Math.abs(centavos))}
            </span>
          </div>
          <p className="mt-1 text-[12.5px] break-words text-texto-2">{linha.descricao}</p>
        </div>

        {faltaCadastro ? (
          <div className="mt-4 rounded-campo border border-terracota-escura bg-terracota-escura/10 p-4">
            <p className="text-[13.5px] text-terracota-clara">
              Faltam cadastros para classificar este movimento.
            </p>
            <ul className="mt-2 ml-4 list-disc text-[13px] text-texto-2">
              {!categorias.length && <li>nenhuma categoria de {tipo.toLowerCase()}</li>}
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
          <div className="mt-4 flex flex-col gap-3.5">
            <Campo rotulo="Descrição">
              <input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Como você reconhece este movimento"
                className={ENTRADA}
                autoFocus
              />
            </Campo>

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

            <Campo rotulo={tipo === 'Receita' ? 'Cliente' : 'Fornecedor'}>
              <select
                value={cliforId}
                onChange={(e) => setCliforId(e.target.value)}
                className={ENTRADA}
              >
                <option value="">Sem vínculo</option>
                {clifor.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
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
            {criar.isPending ? 'Salvando…' : 'Criar e conciliar'}
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
