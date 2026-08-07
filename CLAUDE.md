# Villa Serenità — instruções permanentes

Sistema de gestão da Villa Serenità (Santa Teresa · ES): hospedagem em três acomodações
(Rifugio Fieline, Casa Vecchia, Casa Verona) e produção de café.

`spec/` é a **especificação**, não código de produção. Em caso de dúvida sobre comportamento,
`spec/prototipo/Villa Serenita.dc.html` e `spec/Documentacao do projeto.md` mandam; em caso de
conflito entre os dois, a documentação registra a decisão mais recente. **Nada em `spec/` entra
no build.**

## Regras de negócio invioláveis (não alterar sem aprovação do dono)

- Sociedade: Lucas Hoffmann Tótola, Michel Hoffmann Tótola, Gilson Tótola, **Rosimere** Hoffmann —
  cotas fixas de 25%. Lucro sempre rateado igualmente; NÃO criar opção de rateio alternativo.
- Aportes e devoluções de capital são créditos individuais do sócio, calculados FORA do rateio de
  lucro. Devolução não pode exceder o aporte em aberto do sócio.
- Hóspedes são usados EXCLUSIVAMENTE em reservas (seleção obrigatória para salvar). Clientes e
  fornecedores (tabela separada) são a fonte de compras, despesas e vendas de café.
- Notas fiscais: destinatário apenas Lucas ou Michel (o sítio não tem CNPJ); pagamento à vista por
  padrão; "Inserir nova parcela" redivide o total igualmente com vencimentos +30 dias; a soma das
  parcelas deve bater exatamente com o total.
- Anexo da nota fiscal **não** bloqueia o registro (revisto em 04/08/2026): a nota é salva com ou
  sem arquivo, fica listada em `notas_fiscais_sem_anexo` e o **mês não fecha** enquanto houver nota
  sem documento. Bloquear na hora de registrar produzia dado pior — quando o PDF ainda não chegou,
  o usuário desistiria de registrar ou anexaria qualquer arquivo só para passar.
- Transferência entre contas gera saída na origem + entrada no destino; nunca é receita nem despesa
  e não entra no rateio.
- Conciliação: lançamento conciliado fica somente leitura; prestação de contas só pode ser gerada
  com o mês 100% conciliado; **desfazer conciliação após o fechamento é privilégio exclusivo do
  Lucas** e exige registro em log (data, hora, usuário).
- Venda de café abre pré-preenchida com centro "Café" e categoria "Venda de café"; reserva lança em
  "Hospedagem — diárias" / centro "Hospedagem".
- As datas das etapas da safra (tela Safras) são a fonte única do status exibido na tela do Café.

## Arquitetura

- **Banco e nuvem:** Supabase (Postgres + Auth + Storage + RLS).
- **Login:** Entrar com Google, restrito aos 4 e-mails cadastrados. Qualquer outro é recusado.
- **Interface:** React + Vite + TypeScript. Reconstruída fielmente a partir do protótipo.
- **Distribuição:** aplicativo web hospedado, instalável pelo próprio navegador (PWA) — ganha ícone
  na área de trabalho e abre em janela própria, sem barra de endereço. Decidido em 04/08/2026, em
  substituição ao instalador `.exe` (Electron): dispensa download, evita o aviso de segurança do
  Windows, atualiza sozinho e funciona também no celular. O Electron foi descartado e vive apenas
  em `spec/legado-electron/`.
- **Anexos:** fonte da verdade no Supabase Storage, com cópia espelhada no Google Drive do Lucas.
  A autorização do Google vive **apenas no servidor** (Edge Function) — nunca no cliente.

Estrutura do Drive (o app cria e mantém sozinho), sempre sem acentos:

```
Villa Serenita/
├── Notas fiscais/2026/{Lucas, Michel}
├── Comprovantes de reservas/2026
├── Comprovantes financeiros/2026
├── Extratos bancarios/2026
├── Cafe e safra/2026
└── Prestacao de contas/2026
```

Arquivo de NF: `NF-{numero}-{emitente}.pdf`.

## Onde cada regra é garantida

As invariantes contábeis ficam **no banco** (constraints/triggers/policies), não só na interface:
soma das parcelas = total; devolução ≤ aporte em aberto; lançamento conciliado read-only;
destinatário de NF restrito; origem ≠ destino em transferência; dupla reserva da mesma acomodação
recusada por restrição de exclusão; estoque de café não fica negativo; parcelas de NF/dívida geram
despesas previstas; saldos e prestação de contas calculados a partir dos lançamentos;
`fechar_periodo()` recusa mês não conciliado **ou com nota fiscal sem documento**;
`audit_log` alimentado por trigger.

Ficam na aplicação: pré-preenchimentos, cálculo de +30 dias, redivisão de parcelas, UX de
conciliação.

## Convenções

- Todo texto da interface em português do Brasil; moeda `R$` com formatação pt-BR;
  CPF mascarado `000.000.000-00` (11 dígitos), CNPJ `00.000.000/0000-00`.
- Identidade visual: fundo `#161c0d`, cards `#212a14`, primário `#93a35f` (hover `#a8b76e`),
  terracota `#c2705a`/`#a9553f` para despesa/erro; texto `#edeade` / `#c3c6ac` / `#8b9174`.
  Instrument Serif (títulos) + Instrument Sans (interface). Cards raio 12px, campos 9px,
  pills 99px. **Sem emoji decorativo.**
- Menu agrupado: Operação / Financeiro / Configuração (ver protótipo).
- Dinheiro: `numeric(14,2)` no Postgres e inteiros de centavos no TypeScript. **Nunca float.**
- Um commit ao fim de cada etapa concluída.
- Toda migração termina num bloco `do $$` que tenta violar cada regra que ela cria
  e exige a recusa. E toda migração começa derrubando o que vai recriar
  (`drop ... if exists`): o SQL Editor do Supabase confirma cada comando na hora,
  então uma que falhe no meio precisa poder ser rodada de novo.

## Antes de pedir para o dono rodar uma migração

Aplique-a localmente, **nos dois modos**:

```bash
bash supabase/testes/testar.sh              # banco vazio
SEMEAR=1 bash supabase/testes/testar.sh     # banco já em uso
```

Cada modo esconde uma classe de erro que o outro pega. O `supabase/testes/README.md`
explica as três armadilhas que já custaram retrabalho — asserção absoluta sobre
agregado por sócio, coluna gerada em gatilho `BEFORE`, e migração não refazível.

## O que NÃO fazer

- Não copiar o HTML do protótipo para produção — recriar em React.
- Não usar os dados de exemplo do protótipo (nomes, CPFs, valores) como dados reais.
- Não remover validações do protótipo ao recriar telas.
- Não "melhorar" o design ao converter: reproduzir fielmente.
- Não expor credenciais do Google/Supabase no cliente.

## Perguntar ao dono antes de decidir

- Divisão do valor de pacotes multi-acomodação nos relatórios.
- Se a devolução de aporte precisa de aprovação dos demais sócios.
