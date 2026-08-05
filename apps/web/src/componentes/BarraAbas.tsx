/** Barra de abas em pílulas, usada para filtrar listas nas telas de operação e financeiro. */
export function BarraAbas<T extends string>({
  abas,
  ativa,
  aoMudar,
}: {
  abas: { id: T; rotulo: string }[]
  ativa: T
  aoMudar: (id: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5 rounded-grupo border border-borda bg-card p-1.5">
      {abas.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => aoMudar(a.id)}
          className={`rounded-[7px] px-4 py-2 text-[13px] transition-colors ${
            a.id === ativa
              ? 'bg-primaria/15 font-medium text-verde-suave'
              : 'text-texto-3 hover:text-texto-2'
          }`}
        >
          {a.rotulo}
        </button>
      ))}
    </div>
  )
}
