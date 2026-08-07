import { useMemo, useState } from 'react'
import { useContasAbertas, type Lancamento } from '../../dados/lancamentos'
import { decimalParaCentavos, formatarDinheiro, formatarData } from '../../lib/formato'
import { adicionarDias, hojeISO } from '../../lib/periodo'
import { BarraAbas } from '../../componentes/BarraAbas'
import { CabecalhoPagina } from '../../componentes/CabecalhoPagina'
import { CartaoKpi } from '../../componentes/CartaoKpi'
import { ModalBaixa } from './ModalBaixa'

type Aba = 'pagar' | 'receber'

const GRADE = '34px 92px minmax(0,1fr) 150px 140px 118px 96px'

/**
 * Contas a pagar e a receber — a rotina de baixa.
 *
 * O recorte aqui não é o mês, e é essa a diferença para a tela de
 * Lançamentos: uma conta vencida em maio continua sendo uma conta a pagar
 * hoje. Some da lista por causa do calendário é exatamente como uma conta é
 * esquecida. Por isso a ordem é por vencimento, com o que já venceu no topo.
 */
export function Contas() {
  const [aba, setAba] = useState<Aba>('pagar')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [baixando, setBaixando] = useState<Lancamento[] | null>(null)

  const tipo = aba === 'pagar' ? 'Despesa' : 'Receita'
  const consulta = useContasAbertas(tipo)
  const hoje = hojeISO()

  const linhas = useMemo(() => consulta.data ?? [], [consulta.data])

  const grupos = useMemo(() => {
    const em7 = adicionarDias(hoje, 7)
    return {
      vencidas: linhas.filter((l) => l.data_vencimento < hoje),
      semana: linhas.filter(
        (l) => l.data_vencimento >= hoje && l.data_vencimento <= em7,
      ),
      depois: linhas.filter((l) => l.data_vencimento > em7),
    }
  }, [linhas, hoje])

  const soma = (ls: Lancamento[]) =>
    ls.reduce((t, l) => t + decimalParaCentavos(l.valor), 0)

  const marcados = useMemo(
    () => linhas.filter((l) => selecionados.has(l.id)),
    [linhas, selecionados],
  )

  function alternar(id: string) {
    setSelecionados((s) => {
      const novo = new Set(s)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  function trocarAba(nova: Aba) {
    setAba(nova)
    // Seleção de outra aba não faz sentido: são tipos diferentes, e a baixa
    // em lote pergunta "pagamento" ou "recebimento" conforme o tipo.
    setSelecionados(new Set())
  }

  const receber = aba === 'receber'

  return (
    <div>
      <CabecalhoPagina
        titulo="Contas a pagar e a receber"
        subtitulo="Tudo o que está previsto e ainda não foi baixado, de qualquer mês."
        acao={
          !!marcados.length && (
            <button
              type="button"
              onClick={() => setBaixando(marcados)}
              className="rounded-campo bg-primaria px-4 py-2.5 text-[13.5px] font-semibold whitespace-nowrap text-fundo transition-colors hover:bg-primaria-clara"
            >
              {receber ? 'Receber' : 'Pagar'} {marcados.length} · {formatarDinheiro(soma(marcados))}
            </button>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <CartaoKpi
          rotulo="Vencidas"
          valor={formatarDinheiro(soma(grupos.vencidas))}
          detalhe={`${grupos.vencidas.length} conta(s) em atraso`}
          alerta={grupos.vencidas.length > 0}
        />
        <CartaoKpi
          rotulo="Vence em 7 dias"
          valor={formatarDinheiro(soma(grupos.semana))}
          detalhe={`${grupos.semana.length} conta(s) nesta semana`}
        />
        <CartaoKpi
          rotulo="Total em aberto"
          valor={formatarDinheiro(soma(linhas))}
          detalhe={`${linhas.length} conta(s) ${receber ? 'a receber' : 'a pagar'}`}
        />
      </div>

      <div className="mt-4">
        <BarraAbas
          abas={[
            { id: 'pagar' as Aba, rotulo: 'A pagar' },
            { id: 'receber' as Aba, rotulo: 'A receber' },
          ]}
          ativa={aba}
          aoMudar={trocarAba}
        />
      </div>

      <div className="mt-3.5 overflow-x-auto rounded-card border border-borda bg-card">
        <div className="min-w-[880px] px-5 pb-4">
          <div
            className="grid gap-3 border-b border-borda py-3 text-[11px] tracking-[0.06em] text-texto-3 uppercase"
            style={{ gridTemplateColumns: GRADE }}
          >
            <span />
            <span>Vence</span>
            <span>Descrição</span>
            <span>{receber ? 'Cliente' : 'Fornecedor'}</span>
            <span>Conta bancária</span>
            <span className="text-right">Valor</span>
            <span className="text-right">Ação</span>
          </div>

          {consulta.isPending && <p className="py-8 text-[13px] text-texto-3">Carregando…</p>}
          {consulta.isError && (
            <p className="py-8 text-[13px] text-terracota-clara">
              {(consulta.error as Error).message}
            </p>
          )}

          {!consulta.isPending && !linhas.length && (
            <div className="py-10 text-center">
              <p className="text-[14px] text-texto-2">
                Nada {receber ? 'a receber' : 'a pagar'} em aberto.
              </p>
              <p className="mt-1 text-[12.5px] text-texto-3">
                Compromissos aparecem aqui ao serem lançados como “ainda vou{' '}
                {receber ? 'receber' : 'pagar'}”, e ao nascerem de uma nota fiscal,
                dívida ou reserva.
              </p>
            </div>
          )}

          {(['vencidas', 'semana', 'depois'] as const).map((chave) => {
            const grupo = grupos[chave]
            if (!grupo.length) return null
            const titulos = {
              vencidas: 'Vencidas',
              semana: 'Vence nesta semana',
              depois: 'A vencer',
            }

            return (
              <div key={chave}>
                <p
                  className={`pt-4 pb-1 text-[11px] tracking-[0.06em] uppercase ${
                    chave === 'vencidas' ? 'text-terracota-clara' : 'text-texto-3'
                  }`}
                >
                  {titulos[chave]} · {grupo.length} · {formatarDinheiro(soma(grupo))}
                </p>
                {grupo.map((l) => (
                  <Linha
                    key={l.id}
                    lancamento={l}
                    receber={receber}
                    atrasada={chave === 'vencidas'}
                    marcado={selecionados.has(l.id)}
                    aoMarcar={() => alternar(l.id)}
                    aoBaixar={() => setBaixando([l])}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {baixando && (
        <ModalBaixa
          lancamentos={baixando}
          aoFechar={() => setBaixando(null)}
          aoConcluir={() => setSelecionados(new Set())}
        />
      )}
    </div>
  )
}

function Linha({
  lancamento: l,
  receber,
  atrasada,
  marcado,
  aoMarcar,
  aoBaixar,
}: {
  lancamento: Lancamento
  receber: boolean
  atrasada: boolean
  marcado: boolean
  aoMarcar: () => void
  aoBaixar: () => void
}) {
  return (
    <div
      className="grid items-center gap-3 border-b border-borda/60 py-2.5 text-[13.5px] last:border-0"
      style={{ gridTemplateColumns: GRADE }}
    >
      <span className="flex items-center">
        <input
          type="checkbox"
          checked={marcado}
          onChange={aoMarcar}
          aria-label={`Selecionar ${l.descricao}`}
          className="accent-[#93a35f]"
        />
      </span>

      <span className={`text-[12.5px] ${atrasada ? 'text-terracota-clara' : 'text-texto-3'}`}>
        {formatarData(l.data_vencimento)}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-texto" title={l.descricao}>
          {l.descricao}
        </span>
        {l.origem !== 'Avulso' && (
          <span className="mt-[2px] block text-[11px] text-apagado">
            gerado por {l.origem.toLowerCase()}
          </span>
        )}
      </span>

      <span className="truncate text-[12.5px] text-texto-3">
        {l.clientes_fornecedores?.nome ?? '—'}
      </span>

      <span className="truncate text-[12.5px] text-texto-3">
        {l.contas_bancarias
          ? `${l.contas_bancarias.banco} · ${l.contas_bancarias.apelido}`
          : '—'}
      </span>

      <span className="text-right font-medium tabular-nums text-texto">
        {formatarDinheiro(decimalParaCentavos(l.valor))}
      </span>

      <span className="flex justify-end">
        <button
          type="button"
          onClick={aoBaixar}
          className="rounded-lg border border-primaria/45 px-2.5 py-1 text-[12px] whitespace-nowrap text-verde-suave transition-colors hover:bg-primaria/15"
        >
          {receber ? 'Receber' : 'Pagar'}
        </button>
      </span>
    </div>
  )
}
