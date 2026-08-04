import { useEffect, useState } from 'react'
import { useOpcoes } from '../../dados/opcoes'
import {
  useCriarTransferencia,
  type NovaTransferencia,
} from '../../dados/transferencias'
import {
  centavosParaDecimal,
  formatarDinheiro,
  mascaraDinheiro,
  paraCentavos,
} from '../../lib/formato'

const hoje = () => new Date().toISOString().slice(0, 10)

const ENTRADA =
  'box-border w-full min-w-0 rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 ' +
  'text-[14px] text-texto placeholder:text-apagado outline-none focus:border-primaria'

export function ModalTransferencia({
  aoFechar,
  aoSalvar,
}: {
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const opcoes = useOpcoes()
  const criar = useCriarTransferencia()
  const contas = opcoes.data?.contas ?? []

  const [data, setData] = useState(hoje)
  const [valor, setValor] = useState('')
  const [origemId, setOrigemId] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  const centavos = paraCentavos(valor)
  const nomeOrigem = contas.find((c) => c.id === origemId)?.nome
  const nomeDestino = contas.find((c) => c.id === destinoId)?.nome
  const poucasContas = !opcoes.isPending && contas.length < 2

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (centavos <= 0) return setErro('Informe um valor maior que zero.')
    if (!origemId) return setErro('Escolha a conta de origem.')
    if (!destinoId) return setErro('Escolha a conta de destino.')
    if (origemId === destinoId) {
      return setErro('A conta de destino precisa ser diferente da origem.')
    }

    const nova: NovaTransferencia = {
      data,
      valor: centavosParaDecimal(centavos),
      conta_origem_id: origemId,
      conta_destino_id: destinoId,
      observacao: observacao.trim() || null,
    }
    criar.mutate(nova, { onSuccess: aoSalvar })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(10,14,6,0.72)] px-4 py-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar()
      }}
    >
      <form
        onSubmit={enviar}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-[560px] rounded-card border border-borda bg-card p-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <h2 className="font-serif text-[22px] text-texto">Transferência entre contas</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-texto-3">
          Movimentação apenas de caixa: sai de uma conta e entra em outra, sem
          afetar receitas, despesas nem o rateio de lucro.
        </p>

        {poucasContas ? (
          <p className="mt-5 rounded-campo border border-terracota-escura bg-terracota-escura/10 px-3 py-2.5 text-[13px] text-terracota-clara">
            É preciso ter pelo menos duas contas bancárias cadastradas para
            transferir entre elas.
          </p>
        ) : (
          <div className="mt-5 flex flex-col gap-3.5">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className="block">
                <Rotulo>Valor (R$) *</Rotulo>
                <input
                  value={valor}
                  inputMode="numeric"
                  onChange={(e) => setValor(mascaraDinheiro(e.target.value))}
                  placeholder="0,00"
                  className={ENTRADA}
                  autoFocus
                />
              </label>
              <label className="block">
                <Rotulo>Data *</Rotulo>
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className={ENTRADA}
                />
              </label>
            </div>

            <label className="block">
              <Rotulo>Sai da conta *</Rotulo>
              <select
                value={origemId}
                onChange={(e) => setOrigemId(e.target.value)}
                className={ENTRADA}
              >
                <option value="">Selecione…</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <Rotulo>Entra na conta *</Rotulo>
              <select
                value={destinoId}
                onChange={(e) => setDestinoId(e.target.value)}
                className={ENTRADA}
              >
                <option value="">Selecione…</option>
                {contas
                  .filter((c) => c.id !== origemId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </select>
            </label>

            <label className="block">
              <Rotulo>Observação (opcional)</Rotulo>
              <input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: reserva para o adiantamento da colheita"
                className={ENTRADA}
              />
            </label>

            {/* Prévia dos dois lançamentos que o banco vai criar. */}
            {centavos > 0 && nomeOrigem && nomeDestino && (
              <div className="rounded-campo border border-borda bg-fundo p-3.5">
                <p className="mb-2 text-[11px] tracking-[0.06em] text-texto-3 uppercase">
                  Serão gerados dois lançamentos
                </p>
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="min-w-0 truncate text-texto-2">{nomeOrigem}</span>
                  <span className="ml-3 whitespace-nowrap text-terracota-clara">
                    − {formatarDinheiro(centavos)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between text-[13px]">
                  <span className="min-w-0 truncate text-texto-2">{nomeDestino}</span>
                  <span className="ml-3 whitespace-nowrap text-verde-claro">
                    + {formatarDinheiro(centavos)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {(erro || criar.isError) && (
          <p className="mt-4 rounded-campo border border-terracota-escura bg-terracota-escura/15 px-3 py-2.5 text-[13px] text-terracota-clara">
            {erro ?? (criar.error as Error).message}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-campo border border-borda-campo px-4 py-2.5 text-[13.5px] text-texto-2 transition-colors hover:text-texto"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={criar.isPending || poucasContas}
            className={`rounded-campo px-5 py-2.5 text-[13.5px] font-semibold text-fundo transition-colors ${
              criar.isPending || poucasContas
                ? 'bg-primaria/55'
                : 'bg-primaria hover:bg-primaria-clara'
            }`}
          >
            {criar.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-[11px] tracking-[0.06em] text-texto-3 uppercase">
      {children}
    </span>
  )
}
