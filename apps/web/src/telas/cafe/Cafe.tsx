import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  TIPOS_CAFE,
  formatarSacas,
  useEstoqueCafe,
  useMovimentosCafe,
  useRendimentos,
  useVendasCafe,
  type Movimento,
  type Rendimento,
  useArquivarVendaCafe,
  type VendaCafe,
} from '../../dados/cafe'
import { etapaAtual, statusEtapa, useSafras } from '../../dados/safras'
import { decimalParaCentavos, formatarDinheiro, formatarData } from '../../lib/formato'
import { BarraAbas } from '../../componentes/BarraAbas'
import { CabecalhoPagina } from '../../componentes/CabecalhoPagina'
import { CartaoKpi } from '../../componentes/CartaoKpi'
import { LinhaDoTempo } from '../safras/LinhaDoTempo'
import { ModalMovimento, type ModoMovimento } from './ModalMovimento'
import { ModalVendaCafe } from './ModalVendaCafe'
import { BotaoArquivar } from '../../componentes/BotaoArquivar'

type Aba = 'movimentos' | 'beneficiamentos' | 'vendas'

export function Cafe() {
  const safras = useSafras()
  const [safraId, setSafraId] = useState<string>('')
  const [aba, setAba] = useState<Aba>('movimentos')
  const [modo, setModo] = useState<ModoMovimento | null>(null)
  const [vendaAberta, setVendaAberta] = useState(false)

  const hoje = new Date().toISOString().slice(0, 10)

  // Abre na safra mais recente, que é onde o trabalho está acontecendo.
  useEffect(() => {
    if (!safraId && safras.data?.length) setSafraId(safras.data[0].id)
  }, [safras.data, safraId])

  const safra = safras.data?.find((s) => s.id === safraId)
  const estoque = useEstoqueCafe(safraId || undefined)
  const movimentos = useMovimentosCafe(safraId || undefined)
  const rendimentos = useRendimentos(safraId || undefined)
  const vendas = useVendasCafe(safraId || undefined)

  const saldos = useMemo(() => estoque.data ?? [], [estoque.data])
  const etapa = safra ? etapaAtual(safra, hoje) : null

  const kpis = useMemo(() => {
    const totalVendido = (vendas.data ?? []).reduce(
      (t, v) => t + decimalParaCentavos(v.valor_total),
      0,
    )
    const sacasVendidas = (vendas.data ?? []).reduce((t, v) => t + Number(v.sacas), 0)
    const emEstoque = saldos.reduce((t, s) => t + Number(s.sacas), 0)

    const medias = (rendimentos.data ?? []).map((r) => Number(r.rendimento_pct))
    const rendimentoMedio = medias.length
      ? medias.reduce((a, b) => a + b, 0) / medias.length
      : null

    const expectativa = safra?.expectativa_sacas ? Number(safra.expectativa_sacas) : null
    const colhido = (movimentos.data ?? [])
      .filter((m) => m.tipo_movimento === 'Colheita')
      .reduce((t, m) => t + Number(m.sacas), 0)

    return [
      {
        rotulo: 'Em estoque',
        valor: `${formatarSacas(emEstoque)} sc`,
        detalhe: saldos.length
          ? saldos.map((s) => `${s.tipo_cafe}: ${formatarSacas(s.sacas)}`).join(' · ')
          : 'nenhum movimento registrado',
      },
      {
        rotulo: 'Colhido',
        valor: `${formatarSacas(colhido)} sc`,
        detalhe: expectativa
          ? `${Math.round((colhido / expectativa) * 100)}% da expectativa de ${formatarSacas(expectativa)}`
          : 'sem expectativa registrada na safra',
      },
      {
        rotulo: 'Rendimento médio',
        valor: rendimentoMedio === null ? '—' : `${rendimentoMedio.toFixed(1)}%`,
        detalhe:
          rendimentoMedio === null
            ? 'nenhum beneficiamento ainda'
            : `média de ${medias.length} beneficiamento(s)`,
      },
      {
        rotulo: 'Vendido',
        valor: formatarDinheiro(totalVendido),
        detalhe: `${formatarSacas(sacasVendidas)} saca(s) em ${(vendas.data ?? []).length} venda(s)`,
      },
    ]
  }, [saldos, vendas.data, rendimentos.data, movimentos.data, safra])

  const ABAS: { id: Aba; rotulo: string }[] = [
    { id: 'movimentos', rotulo: 'Movimentos' },
    { id: 'beneficiamentos', rotulo: 'Beneficiamentos' },
    { id: 'vendas', rotulo: 'Vendas' },
  ]

  if (safras.isPending) {
    return <p className="text-[13px] text-texto-3">Carregando…</p>
  }

  if (!safras.data?.length) {
    return (
      <div>
        <CabecalhoPagina titulo="Café" />
        <div className="rounded-card border border-borda bg-card px-5 py-12 text-center">
          <p className="text-[14px] text-texto-2">Nenhuma safra cadastrada.</p>
          <p className="mt-1 text-[12.5px] text-texto-3">
            O estoque de café pertence a uma safra — comece por lá.
          </p>
          <Link
            to="/safras"
            className="mt-3 inline-block text-[13px] text-primaria-clara hover:underline"
          >
            Ir para Safras →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <CabecalhoPagina
        titulo="Café"
        subtitulo={
          etapa
            ? `Safra ${safra?.ciclo} · ${statusEtapa(etapa, hoje) === 'Em andamento' ? 'em' : 'a seguir'} ${etapa.nome.toLowerCase()}`
            : 'Estoque, beneficiamento e vendas da safra.'
        }
        acao={
          <>
            <select
              value={safraId}
              onChange={(e) => setSafraId(e.target.value)}
              className="rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 text-[13.5px] text-texto outline-none focus:border-primaria"
            >
              {safras.data.map((s) => (
                <option key={s.id} value={s.id}>
                  Safra {s.ciclo}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setVendaAberta(true)}
              className="rounded-campo bg-primaria px-4 py-2.5 text-[13.5px] font-semibold whitespace-nowrap text-fundo transition-colors hover:bg-primaria-clara"
            >
              ＋ Venda de café
            </button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <CartaoKpi key={k.rotulo} rotulo={k.rotulo} valor={k.valor} detalhe={k.detalhe} />
        ))}
      </div>

      {safra && !!safra.safra_etapas.length && (
        <div className="mt-3.5 rounded-card border border-borda bg-card p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-[19px] text-texto">Onde a safra está</h2>
            <Link to="/safras" className="text-[12.5px] text-primaria-clara hover:underline">
              Ajustar datas →
            </Link>
          </div>
          <LinhaDoTempo etapas={safra.safra_etapas} hoje={hoje} />
        </div>
      )}

      <div className="mt-3.5 grid gap-3 sm:grid-cols-3">
        {TIPOS_CAFE.map((tipo) => {
          const sacas = Number(saldos.find((s) => s.tipo_cafe === tipo)?.sacas ?? 0)
          return (
            <div key={tipo} className="rounded-card border border-borda bg-card p-4">
              <p className="text-[11px] tracking-[0.06em] text-texto-3 uppercase">{tipo}</p>
              <p className="mt-1.5 font-serif text-[25px] tabular-nums text-texto">
                {formatarSacas(sacas)}{' '}
                <span className="font-sans text-[13px] text-texto-3">sacas</span>
              </p>
            </div>
          )
        })}
      </div>

      <div className="mt-3.5 flex flex-wrap gap-2">
        <BotaoAcao rotulo="＋ Colheita" aoClicar={() => setModo('Colheita')} />
        <BotaoAcao rotulo="⇄ Beneficiamento" aoClicar={() => setModo('Beneficiamento')} />
        <BotaoAcao rotulo="− Perda" aoClicar={() => setModo('Perda')} />
        <BotaoAcao rotulo="⚖ Ajuste de inventário" aoClicar={() => setModo('Ajuste')} />
      </div>

      <div className="mt-4">
        <BarraAbas abas={ABAS} ativa={aba} aoMudar={setAba} />
      </div>

      <div className="mt-3.5 overflow-x-auto rounded-card border border-borda bg-card">
        <div className="min-w-[640px] px-5 pb-4">
          {aba === 'movimentos' && (
            <TabelaMovimentos
              movimentos={movimentos.data ?? []}
              carregando={movimentos.isPending}
            />
          )}
          {aba === 'beneficiamentos' && (
            <TabelaRendimentos
              rendimentos={rendimentos.data ?? []}
              carregando={rendimentos.isPending}
            />
          )}
          {aba === 'vendas' && (
            <TabelaVendas vendas={vendas.data ?? []} carregando={vendas.isPending} />
          )}
        </div>
      </div>

      {modo && safraId && (
        <ModalMovimento
          modo={modo}
          safraId={safraId}
          estoque={saldos}
          aoFechar={() => setModo(null)}
        />
      )}
      {vendaAberta && safraId && (
        <ModalVendaCafe
          safraId={safraId}
          estoque={saldos}
          aoFechar={() => setVendaAberta(false)}
        />
      )}
    </div>
  )
}

function BotaoAcao({ rotulo, aoClicar }: { rotulo: string; aoClicar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className="rounded-lg border border-primaria/40 px-3 py-1.5 text-[12.5px] whitespace-nowrap text-verde-suave transition-colors hover:bg-primaria/15"
    >
      {rotulo}
    </button>
  )
}

const GRADE_MOV = '96px 150px minmax(0,1fr) 110px'

function TabelaMovimentos({
  movimentos,
  carregando,
}: {
  movimentos: Movimento[]
  carregando: boolean
}) {
  return (
    <>
      <div
        className="grid gap-2 border-b border-borda py-3 text-[11px] tracking-[0.06em] text-texto-3 uppercase"
        style={{ gridTemplateColumns: GRADE_MOV }}
      >
        <span>Data</span>
        <span>Movimento</span>
        <span>Tipo · observação</span>
        <span className="text-right">Sacas</span>
      </div>

      {carregando && <p className="py-8 text-[13px] text-texto-3">Carregando…</p>}
      {!carregando && !movimentos.length && (
        <p className="py-10 text-center text-[14px] text-texto-2">
          Nenhum movimento nesta safra. Comece registrando a colheita.
        </p>
      )}

      {movimentos.map((m) => (
        <div
          key={m.id}
          className="grid items-center gap-2 border-b border-borda/60 py-3 text-[13.5px] last:border-0"
          style={{ gridTemplateColumns: GRADE_MOV }}
        >
          <span className="text-[12.5px] text-texto-3">{formatarData(m.data)}</span>
          <span className="text-texto-2">{m.tipo_movimento}</span>
          <div className="min-w-0">
            <div className="truncate text-texto">{m.tipo_cafe}</div>
            {m.observacao && (
              <div className="mt-[3px] truncate text-[11.5px] text-texto-3">
                {m.observacao}
              </div>
            )}
          </div>
          <span
            className={`text-right font-medium tabular-nums ${
              m.sentido === 'Entrada' ? 'text-verde-claro' : 'text-terracota-clara'
            }`}
          >
            {m.sentido === 'Entrada' ? '+' : '−'} {formatarSacas(m.sacas)}
          </span>
        </div>
      ))}
    </>
  )
}

const GRADE_REND = '96px minmax(0,1fr) 30px minmax(0,1fr) 96px'

function TabelaRendimentos({
  rendimentos,
  carregando,
}: {
  rendimentos: Rendimento[]
  carregando: boolean
}) {
  return (
    <>
      <div
        className="grid gap-2 border-b border-borda py-3 text-[11px] tracking-[0.06em] text-texto-3 uppercase"
        style={{ gridTemplateColumns: GRADE_REND }}
      >
        <span>Data</span>
        <span>Entrou</span>
        <span />
        <span>Saiu</span>
        <span className="text-right">Rendimento</span>
      </div>

      {carregando && <p className="py-8 text-[13px] text-texto-3">Carregando…</p>}
      {!carregando && !rendimentos.length && (
        <p className="py-10 text-center text-[14px] text-texto-2">
          Nenhum beneficiamento nesta safra.
        </p>
      )}

      {rendimentos.map((r) => (
        <div
          key={r.conversao_id}
          className="grid items-center gap-2 border-b border-borda/60 py-3 text-[13.5px] last:border-0"
          style={{ gridTemplateColumns: GRADE_REND }}
        >
          <span className="text-[12.5px] text-texto-3">{formatarData(r.data)}</span>
          <div className="min-w-0">
            <div className="truncate text-texto">{r.tipo_origem}</div>
            <div className="mt-[3px] text-[11.5px] text-terracota-clara">
              − {formatarSacas(r.sacas_origem)} sc
            </div>
          </div>
          <span className="text-center text-texto-3">⇄</span>
          <div className="min-w-0">
            <div className="truncate text-texto">{r.tipo_resultado}</div>
            <div className="mt-[3px] text-[11.5px] text-verde-claro">
              + {formatarSacas(r.sacas_resultado)} sc
            </div>
          </div>
          <span className="text-right font-medium tabular-nums text-texto">
            {Number(r.rendimento_pct).toFixed(1)}%
          </span>
        </div>
      ))}
    </>
  )
}

const GRADE_VENDA = '96px minmax(0,1.3fr) 130px 120px 116px 92px'

function TabelaVendas({ vendas, carregando }: { vendas: VendaCafe[]; carregando: boolean }) {
  return (
    <>
      <div
        className="grid gap-2 border-b border-borda py-3 text-[11px] tracking-[0.06em] text-texto-3 uppercase"
        style={{ gridTemplateColumns: GRADE_VENDA }}
      >
        <span>Data</span>
        <span>Comprador</span>
        <span>Café</span>
        <span className="text-right">Total</span>
        <span className="text-right">Recebimento</span>
        <span />
      </div>

      {carregando && <p className="py-8 text-[13px] text-texto-3">Carregando…</p>}
      {!carregando && !vendas.length && (
        <p className="py-10 text-center text-[14px] text-texto-2">
          Nenhuma venda nesta safra.
        </p>
      )}

      {vendas.map((v) => (
        <LinhaVenda key={v.id} venda={v} />
      ))}
    </>
  )
}

function LinhaVenda({ venda: v }: { venda: VendaCafe }) {
  const arquivar = useArquivarVendaCafe()
  const recebida = v.lancamentos?.situacao === 'Realizada'

  return (
          <div
            className="grid items-center gap-2 border-b border-borda/60 py-3 text-[13.5px] last:border-0"
            style={{ gridTemplateColumns: GRADE_VENDA }}
          >
            <span className="text-[12.5px] text-texto-3">{formatarData(v.data)}</span>
            <div className="min-w-0">
              <div className="truncate text-texto">
                {v.clientes_fornecedores?.nome ?? '—'}
              </div>
              {v.observacao && (
                <div className="mt-[3px] truncate text-[11.5px] text-texto-3">
                  {v.observacao}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[12.5px] text-texto-2">
                {formatarSacas(v.sacas)} sc · {v.tipo_cafe}
              </div>
              <div className="mt-[3px] text-[11.5px] text-texto-3">
                {formatarDinheiro(decimalParaCentavos(v.preco_saca))}/sc
              </div>
            </div>
            <span className="text-right font-medium tabular-nums text-texto">
              {formatarDinheiro(decimalParaCentavos(v.valor_total))}
            </span>
            <span className="flex justify-end">
              <span
                className={`rounded-pill px-2.5 py-[3px] text-[11.5px] whitespace-nowrap ${
                  recebida
                    ? 'bg-primaria/15 text-verde-suave'
                    : 'border border-borda-campo text-texto-3'
                }`}
              >
                {recebida ? 'Recebido' : 'A receber'}
              </span>
            </span>

            <span className="text-right">
              <BotaoArquivar
                arquivando={arquivar.isPending}
                erro={arquivar.isError ? (arquivar.error as Error).message : null}
                aviso="A receita é arquivada e as sacas voltam ao estoque."
                aoArquivar={(concluir) => arquivar.mutate(v.id, { onSuccess: concluir })}
              />
            </span>
          </div>
  )
}
