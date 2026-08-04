import { useState } from 'react'
import { useTransferencias } from '../../dados/transferencias'
import { decimalParaCentavos, formatarDinheiro } from '../../lib/formato'
import { diaMes } from '../../lib/periodo'
import { ModalTransferencia } from './ModalTransferencia'

const GRADE = '70px minmax(0,1fr) 30px minmax(0,1fr) 118px'

export function PainelTransferencias({
  competencia,
  contaId,
}: {
  competencia: string
  contaId?: string
}) {
  const consulta = useTransferencias(competencia, contaId)
  const [modalAberto, setModalAberto] = useState(false)
  const linhas = consulta.data ?? []

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-primaria/20 bg-primaria/[0.07] px-4 py-3 text-[12.5px] text-texto-2">
        <span className="text-verde-suave">⇄</span>
        <span className="min-w-0 flex-1">
          Movimentação apenas de caixa — cada transferência gera uma saída na
          conta de origem e uma entrada na conta de destino, sem afetar
          receitas, despesas nem o rateio de lucro.
        </span>
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className="rounded-lg border border-primaria/40 px-3 py-1.5 text-[12.5px] whitespace-nowrap text-verde-suave transition-colors hover:bg-primaria/15"
        >
          ＋ Nova transferência
        </button>
      </div>

      <div className="mt-3.5 rounded-card border border-borda bg-card">
        <div className="overflow-x-auto">
          <div className="min-w-[680px] px-5 pb-4">
            <div
              className="grid gap-2.5 border-b border-borda py-3 text-[11px] tracking-[0.06em] text-texto-3 uppercase"
              style={{ gridTemplateColumns: GRADE }}
            >
              <span>Data</span>
              <span>Conta de origem (saída)</span>
              <span />
              <span>Conta de destino (entrada)</span>
              <span className="text-right">Valor</span>
            </div>

            {consulta.isPending && (
              <p className="py-8 text-[13px] text-texto-3">Carregando…</p>
            )}
            {consulta.isError && (
              <p className="py-8 text-[13px] text-terracota-clara">
                {(consulta.error as Error).message}
              </p>
            )}
            {!consulta.isPending && !linhas.length && (
              <div className="py-10 text-center">
                <p className="text-[14px] text-texto-2">
                  Nenhuma transferência neste mês.
                </p>
              </div>
            )}

            {linhas.map((t) => {
              const valor = decimalParaCentavos(t.valor)
              const origem = t.conta_origem
              const destino = t.conta_destino
              return (
                <div
                  key={t.id}
                  className="grid items-center gap-2.5 border-b border-borda/60 py-3 text-[13.5px] last:border-0"
                  style={{ gridTemplateColumns: GRADE }}
                >
                  <span className="text-[12.5px] text-texto-3">{diaMes(t.data)}</span>

                  <div className="min-w-0">
                    <div className="truncate text-texto">
                      {origem ? `${origem.banco} · ${origem.apelido}` : '—'}
                    </div>
                    <div className="mt-[3px] text-[11.5px] text-terracota-escura">
                      − {formatarDinheiro(valor)}
                    </div>
                  </div>

                  <span className="text-center text-texto-3">⇄</span>

                  <div className="min-w-0">
                    <div className="truncate text-texto">
                      {destino ? `${destino.banco} · ${destino.apelido}` : '—'}
                    </div>
                    <div className="mt-[3px] text-[11.5px] text-verde-claro">
                      + {formatarDinheiro(valor)}
                    </div>
                  </div>

                  <span className="text-right font-medium text-texto-2">
                    {formatarDinheiro(valor)}
                  </span>
                </div>
              )
            })}

            {!!linhas.length && (
              <p className="pt-4 text-[12.5px] text-texto-3">
                {linhas.length} transferência{linhas.length > 1 ? 's' : ''} no mês
                {contaId && ' nesta conta'}
              </p>
            )}
          </div>
        </div>
      </div>

      {modalAberto && (
        <ModalTransferencia
          aoFechar={() => setModalAberto(false)}
          aoSalvar={() => setModalAberto(false)}
        />
      )}
    </div>
  )
}
