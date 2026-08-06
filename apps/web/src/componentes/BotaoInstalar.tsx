import { useEffect, useState } from 'react'

/** O evento que o Chrome dispara quando o app pode ser instalado. */
type EventoInstalacao = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Botão "Instalar aplicativo" — a entrega combinada: ícone na área de
 * trabalho e janela própria, sem instalador nem download.
 *
 * Ele só aparece quando o navegador sinaliza que a instalação é possível
 * (evento `beforeinstallprompt`): some sozinho dentro do app já instalado,
 * em navegador sem suporte e no uso comum em aba. Por isso não há estado
 * de erro — quando não dá, simplesmente não existe.
 */
export function BotaoInstalar() {
  const [evento, setEvento] = useState<EventoInstalacao | null>(null)

  useEffect(() => {
    const guardar = (e: Event) => {
      // Impede o aviso automático do navegador: a oferta fica no nosso botão.
      e.preventDefault()
      setEvento(e as EventoInstalacao)
    }
    const instalado = () => setEvento(null)

    window.addEventListener('beforeinstallprompt', guardar)
    window.addEventListener('appinstalled', instalado)
    return () => {
      window.removeEventListener('beforeinstallprompt', guardar)
      window.removeEventListener('appinstalled', instalado)
    }
  }, [])

  if (!evento) return null

  async function instalar() {
    if (!evento) return
    await evento.prompt()
    // Aceitando ou não, o navegador não deixa reusar o mesmo evento.
    setEvento(null)
  }

  return (
    <button
      type="button"
      onClick={() => void instalar()}
      className="flex items-center justify-center gap-2 rounded-campo border border-primaria/40 px-3.5 py-2 text-[12.5px] text-verde-suave transition-colors hover:bg-primaria/15"
    >
      ⤓ Instalar aplicativo
    </button>
  )
}
