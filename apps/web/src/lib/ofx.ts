/**
 * Leitor de extrato OFX.
 *
 * OFX é um formato antigo e mal comportado. Existem duas gerações — a 1.x, que
 * é SGML e deixa as tags abertas (`<FITID>123` sem fechar), e a 2.x, que é XML
 * de verdade — e cada banco escreve do seu jeito dentro disso: vírgula ou ponto
 * no decimal, acentuação em Windows-1252 ou UTF-8, campos opcionais ausentes.
 *
 * Por isso aqui não há parser de XML: os blocos de movimento são extraídos por
 * varredura de texto, que é o que atravessa as duas gerações sem quebrar. É
 * feio de propósito — um parser correto recusaria arquivos que os bancos
 * mandam todo dia.
 */

export type MovimentoOfx = {
  /** Identificador único e estável do movimento no banco (FITID). */
  identificador: string
  data: string
  descricao: string
  /** Com sinal, como o banco informa: negativo é débito. Em centavos. */
  centavos: number
}

export type ExtratoOfx = {
  /** Conta informada dentro do arquivo, quando existe — só para conferência. */
  contaBanco: string | null
  agencia: string | null
  periodoInicio: string | null
  periodoFim: string | null
  movimentos: MovimentoOfx[]
}

export class ErroOfx extends Error {}

/**
 * Descobre a codificação pelo cabeçalho e decodifica.
 *
 * Bancos brasileiros costumam mandar Windows-1252. Ler esse arquivo como UTF-8
 * transforma "TRANSFERÊNCIA" em "TRANSFERÃŠNCIA" — o extrato até funciona, mas
 * fica ilegível na tela justamente onde o usuário precisa reconhecer o
 * movimento.
 */
function decodificar(bytes: ArrayBuffer): string {
  // O cabeçalho é sempre ASCII, então pode ser lido antes de saber o resto.
  const inicio = new TextDecoder('ascii').decode(bytes.slice(0, 512)).toUpperCase()

  const ehUtf8 =
    inicio.includes('CHARSET:UTF-8') ||
    inicio.includes('ENCODING="UTF-8"') ||
    inicio.includes("ENCODING='UTF-8'")

  // 1252 cobre tanto CHARSET:1252 quanto o silêncio dos arquivos mais antigos.
  const rotulo = ehUtf8 ? 'utf-8' : 'windows-1252'

  try {
    return new TextDecoder(rotulo).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/**
 * Lê o conteúdo de uma tag. Cobre as duas gerações: para na tag de fechamento
 * se houver uma, ou na próxima tag que abrir, que é como a 1.x delimita.
 */
function campo(bloco: string, nome: string): string | null {
  const re = new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i')
  const achado = re.exec(bloco)
  return achado ? achado[1].trim() : null
}

/** '20260710120000[-3:BRT]' -> '2026-07-10'. */
function lerData(bruto: string | null): string | null {
  if (!bruto) return null
  const digitos = bruto.replace(/\D/g, '')
  if (digitos.length < 8) return null
  return `${digitos.slice(0, 4)}-${digitos.slice(4, 6)}-${digitos.slice(6, 8)}`
}

/**
 * '-1.234,56' e '-1234.56' são o mesmo valor escrito por bancos diferentes.
 *
 * A regra: o último separador é o decimal se tiver 1 ou 2 dígitos depois;
 * qualquer outro separador é milhar e some. Sem isso, '1.234' viraria R$ 1,23.
 */
export function centavosDeOfx(bruto: string): number | null {
  const limpo = bruto.trim().replace(/\s/g, '')
  if (!/\d/.test(limpo)) return null

  const negativo = limpo.startsWith('-')
  const semSinal = limpo.replace(/^[+-]/, '')

  const decimal = /[.,](\d{1,2})$/.exec(semSinal)
  let centavos: number

  if (decimal) {
    const reais = semSinal.slice(0, decimal.index).replace(/\D/g, '')
    const fracao = decimal[1].padEnd(2, '0')
    centavos = parseInt(reais || '0', 10) * 100 + parseInt(fracao, 10)
  } else {
    centavos = parseInt(semSinal.replace(/\D/g, ''), 10) * 100
  }

  if (Number.isNaN(centavos)) return null
  return negativo ? -centavos : centavos
}

export function lerOfx(bytes: ArrayBuffer): ExtratoOfx {
  const texto = decodificar(bytes)

  if (!/<OFX>/i.test(texto) && !/<STMTTRN>/i.test(texto)) {
    throw new ErroOfx(
      'Este arquivo não parece ser um extrato OFX. Baixe o extrato do ' +
        'internet banking no formato OFX (às vezes chamado de "Money" ou ' +
        '"arquivo para gerenciador financeiro").',
    )
  }

  const blocos = texto.match(/<STMTTRN>[\s\S]*?(?:<\/STMTTRN>|(?=<STMTTRN>)|$)/gi) ?? []

  const movimentos: MovimentoOfx[] = []
  const vistos = new Set<string>()

  for (const bloco of blocos) {
    const data = lerData(campo(bloco, 'DTPOSTED') ?? campo(bloco, 'DTUSER'))
    const bruto = campo(bloco, 'TRNAMT')
    const centavos = bruto === null ? null : centavosDeOfx(bruto)

    // Sem data ou sem valor não há movimento — linha corrompida, segue o baile.
    if (!data || centavos === null || centavos === 0) continue

    // MEMO costuma ser mais descritivo que NAME; alguns bancos só preenchem um.
    const memo = campo(bloco, 'MEMO')
    const nome = campo(bloco, 'NAME')
    const descricao = [nome, memo]
      .filter((p): p is string => !!p && p.length > 0)
      // Vários bancos repetem o mesmo texto nos dois campos.
      .filter((p, i, arr) => arr.indexOf(p) === i)
      .join(' · ')

    // Sem FITID o arquivo não permite detectar reimportação. Em vez de recusar
    // o extrato inteiro, monta-se uma chave com o que identifica o movimento —
    // não é perfeito, mas mantém a trava contra duplicidade funcionando.
    const fitid =
      campo(bloco, 'FITID') ?? `${data}|${centavos}|${descricao.slice(0, 40)}`

    // Alguns bancos repetem o FITID dentro do próprio arquivo. O banco de dados
    // recusaria a segunda linha e derrubaria a importação inteira.
    if (vistos.has(fitid)) continue
    vistos.add(fitid)

    movimentos.push({
      identificador: fitid,
      data,
      descricao: descricao || 'Movimento sem descrição',
      centavos,
    })
  }

  if (!movimentos.length) {
    throw new ErroOfx(
      'Nenhum movimento foi encontrado neste arquivo. Confira se o extrato ' +
        'cobre um período com movimentação.',
    )
  }

  const datas = movimentos.map((m) => m.data).sort()

  return {
    contaBanco: campo(texto, 'ACCTID'),
    agencia: campo(texto, 'BRANCHID'),
    periodoInicio: lerData(campo(texto, 'DTSTART')) ?? datas[0],
    periodoFim: lerData(campo(texto, 'DTEND')) ?? datas[datas.length - 1],
    movimentos,
  }
}
