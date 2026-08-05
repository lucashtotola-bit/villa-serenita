import { useMemo, useState } from 'react'
import {
  proximaParcela,
  saldoAbertoNf,
  situacaoNf,
  useDestinatariosNf,
  useNotasFiscais,
  useNotasSemAnexo,
  type NotaFiscal,
} from '../../dados/notasFiscais'
import { decimalParaCentavos, formatarDinheiro } from '../../lib/formato'
import { adicionarDias, diaMes } from '../../lib/periodo'
import { CabecalhoPagina } from '../../componentes/CabecalhoPagina'
import { CartaoKpi } from '../../componentes/CartaoKpi'
import { BarraAbas } from '../../componentes/BarraAbas'
import { ModalAnexoNf } from './ModalAnexoNf'
import { ModalNotaFiscal } from './ModalNotaFiscal'

type Aba = 'todas' | 'abertas' | 'vencidas' | 'quitadas'

const GRADE = 'minmax(0,1.6fr) 130px 110px minmax(0,1.2fr) 100px 90px'

export function NotasFiscais() {
  const notas = useNotasFiscais()
  const semAnexo = useNotasSemAnexo()
  const destinatarios = useDestinatariosNf()

  const [aba, setAba] = useState<Aba>('todas')
  const [destinoFiltro, setDestinoFiltro] = useState<string>('')
  const [modalAberto, setModalAberto] = useState(false)

  const todasComSituacao = useMemo(
    () => (notas.data ?? []).map((n) => ({ nf: n, situacao: situacaoNf(n) })),
    [notas.data],
  )

  const kpis = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10)
    const limite7 = adicionarDias(hoje, 7)

    const porDestino = (destinatarios.data ?? []).map((d) => {
      const doDestino = (notas.data ?? []).filter((n) => n.destinatario_socio_id === d.id)
      const totalAcumulado = doDestino.reduce(
        (t, n) => t + decimalParaCentavos(n.valor_total),
        0,
      )
      const emAberto = doDestino.reduce((t, n) => t + saldoAbertoNf(n), 0)
      return {
        rotulo: `Acumulado ${d.nome_curto}`,
        valor: formatarDinheiro(totalAcumulado),
        detalhe: `${doDestino.length} nota(s) · ${formatarDinheiro(emAberto)} em aberto`,
      }
    })

    let venceEm7 = 0
    let vencidas = 0
    let qtdVenceEm7 = 0
    let qtdVencidas = 0
    for (const n of notas.data ?? []) {
      for (const p of n.nf_parcelas) {
        if (p.lancamentos?.situacao === 'Realizada') continue
        const centavos = decimalParaCentavos(p.valor)
        if (p.vencimento < hoje) {
          vencidas += centavos
          qtdVencidas++
        } else if (p.vencimento <= limite7) {
          venceEm7 += centavos
          qtdVenceEm7++
        }
      }
    }

    return [
      ...porDestino,
      {
        rotulo: 'Vence em 7 dias',
        valor: formatarDinheiro(venceEm7),
        detalhe: `${qtdVenceEm7} parcela(s) até ${diaMes(limite7)}`,
      },
      {
        rotulo: 'Vencidas',
        valor: formatarDinheiro(vencidas),
        detalhe: `${qtdVencidas} parcela(s) em atraso`,
        alerta: vencidas > 0,
      },
    ]
  }, [notas.data, destinatarios.data])

  const filtradas = useMemo(() => {
    return todasComSituacao.filter(({ nf, situacao }) => {
      if (aba === 'abertas' && situacao !== 'Aberta') return false
      if (aba === 'vencidas' && situacao !== 'Vencida') return false
      if (aba === 'quitadas' && situacao !== 'Quitada') return false
      if (destinoFiltro && nf.destinatario_socio_id !== destinoFiltro) return false
      return true
    })
  }, [todasComSituacao, aba, destinoFiltro])

  const totalFiltro = filtradas.reduce(
    (t, { nf }) => t + decimalParaCentavos(nf.valor_total),
    0,
  )

  const ABAS: { id: Aba; rotulo: string }[] = [
    { id: 'todas', rotulo: 'Todas' },
    { id: 'abertas', rotulo: 'Abertas' },
    { id: 'vencidas', rotulo: 'Vencidas' },
    { id: 'quitadas', rotulo: 'Quitadas' },
  ]

  return (
    <div>
      <CabecalhoPagina
        titulo="Notas fiscais"
        subtitulo="Emitidas contra Lucas ou Michel — o sítio não tem CNPJ."
        acao={
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className="rounded-campo bg-primaria px-4 py-2.5 text-[13.5px] font-semibold whitespace-nowrap text-fundo transition-colors hover:bg-primaria-clara"
          >
            ＋ Nova nota fiscal
          </button>
        }
      />

      {notas.isPending ? (
        <p className="text-[13px] text-texto-3">Carregando…</p>
      ) : notas.isError ? (
        <p className="text-[13px] text-terracota-clara">{(notas.error as Error).message}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((k) => (
              <CartaoKpi
                key={k.rotulo}
                rotulo={k.rotulo}
                valor={k.valor}
                detalhe={k.detalhe}
                alerta={'alerta' in k && k.alerta}
              />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <BarraAbas abas={ABAS} ativa={aba} aoMudar={setAba} />

            <div className="flex flex-wrap gap-1.5">
              <ChipDestino
                ativo={!destinoFiltro}
                aoClicar={() => setDestinoFiltro('')}
                rotulo="Todos"
              />
              {(destinatarios.data ?? []).map((d) => (
                <ChipDestino
                  key={d.id}
                  ativo={destinoFiltro === d.id}
                  aoClicar={() => setDestinoFiltro(d.id)}
                  rotulo={d.nome_curto}
                />
              ))}
            </div>
          </div>

          <div className="mt-3.5 overflow-x-auto rounded-card border border-borda bg-card">
            <div className="min-w-[820px] px-5 pb-4">
              <div
                className="grid gap-2 border-b border-borda py-3 text-[11px] tracking-[0.06em] text-texto-3 uppercase"
                style={{ gridTemplateColumns: GRADE }}
              >
                <span>Nota · emitente</span>
                <span>Destino</span>
                <span className="text-right">Valor</span>
                <span>Parcelas</span>
                <span className="text-right">Situação</span>
                <span className="text-right">Anexo</span>
              </div>

              {!filtradas.length && (
                <div className="py-10 text-center">
                  <p className="text-[14px] text-texto-2">Nenhuma nota fiscal neste filtro.</p>
                </div>
              )}

              {filtradas.map(({ nf, situacao }) => (
                <Linha
                  key={nf.id}
                  nf={nf}
                  situacao={situacao}
                  semAnexo={semAnexo.data?.has(nf.id) ?? false}
                />
              ))}

              {!!filtradas.length && (
                <div className="flex items-baseline justify-between pt-4">
                  <span className="text-[12.5px] text-texto-3">
                    {filtradas.length} nota(s) no filtro atual
                  </span>
                  <span className="font-serif text-[21px] text-texto tabular-nums">
                    {formatarDinheiro(totalFiltro)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3.5 rounded-grupo border border-primaria/20 bg-primaria/[0.07] px-4 py-3 text-[12.5px] leading-relaxed text-texto-2">
            ▤ Arquivos salvos em{' '}
            <strong className="text-texto">
              Drive compartilhado / Villa Serenità / notas fiscais / 2026 / [destinatário]
            </strong>{' '}
            — uma pasta por sócio, arquivo renomeado como{' '}
            <span className="font-mono text-[11.5px]">NF-numero-emitente.pdf</span>.
          </div>
        </>
      )}

      {modalAberto && (
        <ModalNotaFiscal
          aoFechar={() => setModalAberto(false)}
          aoSalvar={() => setModalAberto(false)}
        />
      )}
    </div>
  )
}

function ChipDestino({
  ativo,
  aoClicar,
  rotulo,
}: {
  ativo: boolean
  aoClicar: () => void
  rotulo: string
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className={`rounded-pill px-3 py-1.5 text-[12.5px] transition-colors ${
        ativo
          ? 'bg-primaria/15 text-verde-suave'
          : 'border border-borda-campo text-texto-3 hover:text-texto-2'
      }`}
    >
      {rotulo}
    </button>
  )
}

function Linha({
  nf,
  situacao,
  semAnexo,
}: {
  nf: NotaFiscal
  situacao: 'Quitada' | 'Vencida' | 'Aberta'
  semAnexo: boolean
}) {
  const proxima = proximaParcela(nf)
  const pagas = nf.nf_parcelas.filter((p) => p.lancamentos?.situacao === 'Realizada').length
  const [modalAnexoAberto, setModalAnexoAberto] = useState(false)

  return (
    <div
      className="grid items-center gap-2 border-b border-borda/60 py-3 text-[13.5px] last:border-0"
      style={{ gridTemplateColumns: GRADE }}
    >
      <div className="min-w-0">
        <div className="truncate font-medium text-texto">NF {nf.numero}</div>
        <div className="mt-[3px] truncate text-[11.5px] text-texto-3">
          {nf.emitente?.nome ?? '—'} · emissão {diaMes(nf.data_emissao)}
        </div>
      </div>

      <span className="truncate text-[13px] text-texto-2">
        {nf.destinatario?.nome_curto ?? '—'}
      </span>

      <span className="text-right font-medium text-texto tabular-nums">
        {formatarDinheiro(decimalParaCentavos(nf.valor_total))}
      </span>

      <div className="min-w-0">
        <div className="truncate text-[12.5px] text-texto-2">
          {pagas}/{nf.nf_parcelas.length} paga{pagas === 1 ? '' : 's'}
        </div>
        <div className="mt-[3px] truncate text-[11.5px] text-texto-3">
          {proxima ? `próxima ${diaMes(proxima.vencimento)}` : 'quitada'}
        </div>
      </div>

      <span className="flex justify-end">
        <SeloSituacao situacao={situacao} />
      </span>

      <span className="text-right">
        {semAnexo ? (
          <button
            type="button"
            onClick={() => setModalAnexoAberto(true)}
            title="Documento ainda não anexado — clique para enviar"
            className="text-[12px] text-terracota-clara hover:underline"
          >
            pendente
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setModalAnexoAberto(true)}
            title="Documento anexado — clique para ver ou substituir"
            className="text-[12px] text-primaria-clara hover:underline"
          >
            ▤ ver
          </button>
        )}
      </span>

      {modalAnexoAberto && (
        <ModalAnexoNf
          notaFiscalId={nf.id}
          numeroNf={nf.numero}
          aoFechar={() => setModalAnexoAberto(false)}
        />
      )}
    </div>
  )
}

function SeloSituacao({ situacao }: { situacao: 'Quitada' | 'Vencida' | 'Aberta' }) {
  const estilos: Record<typeof situacao, string> = {
    Quitada: 'bg-primaria/15 text-verde-suave',
    Vencida: 'bg-terracota-escura/20 text-terracota-clara',
    Aberta: 'border border-borda-campo text-texto-3',
  }
  return (
    <span className={`rounded-pill px-2.5 py-[3px] text-[11.5px] ${estilos[situacao]}`}>
      {situacao}
    </span>
  )
}
