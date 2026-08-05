import { useEffect, useState } from 'react'
import { ETAPAS_SUGERIDAS, useCriarSafra, type NovaSafra } from '../../dados/safras'

const ENTRADA =
  'box-border w-full min-w-0 rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 ' +
  'text-[13.5px] text-texto placeholder:text-apagado outline-none focus:border-primaria'

type LinhaEtapa = { nome: string; inicio: string; fim: string }

/**
 * Datas sugeridas para o ciclo, a partir do ano de início. São só um ponto de
 * partida plausível — o usuário corrige. Um formulário com seis pares de
 * datas em branco é o tipo de coisa que ninguém preenche.
 */
function etapasPadrao(anoInicio: number): LinhaEtapa[] {
  const a = anoInicio
  const b = anoInicio + 1
  const periodos: [string, string][] = [
    [`${a}-09-01`, `${a}-10-31`], // Florada
    [`${a}-11-01`, `${b}-03-31`], // Granação
    [`${b}-04-01`, `${b}-05-31`], // Maturação
    [`${b}-06-01`, `${b}-08-31`], // Colheita
    [`${b}-07-01`, `${b}-09-30`], // Secagem
    [`${b}-08-01`, `${b}-10-31`], // Beneficiamento
  ]
  return ETAPAS_SUGERIDAS.map((nome, i) => ({
    nome,
    inicio: periodos[i][0],
    fim: periodos[i][1],
  }))
}

export function ModalSafra({
  aoFechar,
  aoSalvar,
}: {
  aoFechar: () => void
  aoSalvar: (safraId: string) => void
}) {
  const criar = useCriarSafra()
  const anoAtual = new Date().getFullYear()

  const [anoInicio, setAnoInicio] = useState(anoAtual)
  const [area, setArea] = useState('')
  const [expectativa, setExpectativa] = useState('')
  const [observacao, setObservacao] = useState('')
  const [etapas, setEtapas] = useState<LinhaEtapa[]>(() => etapasPadrao(anoAtual))
  const [erro, setErro] = useState<string | null>(null)

  const ciclo = `${anoInicio}/${String((anoInicio + 1) % 100).padStart(2, '0')}`

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  function mudarAno(novo: number) {
    setAnoInicio(novo)
    setEtapas(etapasPadrao(novo))
    setErro(null)
  }

  function alterarEtapa(i: number, campo: 'inicio' | 'fim', valor: string) {
    setEtapas((arr) => arr.map((e, x) => (x === i ? { ...e, [campo]: valor } : e)))
    setErro(null)
  }

  function removerEtapa(i: number) {
    setEtapas((arr) => arr.filter((_, x) => x !== i))
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    const invertida = etapas.find((et) => et.fim < et.inicio)
    if (invertida) {
      return setErro(`A etapa "${invertida.nome}" termina antes de começar.`)
    }

    const nova: NovaSafra = {
      ciclo,
      area_hectares: area.replace(',', '.') || null,
      expectativa_sacas: expectativa.replace(',', '.') || null,
      observacao: observacao.trim() || null,
      etapas: etapas.map((et, i) => ({
        nome: et.nome,
        ordem: i + 1,
        data_inicio: et.inicio,
        data_fim: et.fim,
      })),
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
        className="w-full max-w-[620px] rounded-card border border-borda bg-card p-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <h2 className="font-serif text-[22px] text-texto">Nova safra</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-texto-3">
          O ciclo do café atravessa o ano: a florada de {anoInicio} dá a colheita
          de {anoInicio + 1}. As datas abaixo são sugestão — corrija conforme a
          lavoura.
        </p>

        <div className="mt-5 flex flex-col gap-3.5">
          <div className="grid grid-cols-3 gap-3.5">
            <Campo rotulo="Ciclo" obrigatorio>
              <div className="flex items-center gap-2">
                <input
                  value={anoInicio}
                  inputMode="numeric"
                  onChange={(e) => {
                    const n = parseInt(e.target.value.replace(/\D/g, ''), 10)
                    if (!Number.isNaN(n)) mudarAno(n)
                  }}
                  className={ENTRADA}
                />
                <span className="text-[13px] whitespace-nowrap text-texto-3">
                  /{String((anoInicio + 1) % 100).padStart(2, '0')}
                </span>
              </div>
            </Campo>
            <Campo rotulo="Área (hectares)">
              <input
                value={area}
                inputMode="decimal"
                onChange={(e) => setArea(e.target.value.replace(/[^\d,.]/g, ''))}
                placeholder="18"
                className={ENTRADA}
              />
            </Campo>
            <Campo rotulo="Expectativa (sacas)">
              <input
                value={expectativa}
                inputMode="decimal"
                onChange={(e) => setExpectativa(e.target.value.replace(/[^\d,.]/g, ''))}
                placeholder="165"
                className={ENTRADA}
              />
            </Campo>
          </div>

          <div>
            <span className="mb-1.5 block text-[11px] tracking-[0.06em] text-texto-3 uppercase">
              Etapas do ciclo
            </span>
            <div className="flex flex-col gap-2">
              {etapas.map((et, i) => (
                <div
                  key={et.nome}
                  className="grid grid-cols-[minmax(0,1fr)_140px_140px_22px] items-center gap-2"
                >
                  <span className="truncate text-[13px] text-texto-2">{et.nome}</span>
                  <input
                    type="date"
                    value={et.inicio}
                    onChange={(e) => alterarEtapa(i, 'inicio', e.target.value)}
                    className={ENTRADA}
                  />
                  <input
                    type="date"
                    value={et.fim}
                    onChange={(e) => alterarEtapa(i, 'fim', e.target.value)}
                    className={ENTRADA}
                  />
                  <button
                    type="button"
                    onClick={() => removerEtapa(i)}
                    title={`Remover ${et.nome}`}
                    className="text-center text-[12px] text-apagado transition-colors hover:text-terracota-clara"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            {!etapas.length && (
              <p className="text-[12px] text-texto-3">
                Sem etapas, a tela do Café não mostra em que ponto a safra está.
              </p>
            )}
          </div>

          <Campo rotulo="Observação">
            <input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: Catuaí Vermelho 144 e Catucaí 785-15, 6 talhões"
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
            {criar.isPending ? 'Salvando…' : 'Salvar safra'}
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
