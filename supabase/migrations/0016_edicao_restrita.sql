-- =============================================================================
-- Villa Serenità — aporte, venda de café e distribuição: arquivar, não editar
-- =============================================================================
-- Problema C3 da revisão de 06/08/2026, resolvido com a opção escolhida pelo
-- dono: RECUSAR a edição e exigir "arquive e lance de novo".
--
-- O PROBLEMA
-- Os gatilhos que criam lançamentos a partir dessas tabelas são `after insert`
-- apenas, mas `UPDATE` está concedido nelas desde as migrações 0006 e 0008.
-- Editar o valor de um aporte de 10.000 para 5.000 deixava `saldo_aportes`
-- mostrando 5.000 (lê `aportes`) e `saldos_contas` mostrando 10.000 (lê
-- `lancamentos`) — os dois números na mesma tela de Prestação de contas.
--
-- POR QUE RECUSAR EM VEZ DE PROPAGAR
-- Propagar exigiria um gatilho por tabela cuidando de cada coluna, e cada um
-- seria uma chance nova de esquecer um caso. Recusar é uma regra só, e o
-- sistema já tem o precedente: a transferência faz exatamente isso desde a
-- migração 0011. Editar um aporte já lançado é raro; o custo de exigir
-- "arquive e lance de novo" é pequeno perto do de um saldo que mente.
--
-- O QUE CONTINUA PODENDO MUDAR: `ativo` (arquivar) e `observacao`. Arquivar
-- propaga para o que foi gerado — sem isso, arquivar seria a mesma operação
-- pela metade que a edição era.
--
-- Nenhuma tela edita essas tabelas hoje; elas só inserem e leem. Esta migração
-- fecha a porta antes de alguém abri-la, pela API ou por uma tela futura.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: só `ativo` e `observacao` podem mudar
-- -----------------------------------------------------------------------------
-- Mesma técnica de `tg_lancamento_conciliado_travado` (migração 0003): comparar
-- a linha inteira em jsonb, descontando as chaves que têm permissão de mudar.
-- Uma coluna nova acrescentada amanhã já nasce protegida, em vez de depender de
-- alguém lembrar de incluí-la numa lista.

create or replace function public.tg_so_arquiva_nao_edita()
returns trigger
language plpgsql
as $$
declare
  -- Os gatilhos geradores voltam para preencher o vínculo com o que acabaram
  -- de criar (`update aportes set lancamento_id = ...` logo após o INSERT).
  -- Esse preenchimento é o próprio sistema trabalhando, e acontece uma vez só:
  -- de nulo para um valor. Sem abrir esta exceção, a trava barraria a criação.
  v_vinculos constant text[] := array['lancamento_id', 'movimento_id'];
  v_ignorar  text[];
  v_antes    jsonb;
  v_depois   jsonb;
  v_col      text;
begin
  -- Coluna GERADA (cafe_vendas.valor_total) tem de ficar fora da comparação:
  -- o Postgres só a calcula DEPOIS dos gatilhos BEFORE, então aqui ela chega
  -- nula em NEW e preenchida em OLD. A diferença é do motor, não do usuário —
  -- e sem esta linha ela reprovava até o gatilho gerador da própria venda.
  -- Descoberta pelo catálogo, para não depender de manter uma lista à mão.
  select array['ativo', 'observacao', 'atualizado_em'] || v_vinculos
         || coalesce(array_agg(attname), '{}')
    into v_ignorar
    from pg_attribute
   where attrelid = tg_relid
     and attgenerated <> ''
     and not attisdropped;

  v_antes  := to_jsonb(old) - v_ignorar;
  v_depois := to_jsonb(new) - v_ignorar;

  if v_antes is distinct from v_depois then
    raise exception
      '% não pode ser editado depois de lançado, porque o lançamento no caixa '
      'já foi gerado a partir dele. Arquive % e registre de novo.',
      tg_argv[0], tg_argv[1];
  end if;

  -- Trocar um vínculo JÁ preenchido é outra coisa: apontaria o registro para
  -- um lançamento diferente do que ele gerou, que é a mesma dessincronização
  -- por outro caminho.
  foreach v_col in array v_vinculos loop
    if to_jsonb(old) -> v_col not in ('null'::jsonb)
       and to_jsonb(old) -> v_col is distinct from to_jsonb(new) -> v_col then
      raise exception
        'O vínculo de % com o lançamento que ele gerou não pode ser alterado.',
        tg_argv[0];
    end if;
  end loop;

  return new;
end;
$$;

comment on function public.tg_so_arquiva_nao_edita is
  'Deixa passar apenas arquivamento e observação. O resto exige arquivar e '
  'lançar de novo, para o registro e o lançamento nunca divergirem.';

-- `drop if exists` antes de cada `create`: o SQL Editor da Supabase confirma
-- cada comando na hora, e não a migração inteira ao final. Uma tentativa que
-- falhe no bloco de conferência deixa os gatilhos criados — e a segunda
-- tentativa esbarraria neles. Toda migração daqui em diante nasce refazível.
drop trigger if exists aportes_so_arquiva             on public.aportes;
drop trigger if exists cafe_vendas_so_arquiva         on public.cafe_vendas;
drop trigger if exists distribuicoes_so_arquiva       on public.distribuicoes;
drop trigger if exists distribuicao_socios_so_arquiva on public.distribuicao_socios;
drop trigger if exists aporte_arquiva                 on public.aportes;
drop trigger if exists distribuicao_arquiva           on public.distribuicoes;
drop trigger if exists venda_cafe_arquiva             on public.cafe_vendas;

-- Sobra de uma versão anterior desta mesma migração, antes de o gatilho da
-- divisão passar a usar o helper comum.
drop trigger  if exists distribuicao_socios_imutavel on public.distribuicao_socios;
drop function if exists public.tg_distribuicao_socios_imutavel();

create trigger aportes_so_arquiva
  before update on public.aportes
  for each row execute function public.tg_so_arquiva_nao_edita('O aporte', 'o aporte');

create trigger cafe_vendas_so_arquiva
  before update on public.cafe_vendas
  for each row execute function public.tg_so_arquiva_nao_edita('A venda de café', 'a venda');

create trigger distribuicoes_so_arquiva
  before update on public.distribuicoes
  for each row execute function public.tg_so_arquiva_nao_edita('A distribuição', 'a distribuição');

-- A divisão entre os sócios não tem sequer o que arquivar por linha: ela vive e
-- morre com a distribuição, e mexer no valor de uma parte dessincronizaria do
-- lançamento daquele sócio. A tabela não tem `ativo` nem `observacao`, então o
-- mesmo gatilho a deixa completamente imutável — menos o vínculo, que o gerador
-- ainda precisa preencher.
create trigger distribuicao_socios_so_arquiva
  before update on public.distribuicao_socios
  for each row execute function public.tg_so_arquiva_nao_edita(
    'A divisão entre os sócios', 'a distribuição');

-- -----------------------------------------------------------------------------
-- Arquivar um aporte
-- -----------------------------------------------------------------------------
-- Duas travas antes de propagar:
--
-- 1. Se o lançamento já foi conciliado com o extrato, arquivar apagaria do
--    caixa um dinheiro que o banco confirma ter entrado.
-- 2. Se o sócio já teve devolução, arquivar o aporte pode deixar o saldo dele
--    negativo — o sistema estaria dizendo que ele recebeu de volta mais do que
--    pôs. A trava de devolução (migração 0008) só olha para a inserção da
--    devolução; esta fecha o outro lado.

create or replace function public.tg_aporte_arquiva()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_saldo numeric(14,2);
  v_nome  text;
begin
  if new.ativo = old.ativo then
    return null;
  end if;

  if exists (
    select 1 from public.lancamentos
     where id = new.lancamento_id and conciliado
  ) then
    raise exception
      'O lançamento deste aporte já foi conciliado com o extrato. Desfaça a '
      'conciliação antes de arquivar.';
  end if;

  if not new.ativo then
    select coalesce(sum(case when tipo = 'Aporte' then valor else -valor end), 0)
      into v_saldo
      from public.aportes
     where socio_id = new.socio_id and ativo and id <> new.id;

    if v_saldo < 0 then
      select nome_curto into v_nome from public.socios where id = new.socio_id;
      raise exception
        'Arquivar este aporte deixaria % com saldo negativo (R$ %): há '
        'devolução registrada que depende dele.',
        v_nome, to_char(v_saldo, 'FM999G999G990D00');
    end if;
  end if;

  update public.lancamentos set ativo = new.ativo where id = new.lancamento_id;
  return null;
end;
$$;

create trigger aporte_arquiva
  after update of ativo on public.aportes
  for each row execute function public.tg_aporte_arquiva();

-- -----------------------------------------------------------------------------
-- Arquivar uma distribuição
-- -----------------------------------------------------------------------------
-- Uma distribuição gera um lançamento POR SÓCIO (migração 0012). Todos vão
-- junto — arquivar metade de uma partilha não é um estado que signifique algo.

create or replace function public.tg_distribuicao_arquiva()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.ativo = old.ativo then
    return null;
  end if;

  if exists (
    select 1 from public.distribuicao_socios ds
      join public.lancamentos l on l.id = ds.lancamento_id
     where ds.distribuicao_id = new.id and l.conciliado
  ) then
    raise exception
      'Ao menos um lançamento desta distribuição já foi conciliado. Desfaça a '
      'conciliação antes de arquivar.';
  end if;

  update public.lancamentos set ativo = new.ativo
   where id in (
     select lancamento_id from public.distribuicao_socios
      where distribuicao_id = new.id and lancamento_id is not null
   );

  return null;
end;
$$;

create trigger distribuicao_arquiva
  after update of ativo on public.distribuicoes
  for each row execute function public.tg_distribuicao_arquiva();

-- -----------------------------------------------------------------------------
-- Arquivar uma venda de café
-- -----------------------------------------------------------------------------
-- Aqui há uma ponta a mais que no aporte e na distribuição: a venda também deu
-- baixa no estoque. Arquivar só o lançamento deixaria as sacas consumidas para
-- sempre, e o estoque passaria a mentir tanto quanto o saldo mentia.
--
-- `cafe_estoque_movimentos` não tem coluna `ativo` de propósito: movimento de
-- estoque é histórico, não se apaga. Então a devolução das sacas entra como um
-- movimento novo de 'Ajuste', que é exatamente o que a migração 0006 reservou
-- para acertar divergência de inventário.
--
-- Reativar refaz a baixa. Se as sacas já tiverem sido vendidas nesse meio
-- tempo, a trava de estoque não negativo recusa — e recusar é o certo: não dá
-- para desarquivar a venda de um café que não existe mais.

create or replace function public.tg_venda_cafe_arquiva()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cliente text;
begin
  if new.ativo = old.ativo then
    return null;
  end if;

  if exists (
    select 1 from public.lancamentos
     where id = new.lancamento_id and conciliado
  ) then
    raise exception
      'O lançamento desta venda já foi conciliado com o extrato. Desfaça a '
      'conciliação antes de arquivar.';
  end if;

  update public.lancamentos set ativo = new.ativo where id = new.lancamento_id;

  select nome into v_cliente from public.clientes_fornecedores where id = new.cliente_id;

  insert into public.cafe_estoque_movimentos (
    safra_id, data, tipo_movimento, tipo_cafe, sentido, sacas, observacao, criado_por
  ) values (
    new.safra_id, current_date, 'Ajuste', new.tipo_cafe,
    case when new.ativo then 'Saída' else 'Entrada' end,
    new.sacas,
    format('%s da venda para %s',
           case when new.ativo then 'Rebaixa' else 'Devolução ao estoque' end,
           coalesce(v_cliente, 'cliente')),
    public.socio_atual_id()
  );

  return null;
end;
$$;

create trigger venda_cafe_arquiva
  after update of ativo on public.cafe_vendas
  for each row execute function public.tg_venda_cafe_arquiva();

-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------

do $$
declare
  v_conta  uuid;
  v_cat    uuid;
  v_centro uuid;
  v_cli    uuid;
  v_socio  uuid;
  v_safra  uuid;
  v_aporte uuid;
  v_ap2    uuid;
  v_venda  uuid;
  v_dist   uuid;
  v_lanc   uuid;
  v_extr   uuid;
  v_linha  uuid;
  v_saldo  numeric(14,2);
  v_base   numeric(14,2);
  v_sacas  numeric(12,3);
  v_ok     boolean;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('email', (select email from public.socios where pode_entrar limit 1))::text,
    true
  );

  select id into v_socio from public.socios where ativo order by nome_completo limit 1;

  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'ed', 'Corrente', 0, date '2020-01-01') returning id into v_conta;
  insert into public.categorias (nome, tipo) values ('__teste__', 'Receita') returning id into v_cat;
  insert into public.centros_custo (nome, tipo) values ('__teste__', 'Receita e despesa') returning id into v_centro;
  insert into public.clientes_fornecedores (nome, relacao, documento, contato)
    values ('__teste__', 'Cliente', '44455566677', 'x') returning id into v_cli;
  insert into public.safras (ciclo) values ('__teste__') returning id into v_safra;

  -- 1. O gatilho gerador tem de conseguir preencher o vínculo. Este é o caso
  -- que a primeira versão desta migração quebrou: a trava barrava o próprio
  -- sistema, e nenhum aporte podia mais ser criado.
  select saldo_em_aberto into v_base from public.saldo_aportes where socio_id = v_socio;

  insert into public.aportes (socio_id, tipo, valor, data, conta_id)
    values (v_socio, 'Aporte', 10000.00, date '2026-05-10', v_conta) returning id into v_aporte;

  select lancamento_id into v_lanc from public.aportes where id = v_aporte;
  if v_lanc is null then
    raise exception 'O gatilho deveria ter preenchido o lançamento do aporte';
  end if;

  -- Mas trocar um vínculo já preenchido aponta para outro lançamento, e isso
  -- continua sendo recusado.
  v_ok := false;
  begin
    update public.aportes set lancamento_id = gen_random_uuid() where id = v_aporte;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'Trocar o vínculo de um aporte já lançado deveria ser recusado';
  end if;

  -- 2. Editar o valor de um aporte tem de ser recusado.
  v_ok := false;
  begin
    update public.aportes set valor = 5000.00 where id = v_aporte;
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Editar o valor de um aporte deveria ser recusado'; end if;

  -- 3. Mudar a observação continua podendo.
  update public.aportes set observacao = 'anotação' where id = v_aporte;

  -- 4. Arquivar o aporte tira do caixa E do saldo do sócio, juntos.
  -- O saldo do sócio é medido pela DIFERENÇA: ele já tem aportes reais, e um
  -- teste que exigisse zero no fim só passaria num banco vazio.
  select saldo_atual into v_saldo from public.saldos_contas where conta_id = v_conta;
  if v_saldo <> 10000.00 then raise exception 'O aporte deveria estar no caixa'; end if;

  if (select saldo_em_aberto from public.saldo_aportes where socio_id = v_socio)
     <> v_base + 10000.00 then
    raise exception 'O aporte deveria somar 10.000 ao saldo do sócio';
  end if;

  update public.aportes set ativo = false where id = v_aporte;

  select saldo_atual into v_saldo from public.saldos_contas where conta_id = v_conta;
  if v_saldo <> 0 then
    raise exception 'Arquivar o aporte deveria zerar o caixa, está em %', v_saldo;
  end if;
  if (select saldo_em_aberto from public.saldo_aportes where socio_id = v_socio) <> v_base then
    raise exception
      'Arquivar o aporte deveria devolver o saldo do sócio a %, mas ficou em %',
      v_base, (select saldo_em_aberto from public.saldo_aportes where socio_id = v_socio);
  end if;

  -- 5. Arquivar um aporte que sustenta uma devolução tem de ser recusado.
  -- A devolução esgota TODO o saldo do sócio (o real mais os 10.000 do teste);
  -- só assim arquivar o aporte de teste de fato deixaria a conta negativa.
  update public.aportes set ativo = true where id = v_aporte;
  insert into public.aportes (socio_id, tipo, valor, data, conta_id)
    values (v_socio, 'Devolução', v_base + 10000.00, date '2026-05-20', v_conta)
    returning id into v_ap2;

  v_ok := false;
  begin
    update public.aportes set ativo = false where id = v_aporte;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'Arquivar aporte que sustenta devolução deveria ser recusado';
  end if;

  -- 6. Venda de café: editar recusado; arquivar devolve as sacas.
  insert into public.cafe_estoque_movimentos
    (safra_id, data, tipo_movimento, tipo_cafe, sentido, sacas)
    values (v_safra, date '2026-07-01', 'Colheita', 'Beneficiado', 'Entrada', 50);

  insert into public.cafe_vendas
    (safra_id, cliente_id, data, tipo_cafe, sacas, preco_saca, categoria_id, centro_id, conta_id)
    values (v_safra, v_cli, date '2026-09-01', 'Beneficiado', 20, 1000.00, v_cat, v_centro, v_conta)
    returning id into v_venda;

  select sacas into v_sacas from public.estoque_cafe
   where safra_id = v_safra and tipo_cafe = 'Beneficiado';
  if v_sacas <> 30 then raise exception 'Estoque deveria cair para 30, está em %', v_sacas; end if;

  v_ok := false;
  begin
    update public.cafe_vendas set sacas = 5 where id = v_venda;
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Editar a venda de café deveria ser recusado'; end if;

  update public.cafe_vendas set ativo = false where id = v_venda;

  select sacas into v_sacas from public.estoque_cafe
   where safra_id = v_safra and tipo_cafe = 'Beneficiado';
  if v_sacas <> 50 then
    raise exception 'Arquivar a venda deveria devolver as sacas (50), está em %', v_sacas;
  end if;

  select lancamento_id into v_lanc from public.cafe_vendas where id = v_venda;
  if (select ativo from public.lancamentos where id = v_lanc) then
    raise exception 'Arquivar a venda deveria arquivar a receita';
  end if;

  -- 7. Distribuição: editar recusado; arquivar leva todos os lançamentos.
  v_dist := public.criar_distribuicao(
    date '2026-07-05', 600.00, null, v_conta, '__teste__',
    format('[{"socio_id":"%s","valor":"600.00"}]', v_socio)::jsonb);

  v_ok := false;
  begin
    update public.distribuicoes set valor_total = 900.00 where id = v_dist;
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Editar a distribuição deveria ser recusado'; end if;

  v_ok := false;
  begin
    update public.distribuicao_socios set valor = 100.00 where distribuicao_id = v_dist;
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Editar a divisão entre sócios deveria ser recusado'; end if;

  update public.distribuicoes set ativo = false where id = v_dist;

  if exists (
    select 1 from public.distribuicao_socios ds
      join public.lancamentos l on l.id = ds.lancamento_id
     where ds.distribuicao_id = v_dist and l.ativo
  ) then
    raise exception 'Arquivar a distribuição deveria arquivar os lançamentos dos sócios';
  end if;

  -- 8. Arquivar com lançamento já conciliado tem de ser recusado.
  -- A conciliação vai pelo caminho legítimo: desde a migração 0014 marcar
  -- `conciliado` na mão é recusado, e é bom que este teste também prove isso.
  update public.distribuicoes set ativo = true where id = v_dist;
  select lancamento_id into v_lanc from public.distribuicao_socios where distribuicao_id = v_dist;

  insert into public.extratos_importados (conta_id, arquivo_nome)
    values (v_conta, '__teste__.ofx') returning id into v_extr;
  -- Distribuição é saída de caixa, então no extrato o valor vem negativo.
  insert into public.extrato_linhas
    (extrato_id, conta_id, data, descricao, valor, identificador_banco)
    values (v_extr, v_conta, date '2026-07-05', '__teste__ distrib', -600.00, 'FITID-T16')
    returning id into v_linha;
  update public.extrato_linhas
     set lancamento_id = v_lanc, conciliado_em = now() where id = v_linha;

  if not (select conciliado from public.lancamentos where id = v_lanc) then
    raise exception 'A conciliação pela linha de extrato deveria ter funcionado';
  end if;

  v_ok := false;
  begin
    update public.distribuicoes set ativo = false where id = v_dist;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'Arquivar distribuição com lançamento conciliado deveria ser recusado';
  end if;

  -- Limpeza. `criar_distribuicao` deixou a trava de soma em modo imediato, e
  -- apagar as partes uma a uma estouraria na primeira; diferindo, a conferência
  -- só roda no fim, quando a distribuição também já saiu.
  set constraints all deferred;

  -- Desfazer o vínculo destrava o lançamento sozinho (migração 0007).
  update public.extrato_linhas
     set lancamento_id = null, conciliado_em = null, conciliado_por = null
   where id = v_linha;
  delete from public.extrato_linhas where extrato_id = v_extr;
  delete from public.extratos_importados where id = v_extr;
  delete from public.distribuicao_socios where distribuicao_id = v_dist;
  delete from public.distribuicoes where id = v_dist;
  delete from public.cafe_vendas where safra_id = v_safra;
  delete from public.cafe_estoque_movimentos where safra_id = v_safra;
  delete from public.aportes where conta_id = v_conta;
  delete from public.lancamentos where conta_id = v_conta;
  delete from public.safras where id = v_safra;
  delete from public.clientes_fornecedores where nome = '__teste__';
  delete from public.contas_bancarias where banco = '__teste__';
  delete from public.categorias where nome = '__teste__';
  delete from public.centros_custo where nome = '__teste__';
  delete from public.audit_log
    where dados_depois::text like '%__teste__%' or dados_antes::text like '%__teste__%';

  raise notice 'OK: aporte, venda e distribuicao nao editam; arquivar leva junto '
               'o lancamento, o saldo do socio e as sacas.';
end;
$$;
