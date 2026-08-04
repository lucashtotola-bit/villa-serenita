import { useEffect, useState } from 'react'
import { useAuth } from '../auth/contexto'
import { supabase } from '../lib/supabase'
import type { Socio } from '../lib/tipos'

/**
 * Tela temporária do Passo 2, só para conferir que o acesso funcionou de ponta
 * a ponta. Sai no Passo 3, quando entram o menu lateral e as telas de verdade.
 *
 * A lista de sócios abaixo é a prova mais direta: antes de entrar, o banco
 * recusava esta mesma consulta.
 */
export function Entrou() {
  const { socio, sair } = useAuth()
  const [socios, setSocios] = useState<Socio[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('socios')
      .select('*')
      .order('nome_curto')
      .then(({ data, error }) => {
        if (error) setErro(error.message)
        else setSocios(data as Socio[])
      })
  }, [])

  return (
    <div className="min-h-screen bg-fundo px-10 py-12">
      <header className="mb-9 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[34px] leading-tight italic text-texto">
            Villa Serenità
          </h1>
          <p className="mt-1 text-[11px] tracking-[0.08em] text-texto-3 uppercase">
            Santa Teresa · ES
          </p>
        </div>
        <button
          type="button"
          onClick={sair}
          className="rounded-campo border border-borda-campo px-4 py-2 text-[13px] text-texto-2 transition-colors hover:border-primaria hover:text-primaria-clara"
        >
          Sair
        </button>
      </header>

      <div className="grid max-w-4xl gap-5">
        <section className="rounded-card border border-borda bg-card p-6">
          <p className="text-[13px] text-texto-3">Você entrou como</p>
          <p className="mt-1 font-serif text-[26px] text-texto">
            {socio?.nome_completo}
          </p>
          <p className="mt-1 text-[13px] text-texto-2">{socio?.email}</p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Selo texto={`Cota ${socio?.cota}%`} />
            {socio?.pode_receber_nf && <Selo texto="Pode receber nota fiscal" />}
            {socio?.pode_desfazer_conciliacao && (
              <Selo texto="Pode desfazer conciliação" destaque />
            )}
          </div>
        </section>

        <section className="rounded-card border border-borda bg-card p-6">
          <h2 className="font-serif text-xl text-texto">Sócios</h2>
          <p className="mt-1 text-[13px] text-texto-3">
            Esta consulta era recusada antes de você entrar.
          </p>

          {erro && <p className="mt-4 text-[13px] text-terracota-clara">{erro}</p>}
          {!socios && !erro && (
            <p className="mt-4 text-[13px] text-texto-3">Carregando…</p>
          )}

          {socios && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-borda">
                    {['Sócio', 'Cota', 'Acessa o app', 'Recebe NF'].map((t) => (
                      <th
                        key={t}
                        className="pb-2.5 text-[11px] font-medium tracking-[0.06em] text-texto-3 uppercase"
                      >
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {socios.map((s) => (
                    <tr key={s.id} className="border-b border-borda last:border-0">
                      <td className="py-3 text-[13.5px] font-medium text-texto">
                        {s.nome_completo}
                      </td>
                      <td className="py-3 text-[13.5px] text-texto-2">{s.cota}%</td>
                      <td className="py-3 text-[13.5px] text-texto-2">
                        {s.pode_entrar ? 'Sim' : '—'}
                      </td>
                      <td className="py-3 text-[13.5px] text-texto-2">
                        {s.pode_receber_nf ? 'Sim' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Selo({ texto, destaque }: { texto: string; destaque?: boolean }) {
  return (
    <span
      className={`rounded-pill px-3 py-1 text-[12px] ${
        destaque
          ? 'bg-primaria/20 text-verde-suave'
          : 'border border-borda-campo text-texto-2'
      }`}
    >
      {texto}
    </span>
  )
}
