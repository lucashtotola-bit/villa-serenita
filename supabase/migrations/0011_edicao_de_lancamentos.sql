-- =============================================================================
-- Villa Serenità — editar e arquivar lançamentos (padrão de ERP)
-- =============================================================================
-- Decisão do dono, ao testar a Etapa 2: "similar a um ERP" precisa poder
-- corrigir um lançamento, não só criar. A trava de "conciliado é somente
-- leitura" já existe (migração 0003); o que faltava era a própria ação.
--
-- Um lançamento AVULSO (o usuário lançou direto) pode ser editado livremente.
-- Um lançamento GERADO (parcela de NF, receita de reserva, venda de café,
-- aporte, transferência) não pode: editar o valor ali dessincronizaria da
-- parcela/reserva de origem, e a soma que o banco garante deixaria de
-- significar nada. A coluna `origem` é o que distingue os dois casos —
-- calculada pelo próprio gatilho que cria cada tipo de lançamento, nunca
-- escolhida pelo usuário.
--
-- Transferência não ganha edição de valor/contas (mudar isso é estornar e
-- lançar de novo); só data e observação. Arquivar uma transferência arquiva
-- em cascata os dois lançamentos que ela gerou.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Coluna origem
-- -----------------------------------------------------------------------------

alter table public.lancamentos
  add column origem text not null default 'Avulso';

alter table public.lancamentos add constraint lanc_origem_valida check (
  origem in ('Avulso', 'Nota fiscal', 'Dívida', 'Reserva', 'Café', 'Transferência', 'Aporte')
);

comment on column public.lancamentos.origem is
  'Quem criou este lançamento. Só "Avulso" é editável livremente na tela de '
  'Lançamentos — os demais se editam pela tela de origem, para não '
  'dessincronizar da parcela/reserva/venda que os gerou.';

create index lanc_origem on public.lancamentos (origem);

-- Os lançamentos já existentes (Etapa 2, testados pelo Lucas) são avulsos por
-- definição — nenhum gatilho de geração automática tinha rodado ainda.

-- -----------------------------------------------------------------------------
-- 2. Marcar a origem nos gatilhos que já geram lançamentos
-- -----------------------------------------------------------------------------
-- Mesmas funções das migrações 0003/0004/0005/0006/0008, com o campo `origem`
-- acrescentado ao INSERT. O resto de cada função é idêntico ao original.

create or replace function public.tg_transferencia_gera_lancamentos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_descricao text;
begin
  v_descricao := coalesce(nullif(trim(new.observacao), ''), 'Transferência entre contas');

  insert into public.lancamentos (
    tipo, situacao, descricao, valor, data_vencimento, data_pagamento,
    conta_id, transferencia_id, sentido, origem, criado_por
  )
  values
    ('Transferência', 'Realizada', v_descricao, new.valor, new.data, new.data,
     new.conta_origem_id, new.id, 'Saída', 'Transferência', new.criado_por),
    ('Transferência', 'Realizada', v_descricao, new.valor, new.data, new.data,
     new.conta_destino_id, new.id, 'Entrada', 'Transferência', new.criado_por);

  return null;
end;
$$;

create or replace function public.tg_nf_parcela_gera_despesa()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  nf     public.notas_fiscais%rowtype;
  v_lanc uuid;
begin
  select * into nf from public.notas_fiscais where id = new.nota_fiscal_id;

  insert into public.lancamentos (
    tipo, situacao, descricao, valor, data_vencimento,
    conta_id, categoria_id, centro_id, clifor_id, origem, criado_por
  )
  values (
    'Despesa', 'Prevista',
    format('NF %s — parcela %s', nf.numero, new.numero),
    new.valor, new.vencimento,
    nf.conta_id, nf.categoria_id, nf.centro_id, nf.emitente_id, 'Nota fiscal', nf.criado_por
  )
  returning id into v_lanc;

  update public.nf_parcelas set lancamento_id = v_lanc where id = new.id;
  return null;
end;
$$;

create or replace function public.tg_divida_parcela_gera_despesa()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ct     public.contratos_divida%rowtype;
  v_lanc uuid;
begin
  select * into ct from public.contratos_divida where id = new.contrato_id;

  insert into public.lancamentos (
    tipo, situacao, descricao, valor, data_vencimento,
    conta_id, categoria_id, centro_id, clifor_id, origem, criado_por
  )
  values (
    'Despesa', 'Prevista',
    format('%s — parcela %s/%s', ct.descricao, new.numero, ct.numero_parcelas),
    new.valor, new.vencimento,
    ct.conta_id, ct.categoria_id, ct.centro_id, ct.credor_id, 'Dívida', ct.criado_por
  )
  returning id into v_lanc;

  update public.divida_parcelas set lancamento_id = v_lanc where id = new.id;
  return null;
end;
$$;

create or replace function public.tg_reserva_gera_receita()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hospede    text;
  v_saldo      numeric(14,2);
  v_status_ant text;
begin
  v_status_ant := case when tg_op = 'INSERT' then '' else old.status end;

  if new.status = 'Confirmada'
     and v_status_ant <> 'Confirmada'
     and not exists (select 1 from public.lancamentos where reserva_id = new.id)
  then
    select nome into v_hospede from public.hospedes where id = new.hospede_id;
    v_saldo := new.valor_total - new.sinal;

    if new.sinal > 0 then
      insert into public.lancamentos (
        tipo, situacao, descricao, valor, data_vencimento,
        conta_id, categoria_id, centro_id, reserva_id, origem, criado_por
      ) values (
        'Receita', 'Prevista', format('Sinal — reserva de %s', v_hospede),
        new.sinal, current_date,
        new.conta_id, new.categoria_id, new.centro_id, new.id, 'Reserva', new.criado_por
      );
    end if;

    if v_saldo > 0 then
      insert into public.lancamentos (
        tipo, situacao, descricao, valor, data_vencimento,
        conta_id, categoria_id, centro_id, reserva_id, origem, criado_por
      ) values (
        'Receita', 'Prevista', format('Hospedagem — %s', v_hospede),
        v_saldo, new.data_entrada,
        new.conta_id, new.categoria_id, new.centro_id, new.id, 'Reserva', new.criado_por
      );
    end if;
  end if;

  if new.status = 'Cancelada' and v_status_ant <> 'Cancelada' then
    update public.lancamentos
       set ativo = false
     where reserva_id = new.id
       and situacao = 'Prevista'
       and not conciliado;
  end if;

  return null;
end;
$$;

create or replace function public.tg_venda_gera_receita_e_baixa()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cliente text;
  v_lanc    uuid;
  v_mov     uuid;
begin
  select nome into v_cliente from public.clientes_fornecedores where id = new.cliente_id;

  insert into public.lancamentos (
    tipo, situacao, descricao, valor, data_vencimento, data_pagamento,
    conta_id, categoria_id, centro_id, clifor_id, origem, criado_por
  ) values (
    'Receita', 'Prevista',
    format('Venda de café — %s sacas (%s) para %s',
           trim(trailing '.' from trim(trailing '0' from new.sacas::text)),
           lower(new.tipo_cafe), v_cliente),
    new.valor_total, new.data, null,
    new.conta_id, new.categoria_id, new.centro_id, new.cliente_id, 'Café', new.criado_por
  )
  returning id into v_lanc;

  insert into public.cafe_estoque_movimentos (
    safra_id, data, tipo_movimento, tipo_cafe, sentido, sacas, observacao, criado_por
  ) values (
    new.safra_id, new.data, 'Venda', new.tipo_cafe, 'Saída', new.sacas,
    format('Venda para %s', v_cliente), new.criado_por
  )
  returning id into v_mov;

  update public.cafe_vendas
     set lancamento_id = v_lanc, movimento_id = v_mov
   where id = new.id;

  return null;
end;
$$;

create or replace function public.tg_aporte_gera_lancamento()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome text;
  v_lanc uuid;
begin
  select nome_curto into v_nome from public.socios where id = new.socio_id;

  insert into public.lancamentos (
    tipo, situacao, descricao, valor, data_vencimento, data_pagamento,
    conta_id, origem, criado_por
  ) values (
    new.tipo, 'Realizada',
    format('%s — %s', new.tipo, v_nome),
    new.valor, new.data, new.data,
    new.conta_id, 'Aporte', new.criado_por
  )
  returning id into v_lanc;

  update public.aportes set lancamento_id = v_lanc where id = new.id;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Edição de lançamento avulso — reforço explícito
-- -----------------------------------------------------------------------------
-- A trava de "conciliado é somente leitura" já cobre isso (migração 0003).
-- Aqui só se impede editar o TIPO ou a ORIGEM depois de criado — mudar um
-- avulso para "gerado" (ou vice-versa) não faz sentido e quebraria a
-- premissa de que só Avulso é editável.

create or replace function public.tg_lancamento_origem_travada()
returns trigger
language plpgsql
as $$
begin
  if new.origem <> old.origem then
    raise exception 'A origem de um lançamento não pode ser alterada.';
  end if;
  if old.origem <> 'Avulso' and new.tipo <> old.tipo then
    raise exception 'O tipo de um lançamento gerado automaticamente não pode ser alterado.';
  end if;
  return new;
end;
$$;

create trigger lancamentos_origem_travada
  before update on public.lancamentos
  for each row execute function public.tg_lancamento_origem_travada();

-- -----------------------------------------------------------------------------
-- 4. Transferência: só data/observação editáveis; arquivar é em cascata
-- -----------------------------------------------------------------------------

create or replace function public.tg_transferencia_edicao_restrita()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_algum_conciliado boolean;
begin
  select bool_or(conciliado) into v_algum_conciliado
    from public.lancamentos where transferencia_id = new.id;

  -- Mudar valor ou contas depois de criada dessincronizaria dos dois
  -- lançamentos já gerados. Mudar isso é estornar (arquivar) e lançar de novo.
  if new.valor <> old.valor
     or new.conta_origem_id <> old.conta_origem_id
     or new.conta_destino_id <> old.conta_destino_id
  then
    raise exception
      'Valor e contas de uma transferência não podem ser alterados. '
      'Arquive esta e registre uma nova.';
  end if;

  if (new.ativo <> old.ativo or new.data <> old.data) and v_algum_conciliado then
    raise exception
      'Um dos lançamentos desta transferência já está conciliado. '
      'Desfaça a conciliação antes de editar ou arquivar.';
  end if;

  return new;
end;
$$;

create trigger transferencia_edicao_restrita
  before update on public.transferencias
  for each row execute function public.tg_transferencia_edicao_restrita();

-- Arquivar (ou reativar) a transferência propaga para os dois lançamentos.
-- Mudar a data também propaga, para os lançamentos não ficarem com uma data
-- diferente da transferência que os originou.
create or replace function public.tg_transferencia_propaga()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.lancamentos
     set ativo = new.ativo,
         data_vencimento = new.data,
         data_pagamento = new.data
   where transferencia_id = new.id;
  return null;
end;
$$;

create trigger transferencia_propaga
  after update of ativo, data on public.transferencias
  for each row execute function public.tg_transferencia_propaga();

-- UPDATE em transferencias e lancamentos já foi concedido na migração 0003.

-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------

do $$
declare
  v_conta_a uuid;
  v_conta_b uuid;
  v_cat     uuid;
  v_centro  uuid;
  v_lanc    uuid;
  v_transf  uuid;
  v_origem  text;
  v_ok      boolean;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('email', (select email from public.socios where pode_entrar limit 1))::text,
    true
  );

  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'edicao_a', 'Corrente', 1000, date '2020-01-01') returning id into v_conta_a;
  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'edicao_b', 'Corrente', 0, date '2020-01-01') returning id into v_conta_b;
  insert into public.categorias (nome, tipo) values ('__teste__', 'Despesa') returning id into v_cat;
  insert into public.centros_custo (nome, tipo) values ('__teste__', 'Despesa') returning id into v_centro;

  -- 1. Lançamento avulso: origem default e editável enquanto não conciliado.
  insert into public.lancamentos (tipo, descricao, valor, data_vencimento, data_pagamento,
    conta_id, categoria_id, centro_id)
    values ('Despesa', '__teste__', 100, date '2026-06-01', date '2026-06-01',
            v_conta_a, v_cat, v_centro)
    returning id, origem into v_lanc, v_origem;

  if v_origem <> 'Avulso' then
    raise exception 'Lançamento criado pelo usuário deveria nascer com origem Avulso, veio %', v_origem;
  end if;

  update public.lancamentos set valor = 150 where id = v_lanc;
  if (select valor from public.lancamentos where id = v_lanc) <> 150 then
    raise exception 'Lançamento avulso não conciliado deveria ser editável';
  end if;

  -- 2. Não é possível mudar a origem de um lançamento.
  v_ok := false;
  begin
    update public.lancamentos set origem = 'Reserva' where id = v_lanc;
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Alterar a origem deveria ser recusado'; end if;

  -- 3. Transferência gerada tem origem 'Transferência', e não é editável direto.
  insert into public.transferencias (data, valor, conta_origem_id, conta_destino_id)
    values (date '2026-06-05', 200, v_conta_a, v_conta_b) returning id into v_transf;

  if not exists (
    select 1 from public.lancamentos where transferencia_id = v_transf and origem = 'Transferência'
  ) then
    raise exception 'Lançamentos da transferência deveriam ter origem Transferência';
  end if;

  v_ok := false;
  begin
    update public.transferencias set valor = 999 where id = v_transf;
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Editar o valor de uma transferência deveria ser recusado'; end if;

  -- 4. Arquivar a transferência arquiva os dois lançamentos em cascata.
  update public.transferencias set ativo = false where id = v_transf;

  if exists (select 1 from public.lancamentos where transferencia_id = v_transf and ativo) then
    raise exception 'Arquivar a transferência deveria arquivar os dois lançamentos';
  end if;

  -- Limpeza.
  delete from public.lancamentos where conta_id in (v_conta_a, v_conta_b);
  delete from public.transferencias where id = v_transf;
  delete from public.contas_bancarias where banco = '__teste__';
  delete from public.categorias where nome = '__teste__';
  delete from public.centros_custo where nome = '__teste__';
  delete from public.audit_log
    where dados_depois::text like '%__teste__%' or dados_antes::text like '%__teste__%';

  raise notice 'OK: origem travada, avulso editavel, transferencia so arquiva (nao edita valor).';
end;
$$;
