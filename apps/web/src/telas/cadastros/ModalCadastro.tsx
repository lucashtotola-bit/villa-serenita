import { useEffect, useMemo, useState } from 'react'
import {
  centavosParaDecimal,
  mascaraCPF,
  mascaraContato,
  mascaraDinheiro,
  mascaraDocumento,
  paraCentavos,
  soDigitos,
} from '../../lib/formato'
import type { Campo, DefinicaoCadastro } from './definicoes'

type Props = {
  def: DefinicaoCadastro
  salvando: boolean
  erroServidor: string | null
  aoFechar: () => void
  aoSalvar: (valores: Record<string, unknown>) => void
}

const hoje = () => new Date().toISOString().slice(0, 10)

function valoresIniciais(def: DefinicaoCadastro): Record<string, string> {
  const inicial: Record<string, string> = {}
  for (const campo of def.campos) {
    if (campo.tipo === 'select') {
      // Select obrigatório já vem na primeira opção, como no protótipo;
      // opcional começa vazio para não inventar dado.
      inicial[campo.chave] = campo.obrigatorio ? (campo.opcoes?.[0] ?? '') : ''
    } else if (campo.tipo === 'data') {
      inicial[campo.chave] = hoje()
    } else {
      inicial[campo.chave] = ''
    }
  }
  return inicial
}

function aplicarMascara(campo: Campo, valor: string): string {
  switch (campo.tipo) {
    case 'cpf':
      return mascaraCPF(valor)
    case 'documento':
      return mascaraDocumento(valor)
    case 'contato':
      return mascaraContato(valor)
    case 'dinheiro':
      return mascaraDinheiro(valor)
    default:
      return valor
  }
}

/** Converte o que está na tela para o formato que o banco espera. */
function paraBanco(campo: Campo, valor: string): unknown {
  const limpo = valor.trim()
  switch (campo.tipo) {
    case 'cpf':
    case 'documento':
      return soDigitos(limpo)
    case 'dinheiro':
      return centavosParaDecimal(paraCentavos(limpo))
    default:
      return limpo === '' ? null : limpo
  }
}

export function ModalCadastro({
  def,
  salvando,
  erroServidor,
  aoFechar,
  aoSalvar,
}: Props) {
  const [valores, setValores] = useState(() => valoresIniciais(def))
  const [erro, setErro] = useState<string | null>(null)

  // Fechar com Esc, como se espera de qualquer janela.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  const mensagem = erro ?? erroServidor

  const completo = useMemo(
    () => def.campos.every((c) => !c.obrigatorio || valores[c.chave]?.trim()),
    [def.campos, valores],
  )

  function alterar(campo: Campo, bruto: string) {
    setValores((v) => ({ ...v, [campo.chave]: aplicarMascara(campo, bruto) }))
    setErro(null)
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault()

    const faltando = def.campos
      .filter((c) => c.obrigatorio && !valores[c.chave]?.trim())
      .map((c) => c.rotulo)
    if (faltando.length) {
      setErro(`Preencha: ${faltando.join(', ')}.`)
      return
    }

    // As mesmas conferências que o banco faz, adiantadas para dar uma
    // mensagem melhor do que a recusa do Postgres.
    for (const campo of def.campos) {
      const digitos = soDigitos(valores[campo.chave] ?? '')
      if (campo.tipo === 'cpf' && digitos.length !== 11) {
        setErro('CPF inválido — informe os 11 dígitos.')
        return
      }
      if (
        campo.tipo === 'documento' &&
        digitos.length !== 11 &&
        digitos.length !== 14
      ) {
        setErro('CNPJ/CPF inválido — informe 11 dígitos (CPF) ou 14 (CNPJ).')
        return
      }
    }

    const dados: Record<string, unknown> = {}
    for (const campo of def.campos) {
      dados[campo.chave] = paraBanco(campo, valores[campo.chave] ?? '')
    }
    aoSalvar(dados)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(10,14,6,0.72)] px-4 py-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar()
      }}
    >
      <form
        onSubmit={enviar}
        role="dialog"
        aria-modal="true"
        aria-label={def.titulo}
        className="w-full max-w-[560px] rounded-card border border-borda bg-card p-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <h2 className="font-serif text-[22px] text-texto">{def.titulo}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-texto-3">
          {def.descricao}
        </p>

        <div className="mt-5 flex flex-col gap-3.5">
          {def.campos.map((campo) => (
            <label key={campo.chave} className="block">
              <span className="mb-1.5 block text-[11px] tracking-[0.06em] text-texto-3 uppercase">
                {campo.rotulo}
                {campo.obrigatorio && <span className="text-primaria"> *</span>}
              </span>

              {campo.tipo === 'select' ? (
                <select
                  value={valores[campo.chave] ?? ''}
                  onChange={(e) => alterar(campo, e.target.value)}
                  className="w-full min-w-0 rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 text-[14px] text-texto outline-none focus:border-primaria"
                >
                  {!campo.obrigatorio && <option value="">—</option>}
                  {campo.opcoes?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={
                    campo.tipo === 'data' ? 'date'
                    : campo.tipo === 'email' ? 'email'
                    : 'text'
                  }
                  inputMode={
                    campo.tipo === 'cpf' ||
                    campo.tipo === 'documento' ||
                    campo.tipo === 'dinheiro'
                      ? 'numeric'
                      : undefined
                  }
                  value={valores[campo.chave] ?? ''}
                  placeholder={campo.placeholder}
                  onChange={(e) => alterar(campo, e.target.value)}
                  className="box-border w-full min-w-0 rounded-campo border border-borda-campo bg-fundo px-3 py-2.5 text-[14px] text-texto placeholder:text-apagado outline-none focus:border-primaria"
                />
              )}

              {campo.dica && (
                <span className="mt-1 block text-[11.5px] leading-relaxed text-apagado">
                  {campo.dica}
                </span>
              )}
            </label>
          ))}
        </div>

        {mensagem && (
          <p className="mt-4 rounded-campo border border-terracota-escura bg-terracota-escura/15 px-3 py-2.5 text-[13px] text-terracota-clara">
            {mensagem}
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
            type="submit"
            disabled={salvando}
            className={`rounded-campo px-5 py-2.5 text-[13.5px] font-semibold text-fundo transition-colors ${
              completo && !salvando
                ? 'bg-primaria hover:bg-primaria-clara'
                : 'bg-primaria/55'
            }`}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
