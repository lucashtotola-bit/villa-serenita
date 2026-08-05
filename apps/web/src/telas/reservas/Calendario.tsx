import { useMemo, useState } from 'react'
import {
  CANAIS,
  noites,
  useAcomodacoes,
  useReservas,
  type Reserva,
} from '../../dados/reservas'
import { decimalParaCentavos, formatarDinheiro } from '../../lib/formato'
import {
  LETRAS_SEMANA,
  corDoCanal,
  dataDoDia,
  diaSemanaDoPrimeiro,
  diasDoMes,
  noiteVendavel,
  noitesVendaveisNoMes,
} from '../../lib/calendario'
import {
  adicionarDias,
  competenciaAtual,
  deslocarMes,
  limitesDoMes,
  rotuloMes,
} from '../../lib/periodo'
import { ModalReserva } from './ModalReserva'

export function Calendario() {
  const [competencia, setCompetencia] = useState(competenciaAtual)
  const [canalFiltro, setCanalFiltro] = useState('')
  const [modalAberto, setModalAberto] = useState(false)

  const intervalo = limitesDoMes(competencia)
  const reservas = useReservas(intervalo)
  const acomodacoes = useAcomodacoes()

  const nDias = diasDoMes(competencia)
  const vazios = diaSemanaDoPrimeiro(competencia)
  const vendaveis = noitesVendaveisNoMes(competencia)
  const hoje = new Date().toISOString().slice(0, 10)

  // Canceladas somem da grade: a casa está livre de novo.
  const visiveis = useMemo(
    () =>
      (reservas.data ?? []).filter(
        (r) => r.status !== 'Cancelada' && (!canalFiltro || r.canal === canalFiltro),
      ),
    [reservas.data, canalFiltro],
  )

  /**
   * Para cada casa, qual reserva ocupa cada dia. O período é [entrada, saída):
   * quem sai dia 10 não ocupa o dia 10 — ele já pode ser vendido a quem chega.
   */
  const ocupacaoPorCasa = useMemo(() => {
    const mapa = new Map<string, Map<number, Reserva>>()

    for (const r of visiveis) {
      for (const ra of r.reserva_acomodacoes) {
        const casaId = ra.acomodacoes?.id
        if (!casaId) continue
        if (!mapa.has(casaId)) mapa.set(casaId, new Map())
        const dias = mapa.get(casaId)!

        for (let d = 1; d <= nDias; d++) {
          const data = dataDoDia(competencia, d)
          if (data >= r.data_entrada && data < r.data_saida) dias.set(d, r)
        }
      }
    }
    return mapa
  }, [visiveis, competencia, nDias])

  const resumoGeral = useMemo(() => {
    const casas = acomodacoes.data ?? []
    let ocupadasVendaveis = 0
    for (const casa of casas) {
      const dias = ocupacaoPorCasa.get(casa.id)
      if (!dias) continue
      for (const d of dias.keys()) {
        if (noiteVendavel(competencia, d)) ocupadasVendaveis++
      }
    }
    const capacidade = vendaveis * casas.length
    return {
      ocupacao: capacidade ? Math.round((ocupadasVendaveis / capacidade) * 100) : 0,
      receita: visiveis.reduce((t, r) => t + decimalParaCentavos(r.valor_total), 0),
      qtd: visiveis.length,
    }
  }, [acomodacoes.data, ocupacaoPorCasa, competencia, vendaveis, visiveis])

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[34px] leading-tight text-texto">Calendário</h1>
          <p className="mt-1 text-[13px] text-texto-3">
            Ocupação medida sobre as noites vendáveis — sextas e sábados.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className="rounded-campo bg-primaria px-4 py-2.5 text-[13.5px] font-semibold whitespace-nowrap text-fundo transition-colors hover:bg-primaria-clara"
        >
          ＋ Nova reserva
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-[10px] border border-borda bg-card p-1.5">
          <button
            type="button"
            onClick={() => setCompetencia((c) => deslocarMes(c, -1))}
            aria-label="Mês anterior"
            className="rounded-[7px] px-3 py-1.5 text-[15px] text-texto-3 transition-colors hover:text-texto"
          >
            ‹
          </button>
          <span className="min-w-[150px] text-center text-[13.5px] text-texto capitalize">
            {rotuloMes(competencia)}
          </span>
          <button
            type="button"
            onClick={() => setCompetencia((c) => deslocarMes(c, 1))}
            aria-label="Próximo mês"
            className="rounded-[7px] px-3 py-1.5 text-[15px] text-texto-3 transition-colors hover:text-texto"
          >
            ›
          </button>
        </div>

        <button
          type="button"
          onClick={() => setCompetencia(competenciaAtual())}
          className="rounded-pill border border-borda-campo px-3 py-1.5 text-[12.5px] text-texto-3 transition-colors hover:text-texto-2"
        >
          Hoje
        </button>

        <div className="flex flex-wrap gap-1.5">
          <ChipCanal ativo={!canalFiltro} aoClicar={() => setCanalFiltro('')} rotulo="Todos os canais" />
          {CANAIS.map((c) => (
            <ChipCanal
              key={c}
              ativo={canalFiltro === c}
              aoClicar={() => setCanalFiltro(c)}
              rotulo={c}
              cor={corDoCanal(c).fundo}
            />
          ))}
        </div>
      </div>

      {reservas.isPending ? (
        <p className="text-[13px] text-texto-3">Carregando…</p>
      ) : reservas.isError ? (
        <p className="text-[13px] text-terracota-clara">
          {(reservas.error as Error).message}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi
              rotulo="Ocupação do mês"
              valor={`${resumoGeral.ocupacao}%`}
              detalhe={`sobre ${vendaveis} noite(s) vendável(is) por casa`}
            />
            <Kpi
              rotulo="Reservas no mês"
              valor={String(resumoGeral.qtd)}
              detalhe={canalFiltro ? `canal ${canalFiltro}` : 'todos os canais'}
            />
            <Kpi
              rotulo="Valor das estadias"
              valor={formatarDinheiro(resumoGeral.receita)}
              detalhe="total das reservas que tocam o mês"
            />
          </div>

          <div className="mt-3.5 grid gap-3.5 lg:grid-cols-3">
            {(acomodacoes.data ?? []).map((casa) => (
              <GradeCasa
                key={casa.id}
                nome={casa.nome}
                cor={casa.cor}
                competencia={competencia}
                nDias={nDias}
                vazios={vazios}
                vendaveis={vendaveis}
                hoje={hoje}
                ocupacao={ocupacaoPorCasa.get(casa.id) ?? new Map()}
              />
            ))}
          </div>

          {!visiveis.length && (
            <p className="mt-3.5 rounded-card border border-borda bg-card px-5 py-8 text-center text-[14px] text-texto-2">
              Nenhuma reserva neste mês
              {canalFiltro && ` pelo canal ${canalFiltro}`}.
            </p>
          )}
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

function GradeCasa({
  nome,
  cor,
  competencia,
  nDias,
  vazios,
  vendaveis,
  hoje,
  ocupacao,
}: {
  nome: string
  cor: string
  competencia: string
  nDias: number
  vazios: number
  vendaveis: number
  hoje: string
  ocupacao: Map<number, Reserva>
}) {
  const ocupadasVendaveis = [...ocupacao.keys()].filter((d) =>
    noiteVendavel(competencia, d),
  ).length
  const pct = vendaveis ? Math.round((ocupadasVendaveis / vendaveis) * 100) : 0

  const reservasDaCasa = new Set([...ocupacao.values()].map((r) => r.id))
  const receita = [...ocupacao.values()]
    .filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i)
    .reduce((t, r) => t + decimalParaCentavos(r.valor_total), 0)

  return (
    <div className="rounded-card border border-borda bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: cor }}
        />
        <span className="min-w-0 flex-1 truncate text-[14px] text-texto">{nome}</span>
        <span className="text-[12.5px] text-texto-3">{pct}%</span>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {LETRAS_SEMANA.map((letra, i) => (
          <span
            key={i}
            className={`text-center text-[10.5px] ${
              i === 0 || i === 5 || i === 6 ? 'text-verde-claro' : 'text-texto-3'
            }`}
          >
            {letra}
          </span>
        ))}

        {Array.from({ length: vazios }, (_, i) => (
          <span key={`v${i}`} className="h-9" />
        ))}

        {Array.from({ length: nDias }, (_, i) => i + 1).map((dia) => (
          <Celula
            key={dia}
            dia={dia}
            competencia={competencia}
            hoje={hoje}
            reserva={ocupacao.get(dia)}
          />
        ))}
      </div>

      <p className="mt-3 border-t border-borda pt-2.5 text-[11.5px] text-texto-3">
        {reservasDaCasa.size} reserva(s) · {formatarDinheiro(receita)}
      </p>
    </div>
  )
}

function Celula({
  dia,
  competencia,
  hoje,
  reserva,
}: {
  dia: number
  competencia: string
  hoje: string
  reserva?: Reserva
}) {
  const data = dataDoDia(competencia, dia)
  const vendavel = noiteVendavel(competencia, dia)
  const eHoje = data === hoje

  if (reserva) {
    const { fundo, texto } = corDoCanal(reserva.canal)
    // As pontas saem das datas da reserva, não das células vizinhas: uma
    // estadia que vem do mês anterior tem de continuar emendada no dia 1, e
    // não parecer que começa ali.
    const primeiro = data === reserva.data_entrada
    const ultimo = adicionarDias(data, 1) === reserva.data_saida
    // Cantos arredondados só nas pontas da estadia: no meio, os dias se
    // emendam numa faixa contínua, e dá para ver a estadia inteira de relance.
    const raio = `${primeiro ? 7 : 2}px ${ultimo ? 7 : 2}px ${ultimo ? 7 : 2}px ${primeiro ? 7 : 2}px`

    return (
      <span
        title={`${reserva.hospedes?.nome ?? '—'} · ${reserva.canal} · ${reserva.status} · ${noites(reserva)} noite(s)`}
        className="grid h-9 place-items-center text-[12.5px] font-semibold transition-[filter] hover:brightness-110"
        style={{
          backgroundColor: fundo,
          color: texto,
          borderRadius: raio,
          // Pré-reserva ainda não é venda: fica translúcida, para não se
          // confundir com o que já está garantido.
          opacity: reserva.status === 'Pré-reserva' ? 0.58 : 1,
          outline: eHoje ? '1.5px solid #dfe3cb' : undefined,
          outlineOffset: '-1.5px',
        }}
      >
        {dia}
      </span>
    )
  }

  return (
    <span
      title={vendavel ? 'Livre · noite vendável' : 'Livre'}
      className={`grid h-9 place-items-center rounded-[7px] text-[12.5px] transition-colors hover:bg-white/[0.07] ${
        vendavel
          ? 'border border-primaria/[0.22] bg-primaria/[0.09] text-verde-claro'
          : 'text-apagado'
      }`}
      style={eHoje ? { outline: '1.5px solid #dfe3cb', outlineOffset: '-1.5px' } : undefined}
    >
      {dia}
    </span>
  )
}

function Kpi({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string
  valor: string
  detalhe: string
}) {
  return (
    <div className="rounded-card border border-borda bg-card p-4">
      <p className="text-[11px] tracking-[0.06em] text-texto-3 uppercase">{rotulo}</p>
      <p className="mt-1.5 font-serif text-[25px] text-texto">{valor}</p>
      <p className="mt-1 text-[11.5px] text-texto-3">{detalhe}</p>
    </div>
  )
}

function ChipCanal({
  ativo,
  aoClicar,
  rotulo,
  cor,
}: {
  ativo: boolean
  aoClicar: () => void
  rotulo: string
  cor?: string
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className={`flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] transition-colors ${
        ativo
          ? 'bg-primaria/15 text-verde-suave'
          : 'border border-borda-campo text-texto-3 hover:text-texto-2'
      }`}
    >
      {cor && (
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: cor }}
        />
      )}
      {rotulo}
    </button>
  )
}
