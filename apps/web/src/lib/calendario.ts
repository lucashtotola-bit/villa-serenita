/**
 * Apoio à grade do calendário de reservas.
 *
 * O conceito central aqui é a **noite vendável**: sexta e sábado (e a véspera
 * de feriado). A propriedade é de fim de semana, então ocupação medida contra
 * o mês inteiro engana — encher todas as terças de julho não é resultado.
 * Herdado do protótipo, onde já era assim.
 */

/** Dias que o mês tem. */
export function diasDoMes(comp: string): number {
  const [ano, mes] = comp.split('-').map(Number)
  return new Date(ano, mes, 0).getDate()
}

/** Em que dia da semana cai o dia 1 (0 = domingo), para alinhar a grade. */
export function diaSemanaDoPrimeiro(comp: string): number {
  const [ano, mes] = comp.split('-').map(Number)
  return new Date(ano, mes - 1, 1).getDay()
}

/** Dia do mês -> data ISO completa. */
export function dataDoDia(comp: string, dia: number): string {
  return `${comp.slice(0, 7)}-${String(dia).padStart(2, '0')}`
}

/**
 * Sexta ou sábado. Feriados entram quando houver cadastro deles — hoje o
 * projeto não tem essa tabela, e inventar uma lista fixa envelheceria mal.
 */
export function noiteVendavel(comp: string, dia: number): boolean {
  const [ano, mes] = comp.split('-').map(Number)
  const semana = new Date(ano, mes - 1, dia).getDay()
  return semana === 5 || semana === 6
}

/** Quantas noites vendáveis o mês tem — o denominador da ocupação. */
export function noitesVendaveisNoMes(comp: string): number {
  let total = 0
  for (let d = 1; d <= diasDoMes(comp); d++) {
    if (noiteVendavel(comp, d)) total++
  }
  return total
}

export const LETRAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/**
 * Cor de cada canal na grade, herdada do protótipo. 'Indicação' e 'Direto'
 * não existiam lá e receberam tons da mesma paleta.
 */
export const CORES_CANAL: Record<string, { fundo: string; texto: string }> = {
  Airbnb: { fundo: '#c2705a', texto: '#20100b' },
  WhatsApp: { fundo: '#8aab55', texto: '#161c0d' },
  Instagram: { fundo: '#cbd0b0', texto: '#161c0d' },
  Indicação: { fundo: '#7d8f6a', texto: '#161c0d' },
  Direto: { fundo: '#a8b088', texto: '#161c0d' },
}

export function corDoCanal(canal: string) {
  return CORES_CANAL[canal] ?? { fundo: '#93a35f', texto: '#161c0d' }
}
