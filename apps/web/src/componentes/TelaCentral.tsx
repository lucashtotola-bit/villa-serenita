/**
 * Enquadramento das telas que aparecem antes de entrar no sistema
 * (login, acesso negado, carregando): cartão único, centralizado.
 */
export function TelaCentral({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-fundo px-6 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-[38px] leading-none italic text-texto">
            Villa Serenità
          </h1>
          <p className="mt-2 text-[11px] tracking-[0.08em] text-texto-3 uppercase">
            Santa Teresa · ES
          </p>
        </div>

        <div className="rounded-card border border-borda bg-card p-7">{children}</div>
      </div>
    </div>
  )
}
