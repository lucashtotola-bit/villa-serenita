import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/contexto'
import { MENU } from '../navegacao/menu'
import { BotaoInstalar } from '../componentes/BotaoInstalar'

/**
 * Barra lateral fixa de 224px, reproduzida do protótipo.
 *
 * No lugar do cartão de resumo que o protótipo tinha no rodapé (ocupação e
 * fase da safra), aqui vai a identificação de quem está logado — o resumo
 * depende de dados que só existem a partir da Etapa 2.
 */
export function BarraLateral() {
  const { socio, sair } = useAuth()

  return (
    <aside className="sticky top-0 flex h-screen w-[224px] flex-none flex-col gap-7 border-r border-borda px-4 py-7">
      <div className="px-2.5">
        <div className="font-serif text-2xl leading-none tracking-[0.2px] italic text-texto">
          Villa Serenità
        </div>
        <div className="mt-[3px] text-[11px] tracking-[0.08em] text-texto-3 uppercase">
          Santa Teresa · ES
        </div>
      </div>

      <NavLink
        to="/reservas"
        className="flex items-center justify-center gap-2 rounded-campo bg-primaria px-3.5 py-2.5 text-[13.5px] font-semibold text-fundo transition-colors hover:bg-primaria-clara"
      >
        ＋ Nova reserva
      </NavLink>

      <nav className="-mt-3.5 flex flex-col gap-0.5 overflow-y-auto">
        {MENU.map((grupo, i) => (
          <div key={grupo.titulo} className={i === 0 ? '' : 'mt-[18px]'}>
            <div className="px-3 pb-[7px] text-[10.5px] tracking-[0.12em] text-apagado uppercase">
              {grupo.titulo}
            </div>

            {grupo.itens.map((item) => (
              <NavLink
                key={item.caminho}
                to={item.caminho}
                end={item.caminho === '/'}
                className={({ isActive }) =>
                  'relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ' +
                  (isActive
                    ? 'bg-primaria/[0.13] font-medium text-verde-suave'
                    : 'text-texto-2 hover:bg-white/5')
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      aria-hidden
                      className="absolute inset-y-1.5 left-0 w-[3px] rounded-full"
                      style={
                        isActive
                          ? { backgroundImage: 'var(--gradiente-assinatura)' }
                          : undefined
                      }
                    />
                    <span className="w-5 text-center opacity-80">{item.icone}</span>
                    {item.rotulo}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2.5">
        <BotaoInstalar />
        <div className="rounded-grupo border border-borda bg-card p-3.5">
        <div className="text-[10.5px] tracking-[0.06em] text-texto-3 uppercase">
          Conectado como
        </div>
        <div className="mt-1 truncate text-[13.5px] font-medium text-texto" title={socio?.email ?? ''}>
          {socio?.nome_curto}
        </div>
        <button
          type="button"
          onClick={sair}
          className="mt-2.5 text-[12.5px] text-texto-3 transition-colors hover:text-primaria-clara"
        >
          Sair
        </button>
        </div>
      </div>
    </aside>
  )
}
