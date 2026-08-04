import { useState } from 'react'
import { useAuth } from '../auth/contexto'
import { TelaCentral } from '../componentes/TelaCentral'
import { LogoGoogle } from '../componentes/LogoGoogle'

export function Login() {
  const { entrarComGoogle, erro } = useAuth()
  const [entrando, setEntrando] = useState(false)

  async function aoClicar() {
    setEntrando(true)
    await entrarComGoogle()
    // Se der certo, o navegador sai desta página para o Google. Voltar ao
    // estado normal só importa quando algo falhou antes do redirecionamento.
    setEntrando(false)
  }

  return (
    <TelaCentral>
      <h2 className="font-serif text-[22px] text-texto">Entrar</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-texto-2">
        Sistema de gestão da propriedade. O acesso é restrito aos sócios
        cadastrados.
      </p>

      <button
        type="button"
        onClick={aoClicar}
        disabled={entrando}
        className="mt-6 flex w-full items-center justify-center gap-3 rounded-campo bg-primaria px-4 py-3 text-[14px] font-semibold text-fundo transition-colors hover:bg-primaria-clara disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[4px] bg-white">
          <LogoGoogle tamanho={15} />
        </span>
        {entrando ? 'Abrindo o Google…' : 'Entrar com Google'}
      </button>

      {erro && (
        <p className="mt-4 rounded-campo border border-terracota-escura bg-terracota-escura/15 px-3 py-2.5 text-[13px] text-terracota-clara">
          {erro}
        </p>
      )}

      <p className="mt-6 border-t border-borda pt-4 text-[12px] leading-relaxed text-texto-3">
        Você será levado ao Google para confirmar sua identidade e volta em
        seguida. A Villa Serenità não vê nem guarda sua senha.
      </p>
    </TelaCentral>
  )
}
