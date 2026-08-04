-- =============================================================================
-- Villa Serenità — data de referência do lançamento
-- =============================================================================
-- Necessidade descoberta ao construir a tela de Lançamentos (Etapa 2).
--
-- "O que aconteceu em julho" tem duas respostas conforme a situação:
--   - Realizada: vale a data em que o dinheiro se moveu (data_pagamento)
--   - Prevista:  vale a data em que vence (data_vencimento), porque ainda não
--                houve pagamento
--
-- Sem uma coluna única, toda tela que filtra por mês precisaria repetir uma
-- consulta com duas condições combinadas — e bastaria uma delas ser escrita
-- errado para um lançamento sumir de um relatório e aparecer em outro.
--
-- Coluna GERADA: o Postgres a mantém sozinho, não há como divergir.
-- =============================================================================

alter table public.lancamentos
  add column data_referencia date
  generated always as (coalesce(data_pagamento, data_vencimento)) stored;

comment on column public.lancamentos.data_referencia is
  'Data pela qual o lançamento é agrupado por mês: pagamento quando realizado, '
  'vencimento quando previsto. Mantida pelo banco, nunca preenchida à mão.';

create index lanc_referencia on public.lancamentos (data_referencia);
create index lanc_referencia_tipo on public.lancamentos (data_referencia, tipo)
  where ativo;

-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------

do $$
declare
  v_conta  uuid;
  v_cat    uuid;
  v_centro uuid;
  v_prev   uuid;
  v_real   uuid;
begin
  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'ref', 'Corrente', 0, date '2020-01-01') returning id into v_conta;
  insert into public.categorias (nome, tipo) values ('__teste__', 'Despesa') returning id into v_cat;
  insert into public.centros_custo (nome, tipo) values ('__teste__', 'Despesa') returning id into v_centro;

  -- Prevista: a referência é o vencimento.
  insert into public.lancamentos (tipo, situacao, descricao, valor, data_vencimento,
    conta_id, categoria_id, centro_id)
    values ('Despesa', 'Prevista', '__teste__', 100, date '2026-09-20', v_conta, v_cat, v_centro)
    returning id into v_prev;

  if (select data_referencia from public.lancamentos where id = v_prev) <> date '2026-09-20' then
    raise exception 'Prevista deveria referenciar o vencimento';
  end if;

  -- Realizada: a referência é o pagamento, mesmo com vencimento em outro mês.
  insert into public.lancamentos (tipo, situacao, descricao, valor, data_vencimento,
    data_pagamento, conta_id, categoria_id, centro_id)
    values ('Despesa', 'Realizada', '__teste__', 100, date '2026-09-20', date '2026-10-03',
            v_conta, v_cat, v_centro)
    returning id into v_real;

  if (select data_referencia from public.lancamentos where id = v_real) <> date '2026-10-03' then
    raise exception 'Realizada deveria referenciar o pagamento';
  end if;

  -- Pagar uma prevista move a referência sozinha.
  update public.lancamentos
     set situacao = 'Realizada', data_pagamento = date '2026-09-25'
   where id = v_prev;

  if (select data_referencia from public.lancamentos where id = v_prev) <> date '2026-09-25' then
    raise exception 'A referência deveria acompanhar o pagamento';
  end if;

  delete from public.lancamentos where conta_id = v_conta;
  delete from public.contas_bancarias where banco = '__teste__';
  delete from public.categorias where nome = '__teste__';
  delete from public.centros_custo where nome = '__teste__';
  delete from public.audit_log
    where dados_depois::text like '%__teste__%' or dados_antes::text like '%__teste__%';

  raise notice 'OK: data_referencia segue vencimento na prevista e pagamento na realizada.';
end;
$$;
