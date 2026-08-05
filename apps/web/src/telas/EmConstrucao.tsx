import { useLocation } from 'react-router-dom'
import { CabecalhoPagina } from '../componentes/CabecalhoPagina'
import { ITENS_MENU } from '../navegacao/menu'

/**
 * Mostrada nas telas que ainda serão construídas, para o menu já nascer
 * completo sem fingir que a tela existe.
 */
export function EmConstrucao() {
  const { pathname } = useLocation()
  const item = ITENS_MENU.find((i) => i.caminho === pathname)

  return (
    <div className="max-w-2xl">
      <CabecalhoPagina titulo={item?.rotulo ?? 'Tela'} />

      <div className="rounded-card border border-borda bg-card p-6">
        <span className="inline-block rounded-pill border border-borda-campo px-3 py-1 text-[12px] text-texto-3">
          Em construção · Etapa {item?.etapa}
        </span>

        {item?.resumo && (
          <p className="mt-4 text-[14px] leading-relaxed text-texto-2">
            {item.resumo}
          </p>
        )}

        <p className="mt-4 border-t border-borda pt-4 text-[13px] leading-relaxed text-texto-3">
          O sistema está sendo construído um módulo por vez. Esta tela entra na
          Etapa {item?.etapa}; o desenho dela já está definido no protótipo.
        </p>
      </div>
    </div>
  )
}
