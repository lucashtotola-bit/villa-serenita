import { useState } from 'react'
import { useCadastro, type Registro } from '../../dados/cadastros'
import { CADASTROS, type DefinicaoCadastro } from './definicoes'
import { ModalCadastro } from './ModalCadastro'

export function Cadastros() {
  const [abaId, setAbaId] = useState(CADASTROS[0].id)
  const def = CADASTROS.find((c) => c.id === abaId) ?? CADASTROS[0]

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[34px] leading-tight text-texto">
            Cadastros
          </h1>
          <p className="mt-1 text-[13px] text-texto-3">
            Dados usados nas demais telas do sistema.
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-1.5 rounded-campo border border-borda bg-card p-1.5">
        {CADASTROS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setAbaId(c.id)}
            className={`rounded-[7px] px-4 py-2 text-[13px] transition-colors ${
              c.id === abaId
                ? 'bg-primaria/15 font-medium text-verde-suave'
                : 'text-texto-3 hover:text-texto-2'
            }`}
          >
            {c.aba}
          </button>
        ))}
      </div>

      {/* `key` remonta a aba ao trocar, zerando estados locais da tabela. */}
      <Aba key={def.id} def={def} />
    </div>
  )
}

function Aba({ def }: { def: DefinicaoCadastro }) {
  const { lista, criar, arquivar } = useCadastro(def)
  const [modalAberto, setModalAberto] = useState(false)
  const [confirmando, setConfirmando] = useState<string | null>(null)

  const grade = `${def.colunas.map((c) => c.largura).join(' ')} 92px`

  function salvar(valores: Record<string, unknown>) {
    criar.mutate(valores, { onSuccess: () => setModalAberto(false) })
  }

  return (
    <div className="rounded-card border border-borda bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-5 py-4">
        <p className="max-w-2xl text-[13px] leading-relaxed text-texto-3">
          {def.descricao}
        </p>
        <button
          type="button"
          onClick={() => {
            criar.reset()
            setModalAberto(true)
          }}
          className="rounded-campo bg-primaria px-4 py-2.5 text-[13.5px] font-semibold whitespace-nowrap text-fundo transition-colors hover:bg-primaria-clara"
        >
          ＋ {def.botao}
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div
            className="grid gap-3 border-b border-borda px-5 py-3"
            style={{ gridTemplateColumns: grade }}
          >
            {def.colunas.map((c) => (
              <span
                key={c.chave}
                className="text-[11px] tracking-[0.06em] text-texto-3 uppercase"
              >
                {c.rotulo}
              </span>
            ))}
            <span className="text-right text-[11px] tracking-[0.06em] text-texto-3 uppercase">
              Ações
            </span>
          </div>

          {lista.isPending && (
            <p className="px-5 py-8 text-[13px] text-texto-3">Carregando…</p>
          )}

          {lista.isError && (
            <p className="px-5 py-8 text-[13px] text-terracota-clara">
              {(lista.error as Error).message}
            </p>
          )}

          {lista.data?.length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="text-[14px] text-texto-2">
                Nenhum registro cadastrado ainda.
              </p>
              <p className="mt-1 text-[13px] text-texto-3">
                Use o botão “{def.botao}” para criar o primeiro.
              </p>
            </div>
          )}

          {lista.data?.map((registro) => (
            <Linha
              key={registro.id}
              def={def}
              grade={grade}
              registro={registro}
              confirmando={confirmando === registro.id}
              aoPedirConfirmacao={() => setConfirmando(registro.id)}
              aoCancelar={() => setConfirmando(null)}
              aoArquivar={() =>
                arquivar.mutate(registro.id, {
                  onSuccess: () => setConfirmando(null),
                })
              }
            />
          ))}
        </div>
      </div>

      {arquivar.isError && (
        <p className="border-t border-borda px-5 py-3 text-[13px] text-terracota-clara">
          {(arquivar.error as Error).message}
        </p>
      )}

      {modalAberto && (
        <ModalCadastro
          def={def}
          salvando={criar.isPending}
          erroServidor={criar.isError ? (criar.error as Error).message : null}
          aoFechar={() => setModalAberto(false)}
          aoSalvar={salvar}
        />
      )}
    </div>
  )
}

function Linha({
  def,
  grade,
  registro,
  confirmando,
  aoPedirConfirmacao,
  aoCancelar,
  aoArquivar,
}: {
  def: DefinicaoCadastro
  grade: string
  registro: Registro
  confirmando: boolean
  aoPedirConfirmacao: () => void
  aoCancelar: () => void
  aoArquivar: () => void
}) {
  return (
    <div
      className="grid items-center gap-3 border-b border-borda px-5 py-3 last:border-0"
      style={{ gridTemplateColumns: grade }}
    >
      {def.colunas.map((coluna, i) => {
        const bruto = registro[coluna.chave]
        const texto = coluna.formatar
          ? coluna.formatar(bruto)
          : bruto == null || bruto === ''
            ? '—'
            : String(bruto)
        return (
          <span
            key={coluna.chave}
            title={texto}
            className={`truncate text-[13.5px] ${
              i === 0 ? 'font-medium text-texto' : 'text-texto-3'
            }`}
          >
            {texto}
          </span>
        )
      })}

      <div className="text-right">
        {confirmando ? (
          <span className="inline-flex items-center gap-2 text-[12.5px]">
            <button
              type="button"
              onClick={aoArquivar}
              className="text-terracota-clara hover:underline"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={aoCancelar}
              className="text-texto-3 hover:text-texto-2"
            >
              Não
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={aoPedirConfirmacao}
            className="text-[12.5px] text-texto-3 transition-colors hover:text-terracota-clara"
          >
            Arquivar
          </button>
        )}
      </div>
    </div>
  )
}
