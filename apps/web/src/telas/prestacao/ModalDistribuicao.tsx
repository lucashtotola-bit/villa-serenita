import { useEffect, useMemo, useState } from 'react'
import {
  useCriarDistribuicao,
  useSociosComCota,
  type NovaDistribuicao,
} from '../../dados/distribuicoes'
import { useOpcoes } from '../../dados/opcoes'
import {
  centavosParaDecimal,
  formatarDinheiro,
  mascaraDinheiro,
  paraCentavos,
} from '../../lib/formato'
import { competenciaAtual, deslocarMes, rotuloMes } from '../../lib/periodo'

const ENTRADA =
  'box-border w-full min-w-0 rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 ' +
  'text-[13.5px] text-texto placeholder:text-apagado outline-none focus:border-primaria'

/** Os últimos meses, para apontar a retirada a uma competência de referência. */
function mesesRecentes(quantos: number): string[] {
  const atual = competenciaAtual()
  return Array.from({ length: quantos }, (_, i) => deslocarMes(atual, -i))
}

export function ModalDistribuicao({
  competenciaSugerida,
  aoFechar,
}: {
  competenciaSugerida?: string
  aoFechar: () => void
}) {
  const socios = useSociosComCota()
  const opcoes = useOpcoes()
  const criar = useCriarDistribuicao()

  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [valorTotal, setValorTotal] = useState('')
  const [competencia, setCompetencia] = useState(competenciaSugerida ?? '')
  const [contaId, setContaId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [ajustes, setAjustes] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)

  const contas = useMemo(() => opcoes.data?.contas ?? [], [opcoes.data])
  const lista = useMemo(() => socios.data ?? [], [socios.data])
  const meses = useMemo(() => mesesRecentes(13), [])

  useEffect(() => {
    if (contas.length === 1) setContaId(contas[0].id)
  }, [contas])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  const totalCentavos = paraCentavos(valorTotal)

  // A sugestão segue a cota de cada um; a sobra do arredondamento vai para o
  // último, para a soma das partes bater exatamente com o total. Cada linha
  // continua editável: um sócio pode deixar a parte dele no caixa.
  const linhas = useMemo(() => {
    let acumulado = 0

    return lista.map((s, i) => {
      const ultimo = i === lista.length - 1
      const sugerido = ultimo
        ? totalCentavos - acumulado
        : Math.round((totalCentavos * Number(s.cota)) / 100)
      if (!ultimo) acumulado += sugerido

      const manual = ajustes[s.id]
      return {
        socio: s,
        centavos: manual !== undefined ? paraCentavos(manual) : sugerido,
        texto: manual ?? (totalCentavos ? mascaraDinheiro(String(sugerido)) : ''),
      }
    })
  }, [lista, totalCentavos, ajustes])

  const soma = linhas.reduce((t, l) => t + l.centavos, 0)
  const diferenca = totalCentavos - soma

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    const faltando: string[] = []
    if (!totalCentavos) faltando.push('valor total')
    if (!contaId) faltando.push('conta bancária')
    if (!lista.length) faltando.push('sócios cadastrados')
    if (faltando.length) return setErro(`Preencha: ${faltando.join(', ')}.`)

    if (diferenca !== 0) {
      return setErro(
        `A divisão soma ${formatarDinheiro(soma)} e o total retirado é ` +
          `${formatarDinheiro(totalCentavos)}. Ajuste antes de salvar.`,
      )
    }
    if (linhas.some((l) => l.centavos < 0)) {
      return setErro('Nenhuma parte pode ser negativa.')
    }

    const nova: NovaDistribuicao = {
      data,
      valor_total: centavosParaDecimal(totalCentavos),
      competencia_referencia: competencia || null,
      conta_id: contaId,
      observacao: observacao.trim() || null,
      partes: linhas.map((l) => ({
        socio_id: l.socio.id,
        nome_completo: l.socio.nome_completo,
        cota: String(l.socio.cota),
        valor: centavosParaDecimal(l.centavos),
      })),
    }

    criar.mutate(nova, { onSuccess: aoFechar })
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
        <h2 className="font-serif text-[22px] text-texto">Distribuir lucro</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-texto-3">
          Retirada dos sócios. Sai do caixa, mas não é despesa — o resultado do
          mês não muda por causa dela. Cada sócio recebe um lançamento próprio,
          para casar com a sua saída no extrato.
        </p>

        <div className="mt-5 flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3.5">
            <Campo rotulo="Valor total" obrigatorio>
              <input
                value={valorTotal}
                inputMode="numeric"
                onChange={(e) => {
                  setValorTotal(mascaraDinheiro(e.target.value))
                  // A base da sugestão mudou; ajustes antigos ficariam soltos.
                  setAjustes({})
                  setErro(null)
                }}
                placeholder="0,00"
                className={ENTRADA}
                autoFocus
              />
            </Campo>
            <Campo rotulo="Data" obrigatorio>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className={ENTRADA}
              />
            </Campo>
          </div>

          <Campo rotulo="Conta de onde sai" obrigatorio>
            <select
              value={contaId}
              onChange={(e) => setContaId(e.target.value)}
              className={ENTRADA}
            >
              <option value="">Selecione…</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Mês de referência">
            <select
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              className={ENTRADA}
            >
              <option value="">Sem mês específico (ex.: safra inteira)</option>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {rotuloMes(m)}
                </option>
              ))}
            </select>
          </Campo>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-[11px] tracking-[0.06em] text-texto-3 uppercase">
                Divisão entre os sócios
              </span>
              {!!Object.keys(ajustes).length && (
                <button
                  type="button"
                  onClick={() => {
                    setAjustes({})
                    setErro(null)
                  }}
                  className="text-[12px] text-texto-3 transition-colors hover:text-texto-2"
                >
                  Voltar às cotas
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {linhas.map((l) => (
                <div
                  key={l.socio.id}
                  className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-2"
                >
                  <span className="min-w-0 truncate text-[13px] text-texto-2">
                    {l.socio.nome_curto}
                    <span className="ml-2 text-[11.5px] text-texto-3">
                      {Number(l.socio.cota)}%
                    </span>
                  </span>
                  <input
                    value={l.texto}
                    inputMode="numeric"
                    placeholder="0,00"
                    onChange={(e) => {
                      setAjustes((a) => ({
                        ...a,
                        [l.socio.id]: mascaraDinheiro(e.target.value),
                      }))
                      setErro(null)
                    }}
                    className={ENTRADA}
                  />
                </div>
              ))}
            </div>

            <p
              className={`mt-2 text-[12px] ${
                !totalCentavos
                  ? 'text-apagado'
                  : diferenca === 0
                    ? 'text-verde-claro'
                    : 'text-terracota-clara'
              }`}
            >
              {!totalCentavos
                ? 'Informe o valor total para dividir entre os sócios.'
                : diferenca === 0
                  ? `As partes somam ${formatarDinheiro(soma)} — igual ao total.`
                  : diferenca > 0
                    ? `As partes somam ${formatarDinheiro(soma)}, faltam ${formatarDinheiro(diferenca)}.`
                    : `As partes somam ${formatarDinheiro(soma)}, ${formatarDinheiro(-diferenca)} a mais que o total.`}
            </p>

            {linhas.some((l) => l.centavos === 0) && totalCentavos > 0 && (
              <p className="mt-1 text-[11.5px] text-texto-3">
                Sócio com parte zerada não gera lançamento — não houve saída no
                banco para conciliar.
              </p>
            )}
          </div>

          <Campo rotulo="Observação">
            <input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: retirada acordada na reunião de agosto"
              className={ENTRADA}
            />
          </Campo>
        </div>

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
            disabled={criar.isPending}
            className={`rounded-campo px-5 py-2.5 text-[13.5px] font-semibold text-fundo transition-colors ${
              criar.isPending ? 'bg-primaria/55' : 'bg-primaria hover:bg-primaria-clara'
            }`}
          >
            {criar.isPending ? 'Salvando…' : 'Registrar distribuição'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Campo({
  rotulo,
  obrigatorio,
  children,
}: {
  rotulo: string
  obrigatorio?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] tracking-[0.06em] text-texto-3 uppercase">
        {rotulo}
        {obrigatorio && <span className="text-primaria"> *</span>}
      </span>
      {children}
    </label>
  )
}
