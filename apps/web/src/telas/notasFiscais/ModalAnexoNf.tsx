import { useRef, useState } from 'react'
import { useAbrirAnexo, useAnexosDeNf, useEnviarAnexoNf } from '../../dados/anexos'
import { formatarData } from '../../lib/formato'

export function ModalAnexoNf({
  notaFiscalId,
  numeroNf,
  aoFechar,
}: {
  notaFiscalId: string
  numeroNf: string
  aoFechar: () => void
}) {
  const anexos = useAnexosDeNf(notaFiscalId)
  const enviar = useEnviarAnexoNf(notaFiscalId)
  const abrir = useAbrirAnexo()
  const inputRef = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)

  const atual = anexos.data?.[0]

  function aoEnviar() {
    if (!arquivo) return
    enviar.mutate(
      { arquivo, substituiId: atual?.id },
      {
        onSuccess: () => {
          setArquivo(null)
          if (inputRef.current) inputRef.current.value = ''
        },
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-card border border-borda bg-card p-5">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-serif text-[20px] text-texto">Documento da NF {numeroNf}</h2>
            <p className="mt-0.5 text-[12.5px] text-texto-3">
              O anexo não é obrigatório para salvar a nota, mas o mês não fecha
              enquanto houver nota sem documento.
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="text-[20px] leading-none text-texto-3 hover:text-texto-2"
          >
            ×
          </button>
        </div>

        {anexos.isPending && <p className="text-[13px] text-texto-3">Carregando…</p>}

        {!anexos.isPending && (
          <div className="mb-4">
            {atual ? (
              <div className="flex items-center justify-between rounded-[10px] border border-borda bg-fundo px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-texto">{atual.nome_arquivo}</p>
                  <p className="mt-0.5 text-[11.5px] text-texto-3">
                    enviado em {formatarData(atual.criado_em.slice(0, 10))}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => abrir.mutate(atual.caminho_storage)}
                  disabled={abrir.isPending}
                  className="ml-3 shrink-0 rounded-lg border border-primaria/40 px-3 py-1.5 text-[12.5px] text-verde-suave transition-colors hover:bg-primaria/15"
                >
                  {abrir.isPending ? 'Abrindo…' : 'Ver'}
                </button>
              </div>
            ) : (
              <p className="rounded-[10px] border border-terracota-clara/30 bg-terracota-escura/10 px-3 py-2.5 text-[12.5px] text-terracota-clara">
                Nenhum documento anexado ainda.
              </p>
            )}
          </div>
        )}

        <div className="border-t border-borda pt-4">
          <label className="mb-1.5 block text-[12.5px] text-texto-2">
            {atual ? 'Enviar nova versão' : 'Enviar documento'}
          </label>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="block w-full text-[12.5px] text-texto-2 file:mr-3 file:rounded-lg file:border file:border-borda-campo file:bg-fundo file:px-3 file:py-1.5 file:text-[12.5px] file:text-texto-2"
          />

          {enviar.isError && (
            <p className="mt-2 text-[12px] text-terracota-clara">
              {(enviar.error as Error).message}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={aoFechar}
              className="rounded-campo px-4 py-2 text-[13px] text-texto-3 hover:text-texto-2"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={aoEnviar}
              disabled={!arquivo || enviar.isPending}
              className="rounded-campo bg-primaria px-4 py-2 text-[13px] font-semibold text-fundo transition-colors hover:bg-primaria-clara disabled:opacity-50"
            >
              {enviar.isPending ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
