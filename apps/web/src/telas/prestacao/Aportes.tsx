import { useEffect, useMemo, useState } from 'react'
import { Campo, ENTRADA, Sobreposicao } from '../../componentes/formulario'
import {
  useAportes,
  useArquivarAporte,
  useCriarAporte,
  useSaldoAportes,
  type Aporte,
  type NovoAporte,
  type SaldoAporte,
} from '../../dados/prestacao'
import { useOpcoes } from '../../dados/opcoes'
import {
  centavosParaDecimal,
  decimalParaCentavos,
  formatarDinheiro,
  formatarData,
  mascaraDinheiro,
  paraCentavos,
} from '../../lib/formato'
import { CabecalhoPagina } from '../../componentes/CabecalhoPagina'
import { CartaoKpi } from '../../componentes/CartaoKpi'
import { BotaoArquivar } from '../../componentes/BotaoArquivar'

const GRADE = '96px minmax(0,1fr) 130px minmax(0,1fr) 120px 92px'

export function Aportes() {
  const saldos = useSaldoAportes()
  const aportes = useAportes()
  const [modalAberto, setModalAberto] = useState(false)

  const lista = saldos.data ?? []
  const totalEmAberto = lista.reduce((t, s) => t + decimalParaCentavos(s.saldo_em_aberto), 0)

  return (
    <div>
      <CabecalhoPagina
        titulo="Aportes"
        subtitulo="Dinheiro que um sócio pôs no sítio e tem a receber de volta. Fica fora do resultado."
        acao={
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className="rounded-campo bg-primaria px-4 py-2.5 text-[13.5px] font-semibold whitespace-nowrap text-fundo transition-colors hover:bg-primaria-clara"
          >
            ＋ Aporte ou devolução
          </button>
        }
      />

      {saldos.isPending ? (
        <p className="text-[13px] text-texto-3">Carregando…</p>
      ) : saldos.isError ? (
        <p className="text-[13px] text-terracota-clara">{(saldos.error as Error).message}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {lista.map((s) => (
              <CartaoKpi
                key={s.socio_id}
                rotulo={s.nome_curto}
                valor={formatarDinheiro(decimalParaCentavos(s.saldo_em_aberto))}
                detalhe={
                  decimalParaCentavos(s.saldo_em_aberto) > 0
                    ? 'a receber de volta'
                    : 'nada em aberto'
                }
              />
            ))}
          </div>

          <p className="mt-3 text-[12.5px] text-texto-3">
            Total em aberto com os sócios:{' '}
            <strong className="text-texto-2">{formatarDinheiro(totalEmAberto)}</strong>
          </p>

          <div className="mt-3.5 overflow-x-auto rounded-card border border-borda bg-card">
            <div className="min-w-[720px] px-5 pb-4">
              <div
                className="grid gap-2 border-b border-borda py-3 text-[11px] tracking-[0.06em] text-texto-3 uppercase"
                style={{ gridTemplateColumns: GRADE }}
              >
                <span>Data</span>
                <span>Sócio</span>
                <span>Movimento</span>
                <span>Conta · observação</span>
                <span className="text-right">Valor</span>
                <span />
              </div>

              {aportes.isPending && <p className="py-8 text-[13px] text-texto-3">Carregando…</p>}
              {!aportes.isPending && !aportes.data?.length && (
                <div className="py-10 text-center">
                  <p className="text-[14px] text-texto-2">Nenhum aporte registrado.</p>
                  <p className="mt-1 text-[12.5px] text-texto-3">
                    Registre aqui quando um sócio cobrir uma despesa do próprio bolso.
                  </p>
                </div>
              )}

              {(aportes.data ?? []).map((a) => (
                <Linha key={a.id} aporte={a} />
              ))}
            </div>
          </div>
        </>
      )}

      {modalAberto && (
        <ModalAporte saldos={lista} aoFechar={() => setModalAberto(false)} />
      )}
    </div>
  )
}

function Linha({ aporte: a }: { aporte: Aporte }) {
  const centavos = decimalParaCentavos(a.valor)
  const entrada = a.tipo === 'Aporte'
  const arquivar = useArquivarAporte()

  return (
    <div
      className="grid items-center gap-2 border-b border-borda/60 py-3 text-[13.5px] last:border-0"
      style={{ gridTemplateColumns: GRADE }}
    >
      <span className="text-[12.5px] text-texto-3">{formatarData(a.data)}</span>
      <span className="truncate text-texto">{a.socios?.nome_curto ?? '—'}</span>
      <span
        className={`rounded-pill px-2.5 py-[3px] text-center text-[11.5px] whitespace-nowrap ${
          entrada ? 'bg-primaria/15 text-verde-suave' : 'border border-borda-campo text-texto-3'
        }`}
      >
        {a.tipo}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[12.5px] text-texto-2">
          {a.contas_bancarias
            ? `${a.contas_bancarias.banco} · ${a.contas_bancarias.apelido}`
            : '—'}
        </div>
        {a.observacao && (
          <div className="mt-[3px] truncate text-[11.5px] text-texto-3">{a.observacao}</div>
        )}
      </div>
      <span
        className={`text-right font-medium tabular-nums ${
          entrada ? 'text-verde-claro' : 'text-terracota-clara'
        }`}
      >
        {entrada ? '+' : '−'} {formatarDinheiro(centavos)}
      </span>

      <span className="text-right">
        <BotaoArquivar
          arquivando={arquivar.isPending}
          erro={arquivar.isError ? (arquivar.error as Error).message : null}
          aviso="O lançamento no caixa vai junto."
          aoArquivar={(concluir) => arquivar.mutate(a.id, { onSuccess: concluir })}
        />
      </span>
    </div>
  )
}

function ModalAporte({
  saldos,
  aoFechar,
}: {
  saldos: SaldoAporte[]
  aoFechar: () => void
}) {
  const opcoes = useOpcoes()
  const criar = useCriarAporte()

  const [socioId, setSocioId] = useState('')
  const [tipo, setTipo] = useState<'Aporte' | 'Devolução'>('Aporte')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [contaId, setContaId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const contas = useMemo(() => opcoes.data?.contas ?? [], [opcoes.data])

  useEffect(() => {
    if (contas.length === 1) setContaId(contas[0].id)
  }, [contas])

  const centavos = paraCentavos(valor)
  const emAberto = socioId
    ? decimalParaCentavos(saldos.find((s) => s.socio_id === socioId)?.saldo_em_aberto ?? '0')
    : 0
  const excedeu = tipo === 'Devolução' && centavos > emAberto

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    const faltando: string[] = []
    if (!socioId) faltando.push('sócio')
    if (!centavos) faltando.push('valor')
    if (!contaId) faltando.push('conta bancária')
    if (faltando.length) return setErro(`Preencha: ${faltando.join(', ')}.`)

    if (excedeu) {
      return setErro(
        `A devolução não pode passar do que o sócio tem em aberto (${formatarDinheiro(emAberto)}).`,
      )
    }

    const novo: NovoAporte = {
      socio_id: socioId,
      tipo,
      valor: centavosParaDecimal(centavos),
      data,
      conta_id: contaId,
      observacao: observacao.trim() || null,
    }

    criar.mutate(novo, { onSuccess: aoFechar })
  }

  return (
    <Sobreposicao aoFechar={aoFechar}>
      <form
        onSubmit={enviar}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-[520px] rounded-card border border-borda bg-card p-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <h2 className="font-serif text-[22px] text-texto">Aporte ou devolução</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-texto-3">
          O dinheiro entra ou sai da conta, mas não é receita nem despesa — não
          entra no resultado do mês, e por isso não distorce a prestação de contas.
        </p>

        <div className="mt-5 flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3.5">
            <Campo rotulo="Sócio" obrigatorio>
              <select
                value={socioId}
                onChange={(e) => {
                  setSocioId(e.target.value)
                  setErro(null)
                }}
                className={ENTRADA}
                autoFocus
              >
                <option value="">Selecione…</option>
                {saldos.map((s) => (
                  <option key={s.socio_id} value={s.socio_id}>
                    {s.nome_completo}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Movimento" obrigatorio>
              <select
                value={tipo}
                onChange={(e) => {
                  setTipo(e.target.value as 'Aporte' | 'Devolução')
                  setErro(null)
                }}
                className={ENTRADA}
              >
                <option value="Aporte">Aporte — o sócio pôs dinheiro</option>
                <option value="Devolução">Devolução — o sítio devolveu</option>
              </select>
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <Campo rotulo="Valor" obrigatorio>
              <input
                value={valor}
                inputMode="numeric"
                onChange={(e) => {
                  setValor(mascaraDinheiro(e.target.value))
                  setErro(null)
                }}
                placeholder="0,00"
                className={ENTRADA}
              />
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

          {socioId && tipo === 'Devolução' && (
            <p
              className={`rounded-campo border px-3 py-2.5 text-[12.5px] ${
                excedeu
                  ? 'border-terracota-escura bg-terracota-escura/15 text-terracota-clara'
                  : 'border-borda bg-fundo text-texto-2'
              }`}
            >
              Em aberto com este sócio:{' '}
              <strong className="text-texto">{formatarDinheiro(emAberto)}</strong>
              {excedeu && ' — a devolução acima passa desse valor.'}
            </p>
          )}

          <Campo rotulo="Conta bancária" obrigatorio>
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
              placeholder="Ex.: pagou o adubo do próprio bolso"
              className={ENTRADA}
            />
          </Campo>
        </div>

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
            disabled={criar.isPending}
            className={`rounded-campo px-5 py-2.5 text-[13.5px] font-semibold text-fundo transition-colors ${
              criar.isPending ? 'bg-primaria/55' : 'bg-primaria hover:bg-primaria-clara'
            }`}
          >
            {criar.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Sobreposicao>
  )
}

