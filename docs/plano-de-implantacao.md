# Plano de implantação — do banco zerado ao primeiro mês de uso real

Checklist do que precisa ser lançado e preenchido antes de tratar o sistema como a fonte oficial
das contas do sítio. Siga na ordem — cada bloco depende do anterior.

## 0. Confirmar o banco zerado

- [ ] Rodar `supabase/manutencao/zerar-dados-de-teste.sql` no SQL Editor do Supabase, se ainda não
      rodou (apaga todo cadastro e lançamento de teste; mantém os 4 sócios e as 3 acomodações).
- [ ] Limpar o bucket `anexos` no Supabase Storage (o script de SQL não apaga arquivo, só a linha
      que aponta para ele).
- [ ] Limpar a pasta "Villa Serenita" no Google Drive compartilhado (cópias espelhadas dos anexos
      de teste).

## 1. Acesso

- [ ] Escolher quais sócios vão usar o sistema já no início (não precisa ser os quatro de uma vez).
- [ ] Liberar o acesso de cada um — procedimento em `docs/liberar-novos-usuarios.md`.
- [ ] Cada sócio liberado faz um login de teste, só para confirmar que entra.

## 2. Escolher a data de corte

Decida **um dia certo** a partir do qual tudo passa a ser lançado no sistema — o primeiro dia de
um mês costuma ser mais simples para fechar contas depois. Tudo que aconteceu antes dessa data
não precisa ser digitado retroativamente; só o **saldo de cada conta bancária na véspera** entra,
no cadastro da conta (passo 3). Escreva essa data em algum lugar visível para os quatro sócios —
ela é a referência de "a partir daqui, o sistema manda".

## 3. Cadastros básicos (Configuração → Cadastros)

Sem isso, nenhuma reserva, nota fiscal, dívida ou venda de café pode ser lançada — o sistema
bloqueia e pede para completar o cadastro primeiro.

- [ ] **Contas bancárias** — uma por conta que o sítio realmente usa. O campo mais importante é o
      **saldo inicial + a data do saldo inicial**: é a partir dele que todo saldo futuro é
      calculado, então confira contra o extrato do banco antes de salvar. Preencha agência e
      número da conta também — é o que permite reconhecer o extrato OFX na hora de importar.
- [ ] **Categorias** de receita e despesa que realmente serão usadas (as de teste já foram
      apagadas no passo 0).
- [ ] **Centros de custo/receita** reais (ex.: Hospedagem, Café, Administrativo — o que fizer
      sentido para o sítio).
- [ ] **Clientes e fornecedores** — pelo menos os recorrentes: quem compra café, quem vende
      insumo, prestadores frequentes. Os demais podem ser cadastrados conforme aparecem.
- [ ] **Hóspedes** — não precisa cadastrar todo mundo de uma vez; cadastre quem já tem reserva
      confirmada para o período à frente (é obrigatório ter o hóspede cadastrado antes de lançar
      a reserva dele).

## 4. Acomodações

- [ ] As três casas (Rifugio Fieline, Casa Vecchia, Casa Verona) já existem — não recriar. Só
      conferir se a **diária padrão** e a **cor** de cada uma em Cadastros continuam corretas;
      ajuste se mudou desde que foram cadastradas.

## 5. Situação em andamento no dia da virada

O que já existe na vida real na data de corte precisa entrar no sistema, para ele refletir a
realidade desde o primeiro dia — não é para recriar histórico, só o que ainda está em aberto:

- [ ] **Reservas já confirmadas ou pré-reservas** para datas depois da virada.
- [ ] **Notas fiscais parceladas ainda não quitadas** (lance a nota inteira; o sistema recria as
      parcelas que já foram pagas como situação "Realizada" e as que faltam como "Prevista" — ou,
      mais simples, lance só o que falta pagar como uma nota nova, se preferir não reconstituir
      o histórico completo).
- [ ] **Contratos de dívida em andamento** (financiamentos, empréstimos), com o número de parcelas
      que ainda faltam.
- [ ] **Aporte em aberto de algum sócio**, se houver — registre em Aportes para o saldo devedor
      do sítio com aquele sócio já nascer correto.

## 6. Café e safra

- [ ] Criar a **safra atual** em Safras, com o ciclo, a área e a expectativa de sacas — as seis
      etapas sugeridas já vêm com datas, ajuste conforme a lavoura de verdade.
- [ ] Registrar o **estoque inicial** de café: para cada tipo que já existe fisicamente (coco,
      descascado, beneficiado), um movimento de **"⚖ Ajuste de inventário"** com a contagem real —
      é a única forma de dar um saldo inicial ao estoque, já que ele é sempre calculado por
      movimento, nunca digitado direto.

## 7. Extrato bancário

- [ ] Importar o **OFX de cada conta**, a partir da data do saldo inicial cadastrado no passo 3.
      É isso que permite conciliar os lançamentos do primeiro mês e, no fim dele, fechar o mês —
      o fechamento exige tudo conciliado.

## 8. Rede de segurança antes de depender do sistema para valer

- [ ] Confirmar em **Database → Backups**, no painel do Supabase, que o backup automático está
      ativo.
- [ ] Fazer o **primeiro fechamento de mês de teste** (pode ser um mês curto, só para validar o
      fluxo) e conferir se o relatório bate com o que os sócios esperam antes de tratar o número
      como oficial.

## Pronto para valer quando…

Todos os itens acima estiverem marcados **e** o primeiro mês fechar sem surpresa. A partir daí,
o sistema é a fonte oficial das contas — e qualquer dúvida futura sobre "por que uma tela funciona
assim" começa pelo `CLAUDE.md` da raiz.
