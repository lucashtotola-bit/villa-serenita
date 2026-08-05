/**
 * Cartão de indicador usado nas linhas de KPI do topo das telas de lista.
 * `tabular-nums` mantém os dígitos alinhados quando os cartões variam de
 * valor lado a lado — importante numa tela financeira.
 */
export function CartaoKpi({
  rotulo,
  valor,
  detalhe,
  alerta,
}: {
  rotulo: string
  valor: string
  detalhe: string
  alerta?: boolean
}) {
  return (
    <div className="rounded-card border border-borda bg-card p-4">
      <p className="text-[11px] tracking-[0.06em] text-texto-3 uppercase">{rotulo}</p>
      <p
        className={`mt-1.5 font-serif text-[25px] tabular-nums ${
          alerta ? 'text-terracota-clara' : 'text-texto'
        }`}
      >
        {valor}
      </p>
      <p className="mt-1 truncate text-[11.5px] text-texto-3" title={detalhe}>
        {detalhe}
      </p>
    </div>
  )
}
