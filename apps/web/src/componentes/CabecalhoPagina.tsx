import type { ReactNode } from 'react'

/**
 * Cabeçalho padrão de tela: título, subtítulo opcional, ação à direita
 * (botão, seletor de mês…) e o filete de assinatura da Villa Serenità —
 * verde (café) esmaecendo em terracota (hospedagem), as duas frentes do
 * negócio. Repetido em toda tela para o alinhamento nunca divergir.
 */
export function CabecalhoPagina({
  titulo,
  subtitulo,
  acao,
}: {
  titulo: string
  subtitulo?: ReactNode
  acao?: ReactNode
}) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[34px] leading-tight text-texto">{titulo}</h1>
          {subtitulo && <p className="mt-1 text-[13px] text-texto-3">{subtitulo}</p>}
        </div>
        {acao && <div className="flex flex-wrap items-center gap-3">{acao}</div>}
      </div>
      <div
        aria-hidden
        className="mt-4 h-[2px] w-full rounded-full"
        style={{
          backgroundImage: 'var(--gradiente-assinatura-h)',
          opacity: 0.5,
          maskImage: 'linear-gradient(90deg, black 0%, black 55%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(90deg, black 0%, black 55%, transparent 100%)',
        }}
      />
    </div>
  )
}
