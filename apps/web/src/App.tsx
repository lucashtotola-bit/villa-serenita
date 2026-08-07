import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/contexto'
import { TelaCentral } from './componentes/TelaCentral'
import { Casca } from './layout/Casca'
import { Login } from './telas/Login'
import { AcessoNegado } from './telas/AcessoNegado'
import { Cadastros } from './telas/cadastros/Cadastros'
import { Historico } from './telas/historico/Historico'
import { Lancamentos } from './telas/lancamentos/Lancamentos'
import { Contas } from './telas/contas/Contas'
import { NotasFiscais } from './telas/notasFiscais/NotasFiscais'
import { Dividas } from './telas/dividas/Dividas'
import { Reservas } from './telas/reservas/Reservas'
import { Calendario } from './telas/reservas/Calendario'
import { Safras } from './telas/safras/Safras'
import { Cafe } from './telas/cafe/Cafe'
import { Conciliacao } from './telas/conciliacao/Conciliacao'
import { PrestacaoContas } from './telas/prestacao/PrestacaoContas'
import { Aportes } from './telas/prestacao/Aportes'
import { Distribuicoes } from './telas/prestacao/Distribuicoes'
import { VisaoGeral } from './telas/visaoGeral/VisaoGeral'

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
          <Route path="/" element={<VisaoGeral />} />
          <Route path="/calendario" element={<Calendario />} />
          <Route path="/reservas" element={<Reservas />} />
          <Route path="/cafe" element={<Cafe />} />
          <Route path="/lancamentos" element={<Lancamentos />} />
          <Route path="/contas" element={<Contas />} />
          <Route path="/notas-fiscais" element={<NotasFiscais />} />
          <Route path="/dividas" element={<Dividas />} />
          <Route path="/conciliacao" element={<Conciliacao />} />
          <Route path="/prestacao-de-contas" element={<PrestacaoContas />} />
          <Route path="/aportes" element={<Aportes />} />
          <Route path="/distribuicao" element={<Distribuicoes />} />
          <Route path="/cadastros" element={<Cadastros />} />
          <Route path="/historico" element={<Historico />} />
          <Route path="/safras" element={<Safras />} />
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
