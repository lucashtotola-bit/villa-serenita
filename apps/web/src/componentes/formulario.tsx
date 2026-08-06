import { useEffect, type ReactNode } from 'react'

/**
 * Peças comuns a todos os formulários em janela do aplicativo.
 *
 * Antes desta revisão, cada modal carregava a própria cópia de `ENTRADA`,
 * `Campo` e da sobreposição com fechamento por Esc — dez cópias que já tinham
 * começado a divergir (uma delas usava outro tamanho de fonte). Centralizar
 * aqui é o que garante que o próximo ajuste de estilo aconteça uma vez só.
 */

/** Classe padrão de input/select dos formulários. */
export const ENTRADA =
  'box-border w-full min-w-0 rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 ' +
  'text-[13.5px] text-texto placeholder:text-apagado outline-none focus:border-primaria'

/**
 * Fundo escurecido que segura a janela: fecha no clique fora e na tecla Esc.
 * O conteúdo (form ou div) continua por conta de cada modal — largura e
 * comportamento de envio variam.
 */
export function Sobreposicao({
  aoFechar,
  children,
}: {
  aoFechar: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(10,14,6,0.72)] px-4 py-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar()
      }}
    >
      {children}
    </div>
  )
}

/** Rótulo em caixa alta sobre o campo, com asterisco quando obrigatório. */
export function Campo({
  rotulo,
  obrigatorio,
  children,
}: {
  rotulo: string
  obrigatorio?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] tracking-[0.06em] text-texto-3 uppercase">
        {rotulo}
        {obrigatorio && <span className="text-primaria"> *</span>}
      </span>
      {children}
    </label>
  )
}

/** Select simples de { id, nome }, com a opção vazia configurável. */
export function Selecao({
  valor,
  aoMudar,
  opcoes,
  vazio = 'Selecione…',
}: {
  valor: string
  aoMudar: (v: string) => void
  opcoes: { id: string; nome: string }[]
  vazio?: string
}) {
  return (
    <select value={valor} onChange={(e) => aoMudar(e.target.value)} className={ENTRADA}>
      <option value="">{vazio}</option>
      {opcoes.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nome}
        </option>
      ))}
    </select>
  )
}
