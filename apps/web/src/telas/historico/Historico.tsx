import { useMemo, useState } from 'react'
import {
  mudancas,
  useEntidadesDoMes,
  useHistorico,
  type RegistroHistorico,
} from '../../dados/historico'
import { competenciaAtual, deslocarMes, rotuloMes } from '../../lib/periodo'
import { CabecalhoPagina } from '../../componentes/CabecalhoPagina'

const GRADE = '120px minmax(0,1fr) 96px 110px'

/** Rótulo e cor da ação. "Criou/alterou/removeu" lê melhor que INSERT/UPDATE. */
const ACOES = {
  INSERT: { rotulo: 'Criou', cor: 'text-verde-suave' },
  UPDATE: { rotulo: 'Alterou', cor: 'text-texto-2' },
  DELETE: { rotulo: 'Removeu', cor: 'text-terracota-clara' },
} as const

/**
 * Histórico de ações — a leitura que faltava desde a migração 0001.
 *
 * O banco já registrava toda alteração com autor e horário; não havia por
 * onde consultar. Registro que se acumula sem ser lido é só custo.
 *
 * O recorte é mensal porque o log cresce sem parar e a pergunta real quase
 * sempre é recente: "quem mexeu nisso semana passada?". Investigar coisa
 * antiga é raro o bastante para custar uma navegação a mais.
 */
export function Historico() {
  const [competencia, setCompetencia] = useState(competenciaAtual)
  const [entidade, setEntidade] = useState('')

  const consulta = useHistorico({ competencia, entidade: entidade || undefined })
  const entidades = useEntidadesDoMes(competencia)

  const registros = useMemo(() => consulta.data ?? [], [consulta.data])

  return (
    <div>
      <CabecalhoPagina
        titulo="Histórico"
        subtitulo="Toda alteração no sistema, com quem fez e quando. Somente leitura."
        acao={
          <div className="flex items-center gap-1 rounded-grupo border border-borda bg-card p-1.5">
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
        }
      />

      {!!entidades.data?.length && (
        <div className="mb-3.5 flex flex-wrap items-center gap-2">
          <Filtro ativo={!entidade} aoClicar={() => setEntidade('')} rotulo="Tudo" />
          {entidades.data.map((e) => (
            <Filtro
              key={e.tabela}
              ativo={entidade === e.tabela}
              aoClicar={() => setEntidade(e.tabela)}
              rotulo={e.rotulo}
            />
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-card border border-borda bg-card">
        <div className="min-w-[720px] px-5 pb-4">
          <div
            className="grid gap-3 border-b border-borda py-3 text-[11px] tracking-[0.06em] text-texto-3 uppercase"
            style={{ gridTemplateColumns: GRADE }}
          >
            <span>Quando</span>
            <span>O quê</span>
            <span>Ação</span>
            <span>Quem</span>
          </div>

          {consulta.isPending && <p className="py-8 text-[13px] text-texto-3">Carregando…</p>}

          {consulta.isError && (
            <p className="py-8 text-[13px] text-terracota-clara">
              {(consulta.error as Error).message}
            </p>
          )}

          {!consulta.isPending && !registros.length && (
            <div className="py-10 text-center">
              <p className="text-[14px] text-texto-2">
                Nenhuma alteração em {rotuloMes(competencia)}.
              </p>
              <p className="mt-1 text-[12.5px] text-texto-3">
                O histórico começa a partir do momento em que o sistema entrou em uso.
              </p>
            </div>
          )}

          {registros.map((r) => (
            <Linha key={r.id} registro={r} />
          ))}

          {registros.length === 500 && (
            <p className="pt-3 text-[12px] text-texto-3">
              Mostrando as 500 alterações mais recentes do mês. Use o filtro acima
              para estreitar a busca.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Filtro({
  ativo,
  rotulo,
  aoClicar,
}: {
  ativo: boolean
  rotulo: string
  aoClicar: () => void
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

function Linha({ registro: r }: { registro: RegistroHistorico }) {
  const [aberto, setAberto] = useState(false)
  const acao = ACOES[r.acao] ?? { rotulo: r.acao, cor: 'text-texto-2' }
  const lista = useMemo(() => mudancas(r), [r])

  const quando = new Date(r.criado_em)
  const hora = quando.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  // O resumo é a primeira coisa que a pessoa lê; se houver descrição ou nome,
  // vale mais que o tipo do registro sozinho.
  const identificacao =
    (r.dados_depois?.descricao as string) ??
    (r.dados_depois?.nome as string) ??
    (r.dados_antes?.descricao as string) ??
    (r.dados_antes?.nome as string) ??
    null

  return (
    <div className="border-b border-borda/60 last:border-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        disabled={!lista.length}
        className="grid w-full items-center gap-3 py-3 text-left text-[13.5px] disabled:cursor-default"
        style={{ gridTemplateColumns: GRADE }}
      >
        <span className="text-[12.5px] text-texto-3">{hora}</span>

        <span className="min-w-0">
          <span className="block truncate text-texto">
            {r.entidade}
            {identificacao && (
              <span className="ml-2 text-[12.5px] text-texto-3">{identificacao}</span>
            )}
          </span>
          {!!lista.length && (
            <span className="mt-[3px] block truncate text-[11.5px] text-texto-3">
              {aberto
                ? 'Recolher'
                : lista.map((m) => m.rotulo).join(', ')}
            </span>
          )}
        </span>

        <span className={`text-[12.5px] ${acao.cor}`}>{acao.rotulo}</span>
        <span className="truncate text-[12.5px] text-texto-2">{r.autor}</span>
      </button>

      {aberto && !!lista.length && (
        <div className="mb-3 rounded-campo border border-borda bg-fundo px-4 py-3">
          <div className="flex flex-col gap-2">
            {lista.map((m) => (
              <div
                key={m.campo}
                className="grid items-baseline gap-3 text-[12.5px]"
                style={{ gridTemplateColumns: '160px minmax(0,1fr)' }}
              >
                <span className="text-texto-3">{m.rotulo}</span>
                <span className="min-w-0">
                  {r.acao === 'UPDATE' ? (
                    <>
                      <span className="text-texto-3 line-through">{m.antes}</span>
                      <span className="mx-2 text-texto-3">→</span>
                      <span className="text-texto">{m.depois}</span>
                    </>
                  ) : (
                    <span className="text-texto">
                      {r.acao === 'DELETE' ? m.antes : m.depois}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
