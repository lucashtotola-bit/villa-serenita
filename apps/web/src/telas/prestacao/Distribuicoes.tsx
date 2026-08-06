import { useState } from 'react'
import {
  useDistribuicoes,
  useDistribuidoPorSocio,
  type Distribuicao,
} from '../../dados/distribuicoes'
import { useSaldoAportes } from '../../dados/prestacao'
import { decimalParaCentavos, formatarDinheiro, formatarData } from '../../lib/formato'
import { rotuloMes } from '../../lib/periodo'
import { CabecalhoPagina } from '../../componentes/CabecalhoPagina'
import { CartaoKpi } from '../../componentes/CartaoKpi'
import { ModalDistribuicao } from './ModalDistribuicao'

export function Distribuicoes() {
  const distribuicoes = useDistribuicoes()
  const porSocio = useDistribuidoPorSocio()
  const aportes = useSaldoAportes()
  const [modalAberto, setModalAberto] = useState(false)

  const lista = distribuicoes.data ?? []
  const total = lista.reduce((t, d) => t + decimalParaCentavos(d.valor_total), 0)

  // Aporte em aberto não é abatido da distribuição — são coisas separadas.
  // Mas convém lembrar disso na hora de distribuir, para ninguém achar que a
  // retirada quitou o que o sócio tem a receber de volta.
  const comAporte = (aportes.data ?? []).filter(
    (a) => decimalParaCentavos(a.saldo_em_aberto) > 0,
  )

  return (
    <div>
      <CabecalhoPagina
        titulo="Distribuição de lucro"
        subtitulo="Retirada dos sócios. Sai do caixa, mas não entra no resultado do mês."
        acao={
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className="rounded-campo bg-primaria px-4 py-2.5 text-[13.5px] font-semibold whitespace-nowrap text-fundo transition-colors hover:bg-primaria-clara"
          >
            ＋ Distribuir lucro
          </button>
        }
      />

      {distribuicoes.isPending ? (
        <p className="text-[13px] text-texto-3">Carregando…</p>
      ) : distribuicoes.isError ? (
        <p className="text-[13px] text-terracota-clara">
          {(distribuicoes.error as Error).message}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(porSocio.data ?? []).map((s) => (
              <CartaoKpi
                key={s.socio_id}
                rotulo={s.nome_curto}
                valor={formatarDinheiro(decimalParaCentavos(s.total_recebido))}
                detalhe="lucro já retirado"
              />
            ))}
          </div>

          <p className="mt-3 text-[12.5px] text-texto-3">
            Total distribuído até hoje:{' '}
            <strong className="text-texto-2">{formatarDinheiro(total)}</strong>
          </p>

          {!!comAporte.length && (
            <div className="mt-3.5 rounded-grupo border border-primaria/20 bg-primaria/[0.07] px-4 py-3 text-[12.5px] leading-relaxed text-texto-2">
              <strong className="text-texto">Aporte em aberto:</strong>{' '}
              {comAporte
                .map(
                  (a) =>
                    `${a.nome_curto} (${formatarDinheiro(decimalParaCentavos(a.saldo_em_aberto))})`,
                )
                .join(', ')}
              . Distribuir lucro não devolve aporte — a devolução tem lugar
              próprio, na tela de Aportes.
            </div>
          )}

          <div className="mt-3.5 flex flex-col gap-3.5">
            {!lista.length && (
              <div className="rounded-card border border-borda bg-card px-5 py-12 text-center">
                <p className="text-[14px] text-texto-2">
                  Nenhuma distribuição registrada.
                </p>
                <p className="mt-1 text-[12.5px] text-texto-3">
                  Registre aqui quando os sócios retirarem lucro do sítio.
                </p>
              </div>
            )}

            {lista.map((d) => (
              <Cartao key={d.id} distribuicao={d} />
            ))}
          </div>
        </>
      )}

      {modalAberto && <ModalDistribuicao aoFechar={() => setModalAberto(false)} />}
    </div>
  )
}

function Cartao({ distribuicao: d }: { distribuicao: Distribuicao }) {
  const total = decimalParaCentavos(d.valor_total)

  return (
    <div className="rounded-card border border-borda bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-serif text-[19px] text-texto">
            {formatarDinheiro(total)}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-texto-3">
            {formatarData(d.data)}
            {d.competencia_referencia && (
              <> · referente a {rotuloMes(d.competencia_referencia)}</>
            )}
            {d.contas_bancarias && (
              <>
                {' · '}
                {d.contas_bancarias.banco} · {d.contas_bancarias.apelido}
              </>
            )}
          </p>
        </div>
      </div>

      {d.observacao && (
        <p className="mt-2 text-[12.5px] text-texto-3">{d.observacao}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-borda pt-3">
        {d.distribuicao_socios
          .slice()
          .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo))
          .map((p) => {
            const centavos = decimalParaCentavos(p.valor)
            return (
              <div key={p.id}>
                <p className="text-[11.5px] text-texto-3">
                  {p.nome_completo.split(' ')[0]}
                  <span className="ml-1.5 text-apagado">{Number(p.cota)}%</span>
                </p>
                <p
                  className={`text-[13.5px] tabular-nums ${
                    centavos === 0 ? 'text-apagado' : 'text-texto-2'
                  }`}
                  title={centavos === 0 ? 'Deixou a parte no caixa' : undefined}
                >
                  {formatarDinheiro(centavos)}
                </p>
              </div>
            )
          })}
      </div>
    </div>
  )
}
