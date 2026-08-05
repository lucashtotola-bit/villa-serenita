import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { categoriasDe, centrosDe, cliforDe, useOpcoes } from '../../dados/opcoes'
import {
  useCriarNotaFiscal,
  useDestinatariosNf,
  type NovaNotaFiscal,
} from '../../dados/notasFiscais'
import {
  centavosParaDecimal,
  formatarDinheiro,
  mascaraDinheiro,
  paraCentavos,
} from '../../lib/formato'
import { adicionarDias } from '../../lib/periodo'

const hoje = () => new Date().toISOString().slice(0, 10)

const ENTRADA =
  'box-border w-full min-w-0 rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 ' +
  'text-[13.5px] text-texto placeholder:text-apagado outline-none focus:border-primaria'

type LinhaParcela = { venc?: string; valor?: string }

export function ModalNotaFiscal({
  aoFechar,
  aoSalvar,
}: {
  aoFechar: () => void
  aoSalvar: (notaId: string) => void
}) {
  const opcoes = useOpcoes()
  const destinatarios = useDestinatariosNf()
  const criar = useCriarNotaFiscal()

  const [numero, setNumero] = useState('')
  const [destinatarioId, setDestinatarioId] = useState('')
  const [emitenteId, setEmitenteId] = useState('')
  const [emissao, setEmissao] = useState(hoje)
  const [valorTotal, setValorTotal] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [centroId, setCentroId] = useState('')
  const [contaId, setContaId] = useState('')
  const [parcelas, setParcelas] = useState<LinhaParcela[]>([{}])
  const [erro, setErro] = useState<string | null>(null)

  const fornecedores = useMemo(() => cliforDe(opcoes.data, 'Despesa'), [opcoes.data])
  const categorias = useMemo(() => categoriasDe(opcoes.data, 'Despesa'), [opcoes.data])
  const centros = useMemo(() => centrosDe(opcoes.data, 'Despesa'), [opcoes.data])
  const contas = useMemo(() => opcoes.data?.contas ?? [], [opcoes.data])

  useEffect(() => {
    if (destinatarios.data?.length === 1) setDestinatarioId(destinatarios.data[0].id)
  }, [destinatarios.data])
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

  const totalCentavos = paraCentavos(valorTotal)
  const nParc = parcelas.length
  const baseParc = nParc ? Math.floor(totalCentavos / nParc) : 0

  // A cada parcela inserida, o total é redividido igualmente e escalonado em
  // 30 dias — regra do protótipo, registrada como inviolável no CLAUDE.md. A
  // última parcela absorve a sobra do arredondamento, para a soma bater exato.
  const linhas = parcelas.map((p, i) => {
    const padrao = i === nParc - 1 ? totalCentavos - baseParc * (nParc - 1) : baseParc
    const centavos = p.valor !== undefined ? paraCentavos(p.valor) : padrao
    return {
      rotulo: `${i + 1}/${nParc}`,
      centavos,
      venc: p.venc ?? adicionarDias(emissao, 30 * i),
      valorTexto: p.valor ?? (totalCentavos ? mascaraDinheiro(String(padrao)) : ''),
    }
  })

  const somaParc = linhas.reduce((t, p) => t + p.centavos, 0)
  const difParc = totalCentavos - somaParc

  function alterarParcela(i: number, campo: 'venc' | 'valor', v: string) {
    setParcelas((arr) => arr.map((p, x) => (x === i ? { ...p, [campo]: v } : p)))
    setErro(null)
  }

  function inserirParcela() {
    setParcelas((arr) => [...arr, {}])
  }

  function removerParcela(i: number) {
    setParcelas((arr) => arr.filter((_, x) => x !== i))
  }

  const faltaCadastro =
    !opcoes.isPending &&
    !destinatarios.isPending &&
    (!contas.length || !categorias.length || !centros.length || !fornecedores.length)

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    const faltando: string[] = []
    if (!numero.trim()) faltando.push('número da nota')
    if (!destinatarioId) faltando.push('destinatário')
    if (!emitenteId) faltando.push('emitente')
    if (!totalCentavos) faltando.push('valor total')
    if (!categoriaId) faltando.push('categoria')
    if (!centroId) faltando.push('centro de custo')
    if (!contaId) faltando.push('conta bancária')
    if (faltando.length) return setErro(`Preencha: ${faltando.join(', ')}.`)

    if (difParc !== 0) {
      return setErro(
        `As parcelas somam ${formatarDinheiro(somaParc)} e o total da nota é ` +
          `${formatarDinheiro(totalCentavos)}. Ajuste antes de salvar.`,
      )
    }

    const nova: NovaNotaFiscal = {
      numero: numero.trim(),
      data_emissao: emissao,
      valor_total: centavosParaDecimal(totalCentavos),
      emitente_id: emitenteId,
      destinatario_socio_id: destinatarioId,
      categoria_id: categoriaId,
      centro_id: centroId,
      conta_id: contaId,
      parcelas: linhas.map((l) => ({
        vencimento: l.venc,
        valor: centavosParaDecimal(l.centavos),
      })),
    }

    criar.mutate(nova, { onSuccess: aoSalvar })
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
        className="w-full max-w-[600px] rounded-card border border-borda bg-card p-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <h2 className="font-serif text-[22px] text-texto">Nota fiscal</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-texto-3">
          O sítio não tem CNPJ: a nota é emitida contra pessoa física, apenas
          Lucas ou Michel.
        </p>

        {faltaCadastro ? (
          <div className="mt-5 rounded-campo border border-terracota-escura bg-terracota-escura/10 p-4">
            <p className="text-[13.5px] text-terracota-clara">
              Faltam cadastros básicos para lançar uma nota fiscal.
            </p>
            <ul className="mt-2 ml-4 list-disc text-[13px] text-texto-2">
              {!contas.length && <li>nenhuma conta bancária</li>}
              {!categorias.length && <li>nenhuma categoria de despesa</li>}
              {!centros.length && <li>nenhum centro de custo</li>}
              {!fornecedores.length && <li>nenhum fornecedor cadastrado</li>}
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
              <Campo rotulo="Número da nota" obrigatorio>
                <input
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="Ex.: 4521"
                  className={ENTRADA}
                  autoFocus
                />
              </Campo>
              <Campo rotulo="Destinatário" obrigatorio>
                <select
                  value={destinatarioId}
                  onChange={(e) => setDestinatarioId(e.target.value)}
                  className={ENTRADA}
                >
                  <option value="">Selecione…</option>
                  {(destinatarios.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome_completo}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>

            <Campo rotulo="Emitente (fornecedor)" obrigatorio>
              <select
                value={emitenteId}
                onChange={(e) => setEmitenteId(e.target.value)}
                className={ENTRADA}
              >
                <option value="">Selecione o fornecedor cadastrado…</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </Campo>

            <div className="grid grid-cols-2 gap-3.5">
              <Campo rotulo="Data de emissão" obrigatorio>
                <input
                  type="date"
                  value={emissao}
                  onChange={(e) => setEmissao(e.target.value)}
                  className={ENTRADA}
                />
              </Campo>
              <Campo rotulo="Valor total" obrigatorio>
                <input
                  value={valorTotal}
                  inputMode="numeric"
                  onChange={(e) => setValorTotal(mascaraDinheiro(e.target.value))}
                  placeholder="0,00"
                  className={ENTRADA}
                />
              </Campo>
            </div>

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

            <Campo rotulo="Conta bancária (pagamento)" obrigatorio>
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

            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="text-[11px] tracking-[0.06em] text-texto-3 uppercase">
                Parcelamento — {nParc}x
              </span>
              <button
                type="button"
                onClick={inserirParcela}
                className="rounded-lg border border-primaria/45 px-3 py-1.5 text-[12px] whitespace-nowrap text-verde-suave transition-colors hover:bg-primaria/15"
              >
                ＋ Inserir nova parcela
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {linhas.map((p, i) => (
                <div key={i} className="grid grid-cols-[40px_1fr_1fr_22px] items-center gap-2">
                  <span className="text-[12px] text-texto-3">{p.rotulo}</span>
                  <input
                    type="date"
                    value={p.venc}
                    onChange={(e) => alterarParcela(i, 'venc', e.target.value)}
                    className={ENTRADA}
                  />
                  <input
                    value={p.valorTexto}
                    inputMode="numeric"
                    placeholder="0,00"
                    onChange={(e) => alterarParcela(i, 'valor', mascaraDinheiro(e.target.value))}
                    className={ENTRADA}
                  />
                  {nParc > 1 ? (
                    <button
                      type="button"
                      onClick={() => removerParcela(i)}
                      title="Remover parcela"
                      className="text-center text-[12px] text-apagado transition-colors hover:text-terracota-clara"
                    >
                      ✕
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>

            <p
              className={`text-[12px] leading-relaxed ${
                !totalCentavos ? 'text-apagado' : difParc === 0 ? 'text-verde-claro' : 'text-terracota-clara'
              }`}
            >
              {!totalCentavos
                ? 'Informe o valor total para dividir as parcelas.'
                : difParc === 0
                  ? `Parcelas somam ${formatarDinheiro(somaParc)} — igual ao total.`
                  : `Parcelas somam ${formatarDinheiro(somaParc)}, faltam ${formatarDinheiro(difParc)}.`}
            </p>

            <p className="rounded-campo border border-borda bg-fundo px-3 py-2.5 text-[12px] leading-relaxed text-texto-3">
              O anexo do documento pode ser enviado agora ou depois, pela lista
              de notas fiscais. O mês só fecha quando todas as notas emitidas
              nele tiverem o arquivo anexado.
            </p>
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
            {criar.isPending ? 'Salvando…' : 'Salvar nota fiscal'}
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
