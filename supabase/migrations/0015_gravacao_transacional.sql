-- =============================================================================
-- Villa Serenità — gravação de pai e filhos numa transação só
-- =============================================================================
-- Correção do problema C1 da revisão de 06/08/2026, o de maior impacto.
--
-- O PROBLEMA
-- Cinco telas gravavam em duas etapas: primeiro o pai (nota fiscal, contrato,
-- safra, reserva, distribuição), depois os filhos (parcelas, etapas, casas,
-- partes). Se os filhos falhassem, o cliente tentava apagar o pai para desfazer.
--
-- Só que nenhuma dessas cinco tabelas tem policy nem grant de DELETE — arquivar
-- é a única remoção neste banco, por decisão de projeto. O apagar voltava
-- `42501 permission denied`, o erro não era lido, e sobrava um pai órfão.
--
-- No caso da nota fiscal isso não ficava só feio: a nota sem parcelas entra em
-- `notas_fiscais_sem_anexo`, e `fechar_periodo` recusa fechar o mês enquanto
-- houver nota sem documento. Um erro de digitação nas parcelas travava o
-- fechamento da competência, sem nenhuma tela que explicasse por quê.
--
-- POR QUE COMPENSAR NO CLIENTE NUNCA IA FUNCIONAR
-- Cada requisição REST do Supabase é a sua própria transação. Com duas
-- requisições não existe "desfazer" confiável: além da permissão negada, a
-- segunda chamada pode simplesmente não acontecer — rede caiu, aba fechada,
-- navegador dormiu. Compensação é o remendo de quem não pode usar transação.
--
-- Aqui pai e filhos passam a entrar numa chamada só. Se qualquer parte falhar,
-- quem desfaz é o ROLLBACK do Postgres, que não tem como não acontecer.
--
-- DE QUEBRA
-- 1. As travas de soma (parcelas × total, casas × total, partes × total) eram
--    DEFERRABLE por causa do cliente. Continuam diferidas, mas agora as funções
--    forçam a conferência ainda dentro da chamada — o erro chega no lugar certo.
-- 2. A numeração das parcelas passa a ser gerada aqui, e não enviada pela tela.
-- 3. O nome e a cota gravados na distribuição passam a vir de `socios`, e não
--    do que o navegador tinha em memória: é uma fotografia do registro, e
--    fotografia se tira da fonte.
-- 4. A reserva confirma na mesma transação. Some o estado "foi salva como
--    pré-reserva mas a confirmação falhou", que a tela hoje precisa explicar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Nota fiscal + parcelas
-- -----------------------------------------------------------------------------

create or replace function public.criar_nota_fiscal(
  p_numero                text,
  p_serie                 text,
  p_data_emissao          date,
  p_valor_total           numeric,
  p_emitente_id           uuid,
  p_destinatario_socio_id uuid,
  p_categoria_id          uuid,
  p_centro_id             uuid,
  p_conta_id              uuid,
  p_observacao            text,
  p_parcelas              jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nf uuid;
begin
  if not public.usuario_autorizado() then
    raise exception 'Sem permissão.';
  end if;

  if jsonb_typeof(p_parcelas) <> 'array' or jsonb_array_length(p_parcelas) = 0 then
    raise exception 'Informe ao menos uma parcela.';
  end if;

  insert into public.notas_fiscais (
    numero, serie, data_emissao, valor_total, emitente_id,
    destinatario_socio_id, categoria_id, centro_id, conta_id, observacao, criado_por
  )
  values (
    p_numero, nullif(trim(coalesce(p_serie, '')), ''), p_data_emissao, p_valor_total,
    p_emitente_id, p_destinatario_socio_id, p_categoria_id, p_centro_id, p_conta_id,
    nullif(trim(coalesce(p_observacao, '')), ''), public.socio_atual_id()
  )
  returning id into v_nf;

  -- A numeração sai da ordem do array, e não de um campo enviado pela tela:
  -- assim não há como chegarem duas parcelas "3" nem faltar a "2".
  insert into public.nf_parcelas (nota_fiscal_id, numero, vencimento, valor)
  select v_nf, ord, (p ->> 'vencimento')::date, (p ->> 'valor')::numeric
    from jsonb_array_elements(p_parcelas) with ordinality as t(p, ord);

  -- A trava é diferida para deixar nota e parcelas entrarem juntas; aqui já
  -- entraram, então a conferência pode (e deve) acontecer antes de retornar.
  set constraints public.nf_parcelas_somam_o_total immediate;

  return v_nf;
end;
$$;

comment on function public.criar_nota_fiscal is
  'Grava a nota e suas parcelas numa transação só. Se as parcelas não fecharem '
  'com o total, nada é gravado — nem a nota.';

-- -----------------------------------------------------------------------------
-- Contrato de dívida + parcelas
-- -----------------------------------------------------------------------------
-- Sem trava de soma: a soma das parcelas SUPERA o valor contratado por causa
-- dos juros, e é assim mesmo (decisão 5 do projeto).

create or replace function public.criar_contrato_divida(
  p_descricao           text,
  p_credor_id           uuid,
  p_titular_socio_id    uuid,
  p_valor_contratado    numeric,
  p_numero_parcelas     int,
  p_primeiro_vencimento date,
  p_periodicidade       text,
  p_juros               text,
  p_categoria_id        uuid,
  p_centro_id           uuid,
  p_conta_id            uuid,
  p_observacao          text,
  p_parcelas            jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ct uuid;
begin
  if not public.usuario_autorizado() then
    raise exception 'Sem permissão.';
  end if;

  if jsonb_typeof(p_parcelas) <> 'array' or jsonb_array_length(p_parcelas) = 0 then
    raise exception 'Informe ao menos uma parcela.';
  end if;

  insert into public.contratos_divida (
    descricao, credor_id, titular_socio_id, valor_contratado, numero_parcelas,
    primeiro_vencimento, periodicidade, juros, categoria_id, centro_id,
    conta_id, observacao, criado_por
  )
  values (
    p_descricao, p_credor_id, p_titular_socio_id, p_valor_contratado, p_numero_parcelas,
    p_primeiro_vencimento, coalesce(p_periodicidade, 'Mensal'),
    nullif(trim(coalesce(p_juros, '')), ''),
    p_categoria_id, p_centro_id, p_conta_id,
    nullif(trim(coalesce(p_observacao, '')), ''), public.socio_atual_id()
  )
  returning id into v_ct;

  insert into public.divida_parcelas (contrato_id, numero, vencimento, valor)
  select v_ct, ord, (p ->> 'vencimento')::date, (p ->> 'valor')::numeric
    from jsonb_array_elements(p_parcelas) with ordinality as t(p, ord);

  return v_ct;
end;
$$;

comment on function public.criar_contrato_divida is
  'Grava o contrato e suas parcelas numa transação só.';

-- -----------------------------------------------------------------------------
-- Safra + etapas
-- -----------------------------------------------------------------------------
-- Aqui as etapas são opcionais: uma safra sem etapa é um estado válido (ainda
-- não se sabe o calendário), só não mostra status na tela do Café.

create or replace function public.criar_safra(
  p_ciclo             text,
  p_area_hectares     numeric,
  p_expectativa_sacas numeric,
  p_observacao        text,
  p_etapas            jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_safra uuid;
begin
  if not public.usuario_autorizado() then
    raise exception 'Sem permissão.';
  end if;

  insert into public.safras (ciclo, area_hectares, expectativa_sacas, observacao, criado_por)
  values (p_ciclo, p_area_hectares, p_expectativa_sacas,
          nullif(trim(coalesce(p_observacao, '')), ''), public.socio_atual_id())
  returning id into v_safra;

  if jsonb_typeof(p_etapas) = 'array' and jsonb_array_length(p_etapas) > 0 then
    insert into public.safra_etapas (safra_id, nome, ordem, data_inicio, data_fim, observacao)
    select v_safra,
           e ->> 'nome',
           coalesce((e ->> 'ordem')::int, ord::int),
           (e ->> 'data_inicio')::date,
           (e ->> 'data_fim')::date,
           nullif(trim(coalesce(e ->> 'observacao', '')), '')
      from jsonb_array_elements(p_etapas) with ordinality as t(e, ord);
  end if;

  return v_safra;
end;
$$;

comment on function public.criar_safra is
  'Grava a safra e suas etapas numa transação só. Etapas são opcionais.';

-- -----------------------------------------------------------------------------
-- Reserva + casas + confirmação
-- -----------------------------------------------------------------------------
-- A ordem interna importa e não é a óbvia: a reserva nasce como Pré-reserva
-- mesmo quando o usuário já quer confirmar, porque confirmar dispara o gatilho
-- que cria as receitas — e elas apontam de volta para a reserva. Dividindo as
-- casas antes da confirmação, o gatilho só roda quando tudo o mais já passou.
--
-- A diferença para a versão anterior é que agora a confirmação está na mesma
-- transação: se ela falhar, a reserva inteira é desfeita, em vez de sobrar uma
-- pré-reserva que o usuário não pediu.

create or replace function public.criar_reserva(
  p_hospede_id      uuid,
  p_canal           text,
  p_data_entrada    date,
  p_data_saida      date,
  p_numero_hospedes int,
  p_valor_total     numeric,
  p_sinal           numeric,
  p_categoria_id    uuid,
  p_centro_id       uuid,
  p_conta_id        uuid,
  p_observacao      text,
  p_acomodacoes     jsonb,
  p_confirmar       boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reserva uuid;
begin
  if not public.usuario_autorizado() then
    raise exception 'Sem permissão.';
  end if;

  if jsonb_typeof(p_acomodacoes) <> 'array' or jsonb_array_length(p_acomodacoes) = 0 then
    raise exception 'Informe ao menos uma acomodação.';
  end if;

  insert into public.reservas (
    hospede_id, canal, data_entrada, data_saida, numero_hospedes,
    valor_total, sinal, status, categoria_id, centro_id, conta_id,
    observacao, criado_por
  )
  values (
    p_hospede_id, p_canal, p_data_entrada, p_data_saida,
    coalesce(p_numero_hospedes, 1), p_valor_total, coalesce(p_sinal, 0),
    'Pré-reserva', p_categoria_id, p_centro_id, p_conta_id,
    nullif(trim(coalesce(p_observacao, '')), ''), public.socio_atual_id()
  )
  returning id into v_reserva;

  insert into public.reserva_acomodacoes (reserva_id, acomodacao_id, valor)
  select v_reserva, (a ->> 'acomodacao_id')::uuid, (a ->> 'valor')::numeric
    from jsonb_array_elements(p_acomodacoes) as a;

  set constraints public.reserva_acomodacoes_somam_o_total immediate;

  if p_confirmar then
    update public.reservas set status = 'Confirmada' where id = v_reserva;
  end if;

  return v_reserva;
end;
$$;

comment on function public.criar_reserva is
  'Grava a reserva, a divisão entre as casas e a confirmação numa transação só.';

-- -----------------------------------------------------------------------------
-- Distribuição + partes
-- -----------------------------------------------------------------------------
-- O nome e a cota gravados em cada parte são uma FOTOGRAFIA, para o registro de
-- hoje continuar legível se o cadastro mudar amanhã. Por isso passam a ser
-- lidos de `socios` aqui dentro, e não aceitos do cliente: fotografia se tira
-- da fonte, não do que o navegador tinha em memória.

create or replace function public.criar_distribuicao(
  p_data                   date,
  p_valor_total            numeric,
  p_competencia_referencia date,
  p_conta_id               uuid,
  p_observacao             text,
  p_partes                 jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dist uuid;
begin
  if not public.usuario_autorizado() then
    raise exception 'Sem permissão.';
  end if;

  if jsonb_typeof(p_partes) <> 'array' or jsonb_array_length(p_partes) = 0 then
    raise exception 'Informe a divisão entre os sócios.';
  end if;

  insert into public.distribuicoes (
    data, valor_total, competencia_referencia, conta_id, observacao, criado_por
  )
  values (
    p_data, p_valor_total, p_competencia_referencia, p_conta_id,
    nullif(trim(coalesce(p_observacao, '')), ''), public.socio_atual_id()
  )
  returning id into v_dist;

  insert into public.distribuicao_socios (
    distribuicao_id, socio_id, nome_completo, cota, valor
  )
  select v_dist, s.id, s.nome_completo, s.cota, (p ->> 'valor')::numeric
    from jsonb_array_elements(p_partes) as p
    join public.socios s on s.id = (p ->> 'socio_id')::uuid and s.ativo;

  -- Um sócio inexistente ou arquivado sumiria silenciosamente no JOIN, e a
  -- soma das partes deixaria de bater sem explicar por quê.
  if (select count(*) from public.distribuicao_socios where distribuicao_id = v_dist)
     <> jsonb_array_length(p_partes) then
    raise exception 'Há sócio inválido ou arquivado na divisão.';
  end if;

  set constraints public.distribuicao_partes_somam_o_total immediate;

  return v_dist;
end;
$$;

comment on function public.criar_distribuicao is
  'Grava a retirada e a divisão entre os sócios numa transação só. Nome e cota '
  'são copiados de socios, não aceitos do cliente.';

-- -----------------------------------------------------------------------------
-- Segurança
-- -----------------------------------------------------------------------------

grant execute on function public.criar_nota_fiscal(
  text, text, date, numeric, uuid, uuid, uuid, uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.criar_contrato_divida(
  text, uuid, uuid, numeric, int, date, text, text, uuid, uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.criar_safra(
  text, numeric, numeric, text, jsonb) to authenticated;
grant execute on function public.criar_reserva(
  uuid, text, date, date, int, numeric, numeric, uuid, uuid, uuid, text, jsonb, boolean) to authenticated;
grant execute on function public.criar_distribuicao(
  date, numeric, date, uuid, text, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------
-- O teste que importa é o do FRACASSO: gravar com filhos inválidos e conferir
-- que o pai não sobrou. É exatamente o que não acontecia antes.

do $$
declare
  v_conta   uuid;
  v_cat_d   uuid;
  v_cat_r   uuid;
  v_centro  uuid;
  v_forn    uuid;
  v_socio   uuid;
  v_hosp    uuid;
  v_acom    uuid;
  v_nf      uuid;
  v_ct      uuid;
  v_safra   uuid;
  v_res     uuid;
  v_dist    uuid;
  v_qtd     int;
  v_ok      boolean;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('email', (select email from public.socios where pode_entrar limit 1))::text,
    true
  );

  select id into v_socio from public.socios where pode_receber_nf order by nome_curto limit 1;
  select id into v_acom  from public.acomodacoes where ativo order by ordem limit 1;

  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'tx', 'Corrente', 0, date '2020-01-01') returning id into v_conta;
  insert into public.categorias (nome, tipo) values ('__teste__d', 'Despesa') returning id into v_cat_d;
  insert into public.categorias (nome, tipo) values ('__teste__r', 'Receita') returning id into v_cat_r;
  insert into public.centros_custo (nome, tipo) values ('__teste__', 'Receita e despesa') returning id into v_centro;
  insert into public.clientes_fornecedores (nome, relacao, documento, contato)
    values ('__teste__', 'Fornecedor', '33344455566', 'x') returning id into v_forn;
  insert into public.hospedes (nome, cpf, contato)
    values ('__teste__', '77788899900', 'x') returning id into v_hosp;

  -- 1. NF com parcelas que NÃO somam o total: nem a nota pode sobrar.
  v_ok := false;
  begin
    perform public.criar_nota_fiscal(
      '__teste__nf1', null, date '2026-07-01', 900.00, v_forn, v_socio,
      v_cat_d, v_centro, v_conta, null,
      '[{"vencimento":"2026-07-01","valor":"300.00"},
        {"vencimento":"2026-08-01","valor":"100.00"}]'::jsonb);
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'NF com parcelas que não fecham deveria ter sido recusada';
  end if;

  select count(*) into v_qtd from public.notas_fiscais where numero = '__teste__nf1';
  if v_qtd <> 0 then
    raise exception 'A nota órfã deveria ter sido desfeita, sobraram %', v_qtd;
  end if;

  -- 2. NF válida em 3x: nota, 3 parcelas e 3 despesas previstas.
  v_nf := public.criar_nota_fiscal(
    '__teste__nf2', 'A', date '2026-07-01', 900.00, v_forn, v_socio,
    v_cat_d, v_centro, v_conta, 'obs',
    '[{"vencimento":"2026-07-01","valor":"300.00"},
      {"vencimento":"2026-07-31","valor":"300.00"},
      {"vencimento":"2026-08-30","valor":"300.00"}]'::jsonb);

  select count(*) into v_qtd from public.nf_parcelas where nota_fiscal_id = v_nf;
  if v_qtd <> 3 then raise exception 'Esperadas 3 parcelas, gravadas %', v_qtd; end if;

  -- A numeração é gerada pela ordem do array.
  if not exists (
    select 1 from public.nf_parcelas
     where nota_fiscal_id = v_nf and numero = 3 and vencimento = date '2026-08-30'
  ) then
    raise exception 'A numeração das parcelas não seguiu a ordem enviada';
  end if;

  select count(*) into v_qtd
    from public.nf_parcelas p join public.lancamentos l on l.id = p.lancamento_id
   where p.nota_fiscal_id = v_nf and l.situacao = 'Prevista' and l.origem = 'Nota fiscal';
  if v_qtd <> 3 then raise exception 'Esperadas 3 despesas previstas, geradas %', v_qtd; end if;

  -- 3. NF contra sócio não autorizado continua sendo recusada, sem deixar resto.
  v_ok := false;
  begin
    perform public.criar_nota_fiscal(
      '__teste__nf3', null, date '2026-07-01', 100.00, v_forn,
      (select id from public.socios where not pode_receber_nf limit 1),
      v_cat_d, v_centro, v_conta, null,
      '[{"vencimento":"2026-07-01","valor":"100.00"}]'::jsonb);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'NF contra sócio sem permissão deveria ser recusada'; end if;
  if exists (select 1 from public.notas_fiscais where numero = '__teste__nf3') then
    raise exception 'A nota recusada não deveria ter sobrado';
  end if;

  -- 4. Dívida: a soma das parcelas PODE superar o contratado.
  v_ct := public.criar_contrato_divida(
    '__teste__ct', v_forn, v_socio, 1000.00, 2, date '2026-08-01', 'Mensal', 'CDI+2',
    v_cat_d, v_centro, v_conta, null,
    '[{"vencimento":"2026-08-01","valor":"560.00"},
      {"vencimento":"2026-09-01","valor":"560.00"}]'::jsonb);

  select count(*) into v_qtd from public.divida_parcelas where contrato_id = v_ct;
  if v_qtd <> 2 then raise exception 'Esperadas 2 parcelas de dívida, gravadas %', v_qtd; end if;

  -- 5. Safra com etapa inválida (fim antes do início): a safra não pode sobrar.
  v_ok := false;
  begin
    perform public.criar_safra('__teste__s1', 10, 100, null,
      '[{"nome":"Colheita","ordem":1,"data_inicio":"2026-05-01","data_fim":"2026-04-01"}]'::jsonb);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Etapa com período invertido deveria ser recusada'; end if;
  if exists (select 1 from public.safras where ciclo = '__teste__s1') then
    raise exception 'A safra órfã deveria ter sido desfeita';
  end if;

  -- 6. Safra válida, e safra sem etapas (estado permitido).
  v_safra := public.criar_safra('__teste__s2', 12.5, 500, null,
    '[{"nome":"Colheita","ordem":1,"data_inicio":"2026-05-01","data_fim":"2026-07-31"},
      {"nome":"Secagem","ordem":2,"data_inicio":"2026-06-01","data_fim":"2026-08-31"}]'::jsonb);
  select count(*) into v_qtd from public.safra_etapas where safra_id = v_safra;
  if v_qtd <> 2 then raise exception 'Esperadas 2 etapas, gravadas %', v_qtd; end if;

  perform public.criar_safra('__teste__s3', null, null, null, '[]'::jsonb);
  if not exists (select 1 from public.safras where ciclo = '__teste__s3') then
    raise exception 'Safra sem etapas deveria ser um estado válido';
  end if;

  -- 7. Reserva cuja divisão entre as casas não fecha: nada pode sobrar.
  v_ok := false;
  begin
    perform public.criar_reserva(
      v_hosp, 'Airbnb', date '2027-03-10', date '2027-03-13', 2, 1500.00, 500.00,
      v_cat_r, v_centro, v_conta, '__teste__r1',
      format('[{"acomodacao_id":"%s","valor":"900.00"}]', v_acom)::jsonb, false);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Divisão que não fecha deveria ser recusada'; end if;
  if exists (select 1 from public.reservas where observacao = '__teste__r1') then
    raise exception 'A reserva órfã deveria ter sido desfeita';
  end if;

  -- 8. Reserva válida COM confirmação: gera sinal + saldo na mesma transação.
  v_res := public.criar_reserva(
    v_hosp, 'Airbnb', date '2027-03-10', date '2027-03-13', 2, 1500.00, 500.00,
    v_cat_r, v_centro, v_conta, '__teste__r2',
    format('[{"acomodacao_id":"%s","valor":"1500.00"}]', v_acom)::jsonb, true);

  if (select status from public.reservas where id = v_res) <> 'Confirmada' then
    raise exception 'A reserva deveria ter sido confirmada na mesma chamada';
  end if;

  select count(*) into v_qtd from public.lancamentos
   where reserva_id = v_res and situacao = 'Prevista' and origem = 'Reserva' and ativo;
  if v_qtd <> 2 then
    raise exception 'Confirmação deveria gerar sinal e saldo (2 receitas), gerou %', v_qtd;
  end if;

  -- 9. Dupla reserva da mesma casa: recusada, e sem deixar reserva pela metade.
  v_ok := false;
  begin
    perform public.criar_reserva(
      v_hosp, 'WhatsApp', date '2027-03-12', date '2027-03-15', 1, 900.00, 0,
      v_cat_r, v_centro, v_conta, '__teste__r3',
      format('[{"acomodacao_id":"%s","valor":"900.00"}]', v_acom)::jsonb, false);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Dupla reserva deveria ser recusada'; end if;
  if exists (select 1 from public.reservas where observacao = '__teste__r3') then
    raise exception 'A reserva recusada por sobreposição não deveria ter sobrado';
  end if;

  -- 10. Distribuição cujas partes não somam o total: nada sobra.
  v_ok := false;
  begin
    perform public.criar_distribuicao(
      date '2026-07-05', 1000.00, null, v_conta, '__teste__d1',
      format('[{"socio_id":"%s","valor":"400.00"}]', v_socio)::jsonb);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Partes que não fecham deveriam ser recusadas'; end if;
  if exists (select 1 from public.distribuicoes where observacao = '__teste__d1') then
    raise exception 'A distribuição órfã deveria ter sido desfeita';
  end if;

  -- 11. Distribuição válida: nome e cota vêm de socios, não do cliente.
  v_dist := public.criar_distribuicao(
    date '2026-07-05', 1000.00, date '2026-06-01', v_conta, '__teste__d2',
    format('[{"socio_id":"%s","valor":"1000.00","nome_completo":"MENTIRA","cota":"99"}]',
           v_socio)::jsonb);

  if exists (
    select 1 from public.distribuicao_socios
     where distribuicao_id = v_dist and (nome_completo = 'MENTIRA' or cota = 99)
  ) then
    raise exception 'Nome e cota deveriam ter vindo de socios, não do cliente';
  end if;

  if not exists (
    select 1 from public.distribuicao_socios ds
      join public.lancamentos l on l.id = ds.lancamento_id
     where ds.distribuicao_id = v_dist and l.origem = 'Distribuição'
  ) then
    raise exception 'A parte deveria ter gerado o lançamento de distribuição';
  end if;

  -- 12. Sócio inexistente na divisão é recusado com mensagem clara.
  v_ok := false;
  begin
    perform public.criar_distribuicao(
      date '2026-07-06', 500.00, null, v_conta, '__teste__d3',
      '[{"socio_id":"00000000-0000-0000-0000-000000000000","valor":"500.00"}]'::jsonb);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Sócio inválido na divisão deveria ser recusado'; end if;

  -- Limpeza, dos filhos para os pais.
  -- As funções acima deixaram as travas de soma em modo imediato, e apagar as
  -- linhas filhas uma a uma estouraria na primeira (a soma parcial não fecha).
  -- Voltando ao diferido, a conferência só roda no fim — quando o pai também
  -- já saiu e não há mais o que conferir.
  set constraints all deferred;

  delete from public.distribuicao_socios where distribuicao_id = v_dist;
  delete from public.distribuicoes where id = v_dist;
  delete from public.reserva_acomodacoes where reserva_id = v_res;
  delete from public.lancamentos where reserva_id = v_res;
  delete from public.reservas where id = v_res;
  delete from public.safra_etapas where safra_id = v_safra;
  delete from public.safras where ciclo like '__teste__%';
  delete from public.divida_parcelas where contrato_id = v_ct;
  delete from public.contratos_divida where id = v_ct;
  delete from public.nf_parcelas where nota_fiscal_id = v_nf;
  delete from public.notas_fiscais where id = v_nf;
  delete from public.lancamentos where conta_id = v_conta;
  delete from public.hospedes where nome = '__teste__';
  delete from public.clientes_fornecedores where nome = '__teste__';
  delete from public.contas_bancarias where banco = '__teste__';
  delete from public.categorias where nome like '__teste__%';
  delete from public.centros_custo where nome = '__teste__';
  delete from public.audit_log
    where dados_depois::text like '%__teste__%' or dados_antes::text like '%__teste__%';

  raise notice 'OK: pai e filhos numa transacao so; falha nos filhos nao deixa orfao '
               'em NF, divida, safra, reserva nem distribuicao.';
end;
$$;
