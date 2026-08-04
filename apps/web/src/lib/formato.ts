/**
 * Máscaras e formatação em pt-BR.
 *
 * Dinheiro é sempre tratado como INTEIRO DE CENTAVOS aqui dentro. Números
 * decimais do JavaScript erram em somas simples (0.1 + 0.2 = 0.30000000000000004),
 * e num sistema contábil esse erro vira divergência de saldo. A conversão para
 * decimal acontece só na fronteira com o banco, que usa numeric(14,2).
 */

/** Deixa só os dígitos: '(27) 99812-4410' -> '27998124410'. */
export function soDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/** 12844091705 -> '128.440.917-05' (parcial enquanto digita). */
export function mascaraCPF(valor: string): string {
  const d = soDigitos(valor).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
}

/** 27114902000140 -> '27.114.902/0001-40' (parcial enquanto digita). */
export function mascaraCNPJ(valor: string): string {
  const d = soDigitos(valor).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

/**
 * Alterna entre CPF e CNPJ conforme a quantidade digitada, como no protótipo:
 * até 11 dígitos usa máscara de CPF; acima disso, de CNPJ.
 */
export function mascaraDocumento(valor: string): string {
  const d = soDigitos(valor)
  return d.length <= 11 ? mascaraCPF(d) : mascaraCNPJ(d)
}

/** '(27) 99812-4410' — aceita fixo (10) e celular (11). */
export function mascaraTelefone(valor: string): string {
  const d = soDigitos(valor).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/**
 * Contato aceita telefone ou texto livre ('chat Airbnb', um e-mail...), como
 * no protótipo. Só aplica máscara quando o conteúdo é claramente numérico.
 */
export function mascaraContato(valor: string): string {
  const temLetra = /[a-zA-ZÀ-ÿ@]/.test(valor)
  return temLetra ? valor : mascaraTelefone(valor)
}

/** '1.234,50' -> 123450 centavos. Ignora o que não for dígito. */
export function paraCentavos(valor: string): number {
  const d = soDigitos(valor)
  return d ? parseInt(d, 10) : 0
}

/** 123450 -> '1.234,50' — o que aparece no campo enquanto se digita. */
export function mascaraDinheiro(valor: string): string {
  const centavos = paraCentavos(valor)
  const reais = Math.floor(centavos / 100)
  const resto = String(centavos % 100).padStart(2, '0')
  return `${reais.toLocaleString('pt-BR')},${resto}`
}

/** 123450 -> 'R$ 1.234,50'. */
export function formatarDinheiro(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

/** 123450 -> '1234.50' — a forma que o Postgres espera em numeric(14,2). */
export function centavosParaDecimal(centavos: number): string {
  const sinal = centavos < 0 ? '-' : ''
  const abs = Math.abs(centavos)
  return `${sinal}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** '1234.50' (vindo do banco) -> 123450 centavos. */
export function decimalParaCentavos(valor: string | number): number {
  return Math.round(Number(valor) * 100)
}

/** '2026-08-04' -> '04/08/2026'. */
export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}
