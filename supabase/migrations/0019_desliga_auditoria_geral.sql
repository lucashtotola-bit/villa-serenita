-- =============================================================================
-- Villa Serenità — desliga a auditoria geral
-- =============================================================================
-- Decisão do dono (08/08/2026): a sociedade é toda familiar, e o audit_log
-- genérico (24 tabelas, alimentando a tela de Histórico) não tem mais
-- utilidade — ninguém consultava o rastro de quem editou uma reserva ou uma
-- categoria. A única coisa que de fato precisa continuar garantida é a
-- exclusividade de quem pode desfazer uma conciliação/prestação de contas já
-- fechada — e essa regra NÃO depende do audit_log: ela vive em
-- `tg_lancamento_conciliado_travado()` (0014) e em `reabrir_periodo()`
-- (0018), que checam `pode_desfazer_conciliacao` e recusam via exceção,
-- independente de qualquer log. Por isso esta migração não cria nada em
-- substituição — só para de gravar.
--
-- O que fica: a tabela `audit_log` e tudo que já foi gravado até hoje. Nada é
-- apagado (spec/decisoes-modelagem.md) — só param de chegar linhas novas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Desliga os 26 gatilhos de auditoria genérica
-- -----------------------------------------------------------------------------

drop trigger if exists socios_audit on public.socios;
drop trigger if exists categorias_audit on public.categorias;
drop trigger if exists centros_audit on public.centros_custo;
drop trigger if exists hospedes_audit on public.hospedes;
drop trigger if exists clifor_audit on public.clientes_fornecedores;
drop trigger if exists contas_audit on public.contas_bancarias;

drop trigger if exists transferencias_audit on public.transferencias;
drop trigger if exists lancamentos_audit on public.lancamentos;

drop trigger if exists nf_audit on public.notas_fiscais;
drop trigger if exists nf_parcelas_audit on public.nf_parcelas;
drop trigger if exists divida_audit on public.contratos_divida;
drop trigger if exists divida_parcelas_audit on public.divida_parcelas;

drop trigger if exists acomodacoes_audit on public.acomodacoes;
drop trigger if exists reservas_audit on public.reservas;
drop trigger if exists res_acom_audit on public.reserva_acomodacoes;

drop trigger if exists safras_audit on public.safras;
drop trigger if exists etapas_audit on public.safra_etapas;
drop trigger if exists estoque_audit on public.cafe_estoque_movimentos;
drop trigger if exists vendas_audit on public.cafe_vendas;

drop trigger if exists extratos_audit on public.extratos_importados;
drop trigger if exists linhas_audit on public.extrato_linhas;

drop trigger if exists aportes_audit on public.aportes;
drop trigger if exists fechamentos_audit on public.fechamentos;

drop trigger if exists anexos_audit on public.anexos;

drop trigger if exists distribuicoes_audit on public.distribuicoes;
drop trigger if exists distribuicao_socios_audit on public.distribuicao_socios;

-- Sem gatilho nenhum apontando para ela, a função vira código morto.
drop function if exists public.tg_audit();

-- A tela de Histórico que a consumia foi removida do aplicativo (React); a
-- visão que ela lia perde sentido sem novas linhas chegando.
drop view if exists public.historico;

-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------

do $$
declare
  v_conta       uuid;
  v_cat         uuid;
  v_centro      uuid;
  v_lucas       uuid;
  v_outro       uuid;
  v_lanc        uuid;
  v_extr        uuid;
  v_linha       uuid;
  v_fech        uuid;
  v_qtd_antes   int;
  v_qtd_depois  int;
  v_ok          boolean;
begin
  select id into v_lucas from public.socios where pode_desfazer_conciliacao limit 1;
  select id into v_outro from public.socios where not pode_desfazer_conciliacao limit 1;

  perform set_config(
    'request.jwt.claims',
    json_build_object('email', (select email from public.socios where id = v_lucas))::text,
    true
  );

  -- 1. UPDATE/INSERT em tabelas comuns não gera mais linha nenhuma no audit_log.
  select count(*) into v_qtd_antes from public.audit_log;

  insert into public.categorias (nome, tipo) values ('__teste__', 'Despesa') returning id into v_cat;
  update public.categorias set nome = '__teste__ 2' where id = v_cat;

  select count(*) into v_qtd_depois from public.audit_log;
  if v_qtd_depois <> v_qtd_antes then
    raise exception 'audit_log nao deveria crescer mais: tinha %, agora tem %', v_qtd_antes, v_qtd_depois;
  end if;

  -- 2. A view historico foi removida de verdade.
  v_ok := false;
  begin
    perform 1 from public.historico limit 1;
  exception when undefined_table then v_ok := true;
  end;
  if not v_ok then
    raise exception 'A visao public.historico deveria ter deixado de existir';
  end if;

  -- 3. A exclusividade de desfazer conciliacao apos o fechamento continua de
  --    pe, sem depender do audit_log.
  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'v19', 'Corrente', 0, date '2020-01-01') returning id into v_conta;
  insert into public.centros_custo (nome, tipo) values ('__teste__', 'Receita') returning id into v_centro;

  insert into public.lancamentos (tipo, descricao, valor, data_vencimento, data_pagamento,
    conta_id, categoria_id, centro_id)
    values ('Receita', '__teste__', 1000.00, date '2027-02-15', date '2027-02-15',
            v_conta, v_cat, v_centro)
    returning id into v_lanc;

  insert into public.extratos_importados (conta_id, arquivo_nome)
    values (v_conta, '__teste__.ofx') returning id into v_extr;
  insert into public.extrato_linhas
    (extrato_id, conta_id, data, descricao, valor, identificador_banco)
    values (v_extr, v_conta, date '2027-02-15', '__teste__', 1000.00, 'FITID-T19')
    returning id into v_linha;
  update public.extrato_linhas
     set lancamento_id = v_lanc, conciliado_em = now() where id = v_linha;

  v_fech := public.fechar_periodo(date '2027-02-01');

  -- Sócio sem o privilégio não pode desfazer a conciliação da competência fechada.
  perform set_config(
    'request.jwt.claims',
    json_build_object('email', (select email from public.socios where id = v_outro))::text,
    true
  );

  v_ok := false;
  begin
    update public.lancamentos set conciliado = false where id = v_lanc;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'Socio sem privilegio nao deveria conseguir desfazer conciliacao de competencia fechada';
  end if;

  -- O sócio autorizado consegue.
  perform set_config(
    'request.jwt.claims',
    json_build_object('email', (select email from public.socios where id = v_lucas))::text,
    true
  );

  update public.lancamentos set conciliado = false where id = v_lanc;
  if (select conciliado from public.lancamentos where id = v_lanc) then
    raise exception 'O socio autorizado deveria ter conseguido desfazer a conciliacao';
  end if;

  -- Limpeza.
  update public.extrato_linhas set lancamento_id = null, conciliado_em = null,
    conciliado_por = null where id = v_linha;
  delete from public.extrato_linhas where extrato_id = v_extr;
  delete from public.extratos_importados where id = v_extr;
  delete from public.fechamento_socios where fechamento_id = v_fech;
  delete from public.fechamentos where id = v_fech;
  delete from public.lancamentos where id = v_lanc;
  delete from public.contas_bancarias where id = v_conta;
  delete from public.centros_custo where id = v_centro;
  delete from public.categorias where id = v_cat;
  delete from public.audit_log
    where dados_depois::text like '%__teste__%' or dados_antes::text like '%__teste__%';

  raise notice 'OK: audit_log parou de crescer, historico foi removida, '
               'exclusividade de desfazer conciliacao continua garantida.';
end;
$$;
