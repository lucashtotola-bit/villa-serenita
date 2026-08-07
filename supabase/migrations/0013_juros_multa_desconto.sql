-- =============================================================================
-- Villa Serenità — juros, multa e desconto na baixa
-- =============================================================================
-- Decisão tomada com o dono em 06/08/2026, ao usar a rotina de baixa: um
-- boleto de R$ 1.000 pago com R$ 50 de juros não tinha onde ser registrado.
-- Sem isto, restavam duas saídas, ambas ruins: lançar R$ 1.000 e deixar o
-- saldo divergir do extrato, ou editar para R$ 1.050 e perder de vista que
-- houve juros.
--
-- POR QUE EM COLUNAS, E NÃO EM UM LANÇAMENTO À PARTE
-- O extrato do banco mostra UMA linha de R$ 1.050. Se os juros virassem um
-- segundo lançamento, nem ele nem o original casariam com essa linha, e a
-- conciliação (migração 0007) recusa valor diferente. Então o lançamento é um
-- só, com o valor efetivamente pago, e o que foi acrescido ou abatido fica
-- registrado ao lado — sem distorcer a categoria da despesa nem quebrar a
-- conferência com o banco.
--
-- `valor` passa a significar "o que de fato saiu ou entrou". O compromisso
-- original fica em `valor_original`, preenchido só quando há diferença.
-- =============================================================================

alter table public.lancamentos
  add column juros            numeric(14,2) not null default 0,
  add column multa            numeric(14,2) not null default 0,
  add column desconto         numeric(14,2) not null default 0,
  /** Valor previsto antes dos acréscimos. Nulo = a baixa saiu pelo combinado. */
  add column valor_original   numeric(14,2);

alter table public.lancamentos add constraint lanc_acrescimos_nao_negativos check (
  juros >= 0 and multa >= 0 and desconto >= 0
);

-- Se houve acréscimo ou abatimento, a conta tem de fechar. É o que impede um
-- valor digitado à mão que não corresponde a nada.
alter table public.lancamentos add constraint lanc_valor_com_acrescimos check (
  valor_original is null
  or valor = valor_original + juros + multa - desconto
);

-- Acréscimo sem baixa não existe: juros se conhece na hora de pagar.
alter table public.lancamentos add constraint lanc_acrescimo_exige_baixa check (
  (juros = 0 and multa = 0 and desconto = 0 and valor_original is null)
  or situacao = 'Realizada'
);

comment on column public.lancamentos.valor is
  'O que de fato saiu ou entrou da conta. Quando houve juros, multa ou '
  'desconto, difere de valor_original — e é este número que casa com o extrato.';
comment on column public.lancamentos.valor_original is
  'O compromisso antes dos acréscimos. Nulo quando a baixa saiu pelo combinado.';

-- -----------------------------------------------------------------------------
-- Baixa com acréscimos
-- -----------------------------------------------------------------------------
-- Fica no banco, e não na aplicação, porque são quatro campos que precisam
-- mudar juntos e coerentes entre si. Deixar a conta na tela abriria espaço
-- para um valor que não bate com a soma das partes.

create or replace function public.baixar_lancamento(
  p_lancamento_id  uuid,
  p_data_pagamento date,
  p_juros          numeric default 0,
  p_multa          numeric default 0,
  p_desconto       numeric default 0,
  p_conta_id       uuid    default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  l          public.lancamentos%rowtype;
  v_previsto numeric(14,2);
  v_final    numeric(14,2);
begin
  if not public.usuario_autorizado() then
    raise exception 'Sem permissão.';
  end if;

  select * into l from public.lancamentos where id = p_lancamento_id;
  if l.id is null then
    raise exception 'Lançamento não encontrado.';
  end if;
  if l.conciliado then
    raise exception 'Lançamento conciliado é somente leitura. Desfaça a conciliação antes.';
  end if;
  if l.situacao = 'Realizada' then
    raise exception 'Este lançamento já foi baixado.';
  end if;

  -- Rebaixar depois de um estorno tem de partir do compromisso original, e
  -- não do valor que ficou de uma baixa anterior — senão os juros da segunda
  -- vez incidiriam sobre os juros da primeira.
  v_previsto := coalesce(l.valor_original, l.valor);
  v_final    := v_previsto + coalesce(p_juros, 0) + coalesce(p_multa, 0)
                           - coalesce(p_desconto, 0);

  if v_final <= 0 then
    raise exception
      'O desconto não pode zerar nem inverter o valor (ficaria R$ %).',
      to_char(v_final, 'FM999G999G990D00');
  end if;

  update public.lancamentos
     set situacao       = 'Realizada',
         data_pagamento = p_data_pagamento,
         juros          = coalesce(p_juros, 0),
         multa          = coalesce(p_multa, 0),
         desconto       = coalesce(p_desconto, 0),
         valor          = v_final,
         -- Só guarda o original quando de fato houve diferença; sem isso,
         -- toda baixa comum passaria a carregar um campo redundante.
         valor_original = case when v_final <> v_previsto then v_previsto else null end,
         conta_id       = coalesce(p_conta_id, l.conta_id)
   where id = p_lancamento_id;
end;
$$;

comment on function public.baixar_lancamento is
  'Registra o pagamento/recebimento com juros, multa e desconto, mantendo o '
  'valor efetivo coerente com a soma das partes.';

-- Estornar devolve o lançamento ao compromisso original, limpando os
-- acréscimos: eles pertenciam àquela baixa, não ao compromisso.
create or replace function public.estornar_baixa(p_lancamento_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  l public.lancamentos%rowtype;
begin
  if not public.usuario_autorizado() then
    raise exception 'Sem permissão.';
  end if;

  select * into l from public.lancamentos where id = p_lancamento_id;
  if l.id is null then
    raise exception 'Lançamento não encontrado.';
  end if;
  if l.conciliado then
    raise exception
      'Lançamento conciliado é somente leitura. Desfaça a conciliação antes de estornar.';
  end if;

  update public.lancamentos
     set situacao       = 'Prevista',
         data_pagamento = null,
         valor          = coalesce(l.valor_original, l.valor),
         juros          = 0,
         multa          = 0,
         desconto       = 0,
         valor_original = null
   where id = p_lancamento_id;
end;
$$;

comment on function public.estornar_baixa is
  'Desfaz a baixa e devolve o lançamento ao valor do compromisso original.';

-- -----------------------------------------------------------------------------
-- Quanto o atraso custou
-- -----------------------------------------------------------------------------
-- A pergunta que motivou separar isso: "quanto pagamos de juros este ano?".
-- Sem esta visão, a resposta estaria diluída dentro das categorias de despesa.

create view public.acrescimos_por_competencia
with (security_invoker = true) as
select
  date_trunc('month', data_pagamento)::date as competencia,
  tipo,
  sum(juros)    as juros,
  sum(multa)    as multa,
  sum(desconto) as desconto,
  count(*)      as lancamentos
from public.lancamentos
where ativo
  and situacao = 'Realizada'
  and data_pagamento is not null
  and (juros <> 0 or multa <> 0 or desconto <> 0)
group by 1, 2;

comment on view public.acrescimos_por_competencia is
  'Juros, multas e descontos do mês. A despesa continua na categoria dela pelo '
  'valor cheio; aqui se vê quanto do total foi custo de atraso.';

grant select on public.acrescimos_por_competencia to authenticated;
revoke all   on public.acrescimos_por_competencia from anon;

grant execute on function public.baixar_lancamento(uuid, date, numeric, numeric, numeric, uuid)
  to authenticated;
grant execute on function public.estornar_baixa(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------

do $$
declare
  v_conta  uuid;
  v_cat    uuid;
  v_centro uuid;
  v_lanc   uuid;
  v_saldo  numeric(14,2);
  v_valor  numeric(14,2);
  v_orig   numeric(14,2);
  v_juros  numeric(14,2);
  v_ok     boolean;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('email', (select email from public.socios where pode_entrar limit 1))::text,
    true
  );

  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'juros', 'Corrente', 5000.00, date '2020-01-01') returning id into v_conta;
  insert into public.categorias (nome, tipo) values ('__teste__', 'Despesa') returning id into v_cat;
  insert into public.centros_custo (nome, tipo) values ('__teste__', 'Despesa') returning id into v_centro;

  -- 1. Despesa prevista de 1.000 não mexe no saldo.
  insert into public.lancamentos (tipo, situacao, descricao, valor, data_vencimento,
    conta_id, categoria_id, centro_id)
    values ('Despesa', 'Prevista', '__teste__ boleto', 1000.00, date '2026-07-10',
            v_conta, v_cat, v_centro)
    returning id into v_lanc;

  select saldo_atual into v_saldo from public.saldos_contas where conta_id = v_conta;
  if v_saldo <> 5000.00 then
    raise exception 'Despesa prevista não deveria mexer no saldo (está %)', v_saldo;
  end if;

  -- 2. Baixa com 50 de juros e 20 de multa: valor efetivo 1.070.
  perform public.baixar_lancamento(v_lanc, date '2026-07-20', 50.00, 20.00, 0, null);

  select valor, valor_original, juros into v_valor, v_orig, v_juros
    from public.lancamentos where id = v_lanc;
  if v_valor <> 1070.00 then
    raise exception 'Valor efetivo deveria ser 1.070, é %', v_valor;
  end if;
  if v_orig <> 1000.00 then
    raise exception 'O compromisso original deveria ficar guardado como 1.000, é %', v_orig;
  end if;

  -- 3. O saldo cai pelo valor EFETIVO — é ele que casa com o extrato.
  select saldo_atual into v_saldo from public.saldos_contas where conta_id = v_conta;
  if v_saldo <> 3930.00 then
    raise exception 'Saldo deveria ser 3.930 (5.000 - 1.070), está em %', v_saldo;
  end if;

  -- 4. A view responde quanto o atraso custou no mês.
  select juros into v_juros from public.acrescimos_por_competencia
   where competencia = date '2026-07-01' and tipo = 'Despesa';
  if v_juros <> 50.00 then
    raise exception 'A view deveria somar 50 de juros em julho, somou %', v_juros;
  end if;

  -- 5. Estornar devolve ao valor original e limpa os acréscimos.
  perform public.estornar_baixa(v_lanc);

  select valor, valor_original, juros into v_valor, v_orig, v_juros
    from public.lancamentos where id = v_lanc;
  if v_valor <> 1000.00 or v_orig is not null or v_juros <> 0 then
    raise exception 'Estorno deveria voltar a 1.000 sem acréscimos (%, %, %)', v_valor, v_orig, v_juros;
  end if;

  -- 6. Rebaixar parte do original de novo — juros não incidem sobre juros.
  perform public.baixar_lancamento(v_lanc, date '2026-07-25', 30.00, 0, 0, null);
  select valor into v_valor from public.lancamentos where id = v_lanc;
  if v_valor <> 1030.00 then
    raise exception 'Rebaixa deveria partir de 1.000 e dar 1.030, deu %', v_valor;
  end if;

  -- 7. Baixar duas vezes tem de ser recusado.
  v_ok := false;
  begin
    perform public.baixar_lancamento(v_lanc, date '2026-07-26', 0, 0, 0, null);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Baixar um lançamento já baixado deveria ser recusado'; end if;

  -- 8. Desconto que zera o valor tem de ser recusado.
  perform public.estornar_baixa(v_lanc);
  v_ok := false;
  begin
    perform public.baixar_lancamento(v_lanc, date '2026-07-27', 0, 0, 5000.00, null);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Desconto maior que o valor deveria ser recusado'; end if;

  -- Limpeza.
  delete from public.lancamentos where conta_id = v_conta;
  delete from public.contas_bancarias where banco = '__teste__';
  delete from public.categorias where nome = '__teste__';
  delete from public.centros_custo where nome = '__teste__';
  delete from public.audit_log
    where dados_depois::text like '%__teste__%' or dados_antes::text like '%__teste__%';

  raise notice 'OK: juros somam ao valor efetivo, saldo bate, estorno limpa, desconto abusivo recusado.';
end;
$$;
