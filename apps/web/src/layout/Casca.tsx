import { Outlet } from 'react-router-dom'
import { BarraLateral } from './BarraLateral'

/** Estrutura do aplicativo: barra lateral fixa + área de conteúdo. */
export function Casca() {
  return (
    <div className="flex min-h-screen bg-fundo">
      <BarraLateral />
      <main className="min-w-0 flex-1 px-10 py-8">
        <Outlet />
      </main>
    </div>
  )
}
