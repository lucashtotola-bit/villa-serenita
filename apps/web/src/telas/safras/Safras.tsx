import { useState } from 'react'
import {
  etapaAtual,
  statusEtapa,
  useAtualizarEtapa,
  useSafras,
  type Safra,
  type SafraEtapa,
} from '../../dados/safras'
import { formatarSacas } from '../../dados/cafe'
import { formatarData } from '../../lib/formato'
import { CabecalhoPagina } from '../../componentes/CabecalhoPagina'
import { LinhaDoTempo } from './LinhaDoTempo'
import { ModalSafra } from './ModalSafra'

export function Safras() {
  const safras = useSafras()
  const [modalAberto, setModalAberto] = useState(false)
  const hoje = new Date().toISOString().slice(0, 10)

  return (
    <div>
      <CabecalhoPagina
        titulo="Safras"
        subtitulo="As datas das etapas são a única fonte do status mostrado na tela do Café."
        acao={
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className="rounded-campo bg-primaria px-4 py-2.5 text-[13.5px] font-semibold whitespace-nowrap text-fundo transition-colors hover:bg-primaria-clara"
          >
            ＋ Nova safra
          </button>
        }
      />

      {safras.isPending ? (
        <p className="text-[13px] text-texto-3">Carregando…</p>
      ) : safras.isError ? (
        <p className="text-[13px] text-terracota-clara">{(safras.error as Error).message}</p>
      ) : !safras.data?.length ? (
        <div className="rounded-card border border-borda bg-card px-5 py-12 text-center">
          <p className="text-[14px] text-texto-2">Nenhuma safra cadastrada.</p>
          <p className="mt-1 text-[12.5px] text-texto-3">
            Comece pelo ciclo atual — as etapas já vêm sugeridas.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {safras.data.map((s) => (
            <CartaoSafra key={s.id} safra={s} hoje={hoje} />
          ))}
        </div>
      )}

      {modalAberto && (
        <ModalSafra
          aoFechar={() => setModalAberto(false)}
          aoSalvar={() => setModalAberto(false)}
        />
      )}
    </div>
  )
}

function CartaoSafra({ safra: s, hoje }: { safra: Safra; hoje: string }) {
  const [editando, setEditando] = useState<SafraEtapa | null>(null)
  const atual = etapaAtual(s, hoje)

  return (
    <div className="rounded-card border border-borda bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-serif text-[21px] text-texto">Safra {s.ciclo}</h2>
          <p className="mt-0.5 text-[12.5px] text-texto-3">
            {s.area_hectares ? `${formatarSacas(s.area_hectares)} ha` : 'área não informada'}
            {' · '}
            {s.expectativa_sacas
              ? `expectativa de ${formatarSacas(s.expectativa_sacas)} sacas`
              : 'sem expectativa registrada'}
          </p>
        </div>
        {atual && (
          <p className="text-[12.5px] text-texto-3">
            {statusEtapa(atual, hoje) === 'Em andamento' ? 'Agora em' : 'A seguir'}{' '}
            <strong className="font-medium text-verde-claro">{atual.nome}</strong>
          </p>
        )}
      </div>

      {s.observacao && (
        <p className="mt-2 text-[12.5px] text-texto-3">{s.observacao}</p>
      )}

      <div className="mt-4">
        <LinhaDoTempo etapas={s.safra_etapas} hoje={hoje} aoEditar={setEditando} />
      </div>

      {editando && (
        <EditorEtapa etapa={editando} aoFechar={() => setEditando(null)} />
      )}
    </div>
  )
}

function EditorEtapa({ etapa, aoFechar }: { etapa: SafraEtapa; aoFechar: () => void }) {
  const atualizar = useAtualizarEtapa()
  const [inicio, setInicio] = useState(etapa.data_inicio)
  const [fim, setFim] = useState(etapa.data_fim)
  const [erro, setErro] = useState<string | null>(null)

  function salvar() {
    if (fim < inicio) return setErro('A etapa não pode terminar antes de começar.')
    atualizar.mutate({ id: etapa.id, data_inicio: inicio, data_fim: fim }, { onSuccess: aoFechar })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,14,6,0.72)] px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-[420px] rounded-card border border-borda bg-card p-5 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <h3 className="font-serif text-[19px] text-texto">{etapa.nome}</h3>
        <p className="mt-0.5 text-[12.5px] text-texto-3">
          Hoje: {formatarData(etapa.data_inicio)} a {formatarData(etapa.data_fim)}.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[11px] tracking-[0.06em] text-texto-3 uppercase">
              Início
            </span>
            <input
              type="date"
              value={inicio}
              onChange={(e) => {
                setInicio(e.target.value)
                setErro(null)
              }}
              className="box-border w-full rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 text-[13.5px] text-texto outline-none focus:border-primaria"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] tracking-[0.06em] text-texto-3 uppercase">
              Fim
            </span>
            <input
              type="date"
              value={fim}
              onChange={(e) => {
                setFim(e.target.value)
                setErro(null)
              }}
              className="box-border w-full rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 text-[13.5px] text-texto outline-none focus:border-primaria"
            />
          </label>
        </div>

        {(erro || atualizar.isError) && (
          <p className="mt-3 text-[12.5px] text-terracota-clara">
            {erro ?? (atualizar.error as Error).message}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-campo border border-borda-campo px-4 py-2 text-[13px] text-texto-2 transition-colors hover:text-texto"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={atualizar.isPending}
            className={`rounded-campo px-4 py-2 text-[13px] font-semibold text-fundo transition-colors ${
              atualizar.isPending ? 'bg-primaria/55' : 'bg-primaria hover:bg-primaria-clara'
            }`}
          >
            {atualizar.isPending ? 'Salvando…' : 'Salvar datas'}
          </button>
        </div>
      </div>
    </div>
  )
}
