import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { categoriasDe, centrosDe, useOpcoes } from '../../dados/opcoes'
import {
  CANAIS,
  useAcomodacoes,
  useCriarReserva,
  useHospedes,
  type NovaReserva,
} from '../../dados/reservas'
import {
  centavosParaDecimal,
  formatarDinheiro,
  mascaraDinheiro,
  paraCentavos,
} from '../../lib/formato'
import { adicionarDias } from '../../lib/periodo'

const hoje = () => new Date().toISOString().slice(0, 10)

const ENTRADA =
  'box-border w-full min-w-0 rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 ' +
  'text-[13.5px] text-texto placeholder:text-apagado outline-none focus:border-primaria'

export function ModalReserva({
  aoFechar,
  aoSalvar,
}: {
  aoFechar: () => void
  aoSalvar: (reservaId: string) => void
}) {
  const opcoes = useOpcoes()
  const acomodacoes = useAcomodacoes()
  const hospedes = useHospedes()
  const criar = useCriarReserva()

  const [hospedeId, setHospedeId] = useState('')
  const [canal, setCanal] = useState<string>(CANAIS[0])
  const [entrada, setEntrada] = useState(hoje)
  const [saida, setSaida] = useState(() => adicionarDias(hoje(), 2))
  const [numeroHospedes, setNumeroHospedes] = useState('2')
  const [valorTotal, setValorTotal] = useState('')
  const [sinal, setSinal] = useState('')
  const [selecionadas, setSelecionadas] = useState<string[]>([])
  const [valoresCasa, setValoresCasa] = useState<Record<string, string>>({})
  const [categoriaId, setCategoriaId] = useState('')
  const [centroId, setCentroId] = useState('')
  const [contaId, setContaId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [confirmar, setConfirmar] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const categorias = useMemo(() => categoriasDe(opcoes.data, 'Receita'), [opcoes.data])
  const centros = useMemo(() => centrosDe(opcoes.data, 'Receita'), [opcoes.data])
  const contas = opcoes.data?.contas ?? []

  useEffect(() => {
    if (contas.length === 1) setContaId(contas[0].id)
  }, [contas])
  useEffect(() => {
    setCategoriaId(categorias.length === 1 ? categorias[0].id : '')
  }, [categorias])
  useEffect(() => {
    setCentroId(centros.length === 1 ? centros[0].id : '')
  }, [centros])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  // Saída sempre depois da entrada: mexer na entrada empurra a saída junto.
  useEffect(() => {
    setSaida((s) => (s <= entrada ? adicionarDias(entrada, 1) : s))
  }, [entrada])

  const totalCentavos = paraCentavos(valorTotal)
  const sinalCentavos = paraCentavos(sinal)
  const nCasas = selecionadas.length
  const base = nCasas ? Math.floor(totalCentavos / nCasas) : 0

  // O total é dividido igualmente entre as casas escolhidas; a última absorve
  // a sobra do arredondamento, para a soma fechar exatamente com o total —
  // é o que o banco exige antes de gravar.
  const linhas = selecionadas.map((id, i) => {
    const padrao = i === nCasas - 1 ? totalCentavos - base * (nCasas - 1) : base
    const manual = valoresCasa[id]
    return {
      id,
      acomodacao: acomodacoes.data?.find((a) => a.id === id),
      centavos: manual !== undefined ? paraCentavos(manual) : padrao,
      texto: manual ?? (totalCentavos ? mascaraDinheiro(String(padrao)) : ''),
    }
  })

  const somaCasas = linhas.reduce((t, l) => t + l.centavos, 0)
  const difCasas = totalCentavos - somaCasas

  function alternarCasa(id: string) {
    setSelecionadas((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
    // Divisão manual antiga não faz mais sentido com outro conjunto de casas.
    setValoresCasa({})
    setErro(null)
  }

  const faltaCadastro =
    !opcoes.isPending &&
    !hospedes.isPending &&
    (!contas.length || !categorias.length || !centros.length || !hospedes.data?.length)

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    const faltando: string[] = []
    if (!hospedeId) faltando.push('hóspede')
    if (!totalCentavos) faltando.push('valor total')
    if (!nCasas) faltando.push('ao menos uma acomodação')
    if (!categoriaId) faltando.push('categoria')
    if (!centroId) faltando.push('centro de custo')
    if (!contaId) faltando.push('conta bancária')
    if (faltando.length) return setErro(`Preencha: ${faltando.join(', ')}.`)

    if (saida <= entrada) return setErro('A saída tem de ser depois da entrada.')
    if (sinalCentavos > totalCentavos) {
      return setErro('O sinal não pode ser maior que o valor total da reserva.')
    }
    if (difCasas !== 0) {
      return setErro(
        `A divisão entre as casas soma ${formatarDinheiro(somaCasas)} e o total ` +
          `da reserva é ${formatarDinheiro(totalCentavos)}. Ajuste antes de salvar.`,
      )
    }

    const nova: NovaReserva = {
      hospede_id: hospedeId,
      canal,
      data_entrada: entrada,
      data_saida: saida,
      numero_hospedes: Math.max(1, parseInt(numeroHospedes, 10) || 1),
      valor_total: centavosParaDecimal(totalCentavos),
      sinal: centavosParaDecimal(sinalCentavos),
      categoria_id: categoriaId,
      centro_id: centroId,
      conta_id: contaId,
      observacao: observacao.trim() || null,
      confirmar,
      acomodacoes: linhas.map((l) => ({
        acomodacao_id: l.id,
        valor: centavosParaDecimal(l.centavos),
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
        <h2 className="font-serif text-[22px] text-texto">Nova reserva</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-texto-3">
          Ao confirmar, nascem duas receitas previstas: o sinal, que garante a
          data, e o saldo, a receber na chegada.
        </p>

        {faltaCadastro ? (
          <div className="mt-5 rounded-campo border border-terracota-escura bg-terracota-escura/10 p-4">
            <p className="text-[13.5px] text-terracota-clara">
              Faltam cadastros básicos para lançar uma reserva.
            </p>
            <ul className="mt-2 ml-4 list-disc text-[13px] text-texto-2">
              {!hospedes.data?.length && <li>nenhum hóspede cadastrado</li>}
              {!contas.length && <li>nenhuma conta bancária</li>}
              {!categorias.length && <li>nenhuma categoria de receita</li>}
              {!centros.length && <li>nenhum centro de custo</li>}
            </ul>
            <Link
              to="/cadastros"
              className="mt-3 inline-block text-[13px] text-primaria-clara hover:underline"
            >
              Ir para Cadastros →
            </Link>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-3.5">
            <Campo rotulo="Hóspede" obrigatorio>
              <select
                value={hospedeId}
                onChange={(e) => setHospedeId(e.target.value)}
                className={ENTRADA}
                autoFocus
              >
                <option value="">Selecione o hóspede cadastrado…</option>
                {(hospedes.data ?? []).map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nome}
                    {h.contato ? ` · ${h.contato}` : ''}
                  </option>
                ))}
              </select>
            </Campo>

            <div className="grid grid-cols-3 gap-3.5">
              <Campo rotulo="Entrada" obrigatorio>
                <input
                  type="date"
                  value={entrada}
                  onChange={(e) => setEntrada(e.target.value)}
                  className={ENTRADA}
                />
              </Campo>
              <Campo rotulo="Saída" obrigatorio>
                <input
                  type="date"
                  value={saida}
                  onChange={(e) => setSaida(e.target.value)}
                  className={ENTRADA}
                />
              </Campo>
              <Campo rotulo="Hóspedes" obrigatorio>
                <input
                  value={numeroHospedes}
                  inputMode="numeric"
                  onChange={(e) => setNumeroHospedes(e.target.value.replace(/\D/g, ''))}
                  className={ENTRADA}
                />
              </Campo>
            </div>

            <div className="grid grid-cols-3 gap-3.5">
              <Campo rotulo="Canal" obrigatorio>
                <select
                  value={canal}
                  onChange={(e) => setCanal(e.target.value)}
                  className={ENTRADA}
                >
                  {CANAIS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Valor total" obrigatorio>
                <input
                  value={valorTotal}
                  inputMode="numeric"
                  onChange={(e) => setValorTotal(mascaraDinheiro(e.target.value))}
                  placeholder="0,00"
                  className={ENTRADA}
                />
              </Campo>
              <Campo rotulo="Sinal">
                <input
                  value={sinal}
                  inputMode="numeric"
                  onChange={(e) => setSinal(mascaraDinheiro(e.target.value))}
                  placeholder="0,00"
                  className={ENTRADA}
                />
              </Campo>
            </div>

            <div>
              <span className="mb-1.5 block text-[11px] tracking-[0.06em] text-texto-3 uppercase">
                Acomodações<span className="text-primaria"> *</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {(acomodacoes.data ?? []).map((a) => {
                  const ativa = selecionadas.includes(a.id)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => alternarCasa(a.id)}
                      className={`flex items-center gap-2 rounded-pill px-3 py-1.5 text-[12.5px] transition-colors ${
                        ativa
                          ? 'bg-primaria/15 text-verde-suave'
                          : 'border border-borda-campo text-texto-3 hover:text-texto-2'
                      }`}
                    >
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: a.cor }}
                      />
                      {a.nome}
                    </button>
                  )
                })}
              </div>
            </div>

            {nCasas > 1 && (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] tracking-[0.06em] text-texto-3 uppercase">
                  Divisão entre as casas
                </span>
                {linhas.map((l) => (
                  <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-2">
                    <span className="truncate text-[13px] text-texto-2">
                      {l.acomodacao?.nome ?? '—'}
                    </span>
                    <input
                      value={l.texto}
                      inputMode="numeric"
                      placeholder="0,00"
                      onChange={(e) => {
                        setValoresCasa((v) => ({
                          ...v,
                          [l.id]: mascaraDinheiro(e.target.value),
                        }))
                        setErro(null)
                      }}
                      className={ENTRADA}
                    />
                  </div>
                ))}
                <p
                  className={`text-[12px] ${
                    difCasas === 0 ? 'text-verde-claro' : 'text-terracota-clara'
                  }`}
                >
                  {difCasas === 0
                    ? `As casas somam ${formatarDinheiro(somaCasas)} — igual ao total.`
                    : `As casas somam ${formatarDinheiro(somaCasas)}, faltam ${formatarDinheiro(difCasas)}.`}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3.5">
              <Campo rotulo="Centro de custo" obrigatorio>
                <select
                  value={centroId}
                  onChange={(e) => setCentroId(e.target.value)}
                  className={ENTRADA}
                >
                  <option value="">Selecione…</option>
                  {centros.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Categoria" obrigatorio>
                <select
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  className={ENTRADA}
                >
                  <option value="">Selecione…</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>

            <Campo rotulo="Conta bancária (recebimento)" obrigatorio>
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

            <Campo rotulo="Observação">
              <input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: chega tarde, deixar chave com o caseiro"
                className={ENTRADA}
              />
            </Campo>

            <label className="flex items-start gap-2.5 rounded-campo border border-borda bg-fundo px-3 py-2.5">
              <input
                type="checkbox"
                checked={confirmar}
                onChange={(e) => setConfirmar(e.target.checked)}
                className="mt-[3px] accent-[#93a35f]"
              />
              <span className="text-[12.5px] leading-relaxed text-texto-2">
                Confirmar já — gera as receitas previstas.{' '}
                <span className="text-texto-3">
                  Desmarque para deixar como pré-reserva: a data fica bloqueada
                  no calendário, mas nada entra no financeiro ainda.
                </span>
              </span>
            </label>
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
            disabled={criar.isPending || faltaCadastro}
            className={`rounded-campo px-5 py-2.5 text-[13.5px] font-semibold text-fundo transition-colors ${
              criar.isPending || faltaCadastro
                ? 'bg-primaria/55'
                : 'bg-primaria hover:bg-primaria-clara'
            }`}
          >
            {criar.isPending ? 'Salvando…' : 'Salvar reserva'}
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
