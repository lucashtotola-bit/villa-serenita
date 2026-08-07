-- =============================================================================
-- Villa Serenità — fechamento versionado, em vez de apagado
-- =============================================================================
-- Item M3 da revisão de 06/08/2026.
--
-- `fechar_periodo` começava apagando o fechamento anterior da competência.
-- Num mês que nunca foi reaberto isso é inofensivo. Num mês reaberto, apagava
-- junto o `motivo_reabertura`, o `reaberto_em` e o `reaberto_por` — e a tabela
-- passava a mostrar um mês que sempre esteve fechado.
--
-- O rastro sobrevivia no audit_log, e desde a migração 0017 o Histórico até
-- deixa consultá-lo. Mas a prestação de contas é um relatório COMPARTILHADO
-- entre os sócios, e "este mês foi reaberto, pelo motivo tal" é exatamente o
-- que eles precisariam ver sem ir garimpar em outra tela.
--
-- Agora cada fechamento é uma versão. Reabrir marca a versão vigente como
-- 'Reaberto' e ela fica; fechar de novo cria a versão seguinte. O histórico
-- vira uma sequência legível, que é o que um ERP faz.
-- =============================================================================

alter table public.fechamentos
  add column if not exists versao int not null default 1;

comment on column public.fechamentos.versao is
  'Cada refechamento da competência é uma versão nova. As anteriores ficam, '
  'com o motivo que levou a reabrir.';

-- A unicidade deixa de ser por competência e passa a ser por versão dela.
drop index if exists public.fech_competencia_unica;

create unique index if not exists fech_competencia_versao
  on public.fechamentos (competencia, versao);

-- Mas continua valendo o essencial: no máximo um fechamento VIGENTE por
-- competência. Sem esta trava, versionar abriria espaço para dois fechamentos
-- válidos do mesmo mês, com resultados diferentes.
create unique index if not exists fech_competencia_vigente
  on public.fechamentos (competencia) where status = 'Fechado';

-- -----------------------------------------------------------------------------
-- Fechar cria versão, não substitui
-- -----------------------------------------------------------------------------
-- Igual à da migração 0009 em tudo o mais: continua recusando mês com
-- lançamento não conciliado ou nota fiscal sem documento.

create or replace function public.fechar_periodo(p_competencia date)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inicio     date;
  v_fim        date;
  v_pendentes  int;
  v_sem_anexo  int;
  v_receitas   numeric(14,2);
  v_despesas   numeric(14,2);
  v_resultado  numeric(14,2);
  v_fech       uuid;
  v_versao     int;
  v_socio      record;
  v_acumulado  numeric(14,2) := 0;
  v_qtd        int;
  v_i          int := 0;
  v_parte      numeric(14,2);
begin
  if not public.usuario_autorizado() then
    raise exception 'Sem permissão.';
  end if;

  v_inicio := date_trunc('month', p_competencia)::date;
  v_fim    := (v_inicio + interval '1 month')::date;

  if exists (select 1 from public.fechamentos where competencia = v_inicio and status = 'Fechado') then
    raise exception 'A competência % já está fechada.', to_char(v_inicio, 'MM/YYYY');
  end if;

  -- Regra inviolável: só fecha com o mês 100% conciliado.
  select count(*) into v_pendentes
    from public.lancamentos
   where ativo
     and situacao = 'Realizada'
     and not conciliado
     and data_pagamento >= v_inicio
     and data_pagamento <  v_fim;

  if v_pendentes > 0 then
    raise exception
      'Ainda há % lançamento(s) sem conciliar em %. Conclua a conciliação antes de fechar.',
      v_pendentes, to_char(v_inicio, 'MM/YYYY');
  end if;

  -- Nenhuma nota fiscal do mês pode estar sem documento.
  select count(*) into v_sem_anexo
    from public.notas_fiscais_sem_anexo
   where competencia = v_inicio;

  if v_sem_anexo > 0 then
    raise exception
      'Há % nota(s) fiscal(is) de % sem o documento anexado. Envie os arquivos antes de fechar.',
      v_sem_anexo, to_char(v_inicio, 'MM/YYYY');
  end if;

  -- Só receita e despesa formam o resultado.
  select
    coalesce(sum(valor) filter (where tipo = 'Receita'), 0),
    coalesce(sum(valor) filter (where tipo = 'Despesa'), 0)
  into v_receitas, v_despesas
  from public.lancamentos
  where ativo
    and situacao = 'Realizada'
    and data_pagamento >= v_inicio
    and data_pagamento <  v_fim;

  v_resultado := v_receitas - v_despesas;

  -- Aqui estava o `delete`. A versão anterior fica, com o motivo que levou a
  -- reabrir; esta entra como a seguinte.
  select coalesce(max(versao), 0) + 1 into v_versao
    from public.fechamentos where competencia = v_inicio;

  insert into public.fechamentos (
    competencia, versao, status, total_receitas, total_despesas, resultado, fechado_por
  )
  values (v_inicio, v_versao, 'Fechado', v_receitas, v_despesas, v_resultado,
          public.socio_atual_id())
  returning id into v_fech;

  -- Rateio igual entre os sócios ativos. A sobra de centavos do arredondamento
  -- vai para o último, para a soma das partes bater exatamente com o resultado.
  select count(*) into v_qtd from public.socios where ativo;

  for v_socio in
    select id, nome_completo, cota from public.socios where ativo order by nome_completo
  loop
    v_i := v_i + 1;
    if v_i = v_qtd then
      v_parte := v_resultado - v_acumulado;
    else
      v_parte := round(v_resultado * v_socio.cota / 100, 2);
      v_acumulado := v_acumulado + v_parte;
    end if;

    insert into public.fechamento_socios (fechamento_id, socio_id, nome_completo, cota, valor)
    values (v_fech, v_socio.id, v_socio.nome_completo, v_socio.cota, v_parte);
  end loop;

  return v_fech;
end;
$$;

comment on function public.fechar_periodo is
  'Fecha o mês e congela o resultado, como uma versão nova. Recusa se houver '
  'lançamento não conciliado ou nota fiscal sem documento.';

-- Reabrir passa a agir sobre a versão vigente, que é a única 'Fechado'.
create or replace function public.reabrir_periodo(p_competencia date, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inicio date;
begin
  -- Regra inviolável: reabrir período fechado é privilégio exclusivo do Lucas.
  if not exists (
    select 1 from public.socios
     where id = public.socio_atual_id() and pode_desfazer_conciliacao
  ) then
    raise exception 'Apenas o sócio autorizado pode reabrir um período fechado.';
  end if;

  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Informe o motivo da reabertura.';
  end if;

  v_inicio := date_trunc('month', p_competencia)::date;

  update public.fechamentos
     set status = 'Reaberto',
         reaberto_em = now(),
         reaberto_por = public.socio_atual_id(),
         motivo_reabertura = p_motivo
   where competencia = v_inicio
     and status = 'Fechado';

  if not found then
    raise exception 'Não há fechamento em aberto para %.', to_char(v_inicio, 'MM/YYYY');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- As reaberturas de uma competência, para a tela poder mostrá-las
-- -----------------------------------------------------------------------------

create or replace view public.reaberturas
with (security_invoker = true) as
select
  f.competencia,
  f.versao,
  f.resultado,
  f.reaberto_em,
  f.motivo_reabertura,
  coalesce(s.nome_curto, 'Sistema') as reaberto_por
from public.fechamentos f
left join public.socios s on s.id = f.reaberto_por
where f.status = 'Reaberto'
order by f.competencia desc, f.versao desc;

comment on view public.reaberturas is
  'Toda vez que um mês já fechado foi reaberto, com motivo e autor. Aparece na '
  'prestação de contas, que é um relatório compartilhado entre os sócios.';

grant select on public.reaberturas to authenticated;
revoke all   on public.reaberturas from anon;

-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------

do $$
declare
  v_conta  uuid;
  v_cat    uuid;
  v_centro uuid;
  v_lucas  uuid;
  v_lanc   uuid;
  v_extr   uuid;
  v_linha  uuid;
  v_f1     uuid;
  v_f2     uuid;
  v_qtd    int;
  v_ok     boolean;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('email', (select email from public.socios where pode_desfazer_conciliacao limit 1))::text,
    true
  );

  select id into v_lucas from public.socios where pode_desfazer_conciliacao limit 1;

  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'fv', 'Corrente', 0, date '2020-01-01') returning id into v_conta;
  insert into public.categorias (nome, tipo) values ('__teste__', 'Receita') returning id into v_cat;
  insert into public.centros_custo (nome, tipo) values ('__teste__', 'Receita') returning id into v_centro;

  -- Uma receita conciliada pelo caminho legítimo, para o mês poder fechar.
  insert into public.lancamentos (tipo, descricao, valor, data_vencimento, data_pagamento,
    conta_id, categoria_id, centro_id)
    values ('Receita', '__teste__', 4000.00, date '2027-01-15', date '2027-01-15',
            v_conta, v_cat, v_centro)
    returning id into v_lanc;

  insert into public.extratos_importados (conta_id, arquivo_nome)
    values (v_conta, '__teste__.ofx') returning id into v_extr;
  insert into public.extrato_linhas
    (extrato_id, conta_id, data, descricao, valor, identificador_banco)
    values (v_extr, v_conta, date '2027-01-15', '__teste__', 4000.00, 'FITID-T18')
    returning id into v_linha;
  update public.extrato_linhas
     set lancamento_id = v_lanc, conciliado_em = now() where id = v_linha;

  -- 1. Primeiro fechamento nasce como versão 1.
  v_f1 := public.fechar_periodo(date '2027-01-01');
  if (select versao from public.fechamentos where id = v_f1) <> 1 then
    raise exception 'O primeiro fechamento deveria ser a versão 1';
  end if;

  -- 2. Fechar de novo sem reabrir tem de ser recusado.
  v_ok := false;
  begin
    perform public.fechar_periodo(date '2027-01-01');
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Fechar competência já fechada deveria ser recusado'; end if;

  -- 3. Reabrir marca a versão vigente, que continua existindo.
  perform public.reabrir_periodo(date '2027-01-01', 'lançamento faltando');

  if (select status from public.fechamentos where id = v_f1) <> 'Reaberto' then
    raise exception 'A versão 1 deveria ter ficado como Reaberto';
  end if;

  -- 4. Refechar cria a versão 2 — e a 1 NÃO some, com o motivo intacto.
  v_f2 := public.fechar_periodo(date '2027-01-01');

  if (select versao from public.fechamentos where id = v_f2) <> 2 then
    raise exception 'O refechamento deveria ser a versão 2';
  end if;

  if not exists (select 1 from public.fechamentos where id = v_f1) then
    raise exception 'A versão anterior não deveria ter sido apagada';
  end if;

  if (select motivo_reabertura from public.fechamentos where id = v_f1)
     <> 'lançamento faltando' then
    raise exception 'O motivo da reabertura deveria ter sobrevivido ao refechamento';
  end if;

  -- 5. Só existe um fechamento vigente por competência.
  select count(*) into v_qtd from public.fechamentos
   where competencia = date '2027-01-01' and status = 'Fechado';
  if v_qtd <> 1 then
    raise exception 'Deveria haver exatamente 1 fechamento vigente, há %', v_qtd;
  end if;

  -- 6. A visão de reaberturas mostra o que aconteceu, com autor.
  if not exists (
    select 1 from public.reaberturas
     where competencia = date '2027-01-01'
       and motivo_reabertura = 'lançamento faltando'
       and reaberto_por is not null
  ) then
    raise exception 'A reabertura deveria aparecer na visão, com autor';
  end if;

  -- 7. Cada versão tem o rateio dela.
  select count(*) into v_qtd from public.fechamento_socios where fechamento_id = v_f2;
  if v_qtd <> (select count(*) from public.socios where ativo) then
    raise exception 'A versão 2 deveria ter o rateio completo';
  end if;

  -- Limpeza.
  update public.extrato_linhas set lancamento_id = null, conciliado_em = null,
    conciliado_por = null where id = v_linha;
  delete from public.extrato_linhas where extrato_id = v_extr;
  delete from public.extratos_importados where id = v_extr;
  delete from public.fechamento_socios where fechamento_id in (v_f1, v_f2);
  delete from public.fechamentos where id in (v_f1, v_f2);
  delete from public.lancamentos where conta_id = v_conta;
  delete from public.contas_bancarias where banco = '__teste__';
  delete from public.categorias where nome = '__teste__';
  delete from public.centros_custo where nome = '__teste__';
  delete from public.audit_log
    where dados_depois::text like '%__teste__%' or dados_antes::text like '%__teste__%';

  raise notice 'OK: fechar cria versao, reabrir preserva a anterior com o motivo, '
               'so um fechamento vigente por competencia.';
end;
$$;
