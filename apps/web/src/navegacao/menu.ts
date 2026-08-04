/**
 * Menu lateral, reproduzido do protótipo (spec/prototipo, linhas 1248-1252).
 *
 * Os ícones são glifos tipográficos, não emoji nem biblioteca de ícones —
 * decisão registrada no CLAUDE.md ("sem emoji decorativo").
 *
 * `etapa` indica em qual etapa do projeto a tela fica pronta. Enquanto estiver
 * preenchido, o item abre um aviso de "em construção" em vez da tela real.
 */
export type ItemMenu = {
  caminho: string
  icone: string
  rotulo: string
  /** Etapa em que a tela é construída. Ausente = já está pronta. */
  etapa?: number
  /** O que a tela vai fazer, mostrado no aviso de em construção. */
  resumo?: string
}

export type GrupoMenu = {
  titulo: string
  itens: ItemMenu[]
}

export const MENU: GrupoMenu[] = [
  {
    titulo: 'Operação',
    itens: [
      {
        caminho: '/',
        icone: '◈',
        rotulo: 'Visão geral',
        etapa: 9,
        resumo:
          'Painéis com receita e despesa do mês, próximas chegadas, alertas e ' +
          'notas fiscais acumuladas por sócio.',
      },
      {
        caminho: '/calendario',
        icone: '▦',
        rotulo: 'Calendário',
        etapa: 4,
        resumo: 'Ocupação das três acomodações mês a mês, com filtro por canal.',
      },
      {
        caminho: '/reservas',
        icone: '◍',
        rotulo: 'Reservas',
        etapa: 4,
        resumo:
          'Lista de reservas, cadastro de nova reserva com hóspede obrigatório ' +
          'e o detalhe de cada estadia.',
      },
      {
        caminho: '/cafe',
        icone: '✳',
        rotulo: 'Café',
        etapa: 5,
        resumo: 'Etapas da safra, custos, estoque e vendas de café.',
      },
    ],
  },
  {
    titulo: 'Financeiro',
    itens: [
      {
        caminho: '/lancamentos',
        icone: '◎',
        rotulo: 'Lançamentos',
        etapa: 2,
        resumo:
          'Receitas, despesas, transferências entre contas, dívidas e ' +
          'prestação de contas.',
      },
      {
        caminho: '/notas-fiscais',
        icone: '▣',
        rotulo: 'Notas fiscais',
        etapa: 3,
        resumo:
          'Notas emitidas contra Lucas ou Michel, com anexo obrigatório e ' +
          'parcelamento.',
      },
      {
        caminho: '/conciliacao',
        icone: '⇄',
        rotulo: 'Conciliação',
        etapa: 6,
        resumo:
          'Importação do extrato OFX e conferência linha a linha contra os ' +
          'lançamentos.',
      },
    ],
  },
  {
    titulo: 'Configuração',
    itens: [
      { caminho: '/cadastros', icone: '☰', rotulo: 'Cadastros' },
      {
        caminho: '/safras',
        icone: '❋',
        rotulo: 'Safras',
        etapa: 5,
        resumo:
          'Datas das etapas da safra e expectativa de colheita. É a fonte do ' +
          'status exibido na tela do Café.',
      },
    ],
  },
]

export const ITENS_MENU: ItemMenu[] = MENU.flatMap((g) => g.itens)
