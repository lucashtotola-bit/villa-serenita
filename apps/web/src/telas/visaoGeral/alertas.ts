import type { CompromissoAberto } from '../../dados/visaoGeral'
import { decimalParaCentavos, formatarDinheiro } from '../../lib/formato'
import { adicionarDias, diaMes, rotuloMes } from '../../lib/periodo'

export type Alerta = {
  id: string
  /** urgente = já passou do prazo; atencao = está chegando; calmo = informativo. */
  nivel: 'urgente' | 'atencao' | 'calmo'
  titulo: string
  descricao: string
  caminho: string
}

type Entrada = {
  hoje: string
  competenciaAnterior: string
  compromissos: CompromissoAberto[]
  naoConciliados: number
  notasSemAnexo: { numero: string; emitente: string; dias_aguardando: number }[]
  mesAnteriorFechado: boolean
  preReservasProximas: { nome: string; data_entrada: string }[]
}

/**
 * Monta os alertas do painel a partir do estado real do sistema.
 *
 * A regra que guiou o que entra aqui: **só aparece o que pede uma ação**. Um
 * painel que avisa de tudo é um painel que ninguém lê — e no protótipo os
 * alertas eram texto fixo, o que é a versão extrema desse problema. Quando
 * não há nada a fazer, a lista fica vazia de propósito, e a tela diz isso.
 *
 * A ordenação é por urgência, e não por assunto: quem abre o app de manhã
 * precisa ver primeiro o que já venceu.
 */
export function montarAlertas(e: Entrada): Alerta[] {
  const alertas: Alerta[] = []
  const em7 = adicionarDias(e.hoje, 7)

  // 1. Vencidos — dinheiro que já devia ter saído ou entrado.
  const vencidos = e.compromissos.filter((c) => c.data_vencimento < e.hoje)
  if (vencidos.length) {
    const total = vencidos.reduce((t, c) => t + decimalParaCentavos(c.valor), 0)
    const despesas = vencidos.filter((c) => c.tipo === 'Despesa').length
    alertas.push({
      id: 'vencidos',
      nivel: 'urgente',
      titulo:
        vencidos.length === 1
          ? `${vencidos[0].descricao} venceu`
          : `${vencidos.length} compromissos vencidos`,
      descricao:
        `${formatarDinheiro(total)} — ` +
        (despesas === vencidos.length
          ? 'a pagar'
          : despesas === 0
            ? 'a receber'
            : `${despesas} a pagar, ${vencidos.length - despesas} a receber`) +
        `, o mais antigo em ${diaMes(vencidos[0].data_vencimento)}`,
      caminho: '/contas',
    })
  }

  // 2. Vence nos próximos 7 dias.
  const proximos = e.compromissos.filter(
    (c) => c.data_vencimento >= e.hoje && c.data_vencimento <= em7,
  )
  if (proximos.length) {
    const total = proximos.reduce((t, c) => t + decimalParaCentavos(c.valor), 0)
    alertas.push({
      id: 'vence-em-7',
      nivel: 'atencao',
      titulo: `${proximos.length} compromisso${proximos.length > 1 ? 's' : ''} nos próximos 7 dias`,
      descricao: `${formatarDinheiro(total)} — o primeiro em ${diaMes(proximos[0].data_vencimento)}`,
      caminho: '/contas',
    })
  }

  // 3. Pré-reserva com chegada próxima: ou confirma, ou libera a data.
  if (e.preReservasProximas.length) {
    const r = e.preReservasProximas[0]
    alertas.push({
      id: 'pre-reservas',
      nivel: 'atencao',
      titulo:
        e.preReservasProximas.length === 1
          ? `Pré-reserva de ${r.nome} chega em ${diaMes(r.data_entrada)}`
          : `${e.preReservasProximas.length} pré-reservas chegam em breve`,
      descricao: 'Confirme para gerar a receita, ou cancele para liberar a data.',
      caminho: '/reservas',
    })
  }

  // 4. Notas sem documento: seguram o fechamento do mês da emissão.
  if (e.notasSemAnexo.length) {
    const maisAntiga = e.notasSemAnexo[0]
    alertas.push({
      id: 'notas-sem-anexo',
      nivel: maisAntiga.dias_aguardando > 30 ? 'urgente' : 'atencao',
      titulo: `${e.notasSemAnexo.length} nota${e.notasSemAnexo.length > 1 ? 's' : ''} sem documento anexado`,
      descricao:
        `A mais antiga é a NF ${maisAntiga.numero} de ${maisAntiga.emitente}, ` +
        `há ${maisAntiga.dias_aguardando} dia(s). O mês não fecha assim.`,
      caminho: '/notas-fiscais',
    })
  }

  // 5. Conciliação pendente do mês anterior — o que trava a prestação.
  if (e.naoConciliados > 0) {
    alertas.push({
      id: 'nao-conciliados',
      nivel: e.mesAnteriorFechado ? 'calmo' : 'atencao',
      titulo: `${e.naoConciliados} lançamento${e.naoConciliados > 1 ? 's' : ''} sem conciliar em ${rotuloMes(e.competenciaAnterior)}`,
      descricao: 'Importe o extrato e concilie para poder fechar o mês.',
      caminho: '/conciliacao',
    })
  }

  // 6. Mês anterior ainda aberto — só quando não há mais nada travando.
  if (!e.mesAnteriorFechado && e.naoConciliados === 0 && !e.notasSemAnexo.length) {
    alertas.push({
      id: 'mes-aberto',
      nivel: 'calmo',
      titulo: `${rotuloMes(e.competenciaAnterior)} está pronto para fechar`,
      descricao: 'Sem pendências de conciliação nem de documento.',
      caminho: '/prestacao-de-contas',
    })
  }

  const ordem = { urgente: 0, atencao: 1, calmo: 2 }
  return alertas.sort((a, b) => ordem[a.nivel] - ordem[b.nivel])
}
