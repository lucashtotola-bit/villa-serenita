import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/contexto'
import { TelaCentral } from './componentes/TelaCentral'
import { Casca } from './layout/Casca'
import { Login } from './telas/Login'
import { AcessoNegado } from './telas/AcessoNegado'
import { EmConstrucao } from './telas/EmConstrucao'
import { Cadastros } from './telas/cadastros/Cadastros'
import { Lancamentos } from './telas/lancamentos/Lancamentos'
import { NotasFiscais } from './telas/notasFiscais/NotasFiscais'
import { Dividas } from './telas/dividas/Dividas'
import { Reservas } from './telas/reservas/Reservas'

/**
 * Antes de qualquer tela, decide se a pessoa pode estar aqui. O aplicativo em
 * si só é montado quando a situação é `autorizado`.
 */
export default function App() {
  const { situacao } = useAuth()

  switch (situacao) {
    case 'carregando':
      return <Aguardando texto="Carregando…" />
    case 'verificando':
      return <Aguardando texto="Verificando seu acesso…" />
    case 'deslogado':
      return <Login />
    case 'negado':
      return <AcessoNegado />
    case 'autorizado':
      return <Aplicativo />
  }
}

function Aplicativo() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Casca />}>
          <Route path="/" element={<EmConstrucao />} />
          <Route path="/calendario" element={<EmConstrucao />} />
          <Route path="/reservas" element={<Reservas />} />
          <Route path="/cafe" element={<EmConstrucao />} />
          <Route path="/lancamentos" element={<Lancamentos />} />
          <Route path="/notas-fiscais" element={<NotasFiscais />} />
          <Route path="/dividas" element={<Dividas />} />
          <Route path="/conciliacao" element={<EmConstrucao />} />
          <Route path="/cadastros" element={<Cadastros />} />
          <Route path="/safras" element={<EmConstrucao />} />
          {/* Endereço desconhecido volta para a Visão geral. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

function Aguardando({ texto }: { texto: string }) {
  return (
    <TelaCentral>
      <p className="text-center text-[13.5px] text-texto-2">{texto}</p>
    </TelaCentral>
  )
}
