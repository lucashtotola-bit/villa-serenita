# Auditoria e documentação — Villa Serenità (mockup de aplicativo de gestão)

> **Nota de método.** Esta auditoria cobre o que está no arquivo `Villa Serenita.dc.html` (estado atual) e o histórico desta conversa. As primeiras interações do projeto chegaram a este ponto apenas como resumo (a conversa foi retomada a partir de "Ajustes no sistema de cadastros"); onde o detalhe original não está disponível, está escrito **"não localizado no contexto disponível"**. Nada foi alterado no projeto durante esta auditoria.
> Legenda de origem usada nas tabelas: **[U]** solicitação explícita do usuário · **[C]** decisão tomada em conversa · **[I]** inferência/decisão de design do assistente.

---

# 1. Visão geral do projeto

- **Nome:** Villa Serenità — app mockup (título do projeto: "Villa Serenità app mockup").
- **Descrição:** protótipo navegável (alta fidelidade, HTML) de um sistema de gestão para uma propriedade em **Santa Teresa · ES** que opera duas frentes: **hospedagem** (três acomodações: Rifugio Fieline, Casa Vecchia, Casa Verona) e **produção de café** (safra 2026/27).
- **Objetivo principal:** centralizar em um único aplicativo a operação de hospedagem, a produção de café e o controle financeiro da sociedade familiar, com rastreabilidade contábil.
- **Problemas que pretende resolver** (declarados pelo usuário ao longo da conversa):
  - Falta de controle e acompanhamento das **notas fiscais** emitidas contra os sócios Lucas e Michel — problema explicitamente citado como ocorrido "esse ano".
  - Cadastros misturados: hóspedes sendo usados como se fossem clientes/fornecedores.
  - Telas de cadastro com pouca área de visualização por causa do formulário fixo ao lado da tabela.
  - Controle de aportes de capital dos sócios separado da divisão de lucro.
  - Necessidade de registrar transferências entre contas bancárias sem contaminar receita/despesa.
- **Público-alvo:** os quatro sócios/gestores da propriedade — **Lucas Hoffmann Tótola, Michel Hoffmann Tótola, Gilson Tótola e Rosimere Hoffmann** — sendo o usuário desta conversa um deles (Lucas). Uso interno, não é produto para terceiros.
- **Resultado esperado:** um mockup completo e coerente que sirva para validar regras de negócio e, depois, orientar o desenvolvimento do software real.

---

# 2. Contexto fornecido

## Informações fornecidas pelo usuário (fatos)
- Sociedade com **4 sócios**, com **cotas iguais de 25%**.
- Nomes dos sócios (corrigido em conversa: **Rosimere**, não "Rosemere").
- O sítio **ainda não tem CNPJ**; notas fiscais são emitidas contra **pessoas físicas — Lucas e Michel**.
- Anexos de notas fiscais devem ser **armazenados em pasta do Google Drive**.
- Transferências ocorrem entre contas de titularidade dos sócios e do sítio (ex.: corrente → poupança).
- Vendas de café são feitas a **clientes** (cooperativas, exportadora, torrefação), não a hóspedes.
- Aportes de capital acontecem pontualmente e precisam ser devolvidos ao sócio que aportou.
- Pagamento de nota fiscal é, por padrão, **à vista**, com data alterável.

## Necessidades identificadas
- Separação rígida entre **hóspedes** (reservas) e **clientes/fornecedores** (compras, despesas, vendas de café).
- Visualização de tabelas completas nos cadastros.
- Provisionamento de contratos de dívida com parcelas e juros.
- Configuração de safra (datas de etapas, expectativa de colheita).
- Acúmulo de despesas com nota fiscal por sócio, visível na Visão geral.

## Restrições mencionadas
- Sem CNPJ ⇒ destinatários de NF limitados a Lucas e Michel.
- Rateio de lucro **sempre** 25% por sócio — sem opção de rateio alternativo.
- Aportes/devoluções **não** entram no rateio.

## Premissas adotadas [I]
- Data "hoje" do protótipo: **01/08/2026**; mês de referência dos painéis: **julho/2026**.
- Valores, extratos, notas e reservas são **dados de exemplo** (mock), não reais.
- Persistência é em memória (estado do componente); não há backend.

---

# 3. Escopo

## Faz parte
Protótipo de interface navegável, com regras de negócio simuladas em JavaScript: navegação entre telas, formulários com validação, filtros, cálculos derivados (totais, projeções, status) e estados de bloqueio.

## Não faz parte
- Backend, banco de dados, autenticação real, integração real com bancos (OFX é simulado), integração real com Google Drive, emissão fiscal, geração real de PDF.
- Layout mobile dedicado (o protótipo é desktop, ~1440px).

## Funcionalidades solicitadas e desenvolvidas
| Funcionalidade | Status |
| --- | --- |
| Cadastros em tabela de tela cheia, com formulário em modal | Implementado |
| Aba "Clientes e fornecedores" separada de "Hóspedes" | Implementado |
| Hóspede obrigatório na nova reserva | Implementado |
| Quatro sócios reais, cota fixa 25%, sem seletor de rateio | Implementado |
| Aporte e devolução de aporte, calculados fora do lucro | Implementado |
| Tela de Notas fiscais com parcelamento incremental e anexo obrigatório | Implementado |
| Somatório de NF por sócio na Visão geral | Implementado |
| "Registrar venda" (Café) abrindo receita e listando clientes | Implementado |
| Máscara de CPF/CNPJ | Implementado |
| Categoria pré-definida em reserva e venda de café | Implementado |
| Transferência entre contas (saída + entrada em um lançamento) | Implementado |
| Menu agrupado (Operação / Financeiro / Configuração) | Implementado |
| Tela de configuração de safra | Implementado |
| Botões da aba Dívidas restritos + contrato de dívida provisionado | Implementado |
| Filtro por conta bancária em Receitas/Despesas/Transferências | Implementado |

## Mencionadas e ainda não implementadas
- **Divisão do valor de pacotes multi-acomodação nos relatórios** (per acomodação × montante único) — pendente desde o resumo inicial.
- **Teste de importação de arquivo OFX real** — pendente.
- **Status de recebimento do XML para o contador** — o usuário disse "inicialmente basta anexo"; portanto **adiado por decisão**.
- Vinculação automática das parcelas de NF e das parcelas do contrato de dívida como lançamentos de despesa na tela Financeiro — descrita na proposta aceita, **não implementada** (hoje NF e dívidas vivem em suas próprias listas).

---

# 4. Regras definidas

## Regras de negócio
| Regra | Por que existe | Onde | Status | Origem |
| --- | --- | --- | --- | --- |
| Lucro é rateado igualmente: 25% por sócio | Cotas iguais; nunca varia | Financeiro › Prestação de contas | Implementada | [U] |
| Aporte de capital é crédito individual do sócio, fora do rateio | Quem aporta precisa reaver o valor | Financeiro › Prestação de contas (painel Aportes) | Implementada | [U] |
| Devolução de aporte abate o crédito do sócio e não é despesa | Não distorcer resultado | Modal de aporte/devolução | Implementada | [U] |
| Devolução não pode exceder o aporte em aberto do sócio | Consistência do saldo | Validação do modal | Implementada | [I] |
| Hóspedes só podem ser usados em reservas | Separação de entidades | Modal Nova reserva | Implementada | [U] |
| Clientes/fornecedores são a fonte de compras, despesas e vendas de café | Separação de entidades | Modal de lançamento, modal de NF | Implementada | [U] |
| Nota fiscal é emitida contra Lucas ou Michel (sítio sem CNPJ) | Realidade fiscal atual | Tela Notas fiscais | Implementada | [U] |
| NF é paga em 1 parcela à vista por padrão; parcelas adicionais são inseridas uma a uma | Fluxo de compra real | Modal NF | Implementada | [U] |
| Ao inserir parcela, o total é redividido igualmente e escalonado em 30 dias | Reduzir digitação | Modal NF | Implementada | [I] |
| Transferência entre contas gera saída na origem e entrada no destino, sem afetar receita/despesa/rateio | É movimentação de caixa | Financeiro › Transferências | Implementada | [U] |
| Contrato de dívida é provisionado com nº de parcelas, 1º vencimento, periodicidade, juros e titular | Acompanhar dívidas | Modal Novo contrato de dívida | Implementada | [U] |
| Transação conciliada fica somente leitura | Auditoria | Financeiro › movimentos | Implementada (herdada) | resumo inicial |
| Prestação de contas só é gerada com o mês 100% conciliado | Auditoria | Financeiro › Prestação de contas | Implementada (herdada) | resumo inicial |
| Após a prestação gerada, desfazer conciliação exige senha de administrador | Auditoria | Modal de senha | Implementada (herdada) | resumo inicial |
| Datas das etapas da safra definem o status exibido no Café | Fonte única | Configuração › Safras | Implementada | [C] |

## Regras de funcionamento
| Regra | Por que | Onde | Status | Origem |
| --- | --- | --- | --- | --- |
| Novo cadastro abre em janela (modal), tabela ocupa a tela inteira | Ganhar área de leitura | Cadastros | Implementada | [U] |
| Rótulo do botão muda conforme a aba ("Nova categoria", "Novo hóspede"…) | Clareza | Cadastros | Implementada | [I] |
| Na aba Dívidas só aparece "＋ Novo contrato de dívida" | Botões irrelevantes poluem | Financeiro | Implementada | [U] |
| Filtro de conta bancária só em Receitas, Despesas e Transferências | Não faz sentido em dívidas/prestação | Financeiro | Implementada | [U] |
| "Registrar venda" (Café) abre receita já com centro "Café" e categoria "Venda de café" | Dado invariável | Café | Implementada | [U] |
| Nova reserva mostra categoria/centro pré-definidos como Hospedagem | Dado invariável | Modal Nova reserva | Implementada | [U] |
| Conciliação sugere par automático por data + valor | Reduzir trabalho | Conciliação | Implementada (herdada) | resumo inicial |
| Salvar NF leva a lista para a aba "Todas"; salvar transferência/dívida leva à aba correspondente | Feedback | Financeiro / NF | Implementada | [I] |

## Regras de validação
| Regra | Por que | Onde | Status | Origem |
| --- | --- | --- | --- | --- |
| Hóspede: Nome, CPF e Contato obrigatórios; e-mail e origem opcionais | Qualidade do cadastro | Modal de cadastro | Implementada | resumo inicial |
| CPF deve ter 11 dígitos | Validade | Modal de cadastro | Implementada | resumo inicial |
| CPF exibido com máscara 000.000.000-00; campo CNPJ/CPF alterna para máscara de CNPJ acima de 11 dígitos | Legibilidade | Modal de cadastro | Implementada | [U] / [I] |
| Cliente/fornecedor: Nome, CNPJ/CPF e Contato obrigatórios | Qualidade | Modal de cadastro | Implementada | [I] |
| Reserva não salva sem hóspede selecionado (select inicia vazio, erro em vermelho) | Regra de negócio | Modal Nova reserva | Implementada | [U] |
| NF: número, emitente e valor obrigatórios | Rastreabilidade | Modal NF | Implementada | [U] |
| NF: soma das parcelas deve bater exatamente com o total | Integridade | Modal NF | Implementada | [I] |
| NF: **anexo obrigatório** — sem arquivo não salva | Problema declarado do ano | Modal NF | Implementada | [U] |
| Transferência: valor > 0 e destino ≠ origem | Integridade | Modal transferência | Implementada | [I] |
| Contrato de dívida: descrição, credor, valor, nº de parcelas e 1º vencimento obrigatórios | Provisionamento | Modal dívida | Implementada | [I] |
| Aporte/devolução: valor obrigatório | Integridade | Modal aporte | Implementada | [I] |
| Mensagens de erro usam rótulos legíveis (ex.: "CNPJ / CPF"), não chaves internas | Clareza | Cadastros | Implementada (correção) | verificação |

## Regras de acesso e permissões
| Regra | Por que | Onde | Status | Origem |
| --- | --- | --- | --- | --- |
| Reabrir período fechado / desfazer conciliação pós-prestação exige senha de administrador (mín. 4 caracteres no mock) | Controle | Modal de senha | Implementada (simulada) | resumo inicial |
| Ação registrada em histórico com data, hora e usuário | Auditoria | Texto do modal | **Apenas declarada na interface** — não implementada | resumo inicial |
| Perfis de usuário, login, permissões por sócio | — | — | **Não existe** | — |

## Regras de conteúdo
| Regra | Por que | Onde | Status | Origem |
| --- | --- | --- | --- | --- |
| Todo o texto em português do Brasil | Público | Todo o app | Implementada | [C] |
| Valores em R$ com formatação pt-BR | Público | Todo o app | Implementada | [I] |
| Nomenclatura "Centro de custo/receita" substitui o antigo campo "Frente" | Pedido anterior | Cadastros / lançamentos | Implementada | resumo inicial |
| Nomes reais dos sócios, sem placeholders ("Sócio 2") | Realidade | Prestação de contas | Implementada | [U] |
| Arquivo de NF nomeado `NF-numero-emitente.pdf`, sem acentos | Padronização no Drive | Modal NF | Implementada | [I] + correção |
| Caminho declarado: `Drive compartilhado / Villa Serenità / notas fiscais / 2026 / [destinatário]` | Organização por sócio | Tela e modal de NF | Implementada (texto/simulação) | [U] |

## Regras visuais
| Regra | Por que | Onde | Status | Origem |
| --- | --- | --- | --- | --- |
| Paleta verde-oliva escura fixa (fundo `#161c0d`, cards `#212a14`) | Identidade do sítio | Todo o app | Implementada | resumo inicial |
| Títulos em Instrument Serif; corpo em Instrument Sans | Identidade | Todo o app | Implementada | resumo inicial |
| Verde `#93a35f` = ação primária; terracota `#c2705a/#a9553f` = despesa/erro/alerta | Semântica de cor | Todo o app | Implementada | resumo inicial |
| Pills de status arredondadas (99px) e cards com raio 12px | Consistência | Todo o app | Implementada | resumo inicial |
| Célula longa trunca com reticências + `title` como tooltip | Evitar quebra de grade | Tabelas | Implementada | resumo inicial |
| Sem emoji decorativo; ícones são glifos tipográficos (◈ ▦ ◍ ◎ ⇄ ✳ ☰ ▣ ❋) | Sobriedade | Menu e botões | Implementada | [I] |

## Regras de responsividade
| Regra | Por que | Onde | Status | Origem |
| --- | --- | --- | --- | --- |
| Alvo de projeto: desktop 1440×900 | Uso em computador | Preview do componente | Implementada | [I] |
| Grades de tabela usam `minmax(0,1fr)` + colunas fixas enxutas para nunca estourar o card | Defeitos encontrados na verificação | Prestação de contas, Notas fiscais | Implementada (após 3 correções) | verificação |
| Inputs com `width:100%; box-sizing:border-box; min-width:0` | Impedem o card de encolher | Tela Safras, modal de dívida | Implementada (após correção) | verificação |
| Cartões da Safra usam `repeat(auto-fit,minmax(300px,1fr))` (empilham em telas estreitas) | Robustez | Safras | Implementada | verificação |
| Barras de botões e filtros com `flex-wrap` | Larguras variáveis | Cabeçalhos | Implementada | [I] |
| Layout mobile dedicado | — | — | **Não existe** | — |

## Regras técnicas
| Regra | Por que | Onde | Status | Origem |
| --- | --- | --- | --- | --- |
| Tudo em **um único Design Component** `Villa Serenita.dc.html` | Estado compartilhado entre módulos; evita duplicar dados | Projeto | Implementada | [C] (recomendação aceita pelo usuário) |
| Estilos **inline**; sem folhas de estilo/classes (exceto reset, fontes e scrollbar no `<helmet>`) | Padrão de autoria do componente | Todo o arquivo | Implementada | [I] |
| Estado central em `state` da classe `Component`; telas alternadas por `st.screen` | Navegação sem recarregar | Lógica | Implementada | [I] |
| Modais controlados por `st.modal` (um por vez) | Simplicidade | Lógica | Implementada | [I] |
| Listas derivadas calculadas em `renderVals()` e expostas ao template | Regra do framework | Lógica | Implementada | [I] |
| Backups: cópia do arquivo antes de mudanças grandes | Permitir desfazer | Projeto | Feito uma vez e **excluído a pedido** | [U] |

---

# 5. Estrutura desenvolvida

## Navegação (menu lateral, agrupado)
- **Operação:** Visão geral · Calendário · Reservas · Café
- **Financeiro:** Lançamentos · Notas fiscais · Conciliação
- **Configuração:** Cadastros · Safras
- Fixo no topo do menu: botão **＋ Nova reserva**; no rodapé, cartão de resumo (ocupação de fins de semana e fase da safra).

## Telas (9 estados de tela)
| Tela (`screen`) | `data-screen-label` | Seções |
| --- | --- | --- |
| `dash` — Visão geral | Dashboard | 4 KPIs; 4 ações rápidas; Próximas chegadas; Resultado do mês; Alertas; **Notas fiscais acumuladas** (por sócio) |
| `cal` — Calendário | Calendário | Filtros de canal; navegação de mês; um calendário por acomodação com ocupação de fins de semana |
| `lista` — Reservas | Reservas | Lista de reservas do mês com canal, período e valor |
| `res` — Detalhe da reserva | Reserva | Estadia; Linha do tempo; Financeiro da reserva; Contato & notas; Comprovantes |
| `fin` — Lançamentos | Financeiro | Abas: Receitas · Despesas · Transferências · Dívidas · Prestação de contas; filtro de conta; tabelas e cards |
| `nf` — Notas fiscais | Notas fiscais | 4 KPIs; abas de situação; filtro por destinatário; tabela; nota sobre pasta do Drive |
| `concil` — Conciliação | Conciliação | Estado vazio (importar OFX); KPIs; linhas extrato × app; legenda |
| `cad` — Cadastros | Cadastros | Abas: Categorias · Centro de custo/receita · Hóspedes · Clientes e fornecedores · Contas bancárias; tabela de largura total |
| `safra` — Safras | Safras | Identificação do ciclo; Expectativa da colheita (+3 projeções); Calendário das etapas |
| `cafe` — Café | Café | Etapas da safra; Custos; Estoque; Vendas |

## Modais (8)
1. **Nova reserva** — acomodações múltiplas (pacote), canal, datas, hóspede obrigatório, nº de hóspedes, valor, sinal, linha de categoria pré-definida, anexo opcional.
2. **Anexar comprovante** — upload simulado, tipo de documento, vínculo, valor, data.
3. **Novo lançamento (receita/despesa/venda de café)** — centro, categoria, conta, data, descrição, valor, vínculo; título e opções mudam conforme contexto.
4. **Autorização do administrador** — senha para reabrir período/desfazer conciliação.
5. **Novo cadastro** — campos conforme a aba de Cadastros.
6. **Aporte / devolução de aporte** — sócio, valor, data, conta, observação, prévia e nota explicativa.
7. **Nota fiscal** — dados da nota, parcelamento dinâmico, anexo obrigatório.
8. **Transferência entre contas** — origem, destino, valor, data, observação, prévia dos dois registros.
9. **Novo contrato de dívida** — descrição, credor, titular, valor, parcelas, 1º vencimento, periodicidade, juros, prévia.

## Fluxos de usuário principais
- Cadastrar hóspede → criar reserva (hóspede obrigatório) → anexar comprovante do sinal.
- Cadastrar fornecedor → lançar nota fiscal com anexo → parcelar → acompanhar por situação e por sócio.
- Importar OFX → conciliar linha a linha (ou todas as sugestões) → fechar mês → gerar prestação de contas → (se necessário) reabrir com senha.
- Registrar aporte → acompanhar saldo em aberto → registrar devolução.
- Configurar safra → datas refletem na tela do Café.

## Estados vazios, mensagens e erros
- **Estado vazio:** Conciliação sem OFX importado (área tracejada clicável).
- **Sucesso:** faixa verde "Configuração da safra salva"; prévia com ✓ quando as parcelas fecham o total.
- **Erros:** faixas terracota nos modais (campos faltando, CPF inválido, parcelas divergentes, anexo ausente, destino igual à origem, devolução maior que o aporte).
- **Bloqueios:** botão "Gerar relatório PDF" desabilitado enquanto não há prestação; botão salvar em tom apagado enquanto o modal está incompleto; lançamento conciliado exibe cadeado.
- **Carregamento:** não existe (dados locais).

## Integrações / fontes de dados
Todas **simuladas**: extrato OFX (9 linhas fixas), Google Drive (caminhos e nomes de arquivo em texto), geração de PDF (botão sem ação).

## Arquivos produzidos
- `Villa Serenita.dc.html` — o protótipo (arquivo único).
- `Documentacao do projeto.md` — este documento.
- `Villa Serenita v2 (backup pre-notas).dc.html` — criado como backup e **excluído a pedido do usuário**.
- `support.js` — runtime do componente (gerado pelo ambiente, não editado).

---

# 6. Design e identidade visual

- **Cores:** fundo `#161c0d`; superfície de card `#212a14`; texto `#edeade`; texto secundário `#c3c6ac`; texto terciário/labels `#8b9174`; apagado `#6f7658`; verde primário `#93a35f` (hover `#a8b76e`); verdes de apoio `#7d9a4a`, `#a3c47d`, `#b7c880`; terracota `#c2705a`, `#a9553f`, `#d2917c`; neutro claro `#cbd0b0`/`#d8dcc4`. Bordas: `rgba(255,255,255,.07)` (card) e `rgba(255,255,255,.14)` (campo).
- **Cores por acomodação:** Rifugio `#93a35f`, Casa Vecchia `#d8dcc4`, Casa Verona `#a9553f`. **Por canal:** Airbnb `#c2705a`, WhatsApp `#8aab55`, Instagram `#cbd0b0`.
- **Tipografia:** títulos e números de destaque em *Instrument Serif* (34px h1, 19–24px h2, 20–44px números); interface em *Instrument Sans* (13–14px corpo, 11–12px labels em caixa alta com `letter-spacing .06em`).
- **Espaçamentos:** conteúdo principal com padding 32/40px; cards 20–22px; gaps de grade 10–14px; linhas de tabela 12–13px verticais.
- **Bordas e sombras:** raio 12px (cards), 9–10px (campos/botões), 99px (pills); sombra apenas no modal (`0 24px 60px rgba(0,0,0,.5)`); overlay `rgba(10,14,6,.72)`.
- **Ícones:** glifos tipográficos, sem biblioteca de ícones e sem emoji decorativo (exceto 📎 e 🔒 herdados nas ações de anexo/trava).
- **Padrões de componente:** card de KPI; abas em pílula dentro de barra; chips de filtro; tabela em CSS grid com cabeçalho em caixa alta; pill de status; faixa informativa (verde) e de erro (terracota); modal de largura máxima 560px com rolagem interna.
- **Layouts:** app shell com sidebar fixa de 224px + conteúdo fluido; grades de 2, 3 e 4 colunas.
- **Design system:** não há sistema externo — a linguagem visual foi criada dentro do projeto e é replicada inline em cada tela.
- **Exceções e decisões específicas:** tabelas com muitas colunas tiveram colunas removidas/mescladas em vez de encolher a fonte (Prestação de contas perdeu a coluna "Cota"; Notas fiscais moveu "Emissão" para a linha do emitente).

---

# 7. Decisões tomadas

| Decisão | Motivo | Alternativas discutidas | Solução escolhida | Impacto | Momento |
| --- | --- | --- | --- | --- | --- |
| Formulário de cadastro em modal | Tabela precisava de tela inteira | Manter painel lateral | Botão "＋ Novo…" abre janela | Mais área útil em todos os cadastros | Início desta fase |
| Duas tabelas de entidades | Hóspede ≠ cliente | Uma tabela com campo "tipo" | Hóspedes + Clientes e fornecedores | Regra de origem de dados clara | Início desta fase |
| Remover seletor de rateio | Rateio é sempre 25% | Manter opção "somente um sócio" | Texto fixo explicando o rateio | Menos erro de lançamento | Início desta fase |
| Aportes como crédito individual | Precisa ser devolvido | Tratar como receita/despesa | Painel próprio + botões aporte/devolução | Lucro não é distorcido | Início desta fase |
| Coluna "Cota" removida da prestação | Não cabia; valor é sempre 25% | Reduzir fonte | Cota no cabeçalho da coluna de nome | Nomes completos visíveis | Correção de verificação |
| NF à vista por padrão | Prática do usuário | 30 dias após emissão | 1 parcela na data de emissão, editável | Menos cliques no caso comum | Ao definir a tela de NF |
| Destinatários limitados a 2 pessoas | Sítio sem CNPJ | Incluir "Villa Serenità" | Lucas e Michel | Reflete a realidade fiscal | Ao definir a tela de NF |
| Sem campo de status de XML | Suficiente por ora | Campo para o contador | Só o anexo | Menos atrito | Ao definir a tela de NF |
| Manter tudo em um arquivo | Estado compartilhado, dado único | Dividir em 3 páginas por domínio | Arquivo único + menu agrupado | Protótipo íntegro; modularização fica como orientação de arquitetura | Após pergunta do usuário |
| Etapas do Café lidas da Safra | Fonte única de verdade | Manter datas fixas no Café | Café lê `state.safra.etapas` | Configuração passa a ter efeito real | Ao criar a tela Safras |
| Aba Dívidas com botões próprios | Botões de caixa não se aplicam | Manter todos os botões | Só "Novo contrato de dívida" | Cabeçalho contextual | Última rodada |

---

# 8. Alterações realizadas durante o projeto (linha do tempo)

**Fase anterior (disponível apenas como resumo — detalhes originais não localizados no contexto disponível):** construção das cinco telas iniciais (Cadastros, Financeiro, Calendário, Reservas, Conciliação), travas de conciliação, prestação de contas, senha de administrador, reservas multi-acomodação, campos de CPF/e-mail/nº de hóspedes, truncamento de células.

1. **Cadastros reestruturados** — tabela em tela cheia; formulário movido para modal com botão contextual; nova aba "Clientes e fornecedores"; hóspede obrigatório na reserva; quatro sócios reais com 25%; seletor de rateio removido; painel de aportes com botões de aporte e devolução. *Estado: concluído.*
2. **Correções da verificação** — colunas da prestação de contas ajustadas (duas rodadas, terminando com a remoção da coluna "Cota"); rótulo "CNPJ / CPF" nas mensagens de erro. *Concluído.*
3. **Correção de nome** — "Rosemere" → **"Rosimere" Hoffmann**. *Concluído.*
4. **Proposta da tela de Notas fiscais** — apresentada e ajustada com três respostas do usuário (à vista; só Lucas e Michel; anexo no Drive + somatório na Visão geral). Backup do arquivo criado antes da implementação. *Concluído.*
5. **Tela Notas fiscais implementada** — lista com abas e filtros, KPIs, modal com parcelamento incremental e anexo obrigatório, card de acumulado por sócio na Visão geral. Correções seguintes: colunas da tabela (coluna "Emissão" mesclada) e remoção de acentos no nome do arquivo. *Concluído.*
6. **Café — "Registrar venda"** passou a abrir **receita** (abria despesa). *Corrigido.*
7. **Origem de dados por contexto** — venda de café lista **clientes**; receita do Financeiro lista hóspedes + clientes; despesa lista fornecedores. Máscaras de CPF e CNPJ adicionadas. *Concluído.*
8. **Categorias pré-definidas** — venda de café abre com centro "Café" e categoria "Venda de café"; nova reserva exibe Hospedagem — diárias / centro Hospedagem. *Concluído.*
9. **Transferência entre contas** — botão no Financeiro, nova aba "Transferências", modal com prévia de saída e entrada. *Concluído.*
10. **Consulta sobre dividir o projeto em páginas** — recomendação de manter arquivo único; usuário concordou. **Menu agrupado** em Operação / Financeiro / Configuração ("Financeiro" virou "Lançamentos"); **backup v2 excluído** a pedido. *Concluído.*
11. **Tela Safras** — identificação do ciclo, expectativa de colheita com projeções, calendário de etapas editável; Café passou a ler essas datas. Correção de layout (inputs `border-box`, grade `auto-fit`). *Concluído.*
12. **Aba Dívidas** — botões de receita/despesa/transferência ocultos; novo modal de contrato de dívida; filtro de conta bancária nas abas de caixa. Correções: rodapé de transferências respeitando o filtro e plural correto da periodicidade. *Concluído.*

**Elementos removidos ao longo do caminho:** painel lateral de cadastro; seletor "Rateio entre sócios"; coluna "Cota"; coluna "Emissão"; nomes-placeholder de sócios; arquivo de backup v2.

---

# 9. Estado atual

## Concluído
As 10 telas navegam; os 9 modais abrem, validam e salvam no estado; filtros, abas e cálculos derivados funcionam; menu agrupado; identidade visual consistente; última verificação automatizada sem erros de console pendentes.

## Parcialmente concluído
- **Google Drive:** apenas caminho e nome de arquivo simulados — não há upload.
- **Conciliação:** trabalha sobre um extrato fixo; "importar OFX" só alterna um booleano.
- **Prestação de contas:** valores do trimestre (R$ 21.470) são fixos, não somam os lançamentos.
- **Notas fiscais × Financeiro:** parcelas de NF não viram lançamentos de despesa.
- **Contrato de dívida:** entra na lista de dívidas, mas não gera parcelas provisionadas no fluxo de caixa.
- **Transferências:** não alteram o saldo exibido das contas bancárias em Cadastros.

## Pendente
- Divisão de pacotes multi-acomodação nos relatórios.
- Teste com arquivo OFX real.
- Vínculo automático NF/dívida → lançamentos.
- Campo de status de XML (adiado por decisão).

## Problemas conhecidos e inconsistências
- **Nomes de conta divergentes:** os lançamentos usam "Sicoob · movimento" / "Banestes · café" / "Nubank PJ", enquanto o cadastro usa "Sicoob · Conta movimento" etc. O filtro por conta funciona porque compara pelo nome do banco, mas os rótulos deveriam ser unificados.
- **Datas fixas no protótipo:** "hoje" é 01/08/2026 em três lugares (`HOJE`, `HOJE_ISO` e uma comparação literal no cálculo das etapas do Café) — mudar o cenário exige alterar os três.
- **Prestação de contas** exibe "2º trimestre 2026" com resultado fixo, enquanto o restante do app fala de julho/2026.
- **Sem persistência:** recarregar a página zera cadastros, notas e aportes inseridos.
- **Anexos** não guardam arquivo real; o texto do anexo é gerado a partir do número/emitente.

## Precisa de validação humana
- Nomes, CPF/CNPJ e valores de exemplo (fictícios) antes de qualquer uso real.
- Regra de juros do contrato de dívida (hoje é texto livre, sem cálculo).
- Se a devolução de aporte deve ou não passar por aprovação dos demais sócios.
- Estrutura de pastas real do Google Drive.

---

# 10. Inventário do projeto

**Telas (10 estados):** dash, cal, lista, res, fin, nf, concil, cad, safra, cafe.

**Modais (9):** nova reserva, anexo, lançamento, senha admin, cadastro, aporte/devolução, nota fiscal, transferência, contrato de dívida.

**Componentes recorrentes:** card de KPI; barra de abas; chips de filtro; tabela em grid com cabeçalho; pill de status; faixa informativa/erro/sucesso; barra de progresso; linha do tempo; card de dívida; área de upload tracejada; campo de formulário (input/select) padronizado.

**Arquivos:** `Villa Serenita.dc.html`; `Documentacao do projeto.md`; `support.js` (runtime); pasta `uploads/` (contém uma captura enviada pelo usuário: `draw-838d6342-…png`).

**Dados de exemplo no estado:** 8 categorias; 3 centros de custo/receita; 4 hóspedes; 6 clientes/fornecedores; 3 contas bancárias; 6 notas fiscais; 4 movimentações de aporte; 3 transferências; 1 safra com 6 etapas; 22 reservas (3 meses); 11 lançamentos; 9 linhas de OFX; 3 dívidas; 3 vendas de café; 5 grupos de custo da safra.

**Integrações:** nenhuma real (OFX, Drive e PDF simulados).

**Dependências:** Google Fonts (Instrument Serif, Instrument Sans); runtime do Design Component.

**Links/referências externas:** nenhum repositório, .fig ou design system importado — **não localizado no contexto disponível**.

---

# 11. Instruções para continuidade

**Preservar**
- O arquivo único `Villa Serenita.dc.html` como fonte de verdade; o estado central em `state`; o padrão de estilos inline.
- A paleta, a dupla de fontes e os padrões de card/pill/tabela.
- Os nomes reais dos sócios (com **Rosimere**) e as cotas de 25%.

**Regras que não podem ser alteradas sem decisão do usuário**
- Rateio sempre igual (25%) e aportes/devoluções fora do rateio.
- Hóspedes exclusivos de reservas; clientes/fornecedores para compras, despesas e vendas de café.
- Anexo obrigatório na nota fiscal.
- NF à vista por padrão, com parcelas adicionadas uma a uma.
- Transferência não é receita nem despesa.
- Destinatário de NF: apenas Lucas e Michel.

**Onde estão os principais elementos**
- Template: telas em blocos `<sc-if value="{{ isX }}">`, na ordem dash → cal → lista → res → fin → cafe → cad → safra → concil; modais no fim, dentro do bloco `modalAberto`.
- Lógica: classe `Component`, com `state` no topo (dados de exemplo) e `renderVals()` contendo as seções comentadas (Cadastros, Notas fiscais, Safra, Contrato de dívida, Transferências, Conciliação).

**Próximos passos recomendados**
1. Unificar os rótulos das contas bancárias entre cadastro e lançamentos.
2. Centralizar a data "hoje" em uma única constante.
3. Fazer as parcelas de NF e de contrato de dívida gerarem despesas programadas no Financeiro.
4. Calcular o resultado da prestação de contas a partir dos lançamentos.
5. Resolver a divisão de pacotes multi-acomodação nos relatórios.

**Riscos ao modificar**
- Quebrar grades de tabela: sempre usar `minmax(0,1fr)` nas colunas de texto e inputs com `box-sizing:border-box`.
- Dividir o arquivo em vários: perde o estado compartilhado e duplica dados.
- Trocar estilos inline por classes: contraria o padrão de autoria adotado.
- Renomear chaves de estado (`clifor`, `notas`, `safra`, `aportes`, `transferencias`, `dividasNovas`) sem atualizar todos os pontos de leitura.

---

# 12. Prompt de continuidade

```
Você vai continuar um projeto já em andamento: o mockup de alta fidelidade do aplicativo de gestão da Villa Serenità (Santa Teresa, ES), uma propriedade familiar com duas frentes — hospedagem (Rifugio Fieline, Casa Vecchia, Casa Verona) e produção de café (safra 2026/27). Sociedade de quatro pessoas com cotas iguais: Lucas Hoffmann Tótola, Michel Hoffmann Tótola, Gilson Tótola e Rosimere Hoffmann.

ARQUIVO: todo o protótipo está em um único Design Component, "Villa Serenita.dc.html". Mantenha assim — não divida em vários arquivos, não use folhas de estilo ou classes CSS (estilos são inline; apenas fontes, reset e scrollbar ficam no <helmet>).

TELAS EXISTENTES (menu agrupado): Operação (Visão geral, Calendário, Reservas + detalhe, Café); Financeiro (Lançamentos com abas Receitas/Despesas/Transferências/Dívidas/Prestação de contas, Notas fiscais, Conciliação); Configuração (Cadastros com 5 abas, Safras).

REGRAS DE NEGÓCIO QUE NÃO PODEM SER ALTERADAS:
- Lucro sempre rateado 25% por sócio; não existe opção de rateio alternativo.
- Aportes e devoluções de capital são créditos individuais, calculados fora do rateio.
- Hóspedes só aparecem em reservas (obrigatório selecionar um para salvar); clientes e fornecedores são a fonte para compras, despesas e vendas de café.
- Notas fiscais são emitidas apenas contra Lucas ou Michel (o sítio não tem CNPJ); anexo do arquivo é obrigatório para salvar; pagamento é à vista por padrão, com botão "Inserir nova parcela" que redivide o valor igualmente e escalona 30 dias; a soma das parcelas precisa bater com o total.
- Anexos de NF são organizados em Drive compartilhado / Villa Serenità / notas fiscais / 2026 / [destinatário], com nome NF-numero-emitente.pdf (sem acentos).
- Transferência entre contas gera saída na origem e entrada no destino e não afeta receita, despesa nem rateio.
- Conciliação: lançamento conciliado fica somente leitura; prestação de contas só com o mês 100% conciliado; desfazer após o fechamento exige senha de administrador.
- Datas das etapas da safra são configuradas na tela Safras e alimentam a tela do Café.

PADRÕES VISUAIS: fundo #161c0d, cards #212a14, texto #edeade / #c3c6ac / #8b9174, verde primário #93a35f (hover #a8b76e), terracota #c2705a e #a9553f para despesa/erro. Títulos em Instrument Serif, interface em Instrument Sans. Cards raio 12px, campos 9px, pills 99px. Sem emoji decorativo. Tabelas em CSS grid: colunas de texto sempre minmax(0,1fr), inputs sempre com width:100%;box-sizing:border-box;min-width:0 (já houve três defeitos de layout por causa disso).

PENDÊNCIAS CONHECIDAS (não implementadas):
1. Unificar rótulos das contas bancárias entre cadastro ("Sicoob · Conta movimento") e lançamentos ("Sicoob · movimento").
2. Centralizar a data "hoje" (01/08/2026) — hoje está repetida em três pontos.
3. Fazer as parcelas de nota fiscal e do contrato de dívida gerarem despesas programadas no Financeiro.
4. Calcular o resultado da prestação de contas a partir dos lançamentos (hoje é fixo: R$ 21.470, rotulado como 2º trimestre).
5. Definir como o valor de reservas com múltiplas acomodações se divide nos relatórios.
6. Testar importação de OFX real (hoje o extrato é fixo, com 9 linhas).

Antes de mudar qualquer coisa, leia o arquivo inteiro. Faça alterações cirúrgicas: mexa apenas no que for pedido, preservando textos, espaçamentos e cores existentes. Todo o conteúdo é em português do Brasil e os valores em R$ com formatação pt-BR.
```

---

# Possíveis omissões

Segunda passagem pelo histórico — pontos que podem ter ficado de fora ou que merecem ressalva:

- **Fase inicial do projeto:** as decisões anteriores a "Ajustes no sistema de cadastros" (escolha da paleta, das fontes, da estrutura de telas, a origem do nome, se houve pesquisa ou referências) **não estão no contexto disponível**; foram reconstruídas apenas a partir do código e do resumo.
- **Perguntas iniciais / briefing:** não localizado no contexto disponível se houve formulário de perguntas no começo do projeto.
- **A imagem enviada pelo usuário** (`uploads/draw-838d6342-…png`) foi uma captura da tela de Prestação de contas usada para apontar o nome "Rosimere"; não há outros materiais importados.
- **Comentário inline:** a correção do nome veio de um comentário fixado no elemento da tabela, não de texto livre — registrado aqui porque muda a forma de rastrear pedidos.
- **Backup:** houve um arquivo `Villa Serenita v2 (backup pre-notas).dc.html`, excluído a pedido; não existe hoje nenhum ponto de restauração.
- **Verificações automáticas:** quatro defeitos foram encontrados por revisão automatizada e corrigidos (colunas da prestação de contas — duas vezes; rótulo "doc"; colunas da tela de NF; acentos no nome do arquivo; layout da tela Safras; rodapé de transferências; plural de periodicidade). Eles não vieram de pedido do usuário, mas alteraram o resultado visual.
- **Uma mensagem interrompida** do usuário ("Quando eu acessar o módulo 'Lançamentos' do menu f…") foi reenviada completa em seguida; nada se perdeu.
- **Prestação de contas trimestral × painéis mensais:** possível contradição de período nunca discutida explicitamente — a versão mais recente da interface mantém o rótulo "2º trimestre 2026".
- **Título do item de menu:** "Financeiro" foi renomeado para "Lançamentos" ao agrupar o menu; textos internos ainda dizem "Financeiro" (h1 da tela). É intencional, mas vale confirmar.
