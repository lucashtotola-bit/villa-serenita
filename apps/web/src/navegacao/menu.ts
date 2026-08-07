/**
 * Menu lateral, reproduzido do protótipo (spec/prototipo, linhas 1248-1252).
 *
 * Os ícones são glifos tipográficos, não emoji nem biblioteca de ícones —
 * decisão registrada no CLAUDE.md ("sem emoji decorativo").
 */
export type ItemMenu = {
  caminho: string
  icone: string
  rotulo: string
}

export type GrupoMenu = {
  titulo: string
  itens: ItemMenu[]
}

export const MENU: GrupoMenu[] = [
  {
    titulo: 'Operação',
    itens: [
      { caminho: '/', icone: '◈', rotulo: 'Visão geral' },
      { caminho: '/calendario', icone: '▦', rotulo: 'Calendário' },
      { caminho: '/reservas', icone: '◍', rotulo: 'Reservas' },
      { caminho: '/cafe', icone: '✳', rotulo: 'Café' },
    ],
  },
  {
    titulo: 'Financeiro',
    itens: [
      { caminho: '/lancamentos', icone: '◎', rotulo: 'Lançamentos' },
      { caminho: '/contas', icone: '⊟', rotulo: 'Contas a pagar/receber' },
      { caminho: '/notas-fiscais', icone: '▣', rotulo: 'Notas fiscais' },
      { caminho: '/dividas', icone: '◇', rotulo: 'Dívidas' },
      { caminho: '/conciliacao', icone: '⇄', rotulo: 'Conciliação' },
      { caminho: '/prestacao-de-contas', icone: '◫', rotulo: 'Prestação de contas' },
      { caminho: '/aportes', icone: '⊕', rotulo: 'Aportes' },
      { caminho: '/distribuicao', icone: '◔', rotulo: 'Distribuição' },
    ],
  },
  {
    titulo: 'Configuração',
    itens: [
      { caminho: '/cadastros', icone: '☰', rotulo: 'Cadastros' },
      { caminho: '/safras', icone: '❋', rotulo: 'Safras' },
      { caminho: '/historico', icone: '⟳', rotulo: 'Histórico' },
    ],
  },
]

export const ITENS_MENU: ItemMenu[] = MENU.flatMap((g) => g.itens)
