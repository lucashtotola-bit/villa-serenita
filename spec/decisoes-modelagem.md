# Decisões de modelagem — Villa Serenità

Registro das decisões que definem o formato do banco de dados, tomadas com o dono
em 04/08/2026. Cada uma traz **o motivo**, não só a regra: daqui a meses, ao olhar
uma tabela e perguntar "por que isso é assim?", a resposta está aqui.

As regras de negócio invioláveis continuam no `CLAUDE.md` da raiz. Este documento
cobre *como* elas foram traduzidas em tabelas.

---

## Lançamentos

**1. Todo lançamento tem duas datas: vencimento e pagamento.**
O vencimento diz quando a obrigação vence; o pagamento, quando o dinheiro se moveu.
Sem essa separação não existe "contas a vencer" nem como representar uma parcela
futura de nota fiscal antes de ela ser paga.

**2. Parcelas de nota fiscal e de contrato de dívida nascem como despesa `Prevista`.**
Lançar uma NF em 3x cria três despesas previstas com seus vencimentos. Ao pagar,
a parcela vira `Realizada`. Resolve uma pendência antiga do protótipo, em que notas
fiscais e dívidas viviam em listas isoladas do financeiro.

**3. Lançamento é editável até ser conciliado; depois vira somente leitura.**
A trava é do banco, não da tela — um trigger recusa qualquer alteração em linha
conciliada. Toda edição anterior fica no `audit_log`.

**4. Transferência entre contas são dois lançamentos irmãos.**
Uma saída na origem e uma entrada no destino, ligados pelo mesmo `transferencia_id`
e marcados com `tipo = 'Transferência'`, o que os mantém fora do resultado e do
rateio. Poderiam viver numa tabela separada, mas então todo cálculo de saldo teria
de somar duas fontes — e é exatamente aí que sistemas contábeis passam a divergir
do extrato. Com tudo numa tabela, saldo é uma soma simples.

Os dois lançamentos são criados **pelo banco**, por trigger: a aplicação grava uma
transferência e não tem como esquecer uma das pontas.

---

## Notas fiscais e dívidas

**5. Juros de dívida são anotação; quem informa o valor da parcela é o usuário.**
O banco credor pode usar Price, SAC, com ou sem TR, e embutir taxas. Qualquer
cálculo nosso divergiria do boleto real. O número que o usuário tem em mãos — o
valor da parcela — é o que vale.

**6. O credor é um fornecedor cadastrado, não texto livre.**
No protótipo era texto, e "Sicoob", "SICOOB" e "Sicoob Sul" virariam três credores
distintos nos relatórios. Cadastrado, dá para somar tudo que se deve a um credor,
juntando dívidas e notas fiscais.

**7. Categoria e centro ficam na nota e são herdados por todas as parcelas.**
Uma compra de adubo em 3x é uma despesa só, dividida no tempo. Classificar uma vez
evita o erro de duas parcelas da mesma nota caírem em centros diferentes.

---

## Reservas

**8. Em pacote com mais de uma casa, o usuário informa o valor de cada uma.**
O app sugere a divisão igual e permite ajustar. Pacotes são ocasionais, então o
trabalho extra é pequeno e o número fica exato — em vez de o sistema supor uma
divisão que talvez não corresponda ao combinado. *(Era a pendência mais antiga do
projeto, registrada no `CLAUDE.md` como decisão do dono.)*

**9. Reserva confirmada gera receita `Prevista`, com vencimento na data de entrada.**
O sinal entra como recebimento assim que cai. Coerente com a decisão 2.

**10. Reserva cancelada vira status, não arquivo.**
Mantém o histórico e permite contar cancelamentos no período. A data volta a ficar
livre no calendário e as receitas previstas são desfeitas; sinal retido permanece
como receita, que é o correto.

---

## Café e safra

**11. Estoque controlado por tipo, com o rendimento do beneficiamento.**
Coco, cereja descascado e beneficiado são controlados separadamente. Beneficiar
segue o mesmo padrão da transferência: uma saída de um tipo e uma entrada de outro,
ligadas — e a diferença entre elas **é** o rendimento da lavoura.

**12. Custos da safra são lançamentos normais com centro "Café".**
Um saco de adubo é uma despesa como qualquer outra. A tela do Café apenas soma o
que está lá. Uma tabela própria de custos obrigaria a lançar o mesmo gasto duas
vezes — ou o resultado do mês deixaria de bater.

---

## Conciliação

**13. Linha de extrato sem correspondente vira lançamento já conciliado.**
O formulário abre preenchido com data, valor e descrição do banco; o usuário só
classifica. Transforma a conciliação na forma mais rápida de lançar o mês, em vez
de um trabalho de conferência.

**14. Reimportar um extrato ignora os movimentos repetidos.**
A comparação usa o identificador único que o próprio arquivo OFX traz para cada
movimento. Permite reimportar um período sobreposto sem duplicar nada.

---

## Prestação de contas

**15. Fechamento mensal, com o resultado congelado.**
Mensal porque a conciliação bancária também é — o erro aparece cedo, quando ainda
se lembra do que se tratava. Resolve a inconsistência do protótipo, que mostrava
painéis mensais e prestação trimestral.

Congelado porque o que os sócios aprovaram na reunião precisa continuar sendo
aquilo. O sistema grava o resultado e a parte de cada sócio como estavam no
fechamento; correções posteriores aparecem como diferença, não reescrevem a
história.

**16. Devolução de aporte não exige aval de outro sócio.**
Fica registrada no histórico com autor, data e valor, e o saldo de aportes é
visível a todos. Adequado a uma sociedade familiar de quatro pessoas — e hoje só
um sócio tem acesso ao sistema.

---

## Anexos

**17. Vínculo por colunas separadas, não por campo genérico.**
Em vez de `entidade` + `entidade_id`, existem `nota_fiscal_id`, `reserva_id`,
`lancamento_id` e afins, com uma trava garantindo que exatamente uma esteja
preenchida. Mais verboso, mas o banco impede um anexo apontar para uma nota fiscal
inexistente — o campo genérico não impede.

**18. Falha no envio ao Drive não impede salvar o anexo.**
O arquivo entra no Supabase, que é a fonte oficial, e fica em fila para o Drive.
Instabilidade de internet nunca faz perder um documento nem trava o lançamento de
uma nota fiscal, que exige anexo.

**19. Anexo não é excluído, é substituído.**
A versão anterior fica arquivada e recuperável. Foi justamente a falta de controle
de notas fiscais que motivou este sistema; nenhum documento fiscal desaparece.

---

## Decisões herdadas da Etapa 1

- **Sócio ≠ usuário:** os quatro existem sempre, com cota de 25% cuja soma o banco
  trava em 100%; só entra no app quem tem `pode_entrar` e e-mail.
- **Nada é apagado:** cadastros são arquivados. Nenhuma tabela tem policy de DELETE.
- **Saldo é calculado** a partir dos lançamentos; a conta guarda saldo inicial e data.
- **Dinheiro** é inteiro de centavos no TypeScript e `numeric(14,2)` no Postgres.
  Float nunca toca valor monetário.
