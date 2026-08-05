import { useEffect, useRef, useState } from 'react'
import { useImportarExtrato, type ResultadoImportacao } from '../../dados/conciliacao'
import { ErroOfx, lerOfx, type ExtratoOfx } from '../../lib/ofx'
import { formatarDinheiro, formatarData } from '../../lib/formato'

export function ModalImportarOfx({
  contaId,
  contaNome,
  aoFechar,
}: {
  contaId: string
  contaNome: string
  aoFechar: () => void
}) {
  const importar = useImportarExtrato()
  const inputRef = useRef<HTMLInputElement>(null)

  const [arquivo, setArquivo] = useState<File | null>(null)
  const [extrato, setExtrato] = useState<ExtratoOfx | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  /**
   * O arquivo é lido e conferido aqui, antes de qualquer gravação: assim o
   * usuário vê o que vai entrar e pode desistir, em vez de descobrir um
   * arquivo errado depois de sujar o banco.
   */
  async function escolher(f: File | null) {
    setArquivo(f)
    setExtrato(null)
    setErro(null)
    setResultado(null)
    if (!f) return

    try {
      setExtrato(lerOfx(await f.arrayBuffer()))
    } catch (e) {
      setErro(
        e instanceof ErroOfx
          ? e.message
          : 'Não foi possível ler este arquivo. Confira se ele é um extrato OFX.',
      )
    }
  }

  function enviar() {
    if (!extrato || !arquivo) return
    importar.mutate(
      { contaId, arquivoNome: arquivo.name, extrato },
      { onSuccess: setResultado },
    )
  }

  const totais = extrato
    ? extrato.movimentos.reduce(
        (t, m) => ({
          entradas: t.entradas + (m.centavos > 0 ? m.centavos : 0),
          saidas: t.saidas + (m.centavos < 0 ? -m.centavos : 0),
        }),
        { entradas: 0, saidas: 0 },
      )
    : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(10,14,6,0.72)] px-4 py-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-[560px] rounded-card border border-borda bg-card p-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <h2 className="font-serif text-[22px] text-texto">Importar extrato</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-texto-3">
          Arquivo OFX de <strong className="text-texto-2">{contaNome}</strong>. Baixe
          do internet banking — costuma aparecer como "OFX", "Money" ou "arquivo
          para gerenciador financeiro". Reimportar um período já lançado é
          seguro: movimentos repetidos são ignorados.
        </p>

        {resultado ? (
          <div className="mt-5">
            <p className="rounded-campo border border-primaria/30 bg-primaria/[0.09] px-4 py-3 text-[13.5px] text-texto-2">
              <strong className="text-verde-claro">
                {resultado.importadas} movimento(s) importado(s).
              </strong>
              {resultado.ignoradas > 0 && (
                <>
                  {' '}
                  {resultado.ignoradas} já estava(m) no sistema de uma importação
                  anterior e foram ignorados.
                </>
              )}
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={aoFechar}
                className="rounded-campo bg-primaria px-5 py-2.5 text-[13.5px] font-semibold text-fundo transition-colors hover:bg-primaria-clara"
              >
                Concluir
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-5">
              <input
                ref={inputRef}
                type="file"
                accept=".ofx,.OFX,application/x-ofx,text/plain"
                onChange={(e) => void escolher(e.target.files?.[0] ?? null)}
                className="block w-full text-[12.5px] text-texto-2 file:mr-3 file:rounded-lg file:border file:border-borda-campo file:bg-fundo file:px-3 file:py-1.5 file:text-[12.5px] file:text-texto-2"
              />
            </div>

            {extrato && totais && (
              <div className="mt-4 rounded-campo border border-borda bg-fundo p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[13.5px] text-texto">
                    {extrato.movimentos.length} movimento(s)
                  </span>
                  <span className="text-[12.5px] text-texto-3">
                    {extrato.periodoInicio && formatarData(extrato.periodoInicio)} a{' '}
                    {extrato.periodoFim && formatarData(extrato.periodoFim)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
                  <span className="text-verde-claro">
                    + {formatarDinheiro(totais.entradas)}
                  </span>
                  <span className="text-terracota-clara">
                    − {formatarDinheiro(totais.saidas)}
                  </span>
                </div>
                {extrato.contaBanco && (
                  <p className="mt-2 border-t border-borda pt-2 text-[11.5px] text-texto-3">
                    Conta no arquivo: {extrato.agencia ? `ag. ${extrato.agencia} · ` : ''}
                    {extrato.contaBanco} — confira se é mesmo {contaNome}.
                  </p>
                )}
              </div>
            )}

            {(erro || importar.isError) && (
              <p className="mt-4 rounded-campo border border-terracota-escura bg-terracota-escura/15 px-3 py-2.5 text-[13px] leading-relaxed text-terracota-clara">
                {erro ?? (importar.error as Error).message}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={aoFechar}
                className="rounded-campo border border-borda-campo px-4 py-2.5 text-[13.5px] text-texto-2 transition-colors hover:text-texto"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={enviar}
                disabled={!extrato || importar.isPending}
                className={`rounded-campo px-5 py-2.5 text-[13.5px] font-semibold text-fundo transition-colors ${
                  !extrato || importar.isPending
                    ? 'bg-primaria/55'
                    : 'bg-primaria hover:bg-primaria-clara'
                }`}
              >
                {importar.isPending ? 'Importando…' : 'Importar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
