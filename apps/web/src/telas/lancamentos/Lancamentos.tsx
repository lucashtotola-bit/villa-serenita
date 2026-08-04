import { useMemo, useState } from 'react'
import {
  useArquivarLancamento,
  useLancamentos,
  useSaldos,
  type Lancamento,
  type TipoLancamento,
} from '../../dados/lancamentos'
import { decimalParaCentavos, formatarDinheiro } from '../../lib/formato'
import { competenciaAtual, deslocarMes, diaMes, rotuloMes } from '../../lib/periodo'
import { ModalLancamento } from './ModalLancamento'
import { PainelTransferencias } from './PainelTransferencias'

/** Colunas do protótipo (linha 334) + Ações, para editar/arquivar avulsos. */
const GRADE = '76px minmax(0,1fr) 148px 124px 142px 108px 104px 86px'

type Aba = {
  id: string
  rotulo: string
  tipo?: TipoLancamento
  etapa?: number
}

const ABAS: Aba[] = [
  { id: 'rec', rotulo: 'Receitas', tipo: 'Receita' },
  { id: 'desp', rotulo: 'Despesas', tipo: 'Despesa' },
  { id: 'transf', rotulo: 'Transferências', tipo: 'Transferência' },
  { id: 'div', rotulo: 'Dívidas', etapa: 3 },
  { id: 'soc', rotulo: 'Prestação de contas', etapa: 7 },
]

export function Lancamentos() {
  const [competencia, setCompetencia] = useState(competenciaAtual)
  const [abaId, setAbaId] = useState('rec')
  const [contaId, setContaId] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Lancamento | null>(null)

  const aba = ABAS.find((a) => a.id === abaId) ?? ABAS[0]
  const saldos = useSaldos()

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
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[34px] leading-tight text-texto">Financeiro</h1>
          <p className="mt-1 text-[13px] text-texto-3">
            Receitas, despesas e movimentação entre contas.
          </p>
        </div>

        <div className="flex items-center gap-1">
          <BotaoMes rotulo="‹" aoClicar={() => setCompetencia(deslocarMes(competencia, -1))} />
          <span className="min-w-[150px] text-center text-[14px] text-texto">
            {rotuloMes(competencia)}
          </span>
          <BotaoMes rotulo="›" aoClicar={() => setCompetencia(deslocarMes(competencia, 1))} />
        </div>
      </div>

      <Saldos consulta={saldos} />

      <div className="mt-6 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5 rounded-[10px] border border-borda bg-card p-1.5">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAbaId(a.id)}
              className={`rounded-[7px] px-4 py-2 text-[13px] transition-colors ${
                a.id === abaId
                  ? 'bg-primaria/15 font-medium text-verde-suave'
                  : 'text-texto-3 hover:text-texto-2'
              }`}
            >
              {a.rotulo}
            </button>
          ))}
        </div>

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

      {aba.etapa ? (
        <div className="rounded-card border border-borda bg-card p-6">
          <span className="inline-block rounded-pill border border-borda-campo px-3 py-1 text-[12px] text-texto-3">
            Em construção · Etapa {aba.etapa}
          </span>
          <p className="mt-3 text-[13.5px] text-texto-2">
            Esta aba entra na Etapa {aba.etapa}. As tabelas já existem no banco.
          </p>
        </div>
      ) : aba.id === 'transf' ? (
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
          <div key={c.conta_id} className="rounded-card border border-borda bg-card p-5">
            <p className="truncate text-[11px] tracking-[0.06em] text-texto-3 uppercase">
              {c.banco} · {c.apelido}
            </p>
            <p
              className={`mt-1.5 font-serif text-[26px] ${
                saldo < 0 ? 'text-terracota-clara' : 'text-texto'
              }`}
            >
              {formatarDinheiro(saldo)}
            </p>
            <p className="mt-0.5 text-[12px] text-apagado">
              calculado a partir dos lançamentos
            </p>
          </div>
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
      <div className="min-w-[1120px] px-5 pb-4">
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
              className={`font-serif text-[22px] ${
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
  const [confirmando, setConfirmando] = useState(false)

  // Só lançamentos avulsos e não conciliados são editáveis por aqui — os
  // gerados (NF, reserva, café…) se editam pela tela de origem.
  const editavel = l.origem === 'Avulso' && !l.conciliado

  return (
    <div
      className="grid items-center gap-3 border-b border-borda/60 py-2.5 text-[13.5px] last:border-0"
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
        className={`text-right font-medium ${
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
        {!editavel ? (
          <span
            title={
              l.conciliado
                ? 'Conciliado — desfaça a conciliação para editar'
                : 'Gerado automaticamente — edite pela tela de origem'
            }
            className="text-[11.5px] text-apagado"
          >
            —
          </span>
        ) : confirmando ? (
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
            <button
              type="button"
              onClick={() => aoEditar(l)}
              className="text-texto-3 transition-colors hover:text-primaria-clara"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="text-texto-3 transition-colors hover:text-terracota-clara"
            >
              Arquivar
            </button>
          </span>
        )}
        {arquivar.isError && (
          <span className="max-w-[140px] text-right text-[11px] leading-snug text-terracota-clara">
            {(arquivar.error as Error).message}
          </span>
        )}
      </span>
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
