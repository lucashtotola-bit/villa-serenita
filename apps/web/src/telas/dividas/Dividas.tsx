import { useMemo, useState } from 'react'
import {
  proximaParcelaDivida,
  saldoDevedor,
  situacaoDivida,
  totalComJuros,
  useDividas,
  type ContratoDivida,
} from '../../dados/dividas'
import { decimalParaCentavos, formatarDinheiro } from '../../lib/formato'
import { adicionarDias, diaMes } from '../../lib/periodo'
import { BarraAbas } from '../../componentes/BarraAbas'
import { CabecalhoPagina } from '../../componentes/CabecalhoPagina'
import { CartaoKpi } from '../../componentes/CartaoKpi'
import { ModalDivida } from './ModalDivida'

type Aba = 'todos' | 'em-dia' | 'vencidos' | 'quitados'

const GRADE = 'minmax(0,1.6fr) 120px 120px minmax(0,1.1fr) 100px'

export function Dividas() {
  const contratos = useDividas()
  const [aba, setAba] = useState<Aba>('todos')
  const [modalAberto, setModalAberto] = useState(false)

  const comSituacao = useMemo(
    () => (contratos.data ?? []).map((c) => ({ ct: c, situacao: situacaoDivida(c) })),
    [contratos.data],
  )

  const kpis = useMemo(() => {
    const lista = contratos.data ?? []
    const hoje = new Date().toISOString().slice(0, 10)
    const limite30 = adicionarDias(hoje, 30)

    const devedor = lista.reduce((t, c) => t + saldoDevedor(c), 0)
    const contratado = lista.reduce((t, c) => t + decimalParaCentavos(c.valor_contratado), 0)
    const comJuros = lista.reduce((t, c) => t + totalComJuros(c), 0)

    let proximos30 = 0
    let qtd30 = 0
    let vencidas = 0
    let qtdVencidas = 0
    for (const c of lista) {
      for (const p of c.divida_parcelas) {
        if (p.lancamentos?.situacao === 'Realizada') continue
        const centavos = decimalParaCentavos(p.valor)
        if (p.vencimento < hoje) {
          vencidas += centavos
          qtdVencidas++
        } else if (p.vencimento <= limite30) {
          proximos30 += centavos
          qtd30++
        }
      }
    }

    return [
      {
        rotulo: 'Saldo devedor',
        valor: formatarDinheiro(devedor),
        detalhe: `${lista.length} contrato(s) ativo(s)`,
      },
      {
        rotulo: 'Juros contratados',
        valor: formatarDinheiro(comJuros - contratado),
        detalhe: `sobre ${formatarDinheiro(contratado)} tomados`,
      },
      {
        rotulo: 'Vence em 30 dias',
        valor: formatarDinheiro(proximos30),
        detalhe: `${qtd30} parcela(s) até ${diaMes(limite30)}`,
      },
      {
        rotulo: 'Vencidas',
        valor: formatarDinheiro(vencidas),
        detalhe: `${qtdVencidas} parcela(s) em atraso`,
        alerta: vencidas > 0,
      },
    ]
  }, [contratos.data])

  const filtrados = useMemo(
    () =>
      comSituacao.filter(({ situacao }) => {
        if (aba === 'em-dia') return situacao === 'Em dia'
        if (aba === 'vencidos') return situacao === 'Vencido'
        if (aba === 'quitados') return situacao === 'Quitado'
        return true
      }),
    [comSituacao, aba],
  )

  const ABAS: { id: Aba; rotulo: string }[] = [
    { id: 'todos', rotulo: 'Todos' },
    { id: 'em-dia', rotulo: 'Em dia' },
    { id: 'vencidos', rotulo: 'Vencidos' },
    { id: 'quitados', rotulo: 'Quitados' },
  ]

  return (
    <div>
      <CabecalhoPagina
        titulo="Dívidas"
        subtitulo="Financiamentos e empréstimos. Cada parcela vira uma despesa prevista no financeiro."
        acao={
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className="rounded-campo bg-primaria px-4 py-2.5 text-[13.5px] font-semibold whitespace-nowrap text-fundo transition-colors hover:bg-primaria-clara"
          >
            ＋ Novo contrato
          </button>
        }
      />

      {contratos.isPending ? (
        <p className="text-[13px] text-texto-3">Carregando…</p>
      ) : contratos.isError ? (
        <p className="text-[13px] text-terracota-clara">
          {(contratos.error as Error).message}
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
            <div className="min-w-[780px] px-5 pb-4">
              <div
                className="grid gap-2 border-b border-borda py-3 text-[11px] tracking-[0.06em] text-texto-3 uppercase"
                style={{ gridTemplateColumns: GRADE }}
              >
                <span>Contrato · credor</span>
                <span className="text-right">Contratado</span>
                <span className="text-right">Falta pagar</span>
                <span>Parcelas</span>
                <span className="text-right">Situação</span>
              </div>

              {!filtrados.length && (
                <div className="py-10 text-center">
                  <p className="text-[14px] text-texto-2">Nenhum contrato neste filtro.</p>
                </div>
              )}

              {filtrados.map(({ ct, situacao }) => (
                <Linha key={ct.id} ct={ct} situacao={situacao} />
              ))}

              {!!filtrados.length && (
                <p className="pt-4 text-[12.5px] text-texto-3">
                  {filtrados.length} contrato(s) no filtro atual
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {modalAberto && (
        <ModalDivida
          aoFechar={() => setModalAberto(false)}
          aoSalvar={() => setModalAberto(false)}
        />
      )}
    </div>
  )
}

function Linha({
  ct,
  situacao,
}: {
  ct: ContratoDivida
  situacao: 'Quitado' | 'Vencido' | 'Em dia'
}) {
  const proxima = proximaParcelaDivida(ct)
  const pagas = ct.divida_parcelas.filter(
    (p) => p.lancamentos?.situacao === 'Realizada',
  ).length

  return (
    <div
      className="grid items-center gap-2 border-b border-borda/60 py-3 text-[13.5px] last:border-0"
      style={{ gridTemplateColumns: GRADE }}
    >
      <div className="min-w-0">
        <div className="truncate font-medium text-texto">{ct.descricao}</div>
        <div className="mt-[3px] truncate text-[11.5px] text-texto-3">
          {ct.credor?.nome ?? '—'}
          {ct.titular && ` · titular ${ct.titular.nome_curto}`}
          {ct.juros && ` · ${ct.juros}`}
        </div>
      </div>

      <span className="text-right text-texto-2 tabular-nums">
        {formatarDinheiro(decimalParaCentavos(ct.valor_contratado))}
      </span>

      <span className="text-right font-medium text-texto tabular-nums">
        {formatarDinheiro(saldoDevedor(ct))}
      </span>

      <div className="min-w-0">
        <div className="truncate text-[12.5px] text-texto-2">
          {pagas}/{ct.divida_parcelas.length} paga{pagas === 1 ? '' : 's'} ·{' '}
          {ct.periodicidade.toLowerCase()}
        </div>
        <div className="mt-[3px] truncate text-[11.5px] text-texto-3">
          {proxima
            ? `próxima ${diaMes(proxima.vencimento)} · ${formatarDinheiro(decimalParaCentavos(proxima.valor))}`
            : 'quitado'}
        </div>
      </div>

      <span className="flex justify-end">
        <SeloSituacao situacao={situacao} />
      </span>
    </div>
  )
}

function SeloSituacao({ situacao }: { situacao: 'Quitado' | 'Vencido' | 'Em dia' }) {
  const estilos: Record<typeof situacao, string> = {
    Quitado: 'bg-primaria/15 text-verde-suave',
    Vencido: 'bg-terracota-escura/20 text-terracota-clara',
    'Em dia': 'border border-borda-campo text-texto-3',
  }
  return (
    <span className={`rounded-pill px-2.5 py-[3px] text-[11.5px] ${estilos[situacao]}`}>
      {situacao}
    </span>
  )
}
