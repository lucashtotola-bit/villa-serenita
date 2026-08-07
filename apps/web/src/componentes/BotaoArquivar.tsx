import { useState } from 'react'

/**
 * Arquivar com confirmação em dois toques, e o motivo à vista quando o banco
 * recusa.
 *
 * O motivo importa mais aqui do que na maioria das telas: nestes registros a
 * recusa quase nunca é "não pode", é "não pode AINDA" — o lançamento já foi
 * conciliado, ou há uma devolução que depende deste aporte. Engolir a
 * mensagem transformaria uma explicação útil num botão que não funciona.
 *
 * Sem janela de confirmação: para uma ação de uma linha só, a janela custa
 * mais atenção do que protege.
 */
export function BotaoArquivar({
  aoArquivar,
  arquivando,
  erro,
  rotulo = 'Arquivar',
  aviso,
}: {
  aoArquivar: (aoConcluir: () => void) => void
  arquivando: boolean
  erro?: string | null
  rotulo?: string
  /** Uma linha explicando o que arquivar leva junto. */
  aviso?: string
}) {
  const [confirmando, setConfirmando] = useState(false)

  if (!confirmando) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="text-[12px] text-texto-3 transition-colors hover:text-terracota-clara"
        >
          {rotulo}
        </button>
        {erro && (
          <span className="max-w-[280px] text-right text-[11.5px] text-terracota-clara">
            {erro}
          </span>
        )}
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      {aviso && (
        <span className="max-w-[280px] text-right text-[11.5px] text-texto-3">{aviso}</span>
      )}
      <span className="inline-flex items-center gap-2 text-[12px]">
        <button
          type="button"
          onClick={() => aoArquivar(() => setConfirmando(false))}
          disabled={arquivando}
          className="text-terracota-clara hover:underline"
        >
          {arquivando ? 'Arquivando…' : 'Confirmar'}
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="text-texto-3 transition-colors hover:text-texto-2"
        >
          Não
        </button>
      </span>
    </span>
  )
}
