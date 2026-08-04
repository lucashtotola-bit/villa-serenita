import {
  decimalParaCentavos,
  formatarData,
  formatarDinheiro,
  mascaraCPF,
  mascaraDocumento,
} from '../../lib/formato'

/**
 * As cinco abas de Cadastros, reproduzidas do protótipo (linhas 1429-1461).
 *
 * Diferenças propositais em relação ao protótipo, decididas com o dono:
 *   - Contas bancárias trocam "Saldo atual" (digitado) por "Saldo inicial" +
 *     data. O saldo corrente passa a ser calculado a partir dos lançamentos.
 *   - Contas bancárias ganham agência e número, para reconhecer sozinhas de
 *     qual conta é o extrato OFX importado.
 *   - Remover vira arquivar: o registro sai das listas mas continua existindo
 *     nos lançamentos antigos.
 */

export type TipoCampo =
  | 'texto'
  | 'select'
  | 'cpf'
  | 'documento'
  | 'contato'
  | 'email'
  | 'dinheiro'
  | 'data'

export type Campo = {
  chave: string
  rotulo: string
  tipo: TipoCampo
  placeholder?: string
  opcoes?: string[]
  obrigatorio?: boolean
  dica?: string
}

export type Coluna = {
  chave: string
  rotulo: string
  /** Largura na grade CSS. Texto usa minmax(0,1fr) para nunca estourar. */
  largura: string
  formatar?: (valor: unknown) => string
}

export type DefinicaoCadastro = {
  id: string
  aba: string
  tabela: string
  titulo: string
  botao: string
  descricao: string
  ordenarPor: string
  colunas: Coluna[]
  campos: Campo[]
}

const TEXTO = 'minmax(0,1fr)'

const dinheiro = (v: unknown) =>
  v == null ? '—' : formatarDinheiro(decimalParaCentavos(v as string))

export const CADASTROS: DefinicaoCadastro[] = [
  {
    id: 'categorias',
    aba: 'Categorias',
    tabela: 'categorias',
    titulo: 'Nova categoria',
    botao: 'Nova categoria',
    descricao:
      'Aparece na lista de categorias ao lançar receitas e despesas.',
    ordenarPor: 'nome',
    colunas: [
      { chave: 'nome', rotulo: 'Categoria', largura: TEXTO },
      { chave: 'tipo', rotulo: 'Tipo', largura: '140px' },
    ],
    campos: [
      {
        chave: 'nome',
        rotulo: 'Nome da categoria',
        tipo: 'texto',
        placeholder: 'Ex.: Marketing e anúncios',
        obrigatorio: true,
      },
      {
        chave: 'tipo',
        rotulo: 'Tipo',
        tipo: 'select',
        opcoes: ['Despesa', 'Receita'],
        obrigatorio: true,
      },
    ],
  },
  {
    id: 'centros',
    aba: 'Centro de custo/receita',
    tabela: 'centros_custo',
    titulo: 'Novo centro',
    botao: 'Novo centro',
    descricao:
      'Substitui o antigo campo “Frente”. Usado nos relatórios por frente de operação.',
    ordenarPor: 'nome',
    colunas: [
      { chave: 'nome', rotulo: 'Centro', largura: TEXTO },
      { chave: 'tipo', rotulo: 'Tipo', largura: '180px' },
      { chave: 'observacao', rotulo: 'Observação', largura: TEXTO },
    ],
    campos: [
      {
        chave: 'nome',
        rotulo: 'Nome do centro',
        tipo: 'texto',
        placeholder: 'Ex.: Eventos e day-use',
        obrigatorio: true,
      },
      {
        chave: 'tipo',
        rotulo: 'Tipo',
        tipo: 'select',
        opcoes: ['Receita e despesa', 'Receita', 'Despesa'],
        obrigatorio: true,
      },
      {
        chave: 'observacao',
        rotulo: 'Observação',
        tipo: 'texto',
        placeholder: 'Ex.: rateio entre frentes',
      },
    ],
  },
  {
    id: 'hospedes',
    aba: 'Hóspedes',
    tabela: 'hospedes',
    titulo: 'Novo hóspede',
    botao: 'Novo hóspede',
    descricao:
      'Obrigatório ao criar uma reserva — só hóspedes cadastrados aqui aparecem na lista.',
    ordenarPor: 'nome',
    colunas: [
      { chave: 'nome', rotulo: 'Hóspede', largura: TEXTO },
      {
        chave: 'cpf',
        rotulo: 'CPF',
        largura: '150px',
        formatar: (v) => (v ? mascaraCPF(String(v)) : '—'),
      },
      { chave: 'contato', rotulo: 'Contato', largura: '160px' },
      { chave: 'email', rotulo: 'E-mail', largura: TEXTO },
      { chave: 'origem', rotulo: 'Origem', largura: '120px' },
    ],
    campos: [
      {
        chave: 'nome',
        rotulo: 'Nome completo',
        tipo: 'texto',
        placeholder: 'Ex.: Ana Beatriz Ferreira',
        obrigatorio: true,
      },
      {
        chave: 'cpf',
        rotulo: 'CPF',
        tipo: 'cpf',
        placeholder: '000.000.000-00',
        obrigatorio: true,
      },
      {
        chave: 'contato',
        rotulo: 'Contato',
        tipo: 'contato',
        placeholder: '(27) 9…',
        obrigatorio: true,
        dica: 'Telefone ou outra forma de contato (ex.: chat do Airbnb).',
      },
      {
        chave: 'email',
        rotulo: 'E-mail',
        tipo: 'email',
        placeholder: 'nome@email.com',
      },
      {
        chave: 'origem',
        rotulo: 'Origem',
        tipo: 'select',
        opcoes: ['Airbnb', 'WhatsApp', 'Instagram', 'Indicação'],
      },
    ],
  },
  {
    id: 'clifor',
    aba: 'Clientes e fornecedores',
    tabela: 'clientes_fornecedores',
    titulo: 'Novo cliente ou fornecedor',
    botao: 'Novo cliente/fornecedor',
    descricao:
      'Entidades do café e da operação — compradores, cooperativas, prestadores e ' +
      'fornecedores de insumos. Aparecem nos pagamentos e recebimentos.',
    ordenarPor: 'nome',
    colunas: [
      { chave: 'nome', rotulo: 'Nome / razão social', largura: TEXTO },
      { chave: 'relacao', rotulo: 'Relação', largura: '150px' },
      {
        chave: 'documento',
        rotulo: 'CNPJ / CPF',
        largura: '170px',
        formatar: (v) => (v ? mascaraDocumento(String(v)) : '—'),
      },
      { chave: 'contato', rotulo: 'Contato', largura: '160px' },
      { chave: 'observacao', rotulo: 'Observação', largura: TEXTO },
    ],
    campos: [
      {
        chave: 'nome',
        rotulo: 'Nome / razão social',
        tipo: 'texto',
        placeholder: 'Ex.: Cooperativa Pronova',
        obrigatorio: true,
      },
      {
        chave: 'relacao',
        rotulo: 'Relação',
        tipo: 'select',
        opcoes: ['Cliente', 'Fornecedor', 'Cliente e fornecedor'],
        obrigatorio: true,
      },
      {
        chave: 'documento',
        rotulo: 'CNPJ / CPF',
        tipo: 'documento',
        placeholder: '00.000.000/0000-00',
        obrigatorio: true,
        dica: 'A máscara muda sozinha: até 11 dígitos vira CPF, acima disso CNPJ.',
      },
      {
        chave: 'contato',
        rotulo: 'Contato',
        tipo: 'contato',
        placeholder: '(27) 9…',
        obrigatorio: true,
      },
      {
        chave: 'observacao',
        rotulo: 'Observação',
        tipo: 'texto',
        placeholder: 'Ex.: compra de café em coco',
      },
    ],
  },
  {
    id: 'contas',
    aba: 'Contas bancárias',
    tabela: 'contas_bancarias',
    titulo: 'Nova conta bancária',
    botao: 'Nova conta bancária',
    descricao:
      'Usada nos lançamentos e na importação do extrato OFX. O saldo atual não ' +
      'é digitado: o sistema calcula a partir do saldo inicial mais os lançamentos.',
    ordenarPor: 'banco',
    colunas: [
      { chave: 'banco', rotulo: 'Banco', largura: TEXTO },
      { chave: 'apelido', rotulo: 'Apelido', largura: TEXTO },
      { chave: 'tipo', rotulo: 'Tipo', largura: '120px' },
      { chave: 'agencia', rotulo: 'Agência', largura: '100px' },
      { chave: 'numero_conta', rotulo: 'Conta', largura: '120px' },
      {
        chave: 'saldo_inicial',
        rotulo: 'Saldo inicial',
        largura: '140px',
        formatar: dinheiro,
      },
      {
        chave: 'data_saldo_inicial',
        rotulo: 'Em',
        largura: '110px',
        formatar: (v) => (v ? formatarData(String(v)) : '—'),
      },
    ],
    campos: [
      {
        chave: 'banco',
        rotulo: 'Banco',
        tipo: 'texto',
        placeholder: 'Ex.: Sicoob',
        obrigatorio: true,
      },
      {
        chave: 'apelido',
        rotulo: 'Apelido da conta',
        tipo: 'texto',
        placeholder: 'Ex.: Conta café',
        obrigatorio: true,
      },
      {
        chave: 'tipo',
        rotulo: 'Tipo',
        tipo: 'select',
        opcoes: ['Corrente', 'Poupança', 'Pagamento'],
        obrigatorio: true,
      },
      { chave: 'agencia', rotulo: 'Agência', tipo: 'texto', placeholder: '0000' },
      {
        chave: 'numero_conta',
        rotulo: 'Número da conta',
        tipo: 'texto',
        placeholder: '00000-0',
        dica: 'Agência e conta permitem reconhecer o extrato OFX automaticamente.',
      },
      {
        chave: 'saldo_inicial',
        rotulo: 'Saldo inicial (R$)',
        tipo: 'dinheiro',
        placeholder: '0,00',
      },
      {
        chave: 'data_saldo_inicial',
        rotulo: 'Data do saldo inicial',
        tipo: 'data',
        dica: 'A partir desta data o sistema soma os lançamentos para achar o saldo atual.',
      },
    ],
  },
]
