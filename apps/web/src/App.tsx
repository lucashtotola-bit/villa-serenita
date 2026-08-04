import { useAuth } from './auth/contexto'
import { TelaCentral } from './componentes/TelaCentral'
import { Login } from './telas/Login'
import { AcessoNegado } from './telas/AcessoNegado'
import { Entrou } from './telas/Entrou'

/** Decide qual tela mostrar conforme a situação do usuário. */
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
      return <Entrou />
  }
}

function Aguardando({ texto }: { texto: string }) {
  return (
    <TelaCentral>
      <p className="text-center text-[13.5px] text-texto-2">{texto}</p>
    </TelaCentral>
  )
}
