import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  podeEstornar,
  useArquivarLancamento,
  useEstornarBaixa,
  useLancamentos,
  useSaldos,
  type Lancamento,
  type TipoLancamento,
} from '../../dados/lancamentos'
import { ModalBaixa } from '../contas/ModalBaixa'
import { decimalParaCentavos, formatarDinheiro } from '../../lib/formato'
import { competenciaAtual, deslocarMes, diaMes, rotuloMes } from '../../lib/periodo'
import { BarraAbas } from '../../componentes/BarraAbas'
import { CabecalhoPagina } from '../../componentes/CabecalhoPagina'
import { CartaoKpi } from '../../componentes/CartaoKpi'
import { ModalLancamento } from './ModalLancamento'
import { PainelTransferencias } from './PainelTransferencias'

/** Colunas do protótipo (linha 334) + Ações (baixar/detalhar/editar/arquivar). */
const GRADE = '76px minmax(0,1fr) 138px 118px 132px 104px 100px 236px'

type Aba = {
  id: string
  rotulo: string
  tipo?: TipoLancamento
  /** Aba que leva a uma tela própria em vez de trocar o conteúdo aqui. */
  caminho?: string
}

/**
 * As abas do protótipo. Dívidas e Prestação de contas ganharam telas próprias
 * (são grandes demais para caber aqui), mas continuam na barra porque é onde
 * se procura por elas — clicar leva à tela, em vez de mostrar um pedaço pior
 * da mesma coisa.
 */
const ABAS: Aba[] = [
  { id: 'rec', rotulo: 'Receitas', tipo: 'Receita' },
  { id: 'desp', rotulo: 'Despesas', tipo: 'Despesa' },
  { id: 'transf', rotulo: 'Transferências', tipo: 'Transferência' },
  { id: 'div', rotulo: 'Dívidas', caminho: '/dividas' },
  { id: 'soc', rotulo: 'Prestação de contas', caminho: '/prestacao-de-contas' },
]

export function Lancamentos() {
  const [competencia, setCompetencia] = useState(competenciaAtual)
  const [abaId, setAbaId] = useState('rec')
  const [contaId, setContaId] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Lancamento | null>(null)

  const navegar = useNavigate()
  const aba = ABAS.find((a) => a.id === abaId) ?? ABAS[0]
  const saldos = useSaldos()

  function trocarAba(id: string) {
    const alvo = ABAS.find((a) => a.id === id)
    if (alvo?.caminho) navegar(alvo.caminho)
    else setAbaId(id)
  }

  const lancamentos = useLancamentos({
    competencia,
    tipo: aba.tipo,
    contaId: contaId || undefined,
  })

  const total = useMemo(
    () =>
      (lancamentos.data ?? []).reduce(
        (soma, l) => soma + decimalParaCentavos(l.valor),
        0,
      ),
    [lancamentos.data],
  )

  return (
    <div>
      <CabecalhoPagina
        titulo="Financeiro"
        subtitulo="Receitas, despesas e movimentação entre contas."
        acao={
          <div className="flex items-center gap-1">
            <BotaoMes rotulo="‹" aoClicar={() => setCompetencia(deslocarMes(competencia, -1))} />
            <span className="min-w-[150px] text-center text-[14px] text-texto">
              {rotuloMes(competencia)}
            </span>
            <BotaoMes rotulo="›" aoClicar={() => setCompetencia(deslocarMes(competencia, 1))} />
          </div>
        }
      />

      <Saldos consulta={saldos} />

      <div className="mt-6 mb-4 flex flex-wrap items-center gap-3">
        <BarraAbas abas={ABAS} ativa={abaId} aoMudar={trocarAba} />

        {aba.tipo && (
          <label className="flex items-center gap-2 text-[12px] text-texto-3">
            Conta
            <select
              value={contaId}
              onChange={(e) => setContaId(e.target.value)}
              className="rounded-campo border border-borda-campo bg-card px-3 py-2 text-[13px] text-texto outline-none focus:border-primaria"
            >
              <option value="">Todas as contas</option>
              {(saldos.data ?? []).map((c) => (
                <option key={c.conta_id} value={c.conta_id}>
                  {c.banco} · {c.apelido}
                </option>
              ))}
            </select>
          </label>
        )}

        {(aba.id === 'rec' || aba.id === 'desp') && (
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className="ml-auto rounded-campo bg-primaria px-4 py-2.5 text-[13.5px] font-semibold whitespace-nowrap text-fundo transition-colors hover:bg-primaria-clara"
          >
            ＋ {aba.id === 'rec' ? 'Nova receita' : 'Nova despesa'}
          </button>
        )}
      </div>

      {aba.id === 'transf' ? (
        <PainelTransferencias competencia={competencia} contaId={contaId || undefined} />
      ) : (
        <Tabela
          consulta={lancamentos}
          total={total}
          receita={aba.tipo === 'Receita'}
          aoEditar={setEditando}
        />
      )}

      {modalAberto && (aba.id === 'rec' || aba.id === 'desp') && (
        <ModalLancamento
          tipo={aba.id === 'rec' ? 'Receita' : 'Despesa'}
          aoFechar={() => setModalAberto(false)}
          aoSalvar={() => setModalAberto(false)}
        />
      )}

      {editando && (
        <ModalLancamento
          tipo={editando.tipo as 'Receita' | 'Despesa'}
          editando={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => setEditando(null)}
        />
      )}
    </div>
  )
}

function BotaoMes({ rotulo, aoClicar }: { rotulo: string; aoClicar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className="rounded-campo border border-borda-campo px-3 py-1.5 text-[15px] text-texto-2 transition-colors hover:border-primaria hover:text-primaria-clara"
    >
      {rotulo}
    </button>
  )
}

function Saldos({ consulta }: { consulta: ReturnType<typeof useSaldos> }) {
  if (consulta.isPending) {
    return <p className="text-[13px] text-texto-3">Carregando saldos…</p>
  }
  if (consulta.isError) {
    return (
      <p className="text-[13px] text-terracota-clara">
        {(consulta.error as Error).message}
      </p>
    )
  }
  if (!consulta.data?.length) {
    return (
      <div className="rounded-card border border-borda bg-card p-5">
        <p className="text-[13.5px] text-texto-2">
          Nenhuma conta bancária cadastrada ainda.
        </p>
        <p className="mt-1 text-[13px] text-texto-3">
          Cadastre em Configuração › Cadastros › Contas bancárias.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {consulta.data.map((c) => {
        const saldo = decimalParaCentavos(c.saldo_atual)
        return (
          <CartaoKpi
            key={c.conta_id}
            rotulo={`${c.banco} · ${c.apelido}`}
            valor={formatarDinheiro(saldo)}
            detalhe="calculado a partir dos lançamentos"
            alerta={saldo < 0}
          />
        )
      })}
    </div>
  )
}

function Tabela({
  consulta,
  total,
  receita,
  aoEditar,
}: {
  consulta: ReturnType<typeof useLancamentos>
  total: number
  receita: boolean
  aoEditar: (l: Lancamento) => void
}) {
  const linhas = consulta.data ?? []

  return (
    <div className="overflow-x-auto rounded-card border border-borda bg-card">
      <div className="min-w-[1260px] px-5 pb-4">
        <div
          className="grid gap-3 border-b border-borda py-3 text-[11px] tracking-[0.06em] text-texto-3 uppercase"
          style={{ gridTemplateColumns: GRADE }}
        >
          <span>Data</span>
          <span>Descrição</span>
          <span>Centro de custo/receita</span>
          <span>Categoria</span>
          <span>Conta bancária</span>
          <span className="text-right">Valor</span>
          <span className="text-right">Situação</span>
          <span className="text-right">Ações</span>
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
              Nenhum lançamento neste mês.
            </p>
            <p className="mt-1 text-[13px] text-texto-3">
              Use “＋ Novo lançamento” para registrar o primeiro.
            </p>
          </div>
        )}

        {linhas.map((l) => (
          <Linha key={l.id} lancamento={l} receita={receita} aoEditar={aoEditar} />
        ))}

        {!!linhas.length && (
          <div className="flex items-baseline justify-between pt-4">
            <span className="text-[12.5px] text-texto-3">
              {linhas.length} {receita ? 'receita' : 'despesa'}
              {linhas.length > 1 ? 's' : ''} no mês
            </span>
            <span
              className={`font-serif text-[22px] tabular-nums ${
                receita ? 'text-verde-claro' : 'text-terracota-escura'
              }`}
            >
              {receita ? '+ ' : '− '}
              {formatarDinheiro(total)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function Linha({
  lancamento: l,
  receita,
  aoEditar,
}: {
  lancamento: Lancamento
  receita: boolean
  aoEditar: (l: Lancamento) => void
}) {
  const valor = decimalParaCentavos(l.valor)
  const prevista = l.situacao === 'Prevista'
  const arquivar = useArquivarLancamento()
  const estornar = useEstornarBaixa()
  const [confirmando, setConfirmando] = useState(false)
  const [expandido, setExpandido] = useState(false)
  const [baixando, setBaixando] = useState(false)

  // Conciliado é somente leitura — o banco recusa qualquer alteração. Nos
  // gerados (NF, reserva, café…) a edição abre com o valor travado; arquivar
  // continua restrito aos avulsos, porque sumir com a parcela de uma NF
  // deixaria a nota sem o compromisso que o banco garantiu.
  const editavel = !l.conciliado
  const arquivavel = l.origem === 'Avulso' && !l.conciliado

  return (
    <div className="border-b border-borda/60 last:border-0">
      <div
        className="grid items-center gap-3 py-2.5 text-[13.5px]"
        style={{ gridTemplateColumns: GRADE }}
      >
        <span className="text-[12.5px] text-texto-3">{diaMes(l.data_referencia)}</span>

        <span className="truncate text-texto" title={l.descricao}>
          {l.descricao}
        </span>

        <span className="min-w-0">
          {l.centros_custo && (
            <span className="inline-block max-w-full truncate rounded-pill bg-white/[0.06] px-2.5 py-[3px] text-[11.5px] text-texto-2">
              {l.centros_custo.nome}
            </span>
          )}
        </span>

        <span className="truncate text-[12.5px] text-texto-3" title={l.categorias?.nome}>
          {l.categorias?.nome ?? '—'}
        </span>

        <span className="truncate text-[12.5px] text-texto-3">
          {l.contas_bancarias
            ? `${l.contas_bancarias.banco} · ${l.contas_bancarias.apelido}`
            : '—'}
        </span>

        <span
          className={`text-right font-medium tabular-nums ${
            prevista ? 'text-texto-3'
            : receita ? 'text-verde-claro'
            : 'text-terracota-escura'
          }`}
        >
          {receita ? '+ ' : '− '}
          {formatarDinheiro(valor)}
        </span>

        <span className="flex justify-end">
          <Situacao lancamento={l} receita={receita} />
        </span>

        <span className="flex flex-col items-end gap-1">
          {confirmando ? (
            <span className="inline-flex items-center gap-2 text-[12px]">
              <button
                type="button"
                onClick={() => arquivar.mutate(l.id, { onSuccess: () => setConfirmando(false) })}
                disabled={arquivar.isPending}
                className="text-terracota-clara hover:underline"
              >
                {arquivar.isPending ? 'Arquivando…' : 'Confirmar'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                className="text-texto-3 hover:text-texto-2"
              >
                Não
              </button>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2.5 text-[12px]">
              {prevista && !l.conciliado && (
                <button
                  type="button"
                  onClick={() => setBaixando(true)}
                  className="rounded-lg border border-primaria/45 px-2 py-[3px] whitespace-nowrap text-verde-suave transition-colors hover:bg-primaria/15"
                >
                  {receita ? 'Receber' : 'Pagar'}
                </button>
              )}
              {podeEstornar(l) && (
                <button
                  type="button"
                  onClick={() => estornar.mutate(l.id)}
                  disabled={estornar.isPending}
                  title="Volta a conta para em aberto, desfazendo juros e desconto"
                  className="text-texto-3 transition-colors hover:text-terracota-clara"
                >
                  {estornar.isPending ? 'Estornando…' : 'Estornar'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setExpandido((v) => !v)}
                className={`transition-colors hover:text-texto ${
                  expandido ? 'text-texto-2' : 'text-texto-3'
                }`}
              >
                {expandido ? 'Recolher' : 'Detalhar'}
              </button>
              {editavel ? (
                <button
                  type="button"
                  onClick={() => aoEditar(l)}
                  title={
                    l.origem !== 'Avulso'
                      ? `Gerado por ${l.origem.toLowerCase()} — o valor não se altera aqui`
                      : undefined
                  }
                  className="text-texto-3 transition-colors hover:text-primaria-clara"
                >
                  Editar
                </button>
              ) : (
                <span
                  title="Conciliado — desfaça a conciliação para editar"
                  className="cursor-not-allowed text-apagado"
                >
                  Editar
                </span>
              )}
              {arquivavel && (
                <button
                  type="button"
                  onClick={() => setConfirmando(true)}
                  className="text-texto-3 transition-colors hover:text-terracota-clara"
                >
                  Arquivar
                </button>
              )}
            </span>
          )}
          {arquivar.isError && (
            <span className="max-w-[160px] text-right text-[11px] leading-snug text-terracota-clara">
              {(arquivar.error as Error).message}
            </span>
          )}
        </span>
      </div>

      {expandido && <Detalhes lancamento={l} receita={receita} />}

      {baixando && (
        <ModalBaixa lancamentos={[l]} aoFechar={() => setBaixando(false)} />
      )}
    </div>
  )
}

/**
 * Painel expandido com tudo o que a linha resume — inclusive o que não coube
 * nas colunas: vencimento e pagamento separados, origem, vínculo e observação.
 */
function Detalhes({ lancamento: l, receita }: { lancamento: Lancamento; receita: boolean }) {
  const itens: { rotulo: string; valor: string }[] = [
    { rotulo: 'Tipo', valor: l.tipo },
    {
      rotulo: 'Origem',
      valor: l.origem === 'Avulso' ? 'Lançado direto (avulso)' : `Gerado por ${l.origem.toLowerCase()}`,
    },
    {
      rotulo: 'Situação',
      valor:
        l.situacao === 'Prevista'
          ? receita ? 'A receber' : 'A pagar'
          : receita ? 'Recebido' : 'Pago',
    },
    { rotulo: 'Vencimento', valor: diaMes(l.data_vencimento) },
    {
      rotulo: 'Pagamento',
      valor: l.data_pagamento ? diaMes(l.data_pagamento) : 'ainda não aconteceu',
    },
    {
      rotulo: 'Conciliado',
      valor: l.conciliado ? 'Sim — conferido com o extrato' : 'Não',
    },
    // Só aparecem quando houve diferença: numa baixa comum, três campos
    // zerados seriam só ruído.
    ...(l.valor_original
      ? [
          {
            rotulo: 'Valor previsto',
            valor: formatarDinheiro(decimalParaCentavos(l.valor_original)),
          },
          {
            rotulo: 'Juros / multa',
            valor: `${formatarDinheiro(decimalParaCentavos(l.juros))} / ${formatarDinheiro(decimalParaCentavos(l.multa))}`,
          },
          {
            rotulo: 'Desconto',
            valor: formatarDinheiro(decimalParaCentavos(l.desconto)),
          },
        ]
      : []),
    { rotulo: 'Categoria', valor: l.categorias?.nome ?? '—' },
    { rotulo: 'Centro', valor: l.centros_custo?.nome ?? '—' },
    {
      rotulo: 'Conta bancária',
      valor: l.contas_bancarias
        ? `${l.contas_bancarias.banco} · ${l.contas_bancarias.apelido}`
        : '—',
    },
    {
      rotulo: receita ? 'Cliente' : 'Fornecedor',
      valor: l.clientes_fornecedores?.nome ?? '—',
    },
    {
      rotulo: l.valor_original ? 'Valor pago' : 'Valor',
      valor: formatarDinheiro(decimalParaCentavos(l.valor)),
    },
  ]

  return (
    <div className="mb-2.5 rounded-grupo border border-borda bg-fundo/60 px-4 py-3.5">
      <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {itens.map((i) => (
          <div key={i.rotulo} className="min-w-0">
            <dt className="text-[10.5px] tracking-[0.06em] text-texto-3 uppercase">
              {i.rotulo}
            </dt>
            <dd className="mt-0.5 truncate text-[13px] text-texto-2" title={i.valor}>
              {i.valor}
            </dd>
          </div>
        ))}
        {l.observacao && (
          <div className="min-w-0 sm:col-span-3 lg:col-span-4">
            <dt className="text-[10.5px] tracking-[0.06em] text-texto-3 uppercase">
              Observação
            </dt>
            <dd className="mt-0.5 text-[13px] leading-relaxed break-words text-texto-2">
              {l.observacao}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}

/**
 * Mostra a situação em linguagem comum. O banco guarda "Prevista" e
 * "Realizada"; quem usa o sistema lê "A pagar" e "Pago".
 */
function Situacao({ lancamento: l, receita }: { lancamento: Lancamento; receita: boolean }) {
  if (l.conciliado) {
    return (
      <span
        title="Conferido com o extrato do banco — não pode mais ser alterado"
        className="rounded-pill bg-primaria/15 px-2.5 py-[3px] text-[11.5px] text-verde-suave"
      >
        Conciliado
      </span>
    )
  }
  if (l.situacao === 'Prevista') {
    return (
      <span
        title={`Vence em ${diaMes(l.data_vencimento)}`}
        className="rounded-pill border border-borda-campo px-2.5 py-[3px] text-[11.5px] text-texto-3"
      >
        {receita ? 'A receber' : 'A pagar'}
      </span>
    )
  }
  return (
    <span className="rounded-pill bg-white/[0.06] px-2.5 py-[3px] text-[11.5px] text-texto-2">
      {receita ? 'Recebido' : 'Pago'}
    </span>
  )
}
