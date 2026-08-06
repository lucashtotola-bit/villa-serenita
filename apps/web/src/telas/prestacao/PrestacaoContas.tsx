import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  agrupar,
  totaisDoMes,
  useFechamento,
  useFecharPeriodo,
  useMovimentosDoMes,
  useNotasSemAnexoNoMes,
  useReabrirPeriodo,
  type Agrupado,
  type Fechamento,
} from '../../dados/prestacao'
import { useDistribuicoes, type Distribuicao } from '../../dados/distribuicoes'
import { decimalParaCentavos, formatarDinheiro, formatarData } from '../../lib/formato'
import { competenciaAtual, deslocarMes, limitesDoMes, rotuloMes } from '../../lib/periodo'
import { CabecalhoPagina } from '../../componentes/CabecalhoPagina'
import { ModalDistribuicao } from './ModalDistribuicao'

export function PrestacaoContas() {
  const [competencia, setCompetencia] = useState(() => deslocarMes(competenciaAtual(), -1))

  const fechamento = useFechamento(competencia)
  const movimentos = useMovimentosDoMes(competencia)
  const semAnexo = useNotasSemAnexoNoMes(competencia)
  const distribuicoes = useDistribuicoes()
  const [distribuindo, setDistribuindo] = useState(false)

  // Uma retirada entra no relatório do mês por dois caminhos: por ter saído do
  // caixa naquele mês, ou por ter sido apontada como referente a ele — o que
  // cobre a retirada feita em agosto sobre o resultado de julho.
  const doMes = useMemo(() => {
    const { inicio, fim } = limitesDoMes(competencia)
    return (distribuicoes.data ?? []).filter(
      (d) =>
        d.competencia_referencia === competencia ||
        (!d.competencia_referencia && d.data >= inicio && d.data < fim),
    )
  }, [distribuicoes.data, competencia])

  const lista = useMemo(() => movimentos.data ?? [], [movimentos.data])
  const totais = useMemo(() => totaisDoMes(lista), [lista])
  const porCentro = useMemo(() => agrupar(lista, 'centro'), [lista])
  const porCategoria = useMemo(() => agrupar(lista, 'categoria'), [lista])

  const naoConciliados = useMemo(() => lista.filter((m) => !m.conciliado), [lista])
  const notasPendentes = semAnexo.data ?? []
  const fechado = fechamento.data?.status === 'Fechado'

  return (
    <div>
      <CabecalhoPagina
        titulo="Prestação de contas"
        subtitulo="Relatório mensal do sítio, para acompanhamento entre os sócios."
        acao={
          <>
            <div className="flex items-center gap-1 rounded-grupo border border-borda bg-card p-1.5 print:hidden">
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
              onClick={() => window.print()}
              className="rounded-campo border border-borda-campo px-4 py-2.5 text-[13.5px] whitespace-nowrap text-texto-2 transition-colors hover:text-texto print:hidden"
            >
              ⎙ Imprimir / PDF
            </button>
          </>
        }
      />

      {movimentos.isPending ? (
        <p className="text-[13px] text-texto-3">Carregando…</p>
      ) : movimentos.isError ? (
        <p className="text-[13px] text-terracota-clara">
          {(movimentos.error as Error).message}
        </p>
      ) : (
        <>
          <Resultado
            competencia={competencia}
            receitas={totais.receitas}
            despesas={totais.despesas}
            resultado={totais.resultado}
            fechamento={fechamento.data ?? null}
          />

          <div className="mt-3.5 grid gap-3.5 lg:grid-cols-2">
            <Quadro
              titulo="Por frente"
              ajuda="Onde o dinheiro foi ganho e gasto — hospedagem, café e o que mais houver."
              linhas={porCentro}
            />
            <Quadro
              titulo="Por categoria"
              ajuda="O detalhe de cada frente."
              linhas={porCategoria}
            />
          </div>

          {(totais.aportes > 0 || totais.devolucoes > 0) && (
            <div className="mt-3.5 rounded-card border border-borda bg-card p-5">
              <h2 className="font-serif text-[19px] text-texto">Movimentação de caixa</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-texto-3">
                Entrou ou saiu da conta, mas não é receita nem despesa — por isso
                não altera o resultado acima. Está aqui para explicar a diferença
                entre o resultado do mês e o que se vê no saldo do banco.
              </p>
              <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-[13.5px]">
                {totais.aportes > 0 && (
                  <div>
                    <dt className="text-[11.5px] text-texto-3">Aportes dos sócios</dt>
                    <dd className="tabular-nums text-verde-claro">
                      + {formatarDinheiro(totais.aportes)}
                    </dd>
                  </div>
                )}
                {totais.devolucoes > 0 && (
                  <div>
                    <dt className="text-[11.5px] text-texto-3">Devoluções de aporte</dt>
                    <dd className="tabular-nums text-terracota-clara">
                      − {formatarDinheiro(totais.devolucoes)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {fechado && !!fechamento.data?.fechamento_socios.length && (
            <DivisaoReferencial
              partes={fechamento.data.fechamento_socios}
              distribuido={doMes}
              aoDistribuir={() => setDistribuindo(true)}
            />
          )}

          {!fechado && !!doMes.length && <Retiradas distribuicoes={doMes} />}

          <Fechar
            competencia={competencia}
            fechamento={fechamento.data ?? null}
            naoConciliados={naoConciliados.length}
            notasPendentes={notasPendentes.length}
          />
        </>
      )}

      {distribuindo && (
        <ModalDistribuicao
          competenciaSugerida={competencia}
          aoFechar={() => setDistribuindo(false)}
        />
      )}
    </div>
  )
}

/** As retiradas do mês, quando ele ainda não foi fechado. */
function Retiradas({ distribuicoes }: { distribuicoes: Distribuicao[] }) {
  const total = distribuicoes.reduce((t, d) => t + decimalParaCentavos(d.valor_total), 0)

  return (
    <div className="mt-3.5 rounded-card border border-borda bg-card p-5">
      <h2 className="font-serif text-[19px] text-texto">Lucro distribuído</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-texto-3">
        Retirado pelos sócios. Saiu do caixa, mas não é despesa — por isso o
        resultado acima não muda por causa disso.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {distribuicoes.map((d) => (
          <div
            key={d.id}
            className="flex items-baseline justify-between gap-3 border-b border-borda/60 pb-2 last:border-0"
          >
            <span className="min-w-0 truncate text-[13px] text-texto-2">
              {formatarData(d.data)}
              {d.observacao && <span className="text-texto-3"> · {d.observacao}</span>}
            </span>
            <span className="shrink-0 text-[13.5px] tabular-nums text-texto">
              {formatarDinheiro(decimalParaCentavos(d.valor_total))}
            </span>
          </div>
        ))}
      </div>
      {distribuicoes.length > 1 && (
        <p className="mt-2 text-right text-[12.5px] text-texto-3">
          Total: <strong className="text-texto-2">{formatarDinheiro(total)}</strong>
        </p>
      )}
    </div>
  )
}

function Resultado({
  competencia,
  receitas,
  despesas,
  resultado,
  fechamento,
}: {
  competencia: string
  receitas: number
  despesas: number
  resultado: number
  fechamento: Fechamento | null
}) {
  // Depois de fechado, vale o número congelado — não o recalculado. Se algum
  // lançamento foi corrigido desde então, os dois aparecem lado a lado, em vez
  // de o relatório mudar em silêncio embaixo de quem já o leu.
  const congelado = fechamento ? decimalParaCentavos(fechamento.resultado) : null
  const divergiu = congelado !== null && congelado !== resultado

  return (
    <div className="rounded-card border border-borda bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.06em] text-texto-3 uppercase">
            Resultado de <span className="capitalize">{rotuloMes(competencia)}</span>
          </p>
          <p
            className={`mt-1 font-serif text-[40px] leading-none tabular-nums ${
              resultado < 0 ? 'text-terracota-clara' : 'text-texto'
            }`}
          >
            {formatarDinheiro(congelado ?? resultado)}
          </p>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-2 text-[13.5px]">
          <div>
            <p className="text-[11.5px] text-texto-3">Receitas</p>
            <p className="tabular-nums text-verde-claro">+ {formatarDinheiro(receitas)}</p>
          </div>
          <div>
            <p className="text-[11.5px] text-texto-3">Despesas</p>
            <p className="tabular-nums text-terracota-clara">− {formatarDinheiro(despesas)}</p>
          </div>
        </div>
      </div>

      {fechamento && (
        <p className="mt-4 border-t border-borda pt-3 text-[12.5px] text-texto-3">
          {fechamento.status === 'Fechado' ? (
            <>
              Fechado em {new Date(fechamento.fechado_em).toLocaleDateString('pt-BR')} — este
              é o número que os sócios aprovaram.
            </>
          ) : (
            <>
              Reaberto{' '}
              {fechamento.reaberto_em &&
                `em ${new Date(fechamento.reaberto_em).toLocaleDateString('pt-BR')}`}
              {fechamento.motivo_reabertura && `: ${fechamento.motivo_reabertura}`}
            </>
          )}
        </p>
      )}

      {divergiu && (
        <p className="mt-2 rounded-campo border border-terracota-escura bg-terracota-escura/15 px-3 py-2.5 text-[12.5px] leading-relaxed text-terracota-clara">
          Algum lançamento mudou depois do fechamento: hoje as contas dão{' '}
          {formatarDinheiro(resultado)}, contra os {formatarDinheiro(congelado)} congelados
          acima. Reabra o mês para atualizar o relatório.
        </p>
      )}
    </div>
  )
}

function Quadro({
  titulo,
  ajuda,
  linhas,
}: {
  titulo: string
  ajuda: string
  linhas: Agrupado[]
}) {
  const maior = Math.max(1, ...linhas.map((l) => Math.max(l.receitas, l.despesas)))

  return (
    <div className="rounded-card border border-borda bg-card p-5">
      <h2 className="font-serif text-[19px] text-texto">{titulo}</h2>
      <p className="mt-1 text-[12.5px] text-texto-3">{ajuda}</p>

      {!linhas.length ? (
        <p className="py-8 text-center text-[13.5px] text-texto-2">
          Nenhum movimento no mês.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {linhas.map((l) => (
            <div key={l.nome}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[13.5px] text-texto-2">{l.nome}</span>
                <span
                  className={`shrink-0 text-[13.5px] font-medium tabular-nums ${
                    l.resultado < 0 ? 'text-terracota-clara' : 'text-texto'
                  }`}
                >
                  {formatarDinheiro(l.resultado)}
                </span>
              </div>

              {/* Duas barras na mesma escala: a leitura é a proporção entre o
                  que entrou e o que saiu, não o número isolado. */}
              <div className="mt-1.5 flex flex-col gap-1">
                <Barra valor={l.receitas} maior={maior} cor="bg-primaria/70" />
                <Barra valor={l.despesas} maior={maior} cor="bg-terracota-escura/70" />
              </div>

              <div className="mt-1 flex justify-between text-[11px] text-texto-3 tabular-nums">
                <span>+ {formatarDinheiro(l.receitas)}</span>
                <span>− {formatarDinheiro(l.despesas)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Barra({ valor, maior, cor }: { valor: number; maior: number; cor: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
      <div
        className={`h-full rounded-full ${cor}`}
        style={{ width: `${(valor / maior) * 100}%` }}
      />
    </div>
  )
}

function DivisaoReferencial({
  partes,
  distribuido,
  aoDistribuir,
}: {
  partes: Fechamento['fechamento_socios']
  distribuido: Distribuicao[]
  aoDistribuir: () => void
}) {
  const total = partes.reduce((t, p) => t + decimalParaCentavos(p.valor), 0)

  // Quanto cada sócio efetivamente retirou referente a este mês. É o que
  // transforma a coluna de referência em algo conferível: cabia tanto, saiu
  // tanto. Sem isso, o relatório diria quanto cabe a cada um e nunca diria se
  // alguém chegou a receber.
  const recebido = new Map<string, number>()
  for (const d of distribuido) {
    for (const p of d.distribuicao_socios) {
      recebido.set(p.socio_id, (recebido.get(p.socio_id) ?? 0) + decimalParaCentavos(p.valor))
    }
  }
  const houveRetirada = recebido.size > 0

  return (
    <div className="mt-3.5 rounded-card border border-borda bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-[19px] text-texto">Divisão entre os sócios</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-texto-3">
            Quanto do resultado cabe a cada um pela sua cota
            {houveRetirada
              ? ' e quanto foi efetivamente retirado.'
              : '. Nada foi retirado referente a este mês.'}
          </p>
        </div>
        <button
          type="button"
          onClick={aoDistribuir}
          className="rounded-lg border border-primaria/45 px-3 py-1.5 text-[12.5px] whitespace-nowrap text-verde-suave transition-colors hover:bg-primaria/15 print:hidden"
        >
          ＋ Distribuir lucro
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <div className="grid grid-cols-[minmax(0,1fr)_130px_130px] gap-3 border-b border-borda pb-2 text-[11px] tracking-[0.06em] text-texto-3 uppercase">
          <span>Sócio</span>
          <span className="text-right">Cabe pela cota</span>
          <span className="text-right">Retirado</span>
        </div>

        {partes.map((p) => {
          const cabe = decimalParaCentavos(p.valor)
          const retirou = recebido.get(p.socio_id) ?? 0

          return (
            <div
              key={p.socio_id}
              className="grid grid-cols-[minmax(0,1fr)_130px_130px] items-baseline gap-3 border-b border-borda/60 pb-2 last:border-0"
            >
              <span className="min-w-0 truncate text-[13.5px] text-texto-2">
                {p.nome_completo}
                <span className="ml-2 text-[11.5px] text-texto-3">{Number(p.cota)}%</span>
              </span>
              <span
                className={`text-right text-[13.5px] tabular-nums ${
                  cabe < 0 ? 'text-terracota-clara' : 'text-texto'
                }`}
              >
                {formatarDinheiro(cabe)}
              </span>
              <span
                className={`text-right text-[13.5px] tabular-nums ${
                  retirou === 0 ? 'text-apagado' : 'text-texto'
                }`}
              >
                {formatarDinheiro(retirou)}
              </span>
            </div>
          )
        })}

        <div className="grid grid-cols-[minmax(0,1fr)_130px_130px] items-baseline gap-3 pt-1">
          <span className="text-[12.5px] text-texto-3">Soma</span>
          <span className="text-right text-[13.5px] font-medium tabular-nums text-texto">
            {formatarDinheiro(total)}
          </span>
          <span className="text-right text-[13.5px] font-medium tabular-nums text-texto">
            {formatarDinheiro([...recebido.values()].reduce((t, v) => t + v, 0))}
          </span>
        </div>
      </div>

      <p className="mt-3 border-t border-borda pt-3 text-[11.5px] leading-relaxed text-texto-3">
        A coluna da cota é referência: ela mostra a que cada sócio teria direito,
        não uma obrigação de pagar. Retirar lucro é uma decisão à parte, e nem
        todo mês tem uma.
      </p>
    </div>
  )
}

function Fechar({
  competencia,
  fechamento,
  naoConciliados,
  notasPendentes,
}: {
  competencia: string
  fechamento: Fechamento | null
  naoConciliados: number
  notasPendentes: number
}) {
  const fechar = useFecharPeriodo()
  const reabrir = useReabrirPeriodo()
  const [motivo, setMotivo] = useState('')
  const [reabrindo, setReabrindo] = useState(false)

  const fechado = fechamento?.status === 'Fechado'
  const impedimentos = naoConciliados + notasPendentes

  if (fechado) {
    return (
      <div className="mt-3.5 rounded-card border border-borda bg-card p-5 print:hidden">
        {reabrindo ? (
          <div className="flex flex-col gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[11px] tracking-[0.06em] text-texto-3 uppercase">
                Motivo da reabertura
              </span>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: nota do fornecedor chegou depois do fechamento"
                autoFocus
                className="box-border w-full rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 text-[13.5px] text-texto placeholder:text-apagado outline-none focus:border-primaria"
              />
            </label>
            <p className="text-[12.5px] text-texto-3">
              Fica registrado quem reabriu, quando e por quê.
            </p>
            {reabrir.isError && (
              <p className="text-[12.5px] text-terracota-clara">
                {(reabrir.error as Error).message}
              </p>
            )}
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setReabrindo(false)}
                className="rounded-campo border border-borda-campo px-4 py-2 text-[13px] text-texto-2 transition-colors hover:text-texto"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() =>
                  reabrir.mutate(
                    { competencia, motivo: motivo.trim() },
                    { onSuccess: () => setReabrindo(false) },
                  )
                }
                disabled={!motivo.trim() || reabrir.isPending}
                className="rounded-campo bg-primaria px-4 py-2 text-[13px] font-semibold text-fundo transition-colors hover:bg-primaria-clara disabled:opacity-55"
              >
                {reabrir.isPending ? 'Reabrindo…' : 'Reabrir mês'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-texto-3">
              Mês fechado. Reabrir é privilégio do sócio autorizado e fica registrado.
            </p>
            <button
              type="button"
              onClick={() => setReabrindo(true)}
              className="rounded-campo border border-borda-campo px-4 py-2 text-[13px] text-texto-2 transition-colors hover:text-texto"
            >
              Reabrir mês
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mt-3.5 rounded-card border border-borda bg-card p-5 print:hidden">
      <h2 className="font-serif text-[19px] text-texto">Fechar o mês</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-texto-3">
        Congela o resultado acima. Depois disso, o relatório continua mostrando o
        que os sócios aprovaram, mesmo que algum lançamento seja corrigido.
      </p>

      {impedimentos > 0 ? (
        <div className="mt-3 rounded-campo border border-terracota-escura bg-terracota-escura/10 px-4 py-3">
          <p className="text-[13px] text-terracota-clara">
            Falta resolver antes de fechar:
          </p>
          <ul className="mt-2 ml-4 list-disc text-[13px] text-texto-2">
            {naoConciliados > 0 && (
              <li>
                {naoConciliados} lançamento(s) sem conciliar —{' '}
                <Link to="/conciliacao" className="text-primaria-clara hover:underline">
                  ir para Conciliação
                </Link>
              </li>
            )}
            {notasPendentes > 0 && (
              <li>
                {notasPendentes} nota(s) fiscal(is) sem documento anexado —{' '}
                <Link to="/notas-fiscais" className="text-primaria-clara hover:underline">
                  ir para Notas fiscais
                </Link>
              </li>
            )}
          </ul>
        </div>
      ) : (
        <>
          {fechar.isError && (
            <p className="mt-3 rounded-campo border border-terracota-escura bg-terracota-escura/15 px-3 py-2.5 text-[13px] text-terracota-clara">
              {(fechar.error as Error).message}
            </p>
          )}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => fechar.mutate(competencia)}
              disabled={fechar.isPending}
              className="rounded-campo bg-primaria px-5 py-2.5 text-[13.5px] font-semibold text-fundo transition-colors hover:bg-primaria-clara disabled:opacity-55"
            >
              {fechar.isPending ? 'Fechando…' : 'Fechar o mês'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
