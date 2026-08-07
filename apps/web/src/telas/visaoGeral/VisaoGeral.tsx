import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  useAcumuladoNf,
  useCompromissos,
  useNaoConciliados,
  useNotasPendentes,
  useProximasChegadas,
  type ChegadaProxima,
} from '../../dados/visaoGeral'
import { useSaldos } from '../../dados/lancamentos'
import { useFechamento, useMovimentosDoMes, totaisDoMes } from '../../dados/prestacao'
import { noites } from '../../dados/reservas'
import { decimalParaCentavos, formatarDinheiro } from '../../lib/formato'
import {
  adicionarDias,
  competenciaAtual,
  deslocarMes,
  diaMes,
  hojeISO,
  rotuloMes,
} from '../../lib/periodo'
import { corDoCanal, noitesVendaveisNoMes } from '../../lib/calendario'
import { CabecalhoPagina } from '../../componentes/CabecalhoPagina'
import { CartaoKpi } from '../../componentes/CartaoKpi'
import { montarAlertas, type Alerta } from './alertas'

/**
 * Texto de variação percentual vs. o mês anterior, para o detalhe dos KPIs
 * de fluxo. Sem mês anterior para comparar (ainda sem lançamento algum),
 * não há variação que faça sentido mostrar.
 */
function variacaoTexto(atual: number, anterior: number): string | null {
  if (anterior === 0) return null
  const pct = ((atual - anterior) / anterior) * 100
  const sinal = pct >= 0 ? '+' : ''
  return `${sinal}${pct.toFixed(0)}% vs. mês anterior`
}

export function VisaoGeral() {
  const hoje = hojeISO()
  const competencia = competenciaAtual()
  const anterior = deslocarMes(competencia, -1)

  const saldos = useSaldos()
  const movimentos = useMovimentosDoMes(competencia)
  const movimentosAnterior = useMovimentosDoMes(anterior)
  const compromissos = useCompromissos(14)
  const naoConciliados = useNaoConciliados(anterior)
  const notasPendentes = useNotasPendentes()
  const chegadas = useProximasChegadas(5)
  const acumulado = useAcumuladoNf(Number(competencia.slice(0, 4)))
  const fechamentoAnterior = useFechamento(anterior)

  const totais = useMemo(
    () => totaisDoMes(movimentos.data ?? []),
    [movimentos.data],
  )

  const totaisAnterior = useMemo(
    () => totaisDoMes(movimentosAnterior.data ?? []),
    [movimentosAnterior.data],
  )

  const emCaixa = useMemo(
    () => (saldos.data ?? []).reduce((t, c) => t + decimalParaCentavos(c.saldo_atual), 0),
    [saldos.data],
  )

  const alertas = useMemo(
    () =>
      montarAlertas({
        hoje,
        competenciaAnterior: anterior,
        compromissos: compromissos.data ?? [],
        naoConciliados: naoConciliados.data ?? 0,
        notasSemAnexo: notasPendentes.data ?? [],
        mesAnteriorFechado: fechamentoAnterior.data?.status === 'Fechado',
        preReservasProximas: (chegadas.data ?? [])
          .filter(
            (r) => r.status === 'Pré-reserva' && r.data_entrada <= adicionarDias(hoje, 14),
          )
          .map((r) => ({ nome: r.hospedes?.nome ?? '—', data_entrada: r.data_entrada })),
      }),
    [
      hoje,
      anterior,
      compromissos.data,
      naoConciliados.data,
      notasPendentes.data,
      fechamentoAnterior.data,
      chegadas.data,
    ],
  )

  // Ocupação do mês corrente sobre as noites vendáveis (sexta e sábado), a
  // mesma medida do calendário — a propriedade é de fim de semana.
  const ocupacao = useMemo(() => {
    const vendaveis = noitesVendaveisNoMes(competencia)
    return { vendaveis, casas: 3 }
  }, [competencia])

  const carregando = saldos.isPending || movimentos.isPending || movimentosAnterior.isPending

  return (
    <div>
      <CabecalhoPagina
        titulo="Visão geral"
        subtitulo={new Date().toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      />

      {carregando ? (
        <p className="text-[13px] text-texto-3">Carregando…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CartaoKpi
              rotulo="Em caixa"
              valor={formatarDinheiro(emCaixa)}
              detalhe={`somando ${(saldos.data ?? []).length} conta(s)`}
              alerta={emCaixa < 0}
            />
            <CartaoKpi
              rotulo={`Receitas · ${rotuloMes(competencia).split(' de ')[0]}`}
              valor={formatarDinheiro(totais.receitas)}
              detalhe={variacaoTexto(totais.receitas, totaisAnterior.receitas) ?? 'recebido no mês'}
            />
            <CartaoKpi
              rotulo="Despesas do mês"
              valor={formatarDinheiro(totais.despesas)}
              detalhe={variacaoTexto(totais.despesas, totaisAnterior.despesas) ?? 'pago no mês'}
            />
            <CartaoKpi
              rotulo="Resultado do mês"
              valor={formatarDinheiro(totais.resultado)}
              detalhe={
                totais.resultado < 0
                  ? 'mês no vermelho'
                  : (variacaoTexto(totais.resultado, totaisAnterior.resultado) ??
                    'receitas menos despesas')
              }
              alerta={totais.resultado < 0}
            />
          </div>

          <div className="mt-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AtalhoRapido
              para="/reservas"
              icone="◍"
              titulo="Nova reserva"
              descricao="hóspede, datas e casas"
            />
            <AtalhoRapido
              para="/contas"
              icone="⊟"
              titulo="Dar baixa em contas"
              descricao="registrar pagamentos e recebimentos"
            />
            <AtalhoRapido
              para="/conciliacao"
              icone="⇄"
              titulo="Importar extrato"
              descricao="conferir com o banco"
            />
            <AtalhoRapido
              para="/prestacao-de-contas"
              icone="◫"
              titulo="Prestação de contas"
              descricao="relatório do mês"
            />
          </div>

          <div className="mt-3.5 grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
            <ProximasChegadas chegadas={chegadas.data ?? []} carregando={chegadas.isPending} />

            <div className="flex flex-col gap-3.5">
              <Alertas alertas={alertas} />
              <ResultadoMes receitas={totais.receitas} despesas={totais.despesas} />
              <AcumuladoPorSocio
                linhas={acumulado.data ?? []}
                ano={Number(competencia.slice(0, 4))}
              />
            </div>
          </div>

          <p className="mt-3.5 text-[11.5px] text-apagado">
            Ocupação medida sobre {ocupacao.vendaveis} noites vendáveis no mês
            (sextas e sábados) × {ocupacao.casas} casas — veja o detalhe no{' '}
            <Link to="/calendario" className="text-primaria-clara hover:underline">
              calendário
            </Link>
            .
          </p>
        </>
      )}
    </div>
  )
}

function AtalhoRapido({
  para,
  icone,
  titulo,
  descricao,
}: {
  para: string
  icone: string
  titulo: string
  descricao: string
}) {
  return (
    <Link
      to={para}
      className="flex items-center gap-3 rounded-card border border-primaria/[0.22] bg-card px-4 py-3.5 transition-colors hover:border-primaria hover:bg-primaria/[0.07]"
    >
      <span
        aria-hidden
        className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] bg-primaria/[0.16] text-[15px] text-verde-suave"
      >
        {icone}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-medium text-texto">{titulo}</span>
        <span className="mt-[2px] block truncate text-[11.5px] text-texto-3">{descricao}</span>
      </span>
    </Link>
  )
}

function ProximasChegadas({
  chegadas,
  carregando,
}: {
  chegadas: ChegadaProxima[]
  carregando: boolean
}) {
  return (
    <div className="rounded-card border border-borda bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-[19px] text-texto">Próximas chegadas</h2>
        <Link to="/calendario" className="text-[12.5px] text-primaria-clara hover:underline">
          ver calendário →
        </Link>
      </div>

      {carregando && <p className="py-8 text-[13px] text-texto-3">Carregando…</p>}

      {!carregando && !chegadas.length && (
        <div className="py-10 text-center">
          <p className="text-[14px] text-texto-2">Nenhuma chegada agendada.</p>
          <Link
            to="/reservas"
            className="mt-1 inline-block text-[12.5px] text-primaria-clara hover:underline"
          >
            Registrar uma reserva →
          </Link>
        </div>
      )}

      <div className="mt-2 flex flex-col">
        {chegadas.map((r) => {
          const cor = corDoCanal(r.canal)
          const casas = r.reserva_acomodacoes
            .map((ra) => ra.acomodacoes?.nome)
            .filter(Boolean)
            .join(' + ')
          const n = noites(r)

          return (
            <Link
              key={r.id}
              to="/reservas"
              className="flex items-center gap-3.5 rounded-[6px] border-t border-borda/60 px-2 py-3 transition-colors hover:bg-white/[0.04]"
            >
              <span
                aria-hidden
                className="h-2 w-2 flex-none rounded-full"
                style={{
                  backgroundColor: r.reserva_acomodacoes[0]?.acomodacoes?.cor ?? '#93a35f',
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-texto">
                  {r.hospedes?.nome ?? '—'}
                  {r.status === 'Pré-reserva' && (
                    <span className="ml-2 text-[11px] font-normal text-texto-3">
                      pré-reserva
                    </span>
                  )}
                </span>
                <span className="mt-[2px] block truncate text-[12px] text-texto-3">
                  {casas || '—'} · {diaMes(r.data_entrada)} a {diaMes(r.data_saida)} ({n}{' '}
                  noite{n === 1 ? '' : 's'})
                </span>
              </span>
              <span
                className="flex-none rounded-pill px-2.5 py-[3px] text-[11px] whitespace-nowrap"
                style={{ backgroundColor: `${cor.fundo}33`, color: cor.fundo }}
              >
                {r.canal}
              </span>
              <span className="w-[92px] flex-none text-right text-[13.5px] tabular-nums text-texto-2">
                {formatarDinheiro(decimalParaCentavos(r.valor_total))}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function Alertas({ alertas }: { alertas: Alerta[] }) {
  const CORES: Record<Alerta['nivel'], string> = {
    urgente: 'text-terracota-clara',
    atencao: 'text-verde-claro',
    calmo: 'text-texto-3',
  }

  return (
    <div className="rounded-card border border-borda bg-card p-5">
      <h2 className="font-serif text-[19px] text-texto">Alertas</h2>

      {!alertas.length ? (
        <p className="mt-3 text-[13px] leading-relaxed text-texto-2">
          Nada pendente. Contas em dia, documentos anexados e nenhuma reserva
          esperando confirmação.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5">
          {alertas.map((a) => (
            <Link
              key={a.id}
              to={a.caminho}
              className="-mx-2 flex gap-2.5 rounded-[6px] px-2 py-1.5 transition-colors hover:bg-white/[0.04]"
            >
              <span aria-hidden className={`text-[13px] leading-[1.45] ${CORES[a.nivel]}`}>
                ●
              </span>
              <span className="min-w-0 text-[13px] leading-[1.45] text-texto-2">
                <strong className="font-medium text-texto">{a.titulo}</strong> — {a.descricao}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function ResultadoMes({ receitas, despesas }: { receitas: number; despesas: number }) {
  // As duas barras compartilham a mesma escala, senão a comparação engana:
  // uma despesa pequena não pode parecer do tamanho de uma receita grande.
  // "Em caixa" fica de fora — é saldo acumulado, não fluxo do mês, e já tem
  // seu próprio KPI no topo da tela; misturado aqui, distorceria a escala das
  // duas barras que de fato são comparáveis.
  const maior = Math.max(receitas, despesas, 1)

  const barras = [
    { rotulo: 'Receitas', valor: receitas, cor: 'bg-primaria' },
    { rotulo: 'Despesas', valor: despesas, cor: 'bg-terracota-escura' },
  ]

  return (
    <div className="rounded-card border border-borda bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-[19px] text-texto">Resultado do mês</h2>
        <Link to="/lancamentos" className="text-[12.5px] text-primaria-clara hover:underline">
          financeiro →
        </Link>
      </div>

      <div className="mt-3.5 flex flex-col gap-2.5">
        {barras.map((b) => (
          <div key={b.rotulo}>
            <div className="flex justify-between text-[13px]">
              <span className="text-texto-2">{b.rotulo}</span>
              <span className="tabular-nums text-texto">{formatarDinheiro(b.valor)}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={`h-full rounded-full ${b.cor}`}
                style={{ width: `${(b.valor / maior) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Cor fixa por sócio, não por posição no ranking — se Michel ultrapassar
 * Lucas no acumulado do ano, a cor de cada um não pode trocar de lugar. As
 * notas fiscais só saem no CPF do Lucas ou do Michel (regra do sítio sem
 * CNPJ), então dois nomes já cobrem todo caso real; um terceiro nome cai no
 * verde-suave neutro em vez de inventar uma terceira cor fixa sem uso.
 */
function corDoSocio(nomeCurto: string): string {
  if (nomeCurto === 'Lucas') return 'bg-primaria'
  if (nomeCurto === 'Michel') return 'bg-terracota'
  return 'bg-verde-suave/60'
}

/** Barra de proporção entre os dois sócios que podem receber nota fiscal. */
function ProporcaoNf({
  linhas,
}: {
  linhas: { socio_id: string; nome_curto: string; total: number }[]
}) {
  const total = linhas.reduce((t, l) => t + l.total, 0)
  if (!total) return null

  return (
    <div
      className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-white/[0.06]"
      role="img"
      aria-label={linhas
        .map((l) => `${l.nome_curto} ${Math.round((l.total / total) * 100)}%`)
        .join(', ')}
    >
      {linhas.map((l) => (
        <div
          key={l.socio_id}
          className={`h-full ${corDoSocio(l.nome_curto)}`}
          style={{ width: `${(l.total / total) * 100}%` }}
        />
      ))}
    </div>
  )
}

function AcumuladoPorSocio({
  linhas,
  ano,
}: {
  linhas: { socio_id: string; nome_curto: string; total: number; qtd: number }[]
  ano: number
}) {
  return (
    <div className="rounded-card border border-borda bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-[19px] text-texto">Notas no CPF</h2>
        <Link to="/notas-fiscais" className="text-[12.5px] text-primaria-clara hover:underline">
          notas fiscais →
        </Link>
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-texto-3">
        Acumulado de {ano}. O sítio não tem CNPJ: as notas saem no CPF de um dos
        sócios, e vale acompanhar a concentração.
      </p>

      {!linhas.length ? (
        <p className="mt-3 text-[13px] text-texto-2">Nenhuma nota registrada em {ano}.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <ProporcaoNf linhas={linhas} />
          {linhas.map((l) => (
            <div
              key={l.socio_id}
              className="flex items-baseline justify-between gap-3 rounded-[9px] bg-white/[0.04] px-3.5 py-2.5"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden
                  className={`h-2 w-2 flex-none rounded-full ${corDoSocio(l.nome_curto)}`}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-texto">
                    {l.nome_curto}
                  </span>
                  <span className="mt-[3px] block text-[11.5px] text-texto-3">
                    {l.qtd} nota{l.qtd > 1 ? 's' : ''}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-[13.5px] tabular-nums text-texto-2">
                {formatarDinheiro(l.total)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
