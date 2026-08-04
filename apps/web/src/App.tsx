import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

/**
 * Página de conferência do Passo 1.
 *
 * Serve para validar, de olho, que a base está de pé: fontes carregando,
 * paleta correta e conexão com o Supabase respondendo. É descartada assim que
 * a tela de login entrar no lugar.
 */

type Estado = 'verificando' | 'conectado' | 'falhou'

const PALETA = [
  ['Fundo', 'bg-fundo', '#161c0d'],
  ['Card', 'bg-card', '#212a14'],
  ['Primária', 'bg-primaria', '#93a35f'],
  ['Primária clara', 'bg-primaria-clara', '#a8b76e'],
  ['Verde escuro', 'bg-verde-escuro', '#7d9a4a'],
  ['Verde claro', 'bg-verde-claro', '#a3c47d'],
  ['Terracota', 'bg-terracota', '#c2705a'],
  ['Terracota escura', 'bg-terracota-escura', '#a9553f'],
  ['Neutro', 'bg-neutro', '#cbd0b0'],
  ['Neutro claro', 'bg-neutro-claro', '#d8dcc4'],
] as const

export default function App() {
  const [banco, setBanco] = useState<Estado>('verificando')
  const [detalhe, setDetalhe] = useState('')

  useEffect(() => {
    // Uma consulta que o banco DEVE recusar enquanto ninguém está logado.
    // Receber a recusa já prova duas coisas: o servidor respondeu e a trava
    // de segurança está em pé.
    supabase
      .from('socios')
      .select('id')
      .limit(1)
      .then(({ error }) => {
        if (!error) {
          setBanco('falhou')
          setDetalhe('O banco respondeu SEM exigir login — a trava não está funcionando.')
        } else if (error.code === '42501' || error.code === 'PGRST301') {
          setBanco('conectado')
          setDetalhe('Acesso corretamente negado sem login.')
        } else {
          setBanco('falhou')
          setDetalhe(`${error.code ?? 'erro'}: ${error.message}`)
        }
      })
  }, [])

  const cor =
    banco === 'conectado' ? 'text-verde-claro'
    : banco === 'falhou' ? 'text-terracota-clara'
    : 'text-texto-3'

  return (
    <div className="min-h-screen bg-fundo px-10 py-12">
      <header className="mb-10">
        <h1 className="font-serif text-[34px] italic leading-tight text-texto">
          Villa Serenità
        </h1>
        <p className="mt-1 text-[11px] tracking-[0.08em] text-texto-3 uppercase">
          Santa Teresa · ES
        </p>
      </header>

      <div className="grid max-w-5xl gap-5 md:grid-cols-2">
        <section className="rounded-card border border-borda bg-card p-6">
          <h2 className="font-serif text-xl text-texto">Tipografia</h2>
          <p className="mt-4 font-serif text-3xl text-texto">
            Prestação de contas
          </p>
          <p className="text-[11px] tracking-[0.06em] text-texto-3 uppercase">
            Instrument Serif — títulos
          </p>
          <p className="mt-5 text-sm text-texto-2">
            Reserva confirmada · Rifugio Fieline · R$ 1.240,00
          </p>
          <p className="text-sm font-semibold text-texto">
            Peso 600 — usado em botões e destaques
          </p>
          <p className="text-[11px] tracking-[0.06em] text-texto-3 uppercase">
            Instrument Sans — interface
          </p>
        </section>

        <section className="rounded-card border border-borda bg-card p-6">
          <h2 className="font-serif text-xl text-texto">Conexão com o banco</h2>
          <p className={`mt-4 text-sm font-medium ${cor}`}>
            {banco === 'verificando' && 'Verificando…'}
            {banco === 'conectado' && '✓ Conectado ao Supabase'}
            {banco === 'falhou' && '✕ Problema na conexão'}
          </p>
          {detalhe && <p className="mt-1 text-[13px] text-texto-3">{detalhe}</p>}

          <div className="mt-6 border-t border-borda pt-4">
            <p className="text-[13px] text-texto-2">
              Ninguém consegue ler dados ainda — nem você. O login com Google
              entra no Passo 2.
            </p>
          </div>
        </section>

        <section className="rounded-card border border-borda bg-card p-6 md:col-span-2">
          <h2 className="font-serif text-xl text-texto">Paleta</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {PALETA.map(([nome, classe, hex]) => (
              <div key={nome}>
                <div
                  className={`h-14 rounded-campo border border-borda-campo ${classe}`}
                />
                <p className="mt-1.5 text-[12px] text-texto-2">{nome}</p>
                <p className="text-[11px] text-apagado">{hex}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
