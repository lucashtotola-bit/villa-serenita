import { useEffect, useMemo, useState } from 'react'
import {
  sugerirLancamento,
  useConciliar,
  useDesfazerConciliacao,
  useIgnorarLinha,
  useLancamentosAbertos,
  useLinhasExtrato,
  type LancamentoAberto,
  type LinhaExtrato,
} from '../../dados/conciliacao'
import { useOpcoes } from '../../dados/opcoes'
import { decimalParaCentavos, formatarDinheiro, formatarData } from '../../lib/formato'
import { BarraAbas } from '../../componentes/BarraAbas'
import { CabecalhoPagina } from '../../componentes/CabecalhoPagina'
import { CartaoKpi } from '../../componentes/CartaoKpi'
import { ModalCriarDaLinha } from './ModalCriarDaLinha'
import { ModalImportarOfx } from './ModalImportarOfx'

type Aba = 'pendentes' | 'conciliadas' | 'ignoradas'

const GRADE = '92px minmax(0,1.2fr) 118px minmax(0,1.1fr) 176px'

export function Conciliacao() {
  const opcoes = useOpcoes()
  const [contaId, setContaId] = useState('')
  const [aba, setAba] = useState<Aba>('pendentes')
  const [importando, setImportando] = useState(false)

  const contas = useMemo(() => opcoes.data?.contas ?? [], [opcoes.data])

  useEffect(() => {
    if (!contaId && contas.length) setContaId(contas[0].id)
  }, [contas, contaId])

  const linhas = useLinhasExtrato(contaId || undefined)
  const abertos = useLancamentosAbertos(contaId || undefined)

  const conta = contas.find((c) => c.id === contaId)

  // A sugestão é calculada uma vez para todas as linhas, e não por linha:
  // assim um mesmo lançamento não é oferecido a duas linhas diferentes —
  // conciliar a primeira deixaria a segunda com uma sugestão morta.
  const sugestoes = useMemo(() => {
    const mapa = new Map<string, LancamentoAberto>()
    const usados = new Set<string>()

    const pendentes = (linhas.data ?? [])
      .filter((l) => !l.lancamento_id && !l.ignorada)
      .sort((a, b) => a.data.localeCompare(b.data))

    for (const linha of pendentes) {
      const livres = (abertos.data ?? []).filter((l) => !usados.has(l.id))
      const achado = sugerirLancamento(linha, livres)
      if (achado) {
        mapa.set(linha.id, achado)
        usados.add(achado.id)
      }
    }
    return mapa
  }, [linhas.data, abertos.data])

  const todas = useMemo(() => linhas.data ?? [], [linhas.data])
  const pendentes = useMemo(
    () => todas.filter((l) => !l.lancamento_id && !l.ignorada),
    [todas],
  )

  const filtradas = useMemo(() => {
    if (aba === 'pendentes') return pendentes
    if (aba === 'conciliadas') return todas.filter((l) => l.lancamento_id)
    return todas.filter((l) => l.ignorada)
  }, [todas, pendentes, aba])

  const kpis = useMemo(() => {
    const comSugestao = pendentes.filter((l) => sugestoes.has(l.id)).length
    const conciliadas = todas.filter((l) => l.lancamento_id).length

    return [
      {
        rotulo: 'A conciliar',
        valor: String(pendentes.length),
        detalhe: `${comSugestao} com sugestão · ${pendentes.length - comSugestao} sem par`,
        alerta: pendentes.length > 0,
      },
      {
        rotulo: 'Conciliadas',
        valor: String(conciliadas),
        detalhe: `de ${todas.length} movimento(s) importado(s)`,
      },
      {
        rotulo: 'Lançamentos em aberto',
        valor: String((abertos.data ?? []).length),
        detalhe: 'realizados, ainda sem par no extrato',
      },
    ]
  }, [pendentes, todas, sugestoes, abertos.data])

  const ABAS: { id: Aba; rotulo: string }[] = [
    { id: 'pendentes', rotulo: 'A conciliar' },
    { id: 'conciliadas', rotulo: 'Conciliadas' },
    { id: 'ignoradas', rotulo: 'Ignoradas' },
  ]

  if (!opcoes.isPending && !contas.length) {
    return (
      <div>
        <CabecalhoPagina titulo="Conciliação" />
        <p className="rounded-card border border-borda bg-card px-5 py-12 text-center text-[14px] text-texto-2">
          Cadastre uma conta bancária antes de importar extratos.
        </p>
      </div>
    )
  }

  return (
    <div>
      <CabecalhoPagina
        titulo="Conciliação"
        subtitulo="Confere o extrato do banco com o que foi lançado. Conciliar trava o lançamento."
        acao={
          <>
            <select
              value={contaId}
              onChange={(e) => setContaId(e.target.value)}
              className="rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 text-[13.5px] text-texto outline-none focus:border-primaria"
            >
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setImportando(true)}
              disabled={!contaId}
              className="rounded-campo bg-primaria px-4 py-2.5 text-[13.5px] font-semibold whitespace-nowrap text-fundo transition-colors hover:bg-primaria-clara disabled:opacity-55"
            >
              ↥ Importar extrato
            </button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
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
        <div className="min-w-[900px] px-5 pb-4">
          <div
            className="grid gap-2 border-b border-borda py-3 text-[11px] tracking-[0.06em] text-texto-3 uppercase"
            style={{ gridTemplateColumns: GRADE }}
          >
            <span>Data</span>
            <span>Movimento no banco</span>
            <span className="text-right">Valor</span>
            <span>No sistema</span>
            <span className="text-right">Ação</span>
          </div>

          {linhas.isPending && <p className="py-8 text-[13px] text-texto-3">Carregando…</p>}
          {linhas.isError && (
            <p className="py-8 text-[13px] text-terracota-clara">
              {(linhas.error as Error).message}
            </p>
          )}

          {!linhas.isPending && !filtradas.length && (
            <div className="py-10 text-center">
              <p className="text-[14px] text-texto-2">
                {aba === 'pendentes' && todas.length
                  ? 'Tudo conciliado nesta conta.'
                  : aba === 'pendentes'
                    ? 'Nenhum extrato importado nesta conta ainda.'
                    : 'Nada aqui.'}
              </p>
              {aba === 'pendentes' && !todas.length && (
                <p className="mt-1 text-[12.5px] text-texto-3">
                  Baixe o OFX do internet banking e importe acima.
                </p>
              )}
            </div>
          )}

          {filtradas.map((l) => (
            <Linha key={l.id} linha={l} sugestao={sugestoes.get(l.id) ?? null} />
          ))}
        </div>
      </div>

      {importando && contaId && (
        <ModalImportarOfx
          contaId={contaId}
          contaNome={conta?.nome ?? ''}
          aoFechar={() => setImportando(false)}
        />
      )}
    </div>
  )
}

function Linha({ linha: l, sugestao }: { linha: LinhaExtrato; sugestao: LancamentoAberto | null }) {
  const conciliar = useConciliar()
  const desfazer = useDesfazerConciliacao()
  const ignorar = useIgnorarLinha()
  const [criando, setCriando] = useState(false)

  const centavos = decimalParaCentavos(l.valor)
  const conciliada = !!l.lancamento_id
  const pendente = conciliar.isPending || desfazer.isPending || ignorar.isPending
  const erro = (conciliar.error ?? desfazer.error ?? ignorar.error) as Error | null

  // Faixa lateral: verde quando resolvido, verde fraco quando há sugestão,
  // terracota quando o movimento não tem par nenhum e exige decisão.
  const faixa = conciliada
    ? 'bg-primaria'
    : l.ignorada
      ? 'bg-borda-campo'
      : sugestao
        ? 'bg-primaria/45'
        : 'bg-terracota-escura'

  return (
    <div
      className="grid items-center gap-2 border-b border-borda/60 py-3 text-[13.5px] last:border-0"
      style={{ gridTemplateColumns: GRADE }}
    >
      <div className="flex items-center gap-2.5">
        <span aria-hidden className={`h-8 w-[3px] shrink-0 rounded-full ${faixa}`} />
        <span className="text-[12.5px] text-texto-3">{formatarData(l.data)}</span>
      </div>

      <div className="min-w-0">
        <div className="truncate text-texto" title={l.descricao}>
          {l.descricao}
        </div>
        <div className="mt-[3px] truncate text-[11px] text-apagado">
          {l.identificador_banco}
        </div>
      </div>

      <span
        className={`text-right font-medium tabular-nums ${
          centavos > 0 ? 'text-verde-claro' : 'text-terracota-clara'
        }`}
      >
        {centavos > 0 ? '+' : '−'} {formatarDinheiro(Math.abs(centavos))}
      </span>

      <div className="min-w-0">
        {conciliada ? (
          <>
            <div className="truncate text-texto-2">{l.lancamentos?.descricao ?? '—'}</div>
            <div className="mt-[3px] text-[11.5px] text-verde-suave">conciliado</div>
          </>
        ) : l.ignorada ? (
          <span className="text-[12.5px] text-texto-3">ignorada</span>
        ) : sugestao ? (
          <>
            <div className="truncate text-texto-2">{sugestao.descricao}</div>
            <div className="mt-[3px] text-[11.5px] text-texto-3">
              lançado em {formatarData(sugestao.data_referencia)}
            </div>
          </>
        ) : (
          <span className="text-[12.5px] text-texto-3">
            Nenhum lançamento com esse valor no período
          </span>
        )}
      </div>

      <div className="flex flex-col items-end gap-1">
        <span className="flex flex-wrap justify-end gap-2 text-[12px]">
          {conciliada ? (
            <button
              type="button"
              onClick={() => desfazer.mutate(l.id)}
              disabled={pendente}
              className="text-texto-3 transition-colors hover:text-terracota-clara"
            >
              {desfazer.isPending ? 'Desfazendo…' : 'Desfazer'}
            </button>
          ) : l.ignorada ? (
            <button
              type="button"
              onClick={() => ignorar.mutate({ linhaId: l.id, ignorada: false })}
              disabled={pendente}
              className="text-texto-3 transition-colors hover:text-texto-2"
            >
              Trazer de volta
            </button>
          ) : (
            <>
              {sugestao ? (
                <button
                  type="button"
                  onClick={() =>
                    conciliar.mutate({ linhaId: l.id, lancamentoId: sugestao.id })
                  }
                  disabled={pendente}
                  className="rounded-lg border border-primaria/45 px-2.5 py-1 text-verde-suave transition-colors hover:bg-primaria/15"
                >
                  {conciliar.isPending ? 'Conciliando…' : 'Conciliar'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCriando(true)}
                  disabled={pendente}
                  className="rounded-lg border border-borda-campo px-2.5 py-1 text-texto-2 transition-colors hover:text-texto"
                >
                  Criar lançamento
                </button>
              )}
              <button
                type="button"
                onClick={() => ignorar.mutate({ linhaId: l.id, ignorada: true })}
                disabled={pendente}
                title="Movimento que não deve virar lançamento"
                className="text-texto-3 transition-colors hover:text-texto-2"
              >
                Ignorar
              </button>
            </>
          )}
        </span>

        {erro && (
          <span className="max-w-[176px] text-right text-[11px] leading-snug text-terracota-clara">
            {erro.message}
          </span>
        )}
      </div>

      {criando && <ModalCriarDaLinha linha={l} aoFechar={() => setCriando(false)} />}
    </div>
  )
}
