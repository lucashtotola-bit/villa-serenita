/** Navegação e rótulos de mês, em pt-BR. */

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** A data de hoje em ISO ('2026-08-05') — o formato de todo o aplicativo. */
export function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Primeiro dia do mês corrente, no formato 'AAAA-MM-01'. */
export function competenciaAtual(): string {
  const hoje = new Date()
  return competencia(hoje.getFullYear(), hoje.getMonth())
}

function competencia(ano: number, mes: number): string {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-01`
}

/** Move a competência em N meses (negativo volta). */
export function deslocarMes(comp: string, n: number): string {
  const [ano, mes] = comp.split('-').map(Number)
  // Date lida com a virada de ano sozinho: mês 12 vira janeiro do ano seguinte.
  const d = new Date(ano, mes - 1 + n, 1)
  return competencia(d.getFullYear(), d.getMonth())
}

/** '2026-07-01' -> 'julho de 2026'. */
export function rotuloMes(comp: string): string {
  const [ano, mes] = comp.split('-').map(Number)
  return `${MESES[mes - 1]} de ${ano}`
}

/** Intervalo semiaberto do mês: início inclusivo, fim exclusivo. */
export function limitesDoMes(comp: string): { inicio: string; fim: string } {
  return { inicio: comp, fim: deslocarMes(comp, 1) }
}

/** '2026-07-28' -> '28/07'. */
export function diaMes(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

/**
 * '2026-01-31' + 1 mês -> '2026-02-28'. Usado no escalonamento de parcelas de
 * dívida, que seguem periodicidade e não intervalo fixo de dias. Vencimento
 * que não existe no mês de destino cai no último dia dele, como faz o banco.
 */
export function adicionarMeses(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const ultimoDia = new Date(ano, mes - 1 + meses + 1, 0).getDate()
  const d = new Date(ano, mes - 1 + meses, Math.min(dia, ultimoDia))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** '2026-07-01' + 30 -> '2026-07-31'. Usado no escalonamento de parcelas. */
export function adicionarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const d = new Date(ano, mes - 1, dia + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
