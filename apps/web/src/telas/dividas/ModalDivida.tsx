import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { categoriasDe, centrosDe, cliforDe, useOpcoes } from '../../dados/opcoes'
import { useCriarDivida, useSocios, type NovoContratoDivida } from '../../dados/dividas'
import {
  centavosDeTexto,
  centavosParaDecimal,
  formatarDinheiro,
  mascaraDinheiro,
  paraCentavos,
} from '../../lib/formato'
import { adicionarMeses } from '../../lib/periodo'

const hoje = () => new Date().toISOString().slice(0, 10)

const ENTRADA =
  'box-border w-full min-w-0 rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 ' +
  'text-[13.5px] text-texto placeholder:text-apagado outline-none focus:border-primaria'

/** Quantos meses cada periodicidade avança entre uma parcela e a seguinte. */
const PASSO_MESES: Record<string, number> = {
  Mensal: 1,
  Bimestral: 2,
  Trimestral: 3,
  Semestral: 6,
  Anual: 12,
}

type LinhaParcela = { venc?: string; valor?: string }

export function ModalDivida({
  aoFechar,
  aoSalvar,
}: {
  aoFechar: () => void
  aoSalvar: (contratoId: string) => void
}) {
  const opcoes = useOpcoes()
  const socios = useSocios()
  const criar = useCriarDivida()

  const [descricao, setDescricao] = useState('')
  const [credorId, setCredorId] = useState('')
  const [titularId, setTitularId] = useState('')
  const [valorContratado, setValorContratado] = useState('')
  const [valorParcela, setValorParcela] = useState('')
  const [numeroParcelas, setNumeroParcelas] = useState('12')
  const [primeiroVencimento, setPrimeiroVencimento] = useState(hoje)
  const [periodicidade, setPeriodicidade] = useState('Mensal')
  const [juros, setJuros] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [centroId, setCentroId] = useState('')
  const [contaId, setContaId] = useState('')
  const [ajustes, setAjustes] = useState<Record<number, LinhaParcela>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [colagemAberta, setColagemAberta] = useState(false)
  const [colagem, setColagem] = useState('')
  const [avisoColagem, setAvisoColagem] = useState<string | null>(null)

  const credores = useMemo(() => cliforDe(opcoes.data, 'Despesa'), [opcoes.data])
  const categorias = useMemo(() => categoriasDe(opcoes.data, 'Despesa'), [opcoes.data])
  const centros = useMemo(() => centrosDe(opcoes.data, 'Despesa'), [opcoes.data])
  const contas = useMemo(() => opcoes.data?.contas ?? [], [opcoes.data])

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

  const contratadoCentavos = paraCentavos(valorContratado)
  const parcelaCentavos = paraCentavos(valorParcela)
  const nParc = Math.max(0, Math.min(360, parseInt(numeroParcelas, 10) || 0))
  const passo = PASSO_MESES[periodicidade] ?? 1

  // Diferente da nota fiscal, o valor não é dividido: quem manda é o valor da
  // parcela que o banco cobra. O sistema só repete esse valor e escalona as
  // datas — qualquer cálculo de juros nosso divergiria do boleto.
  const linhas = Array.from({ length: nParc }, (_, i) => {
    const ajuste = ajustes[i] ?? {}
    return {
      rotulo: `${i + 1}/${nParc}`,
      centavos: ajuste.valor !== undefined ? paraCentavos(ajuste.valor) : parcelaCentavos,
      venc: ajuste.venc ?? adicionarMeses(primeiroVencimento, passo * i),
      valorTexto:
        ajuste.valor ?? (parcelaCentavos ? mascaraDinheiro(String(parcelaCentavos)) : ''),
    }
  })

  const somaParcelas = linhas.reduce((t, p) => t + p.centavos, 0)
  const jurosCentavos = somaParcelas - contratadoCentavos

  function alterarParcela(i: number, campo: 'venc' | 'valor', v: string) {
    setAjustes((a) => ({ ...a, [i]: { ...a[i], [campo]: v } }))
    setErro(null)
  }

  /**
   * Preenche as parcelas com os valores colados do carnê. Quem manda é a lista
   * colada: se ela tiver mais ou menos linhas que o informado, o número de
   * parcelas se ajusta a ela — o carnê é o documento, não o nosso palpite.
   */
  function aplicarColagem() {
    const valores = colagem
      .split('\n')
      .map(centavosDeTexto)
      .filter((v): v is number => v !== null && v > 0)

    if (!valores.length) {
      setAvisoColagem('Não encontrei nenhum valor nas linhas coladas.')
      return
    }

    // Datas já ajustadas à mão são preservadas; a colagem mexe só nos valores.
    setAjustes((a) =>
      Object.fromEntries(
        valores.map((c, i) => [i, { venc: a[i]?.venc, valor: mascaraDinheiro(String(c)) }]),
      ),
    )
    setNumeroParcelas(String(valores.length))
    setColagemAberta(false)
    setColagem('')
    setAvisoColagem(null)
    setErro(null)
  }

  const faltaCadastro =
    !opcoes.isPending &&
    (!contas.length || !categorias.length || !centros.length || !credores.length)

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    const faltando: string[] = []
    if (!descricao.trim()) faltando.push('descrição')
    if (!credorId) faltando.push('credor')
    if (!contratadoCentavos) faltando.push('valor contratado')
    if (!nParc) faltando.push('número de parcelas')
    if (!categoriaId) faltando.push('categoria')
    if (!centroId) faltando.push('centro de custo')
    if (!contaId) faltando.push('conta bancária')
    if (faltando.length) return setErro(`Preencha: ${faltando.join(', ')}.`)

    if (linhas.some((l) => l.centavos <= 0)) {
      return setErro('Toda parcela precisa de um valor maior que zero.')
    }

    const novo: NovoContratoDivida = {
      descricao: descricao.trim(),
      credor_id: credorId,
      titular_socio_id: titularId || null,
      valor_contratado: centavosParaDecimal(contratadoCentavos),
      numero_parcelas: nParc,
      primeiro_vencimento: primeiroVencimento,
      periodicidade,
      juros: juros.trim() || null,
      categoria_id: categoriaId,
      centro_id: centroId,
      conta_id: contaId,
      parcelas: linhas.map((l) => ({
        vencimento: l.venc,
        valor: centavosParaDecimal(l.centavos),
      })),
    }

    criar.mutate(novo, { onSuccess: aoSalvar })
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
        <h2 className="font-serif text-[22px] text-texto">Contrato de dívida</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-texto-3">
          Financiamento ou empréstimo. Os valores vêm do carnê, não de cálculo
          nosso — a soma das parcelas supera o contratado, por causa dos juros.
          Se as parcelas não forem iguais, use "colar valores do carnê".
        </p>

        {faltaCadastro ? (
          <div className="mt-5 rounded-campo border border-terracota-escura bg-terracota-escura/10 p-4">
            <p className="text-[13.5px] text-terracota-clara">
              Faltam cadastros básicos para registrar um contrato.
            </p>
            <ul className="mt-2 ml-4 list-disc text-[13px] text-texto-2">
              {!contas.length && <li>nenhuma conta bancária</li>}
              {!categorias.length && <li>nenhuma categoria de despesa</li>}
              {!centros.length && <li>nenhum centro de custo</li>}
              {!credores.length && <li>nenhum fornecedor/credor cadastrado</li>}
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
                placeholder="Ex.: Financiamento do trator"
                className={ENTRADA}
                autoFocus
              />
            </Campo>

            <div className="grid grid-cols-2 gap-3.5">
              <Campo rotulo="Credor" obrigatorio>
                <select
                  value={credorId}
                  onChange={(e) => setCredorId(e.target.value)}
                  className={ENTRADA}
                >
                  <option value="">Selecione…</option>
                  {credores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Titular">
                <select
                  value={titularId}
                  onChange={(e) => setTitularId(e.target.value)}
                  className={ENTRADA}
                >
                  <option value="">Sítio (sem titular)</option>
                  {(socios.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome_completo}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <Campo rotulo="Valor contratado" obrigatorio>
                <input
                  value={valorContratado}
                  inputMode="numeric"
                  onChange={(e) => setValorContratado(mascaraDinheiro(e.target.value))}
                  placeholder="0,00"
                  className={ENTRADA}
                />
              </Campo>
              <Campo rotulo="Valor da parcela" obrigatorio>
                <input
                  value={valorParcela}
                  inputMode="numeric"
                  onChange={(e) => setValorParcela(mascaraDinheiro(e.target.value))}
                  placeholder="0,00"
                  className={ENTRADA}
                />
              </Campo>
            </div>

            <div className="grid grid-cols-3 gap-3.5">
              <Campo rotulo="Nº de parcelas" obrigatorio>
                <input
                  value={numeroParcelas}
                  inputMode="numeric"
                  onChange={(e) => setNumeroParcelas(e.target.value.replace(/\D/g, ''))}
                  className={ENTRADA}
                />
              </Campo>
              <Campo rotulo="Periodicidade" obrigatorio>
                <select
                  value={periodicidade}
                  onChange={(e) => setPeriodicidade(e.target.value)}
                  className={ENTRADA}
                >
                  {Object.keys(PASSO_MESES).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="1º vencimento" obrigatorio>
                <input
                  type="date"
                  value={primeiroVencimento}
                  onChange={(e) => setPrimeiroVencimento(e.target.value)}
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

            <div className="grid grid-cols-2 gap-3.5">
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
              <Campo rotulo="Juros (anotação)">
                <input
                  value={juros}
                  onChange={(e) => setJuros(e.target.value)}
                  placeholder="Ex.: 1,2% a.m. Price"
                  className={ENTRADA}
                />
              </Campo>
            </div>

            {!!nParc && (
              <>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="text-[11px] tracking-[0.06em] text-texto-3 uppercase">
                    Parcelas — {nParc}x, {periodicidade.toLowerCase()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setColagemAberta((v) => !v)}
                    className="rounded-lg border border-primaria/45 px-3 py-1.5 text-[12px] whitespace-nowrap text-verde-suave transition-colors hover:bg-primaria/15"
                  >
                    {colagemAberta ? 'Cancelar colagem' : '⎘ Colar valores do carnê'}
                  </button>
                </div>

                {colagemAberta && (
                  <div className="rounded-campo border border-borda bg-fundo p-3">
                    <p className="text-[12px] leading-relaxed text-texto-3">
                      Cole os valores das parcelas, um por linha — direto do carnê,
                      do PDF do banco ou de uma coluna do Excel. Use quando as
                      parcelas não são todas iguais (SAC, contrato com TR).
                    </p>
                    <textarea
                      value={colagem}
                      onChange={(e) => {
                        setColagem(e.target.value)
                        setAvisoColagem(null)
                      }}
                      rows={5}
                      placeholder={'1.234,56\n1.210,08\n1.185,60'}
                      className={`${ENTRADA} mt-2 resize-y font-mono text-[12.5px]`}
                    />
                    {avisoColagem && (
                      <p className="mt-2 text-[12px] text-terracota-clara">{avisoColagem}</p>
                    )}
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={aplicarColagem}
                        className="rounded-campo bg-primaria px-4 py-2 text-[12.5px] font-semibold text-fundo transition-colors hover:bg-primaria-clara"
                      >
                        Aplicar às parcelas
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex max-h-[260px] flex-col gap-2 overflow-y-auto pr-1">
                  {linhas.map((p, i) => (
                    <div key={i} className="grid grid-cols-[46px_1fr_1fr] items-center gap-2">
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
                        onChange={(e) =>
                          alterarParcela(i, 'valor', mascaraDinheiro(e.target.value))
                        }
                        className={ENTRADA}
                      />
                    </div>
                  ))}
                </div>

                <p className="rounded-campo border border-borda bg-fundo px-3 py-2.5 text-[12px] leading-relaxed text-texto-3">
                  {!contratadoCentavos || !somaParcelas ? (
                    'Informe o valor contratado e o valor da parcela.'
                  ) : (
                    <>
                      Parcelas somam{' '}
                      <strong className="text-texto-2">{formatarDinheiro(somaParcelas)}</strong>{' '}
                      contra {formatarDinheiro(contratadoCentavos)} contratados —{' '}
                      <strong
                        className={
                          jurosCentavos < 0 ? 'text-terracota-clara' : 'text-texto-2'
                        }
                      >
                        {formatarDinheiro(jurosCentavos)}
                      </strong>{' '}
                      de juros.
                      {jurosCentavos < 0 &&
                        ' As parcelas somam menos que o contratado — confira os valores.'}
                    </>
                  )}
                </p>
              </>
            )}
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
            {criar.isPending ? 'Salvando…' : 'Salvar contrato'}
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
