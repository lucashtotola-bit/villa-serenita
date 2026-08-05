import { progressoEtapa, statusEtapa, type SafraEtapa } from '../../dados/safras'
import { formatarData } from '../../lib/formato'

const MES_CURTO = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

function rotuloPeriodo(e: SafraEtapa): string {
  const mes = (iso: string) => MES_CURTO[Number(iso.slice(5, 7)) - 1]
  const ini = mes(e.data_inicio)
  const fim = mes(e.data_fim)
  return ini === fim ? ini : `${ini} – ${fim}`
}

/**
 * Linha do tempo da safra, em escala real de datas.
 *
 * Cada etapa é uma faixa posicionada pelo tempo que ocupa, não por uma fatia
 * igual do espaço. É o que torna visível a sobreposição que existe de fato na
 * lavoura — a colheita ainda está em campo enquanto a secagem já começou —, e
 * que uma lista de barras de mesmo tamanho esconderia.
 */
export function LinhaDoTempo({
  etapas,
  hoje,
  aoEditar,
}: {
  etapas: SafraEtapa[]
  hoje: string
  aoEditar?: (etapa: SafraEtapa) => void
}) {
  if (!etapas.length) {
    return (
      <p className="rounded-grupo border border-borda bg-fundo px-3 py-4 text-center text-[12.5px] text-texto-3">
        Esta safra ainda não tem etapas.
      </p>
    )
  }

  const inicio = etapas.reduce((a, e) => (e.data_inicio < a ? e.data_inicio : a), etapas[0].data_inicio)
  const fim = etapas.reduce((a, e) => (e.data_fim > a ? e.data_fim : a), etapas[0].data_fim)

  const t0 = new Date(inicio).getTime()
  const t1 = new Date(fim).getTime()
  const vao = Math.max(t1 - t0, 1)
  const pos = (iso: string) => ((new Date(iso).getTime() - t0) / vao) * 100

  const hojeDentro = hoje >= inicio && hoje <= fim
  const posHoje = pos(hoje)

  return (
    <div>
      <div className="relative flex flex-col gap-1.5">
        {hojeDentro && (
          <div
            aria-hidden
            title="hoje"
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-verde-claro/45"
            style={{ left: `${posHoje}%` }}
          />
        )}

        {etapas.map((e) => {
          const status = statusEtapa(e, hoje)
          const esquerda = pos(e.data_inicio)
          const largura = Math.max(pos(e.data_fim) - esquerda, 1.5)
          const progresso = progressoEtapa(e, hoje)
          const emAndamento = status === 'Em andamento'

          return (
            <button
              key={e.id}
              type="button"
              onClick={aoEditar ? () => aoEditar(e) : undefined}
              disabled={!aoEditar}
              title={`${e.nome} · ${formatarData(e.data_inicio)} a ${formatarData(e.data_fim)} · ${status}`}
              className={`group relative block h-8 w-full text-left ${
                aoEditar ? 'cursor-pointer' : 'cursor-default'
              }`}
            >
              {/* Trilho de fundo: o vão completo da safra, para a faixa da
                  etapa ser lida como uma fatia do ciclo inteiro. */}
              <span
                aria-hidden
                className="absolute inset-y-[7px] left-0 w-full rounded-full bg-white/[0.04]"
              />

              <span
                className={`absolute inset-y-0 flex items-center overflow-hidden rounded-[7px] px-2.5 text-[12px] transition-[filter] ${
                  emAndamento
                    ? 'bg-primaria/85 font-semibold text-fundo'
                    : status === 'Concluída'
                      ? 'bg-primaria/25 text-texto-2'
                      : 'border border-borda-campo bg-card text-texto-3'
                } ${aoEditar ? 'group-hover:brightness-110' : ''}`}
                style={{ left: `${esquerda}%`, width: `${largura}%` }}
              >
                {/* Dentro da etapa em curso, o quanto dela já passou. */}
                {emAndamento && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-white/20"
                    style={{ width: `${progresso * 100}%` }}
                  />
                )}
                <span className="relative truncate">{e.nome}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-borda pt-2.5 text-[11px] text-texto-3">
        {etapas.map((e) => (
          <span key={e.id} className="whitespace-nowrap">
            <span
              className={
                statusEtapa(e, hoje) === 'Em andamento' ? 'text-verde-claro' : 'text-texto-3'
              }
            >
              {e.nome}
            </span>{' '}
            {rotuloPeriodo(e)}
          </span>
        ))}
      </div>
    </div>
  )
}
