import { useMemo, useState } from 'react'
import {
  useBaixarLancamentos,
  type Acrescimos,
  type Lancamento,
} from '../../dados/lancamentos'
import { useOpcoes } from '../../dados/opcoes'
import {
  decimalParaCentavos,
  formatarDinheiro,
  formatarData,
  mascaraDinheiro,
  paraCentavos,
} from '../../lib/formato'
import { hojeISO } from '../../lib/periodo'
import { Campo, ENTRADA, Selecao, Sobreposicao } from '../../componentes/formulario'

type Texto = { juros: string; multa: string; desconto: string }

const VAZIO: Texto = { juros: '', multa: '', desconto: '' }

/**
 * Baixa de contas — uma ou várias de uma vez, com juros, multa e desconto.
 *
 * A janela pergunta o que o sistema não tem como saber: em que dia o dinheiro
 * andou, de qual conta, e o que o atraso (ou a negociação) mudou no valor.
 *
 * Os acréscimos são por lançamento, e não um total da baixa: pagar três
 * boletos atrasados costuma render juros diferentes em cada um, e um campo
 * único obrigaria a somar de cabeça — que é onde o erro entra.
 */
export function ModalBaixa({
  lancamentos,
  aoFechar,
  aoConcluir,
}: {
  lancamentos: Lancamento[]
  aoFechar: () => void
  aoConcluir?: () => void
}) {
  const opcoes = useOpcoes()
  const baixar = useBaixarLancamentos()

  const [data, setData] = useState(hojeISO)
  const [trocarConta, setTrocarConta] = useState(false)
  const [contaId, setContaId] = useState('')
  const [ajustando, setAjustando] = useState(false)
  const [textos, setTextos] = useState<Record<string, Texto>>({})
  const [falhas, setFalhas] = useState<string[]>([])

  const contas = useMemo(() => opcoes.data?.contas ?? [], [opcoes.data])
  const receita = lancamentos[0]?.tipo === 'Receita'

  const contasDistintas = new Set(lancamentos.map((l) => l.conta_id))
  const contaUnica = contasDistintas.size === 1 ? lancamentos[0].conta_id : null
  const nomeContaAtual = contas.find((c) => c.id === contaUnica)?.nome

  const linhas = useMemo(
    () =>
      lancamentos.map((l) => {
        const t = textos[l.id] ?? VAZIO
        const previsto = decimalParaCentavos(l.valor)
        const juros = paraCentavos(t.juros)
        const multa = paraCentavos(t.multa)
        const desconto = paraCentavos(t.desconto)
        return {
          lancamento: l,
          texto: t,
          previsto,
          acrescimos: { juros, multa, desconto } as Acrescimos,
          efetivo: previsto + juros + multa - desconto,
          mudou: juros > 0 || multa > 0 || desconto > 0,
        }
      }),
    [lancamentos, textos],
  )

  const totalPrevisto = linhas.reduce((t, l) => t + l.previsto, 0)
  const totalEfetivo = linhas.reduce((t, l) => t + l.efetivo, 0)
  const houveAjuste = linhas.some((l) => l.mudou)
  const invalida = linhas.find((l) => l.efetivo <= 0)

  function alterar(id: string, campo: keyof Texto, valor: string) {
    setTextos((t) => ({
      ...t,
      [id]: { ...(t[id] ?? VAZIO), [campo]: mascaraDinheiro(valor) },
    }))
    setFalhas([])
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    setFalhas([])
    if (invalida) return

    const acrescimos: Record<string, Acrescimos> = {}
    for (const l of linhas) {
      if (l.mudou) acrescimos[l.lancamento.id] = l.acrescimos
    }

    baixar.mutate(
      {
        ids: lancamentos.map((l) => l.id),
        dataPagamento: data,
        contaId: trocarConta && contaId ? contaId : undefined,
        acrescimos: houveAjuste ? acrescimos : undefined,
      },
      {
        onSuccess: (r) => {
          if (r.falhas.length) {
            // Sucesso parcial: a janela fica aberta mostrando o que não passou.
            setFalhas([...new Set(r.falhas)])
            return
          }
          aoConcluir?.()
          aoFechar()
        },
      },
    )
  }

  return (
    <Sobreposicao aoFechar={aoFechar}>
      <form
        onSubmit={enviar}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-[600px] rounded-card border border-borda bg-card p-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <h2 className="font-serif text-[22px] text-texto">
          {receita ? 'Registrar recebimento' : 'Registrar pagamento'}
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-texto-3">
          {lancamentos.length === 1
            ? `Marca este compromisso como ${receita ? 'recebido' : 'pago'} e move o saldo da conta.`
            : `${lancamentos.length} compromissos serão marcados como ${receita ? 'recebidos' : 'pagos'} na mesma data.`}
        </p>

        <div className="mt-4 max-h-[260px] overflow-y-auto rounded-campo border border-borda bg-fundo">
          {linhas.map((l) => (
            <div key={l.lancamento.id} className="border-b border-borda/60 px-3.5 py-2.5 last:border-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-texto-2">
                    {l.lancamento.descricao}
                  </span>
                  <span className="mt-[2px] block text-[11.5px] text-texto-3">
                    vence {formatarData(l.lancamento.data_vencimento)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[13px] tabular-nums text-texto">
                    {formatarDinheiro(l.efetivo)}
                  </span>
                  {l.mudou && (
                    <span className="mt-[2px] block text-[11px] text-texto-3 line-through">
                      {formatarDinheiro(l.previsto)}
                    </span>
                  )}
                </span>
              </div>

              {ajustando && (
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  {(
                    [
                      ['juros', 'Juros'],
                      ['multa', 'Multa'],
                      ['desconto', 'Desconto'],
                    ] as const
                  ).map(([campo, rotulo]) => (
                    <label key={campo} className="block">
                      <span className="mb-1 block text-[10.5px] tracking-[0.06em] text-texto-3 uppercase">
                        {rotulo}
                      </span>
                      <input
                        value={l.texto[campo]}
                        inputMode="numeric"
                        placeholder="0,00"
                        onChange={(e) => alterar(l.lancamento.id, campo, e.target.value)}
                        className={`${ENTRADA} px-2.5 py-1.5 text-[12.5px]`}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-baseline justify-between gap-3 text-[13px]">
          <button
            type="button"
            onClick={() => setAjustando((v) => !v)}
            className="text-[12.5px] text-texto-3 transition-colors hover:text-primaria-clara"
          >
            {ajustando ? 'Ocultar juros, multa e desconto' : '＋ Juros, multa ou desconto'}
          </button>

          <span className="text-right">
            <span
              className={`font-medium tabular-nums ${
                receita ? 'text-verde-claro' : 'text-terracota-clara'
              }`}
            >
              {receita ? '+ ' : '− '}
              {formatarDinheiro(totalEfetivo)}
            </span>
            {houveAjuste && (
              <span className="mt-[2px] block text-[11.5px] text-texto-3">
                previsto {formatarDinheiro(totalPrevisto)} ·{' '}
                {totalEfetivo > totalPrevisto ? 'acréscimo de ' : 'abatimento de '}
                {formatarDinheiro(Math.abs(totalEfetivo - totalPrevisto))}
              </span>
            )}
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-3.5">
          <Campo rotulo={receita ? 'Data do recebimento' : 'Data do pagamento'} obrigatorio>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className={ENTRADA}
              autoFocus
            />
          </Campo>

          <div>
            <label className="flex items-start gap-2.5 rounded-campo border border-borda bg-fundo px-3 py-2.5">
              <input
                type="checkbox"
                checked={trocarConta}
                onChange={(e) => setTrocarConta(e.target.checked)}
                className="mt-[3px] accent-[#93a35f]"
              />
              <span className="text-[12.5px] leading-relaxed text-texto-2">
                {receita ? 'Entrou' : 'Saiu'} de outra conta
                <span className="block text-texto-3">
                  {contaUnica
                    ? `Sem marcar, usa ${nomeContaAtual ?? 'a conta do lançamento'}.`
                    : 'Os compromissos selecionados estão em contas diferentes; marcar joga todos para a mesma.'}
                </span>
              </span>
            </label>

            {trocarConta && (
              <div className="mt-2">
                <Selecao valor={contaId} aoMudar={setContaId} opcoes={contas} />
              </div>
            )}
          </div>
        </div>

        {invalida && (
          <p className="mt-4 rounded-campo border border-terracota-escura bg-terracota-escura/15 px-3 py-2.5 text-[13px] text-terracota-clara">
            O desconto em “{invalida.lancamento.descricao}” zera ou inverte o valor.
            Para cancelar a cobrança, arquive o lançamento em vez de descontar tudo.
          </p>
        )}

        {!!falhas.length && (
          <div className="mt-4 rounded-campo border border-terracota-escura bg-terracota-escura/15 px-3 py-2.5 text-[13px] text-terracota-clara">
            <p>Nem todos foram baixados:</p>
            <ul className="mt-1.5 ml-4 list-disc leading-relaxed">
              {falhas.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-campo border border-borda-campo px-4 py-2.5 text-[13.5px] text-texto-2 transition-colors hover:text-texto"
          >
            {falhas.length ? 'Fechar' : 'Cancelar'}
          </button>
          <button
            type="submit"
            disabled={baixar.isPending || !!invalida || (trocarConta && !contaId)}
            className={`rounded-campo px-5 py-2.5 text-[13.5px] font-semibold text-fundo transition-colors ${
              baixar.isPending || invalida || (trocarConta && !contaId)
                ? 'bg-primaria/55'
                : 'bg-primaria hover:bg-primaria-clara'
            }`}
          >
            {baixar.isPending
              ? 'Registrando…'
              : receita
                ? 'Confirmar recebimento'
                : 'Confirmar pagamento'}
          </button>
        </div>
      </form>
    </Sobreposicao>
  )
}
