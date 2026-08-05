import { useEffect, useState } from 'react'
import {
  TIPOS_CAFE,
  formatarSacas,
  useBeneficiar,
  useRegistrarMovimento,
  type SaldoEstoque,
  type TipoCafe,
} from '../../dados/cafe'

const hoje = () => new Date().toISOString().slice(0, 10)

const ENTRADA =
  'box-border w-full min-w-0 rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 ' +
  'text-[13.5px] text-texto placeholder:text-apagado outline-none focus:border-primaria'

export type ModoMovimento = 'Colheita' | 'Beneficiamento' | 'Perda' | 'Ajuste'

const TEXTO: Record<ModoMovimento, { titulo: string; ajuda: string }> = {
  Colheita: {
    titulo: 'Registrar colheita',
    ajuda: 'Entra café novo no estoque, direto da lavoura.',
  },
  Beneficiamento: {
    titulo: 'Registrar beneficiamento',
    ajuda:
      'Um tipo de café vira outro: sai de um, entra em outro. A diferença ' +
      'entre as duas quantidades é o rendimento da lavoura.',
  },
  Perda: {
    titulo: 'Registrar perda',
    ajuda: 'Baixa definitiva — café perdido na secagem, no transporte ou no armazenamento.',
  },
  Ajuste: {
    titulo: 'Ajustar inventário',
    ajuda:
      'Acerta o saldo quando a contagem física diverge do sistema. É a única ' +
      'operação que pode deixar o estoque negativo, justamente para permitir a correção.',
  },
}

export function ModalMovimento({
  modo,
  safraId,
  estoque,
  aoFechar,
}: {
  modo: ModoMovimento
  safraId: string
  estoque: SaldoEstoque[]
  aoFechar: () => void
}) {
  const registrar = useRegistrarMovimento()
  const beneficiar = useBeneficiar()

  const [data, setData] = useState(hoje)
  const [tipoCafe, setTipoCafe] = useState<TipoCafe>('Coco')
  const [sacas, setSacas] = useState('')
  const [sentidoAjuste, setSentidoAjuste] = useState<'Entrada' | 'Saída'>('Entrada')
  const [tipoResultado, setTipoResultado] = useState<TipoCafe>('Beneficiado')
  const [sacasResultado, setSacasResultado] = useState('')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  const saldoDe = (t: TipoCafe) =>
    Number(estoque.find((e) => e.tipo_cafe === t)?.sacas ?? 0)

  const numero = (v: string) => Number(v.replace(',', '.'))
  const qtd = numero(sacas)
  const qtdResultado = numero(sacasResultado)

  const pendente = registrar.isPending || beneficiar.isPending
  const erroMutacao = (registrar.error ?? beneficiar.error) as Error | null

  // Prévia do rendimento antes de gravar: é o número que interessa ao
  // produtor, e vê-lo antes evita descobrir um erro de digitação depois.
  const rendimento =
    modo === 'Beneficiamento' && qtd > 0 && qtdResultado > 0
      ? (qtdResultado / qtd) * 100
      : null

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!(qtd > 0)) return setErro('Informe a quantidade de sacas.')

    if (modo === 'Beneficiamento') {
      if (!(qtdResultado > 0)) return setErro('Informe quantas sacas resultaram.')
      if (tipoCafe === tipoResultado) {
        return setErro('O café de origem e o resultado têm de ser de tipos diferentes.')
      }
      return beneficiar.mutate(
        {
          safra_id: safraId,
          data,
          tipo_origem: tipoCafe,
          sacas_origem: String(qtd),
          tipo_resultado: tipoResultado,
          sacas_resultado: String(qtdResultado),
          observacao: observacao.trim() || null,
        },
        { onSuccess: aoFechar },
      )
    }

    registrar.mutate(
      {
        safra_id: safraId,
        data,
        tipo_movimento: modo,
        tipo_cafe: tipoCafe,
        sentido:
          modo === 'Colheita' ? 'Entrada' : modo === 'Perda' ? 'Saída' : sentidoAjuste,
        sacas: String(qtd),
        observacao: observacao.trim() || null,
      },
      { onSuccess: aoFechar },
    )
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
        className="w-full max-w-[520px] rounded-card border border-borda bg-card p-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <h2 className="font-serif text-[22px] text-texto">{TEXTO[modo].titulo}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-texto-3">{TEXTO[modo].ajuda}</p>

        <div className="mt-5 flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3.5">
            <Campo rotulo="Data" obrigatorio>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className={ENTRADA}
              />
            </Campo>
            {modo === 'Ajuste' && (
              <Campo rotulo="Sentido" obrigatorio>
                <select
                  value={sentidoAjuste}
                  onChange={(e) => setSentidoAjuste(e.target.value as 'Entrada' | 'Saída')}
                  className={ENTRADA}
                >
                  <option value="Entrada">Sobrou na contagem (entrada)</option>
                  <option value="Saída">Faltou na contagem (saída)</option>
                </select>
              </Campo>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <Campo
              rotulo={modo === 'Beneficiamento' ? 'Café de origem' : 'Tipo de café'}
              obrigatorio
            >
              <select
                value={tipoCafe}
                onChange={(e) => setTipoCafe(e.target.value as TipoCafe)}
                className={ENTRADA}
              >
                {TIPOS_CAFE.map((t) => (
                  <option key={t} value={t}>
                    {t} · {formatarSacas(saldoDe(t))} sc
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo={modo === 'Beneficiamento' ? 'Sacas usadas' : 'Sacas'} obrigatorio>
              <input
                value={sacas}
                inputMode="decimal"
                onChange={(e) => {
                  setSacas(e.target.value.replace(/[^\d,.]/g, ''))
                  setErro(null)
                }}
                placeholder="0"
                className={ENTRADA}
              />
            </Campo>
          </div>

          {modo === 'Beneficiamento' && (
            <>
              <div className="grid grid-cols-2 gap-3.5">
                <Campo rotulo="Café resultante" obrigatorio>
                  <select
                    value={tipoResultado}
                    onChange={(e) => setTipoResultado(e.target.value as TipoCafe)}
                    className={ENTRADA}
                  >
                    {TIPOS_CAFE.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo rotulo="Sacas resultantes" obrigatorio>
                  <input
                    value={sacasResultado}
                    inputMode="decimal"
                    onChange={(e) => {
                      setSacasResultado(e.target.value.replace(/[^\d,.]/g, ''))
                      setErro(null)
                    }}
                    placeholder="0"
                    className={ENTRADA}
                  />
                </Campo>
              </div>

              <p
                className={`rounded-campo border px-3 py-2.5 text-[12.5px] ${
                  rendimento === null
                    ? 'border-borda bg-fundo text-texto-3'
                    : rendimento > 100
                      ? 'border-terracota-escura bg-terracota-escura/15 text-terracota-clara'
                      : 'border-borda bg-fundo text-verde-claro'
                }`}
              >
                {rendimento === null
                  ? 'Informe as duas quantidades para ver o rendimento.'
                  : rendimento > 100
                    ? `Rendimento de ${rendimento.toFixed(1)}% — saiu mais café do que entrou. Confira as quantidades.`
                    : `Rendimento de ${rendimento.toFixed(1)}%.`}
              </p>
            </>
          )}

          <Campo rotulo="Observação">
            <input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder={
                modo === 'Ajuste'
                  ? 'Ex.: contagem física do terreiro em 05/08'
                  : 'Ex.: talhão 3'
              }
              className={ENTRADA}
            />
          </Campo>
        </div>

        {(erro || erroMutacao) && (
          <p className="mt-4 rounded-campo border border-terracota-escura bg-terracota-escura/15 px-3 py-2.5 text-[13px] text-terracota-clara">
            {erro ?? erroMutacao?.message}
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
            disabled={pendente}
            className={`rounded-campo px-5 py-2.5 text-[13.5px] font-semibold text-fundo transition-colors ${
              pendente ? 'bg-primaria/55' : 'bg-primaria hover:bg-primaria-clara'
            }`}
          >
            {pendente ? 'Salvando…' : 'Salvar'}
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
