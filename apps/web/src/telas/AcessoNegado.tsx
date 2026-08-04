import { useAuth } from '../auth/contexto'
import { TelaCentral } from '../componentes/TelaCentral'

/**
 * O Google confirmou quem é a pessoa, mas o e-mail não está autorizado.
 * Sem esta tela, o usuário veria um sistema vazio sem entender o motivo.
 */
export function AcessoNegado() {
  const { emailTentado, sair } = useAuth()

  return (
    <TelaCentral>
      <h2 className="font-serif text-[22px] text-terracota-clara">
        Acesso não autorizado
      </h2>

      <p className="mt-2 text-[13px] leading-relaxed text-texto-2">
        A conta abaixo não está cadastrada como usuária do sistema.
      </p>

      {emailTentado && (
        <p className="mt-3 rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 text-[13px] break-all text-texto">
          {emailTentado}
        </p>
      )}

      <p className="mt-4 text-[13px] leading-relaxed text-texto-3">
        Se você é sócio e deveria ter acesso, peça ao Lucas para liberar este
        endereço. Se entrou com a conta errada, saia e tente de novo.
      </p>

      <button
        type="button"
        onClick={sair}
        className="mt-6 w-full rounded-campo border border-borda-campo px-4 py-2.5 text-[13.5px] font-medium text-texto transition-colors hover:border-primaria hover:text-primaria-clara"
      >
        Sair e usar outra conta
      </button>
    </TelaCentral>
  )
}
