import { useMemo, useState } from 'react'
import {
  noites,
  saldoAReceber,
  useMudarStatusReserva,
  useReservas,
  type Reserva,
  type StatusReserva,
} from '../../dados/reservas'
import { decimalParaCentavos, formatarDinheiro, formatarData } from '../../lib/formato'
import { adicionarDias } from '../../lib/periodo'
import { BarraAbas } from '../../componentes/BarraAbas'
import { CabecalhoPagina } from '../../componentes/CabecalhoPagina'
import { CartaoKpi } from '../../componentes/CartaoKpi'
import { ModalReserva } from './ModalReserva'

type Aba = 'proximas' | 'pre-reservas' | 'todas' | 'canceladas'

const GRADE = 'minmax(0,1.5fr) 168px minmax(0,1fr) 116px 112px 150px'

export function Reservas() {
  const reservas = useReservas()
  const [aba, setAba] = useState<Aba>('proximas')
  const [modalAberto, setModalAberto] = useState(false)

  const hoje = new Date().toISOString().slice(0, 10)

  const kpis = useMemo(() => {
    const lista = reservas.data ?? []
    const limite30 = adicionarDias(hoje, 30)
    const ativas = lista.filter((r) => r.status !== 'Cancelada')

    const chegam30 = ativas.filter(
      (r) => r.data_entrada >= hoje && r.data_entrada <= limite30,
    )
    const hospedados = ativas.filter(
      (r) => r.data_entrada <= hoje && r.data_saida > hoje && r.status !== 'Pré-reserva',
    )
    const aReceber = ativas.reduce((t, r) => t + saldoAReceber(r), 0)
    const preReservas = lista.filter((r) => r.status === 'Pré-reserva')

    return [
      {
        rotulo: 'No sítio agora',
        valor: String(hospedados.length),
        detalhe: hospedados.length
          ? hospedados.map((r) => r.hospedes?.nome ?? '—').join(', ')
          : 'nenhuma casa ocupada',
      },
      {
        rotulo: 'Chegam em 30 dias',
        valor: String(chegam30.length),
        detalhe: `${chegam30.reduce((t, r) => t + r.numero_hospedes, 0)} hóspede(s) esperados`,
      },
      {
        rotulo: 'A receber',
        valor: formatarDinheiro(aReceber),
        detalhe: 'sinais e saldos ainda não recebidos',
      },
      {
        rotulo: 'Pré-reservas',
        valor: String(preReservas.length),
        detalhe: 'seguram a data, sem entrar no financeiro',
        alerta: preReservas.some((r) => r.data_entrada <= adicionarDias(hoje, 7)),
      },
    ]
  }, [reservas.data, hoje])

  const filtradas = useMemo(() => {
    const lista = reservas.data ?? []
    if (aba === 'proximas') {
      return lista
        .filter((r) => r.status !== 'Cancelada' && r.data_saida >= hoje)
        .sort((a, b) => a.data_entrada.localeCompare(b.data_entrada))
    }
    if (aba === 'pre-reservas') return lista.filter((r) => r.status === 'Pré-reserva')
    if (aba === 'canceladas') return lista.filter((r) => r.status === 'Cancelada')
    return lista
  }, [reservas.data, aba, hoje])

  const ABAS: { id: Aba; rotulo: string }[] = [
    { id: 'proximas', rotulo: 'Próximas' },
    { id: 'pre-reservas', rotulo: 'Pré-reservas' },
    { id: 'todas', rotulo: 'Todas' },
    { id: 'canceladas', rotulo: 'Canceladas' },
  ]

  return (
    <div>
      <CabecalhoPagina
        titulo="Reservas"
        subtitulo="O sinal confirma e garante a data; o saldo é recebido na chegada."
        acao={
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className="rounded-campo bg-primaria px-4 py-2.5 text-[13.5px] font-semibold whitespace-nowrap text-fundo transition-colors hover:bg-primaria-clara"
          >
            ＋ Nova reserva
          </button>
        }
      />

      {reservas.isPending ? (
        <p className="text-[13px] text-texto-3">Carregando…</p>
      ) : reservas.isError ? (
        <p className="text-[13px] text-terracota-clara">
          {(reservas.error as Error).message}
        </p>
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

          <div className="mt-4">
            <BarraAbas abas={ABAS} ativa={aba} aoMudar={setAba} />
          </div>

          <div className="mt-3.5 overflow-x-auto rounded-card border border-borda bg-card">
            <div className="min-w-[900px] px-5 pb-4">
              <div
                className="grid gap-2 border-b border-borda py-3 text-[11px] tracking-[0.06em] text-texto-3 uppercase"
                style={{ gridTemplateColumns: GRADE }}
              >
                <span>Hóspede · canal</span>
                <span>Período</span>
                <span>Acomodações</span>
                <span className="text-right">Valor</span>
                <span className="text-right">Situação</span>
                <span className="text-right">Ações</span>
              </div>

              {!filtradas.length && (
                <div className="py-10 text-center">
                  <p className="text-[14px] text-texto-2">Nenhuma reserva neste filtro.</p>
                </div>
              )}

              {filtradas.map((r) => (
                <Linha key={r.id} reserva={r} hoje={hoje} />
              ))}

              {!!filtradas.length && (
                <p className="pt-4 text-[12.5px] text-texto-3">
                  {filtradas.length} reserva(s) no filtro atual
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {modalAberto && (
        <ModalReserva
          aoFechar={() => setModalAberto(false)}
          aoSalvar={() => setModalAberto(false)}
        />
      )}
    </div>
  )
}

function Linha({ reserva: r, hoje }: { reserva: Reserva; hoje: string }) {
  const mudar = useMudarStatusReserva()
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')

  const total = decimalParaCentavos(r.valor_total)
  const aReceber = saldoAReceber(r)
  const n = noites(r)

  function aplicar(status: StatusReserva, motivoTexto?: string) {
    mudar.mutate(
      { id: r.id, status, motivo: motivoTexto },
      { onSuccess: () => setCancelando(false) },
    )
  }

  return (
    <div
      className="grid items-center gap-2 border-b border-borda/60 py-3 text-[13.5px] last:border-0"
      style={{ gridTemplateColumns: GRADE }}
    >
      <div className="min-w-0">
        <div className="truncate font-medium text-texto">{r.hospedes?.nome ?? '—'}</div>
        <div className="mt-[3px] truncate text-[11.5px] text-texto-3">
          {r.canal} · {r.numero_hospedes} hóspede{r.numero_hospedes === 1 ? '' : 's'}
          {r.status === 'Cancelada' && r.motivo_cancelamento && ` · ${r.motivo_cancelamento}`}
        </div>
      </div>

      <div className="min-w-0">
        <div className="truncate text-[12.5px] text-texto-2">
          {formatarData(r.data_entrada)} → {formatarData(r.data_saida)}
        </div>
        <div className="mt-[3px] text-[11.5px] text-texto-3">
          {n} noite{n === 1 ? '' : 's'}
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap gap-1">
        {r.reserva_acomodacoes.map((ra) => (
          <span
            key={ra.id}
            title={ra.acomodacoes?.nome ?? ''}
            className="flex items-center gap-1.5 rounded-pill border border-borda-campo px-2 py-[2px] text-[11.5px] text-texto-3"
          >
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: ra.acomodacoes?.cor ?? '#93a35f' }}
            />
            <span className="truncate">{ra.acomodacoes?.nome ?? '—'}</span>
          </span>
        ))}
      </div>

      <div className="text-right tabular-nums">
        <div className="font-medium text-texto">{formatarDinheiro(total)}</div>
        {aReceber > 0 && (
          <div className="mt-[3px] text-[11.5px] text-texto-3">
            {formatarDinheiro(aReceber)} a receber
          </div>
        )}
      </div>

      <span className="flex justify-end">
        <SeloStatus status={r.status} />
      </span>

      <div className="flex flex-col items-end gap-1">
        {cancelando ? (
          <div className="flex w-full flex-col items-end gap-1.5">
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo do cancelamento"
              autoFocus
              className="w-full rounded-campo border border-borda-campo bg-fundo px-2 py-1 text-right text-[11.5px] text-texto placeholder:text-apagado outline-none focus:border-primaria"
            />
            <span className="flex gap-2 text-[12px]">
              <button
                type="button"
                onClick={() => aplicar('Cancelada', motivo.trim())}
                disabled={!motivo.trim() || mudar.isPending}
                className="text-terracota-clara hover:underline disabled:opacity-40"
              >
                {mudar.isPending ? 'Cancelando…' : 'Confirmar'}
              </button>
              <button
                type="button"
                onClick={() => setCancelando(false)}
                className="text-texto-3 hover:text-texto-2"
              >
                Voltar
              </button>
            </span>
          </div>
        ) : (
          <span className="flex flex-wrap justify-end gap-2 text-[12px]">
            {r.status === 'Pré-reserva' && (
              <button
                type="button"
                onClick={() => aplicar('Confirmada')}
                disabled={mudar.isPending}
                className="text-verde-suave hover:underline"
              >
                Confirmar
              </button>
            )}
            {r.status === 'Confirmada' && r.data_saida <= hoje && (
              <button
                type="button"
                onClick={() => aplicar('Concluída')}
                disabled={mudar.isPending}
                className="text-verde-suave hover:underline"
              >
                Concluir
              </button>
            )}
            {(r.status === 'Pré-reserva' || r.status === 'Confirmada') && (
              <button
                type="button"
                onClick={() => setCancelando(true)}
                className="text-texto-3 transition-colors hover:text-terracota-clara"
              >
                Cancelar
              </button>
            )}
            {(r.status === 'Concluída' || r.status === 'Cancelada') && (
              <span className="text-apagado">—</span>
            )}
          </span>
        )}
        {mudar.isError && (
          <span className="max-w-[150px] text-right text-[11px] leading-snug text-terracota-clara">
            {(mudar.error as Error).message}
          </span>
        )}
      </div>
    </div>
  )
}

function SeloStatus({ status }: { status: StatusReserva }) {
  const estilos: Record<StatusReserva, string> = {
    Confirmada: 'bg-primaria/15 text-verde-suave',
    'Pré-reserva': 'border border-borda-campo text-texto-3',
    Concluída: 'bg-primaria/10 text-texto-2',
    Cancelada: 'bg-terracota-escura/20 text-terracota-clara',
  }
  return (
    <span className={`rounded-pill px-2.5 py-[3px] text-[11.5px] whitespace-nowrap ${estilos[status]}`}>
      {status}
    </span>
  )
}
