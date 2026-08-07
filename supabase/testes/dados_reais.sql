-- Simula um banco EM USO, e não recém-criado.
-- Os dois últimos erros das migrações 0014 e 0016 só apareceram porque o banco
-- do dono já tinha aportes e distribuições — asserção absoluta sobre agregado
-- por sócio passa em banco vazio e falha em banco real. Este arquivo existe
-- para que essa diferença seja testada aqui, e não lá.

do $$
declare
  v_conta  uuid;
  v_cat_r  uuid;
  v_cat_d  uuid;
  v_centro uuid;
  v_forn   uuid;
  v_socio  uuid;
  v_outro  uuid;
  v_dist   uuid;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('email', (select email from public.socios where pode_entrar limit 1))::text,
    true
  );

  -- O primeiro em ordem alfabética é o que os testes das migrações escolhem.
  select id into v_socio from public.socios where ativo order by nome_completo limit 1;
  select id into v_outro from public.socios where ativo and id <> v_socio
    order by nome_completo limit 1;

  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('Sicoob', 'Principal', 'Corrente', 25000.00, date '2025-12-31') returning id into v_conta;
  insert into public.categorias (nome, tipo) values ('Hospedagem', 'Receita') returning id into v_cat_r;
  insert into public.categorias (nome, tipo) values ('Insumos', 'Despesa') returning id into v_cat_d;
  insert into public.centros_custo (nome, tipo) values ('Café', 'Receita e despesa') returning id into v_centro;
  insert into public.clientes_fornecedores (nome, relacao, documento, contato)
    values ('Agropecuária Serrana', 'Fornecedor', '12345678000199', 'x') returning id into v_forn;

  -- Aportes reais de DOIS sócios: o saldo por sócio deixa de ser zero.
  insert into public.aportes (socio_id, tipo, valor, data, conta_id)
    values (v_socio, 'Aporte', 12000.00, date '2026-02-10', v_conta);
  insert into public.aportes (socio_id, tipo, valor, data, conta_id)
    values (v_socio, 'Aporte', 3000.00, date '2026-03-05', v_conta);
  insert into public.aportes (socio_id, tipo, valor, data, conta_id)
    values (v_outro, 'Aporte', 7500.00, date '2026-03-20', v_conta);
  insert into public.aportes (socio_id, tipo, valor, data, conta_id)
    values (v_socio, 'Devolução', 2000.00, date '2026-04-02', v_conta);

  -- Movimento comum, para os relatórios não ficarem vazios.
  insert into public.lancamentos (tipo, situacao, descricao, valor, data_vencimento,
    data_pagamento, conta_id, categoria_id, centro_id, clifor_id)
  values
    ('Receita', 'Realizada', 'Hospedagem — família Souza', 2400.00,
     date '2026-06-14', date '2026-06-14', v_conta, v_cat_r, v_centro, null),
    ('Despesa', 'Realizada', 'Adubo', 1850.00,
     date '2026-06-20', date '2026-06-20', v_conta, v_cat_d, v_centro, v_forn),
    ('Despesa', 'Prevista', 'Calcário', 900.00,
     date '2026-09-15', null, v_conta, v_cat_d, v_centro, v_forn);

  -- Uma retirada já registrada: é o que faz `distribuido_por_socio` deixar de
  -- ser zero, a condição exata em que o teste da 0014 falhou no banco do dono.
  insert into public.distribuicoes (data, valor_total, competencia_referencia, conta_id)
    values (date '2026-05-30', 2500.00, date '2026-04-01', v_conta)
    returning id into v_dist;

  insert into public.distribuicao_socios (distribuicao_id, socio_id, nome_completo, cota, valor)
  select v_dist, s.id, s.nome_completo, s.cota, 625.00
    from public.socios s where s.ativo;

  raise notice 'Banco populado como se estivesse em uso.';
end;
$$;
