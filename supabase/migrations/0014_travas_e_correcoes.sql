-- =============================================================================
-- Villa Serenità — travas que faltavam e correções da revisão
-- =============================================================================
-- Revisão da arquitetura de dados, 06/08/2026. Seis correções que têm a mesma
-- raiz: os gatilhos foram escritos para o caminho de CRIAÇÃO, e o caminho de
-- correção (editar, arquivar, estornar) veio depois, tela por tela, sem voltar
-- ao banco para fechar as travas correspondentes.
--
--   1. `distribuido_por_socio` somava distribuição arquivada  (view)
--   2. lançamento de distribuição nascia com origem 'Avulso'
--   3. `estornar_baixa` desmontava aporte, venda e transferência
--   4. `conciliado = true` podia ser forjado pela API, sem extrato nenhum
--   5. CPF de hóspede ia em claro para o audit_log
--   6. faltava índice na FK `lancamentos.clifor_id`
--
-- Fica de fora, para migrações próprias: a gravação transacional de nota
-- fiscal/dívida/safra/reserva/distribuição (hoje o rollback no cliente não
-- funciona e deixa registro órfão), e a propagação de edição do pai para o
-- lançamento gerado em aportes, vendas de café e distribuições.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Distribuição arquivada tem de sair do total do sócio
-- -----------------------------------------------------------------------------
-- O join era LEFT com `and d.ativo` na condição: arquivar fazia `d` virar nulo,
-- mas a linha de `ds` continuava lá — e era `ds.valor` que estava sendo somado.
-- O total distribuído nunca diminuía.
--
-- `saldo_aportes` (migração 0008) não tem o problema porque lá a coluna somada
-- é a do lado que fica nulo. Aqui a condição precisa entrar no CASE.

drop view public.distribuido_por_socio;

create view public.distribuido_por_socio
with (security_invoker = true) as
select
  s.id          as socio_id,
  s.nome_curto,
  s.nome_completo,
  coalesce(sum(case when d.ativo then ds.valor else 0 end), 0) as total_recebido
from public.socios s
left join public.distribuicao_socios ds on ds.socio_id = s.id
left join public.distribuicoes d on d.id = ds.distribuicao_id
where s.ativo
group by s.id, s.nome_curto, s.nome_completo;

comment on view public.distribuido_por_socio is
  'Total de lucro já retirado por cada sócio. Não se confunde com saldo_aportes: '
  'aporte é dinheiro que o sócio tem a receber de volta; distribuição é lucro '
  'que ele já recebeu.';

grant select on public.distribuido_por_socio to authenticated;
revoke all   on public.distribuido_por_socio from anon;

-- -----------------------------------------------------------------------------
-- 2. Distribuição é uma origem, não um lançamento avulso
-- -----------------------------------------------------------------------------
-- A migração 0012 criou o TIPO 'Distribuição' mas esqueceu a ORIGEM: o check da
-- 0011 não a listava, e o gatilho gerador não a informava. Resultado: os
-- lançamentos por sócio nasciam com o default 'Avulso' e, na tela de
-- Lançamentos, apareciam como editáveis, arquiváveis e estornáveis.
--
-- Arquivar um deles tiraria a saída do caixa mas manteria o valor em
-- `distribuido_por_socio` — a mesma inconsistência que o item 1 corrige, por
-- outro caminho.

alter table public.lancamentos drop constraint lanc_origem_valida;
alter table public.lancamentos add constraint lanc_origem_valida check (
  origem in ('Avulso', 'Nota fiscal', 'Dívida', 'Reserva', 'Café',
             'Transferência', 'Aporte', 'Distribuição')
);

create or replace function public.tg_distribuicao_gera_lancamento()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d      public.distribuicoes%rowtype;
  v_nome text;
  v_lanc uuid;
begin
  if new.valor = 0 then
    return null;
  end if;

  select * into d from public.distribuicoes where id = new.distribuicao_id;
  select nome_curto into v_nome from public.socios where id = new.socio_id;

  insert into public.lancamentos (
    tipo, situacao, descricao, valor, data_vencimento, data_pagamento,
    conta_id, origem, criado_por
  ) values (
    'Distribuição', 'Realizada',
    format('Distribuição de lucro — %s', v_nome),
    new.valor, d.data, d.data,
    d.conta_id, 'Distribuição', d.criado_por
  )
  returning id into v_lanc;

  update public.distribuicao_socios set lancamento_id = v_lanc where id = new.id;
  return null;
end;
$$;

-- Corrige o que já foi gravado. A origem é imutável por gatilho (0011), e é
-- exatamente por isso que ele precisa sair do caminho aqui: esta é a única
-- correção legítima, feita uma vez, pelo dono do schema.
alter table public.lancamentos disable trigger lancamentos_origem_travada;

update public.lancamentos
   set origem = 'Distribuição'
 where origem = 'Avulso'
   and id in (
     select lancamento_id from public.distribuicao_socios where lancamento_id is not null
   );

alter table public.lancamentos enable trigger lancamentos_origem_travada;

-- -----------------------------------------------------------------------------
-- 3. Estorno só vale para compromisso, nunca para movimento já consumado
-- -----------------------------------------------------------------------------
-- A função da 0013 conferia `conciliado` e a existência do lançamento, mas não
-- a origem. Estornar um lançamento de Aporte, Café, Transferência ou
-- Distribuição — todos nascem Realizada — jogava para Prevista e desfazia meia
-- operação: saía de `saldos_contas`, mas continuava contado em `saldo_aportes`,
-- `estoque_cafe` ou `distribuido_por_socio`.
--
-- Estorno existe para o engano do dia a dia numa BAIXA: baixou a parcela
-- errada, ou com a data errada. Um aporte lançado por engano se desfaz
-- arquivando o aporte, não estornando o lançamento dele.

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

  if l.situacao <> 'Realizada' then
    raise exception 'Este lançamento não está baixado, não há o que estornar.';
  end if;

  -- Só o que nasce como compromisso a pagar/receber pode voltar a ser
  -- compromisso. Os demais não têm estado "previsto" que faça sentido.
  if l.origem not in ('Avulso', 'Nota fiscal', 'Dívida', 'Reserva') then
    raise exception
      'Lançamento de origem "%" não se estorna por aqui: desfaça pela tela que '
      'o gerou, para as duas pontas voltarem juntas.', l.origem;
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
  'Desfaz a baixa e devolve o lançamento ao valor do compromisso original. '
  'Vale apenas para lançamentos que nascem previstos.';

-- -----------------------------------------------------------------------------
-- 4. Conciliar exige extrato — a marca não pode ser digitada
-- -----------------------------------------------------------------------------
-- A trava da 0003/0008 protegia o que JÁ estava conciliado, mas não impedia
-- MARCAR como conciliado. Um PATCH direto em /lancamentos com
-- {conciliado: true, conciliado_em: ..., conciliado_por: ...} passava pelo
-- check `lanc_conciliado_coerente` — e a partir daí `fechar_periodo` dava o mês
-- por conferido sem que nenhum extrato tivesse sido importado.
--
-- Como a regra "só fecha com o mês 100% conciliado" é o que sustenta a
-- prestação de contas, ela precisa ser verificável, e não apenas prometida.
-- O caminho legítimo continua passando: `tg_linha_concilia_lancamento` roda
-- DEPOIS que a linha de extrato já aponta para o lançamento.

create or replace function public.tg_lancamento_conciliado_travado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_competencia date;
begin
  if not old.conciliado then
    -- Está marcando como conciliado agora: tem de haver linha de extrato.
    if new.conciliado and not exists (
      select 1 from public.extrato_linhas where lancamento_id = new.id
    ) then
      raise exception
        'Um lançamento só fica conciliado ao ser casado com uma linha de '
        'extrato. Importe o extrato e concilie pela tela de Conciliação.';
    end if;
    return new;
  end if;

  -- Continua conciliado: nada pode mudar.
  if new.conciliado then
    if to_jsonb(old) - 'atualizado_em' is distinct from to_jsonb(new) - 'atualizado_em' then
      raise exception
        'Lançamento conciliado é somente leitura. Desfaça a conciliação antes de alterar.';
    end if;
    return new;
  end if;

  -- Está desfazendo. Se a competência já foi fechada, é privilégio do Lucas.
  v_competencia := date_trunc('month', old.data_pagamento)::date;

  if exists (
    select 1 from public.fechamentos
     where competencia = v_competencia and status = 'Fechado'
  ) then
    if not exists (
      select 1 from public.socios
       where id = public.socio_atual_id() and pode_desfazer_conciliacao
    ) then
      raise exception
        'A competência % está fechada. Apenas o sócio autorizado pode desfazer a conciliação.',
        to_char(v_competencia, 'MM/YYYY');
    end if;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. CPF fora do histórico
-- -----------------------------------------------------------------------------
-- O gatilho de auditoria grava a linha inteira em jsonb, e `hospedes` tem CPF
-- obrigatório — que ficava em claro, legível por qualquer sócio, replicado a
-- cada alteração do cadastro e sem prazo de descarte.
--
-- O histórico continua registrando QUE o cadastro mudou e por quem; só o
-- número deixa de ser carregado junto. O CPF em si permanece onde tem
-- finalidade: na própria tabela `hospedes`.

create or replace function public.tg_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_antes  jsonb;
  v_depois jsonb;
begin
  if tg_op = 'DELETE' then
    v_id := old.id; v_antes := to_jsonb(old); v_depois := null;
  elsif tg_op = 'UPDATE' then
    v_id := new.id; v_antes := to_jsonb(old); v_depois := to_jsonb(new);
  else
    v_id := new.id; v_antes := null;         v_depois := to_jsonb(new);
  end if;

  -- Dado pessoal sensível não entra no log. `-` remove a chave; sobre NULL
  -- devolve NULL, então não é preciso testar cada caso.
  if tg_table_name = 'hospedes' then
    v_antes  := v_antes  - 'cpf';
    v_depois := v_depois - 'cpf';
  end if;

  insert into public.audit_log (
    tabela, registro_id, acao, usuario_email, usuario_id, dados_antes, dados_depois
  )
  values (
    tg_table_name, v_id, tg_op,
    public.email_do_usuario(), auth.uid(),
    v_antes, v_depois
  );

  return null;
end;
$$;

-- O que já foi gravado antes desta migração sai agora.
update public.audit_log
   set dados_antes  = dados_antes  - 'cpf',
       dados_depois = dados_depois - 'cpf'
 where tabela = 'hospedes'
   and (dados_antes ? 'cpf' or dados_depois ? 'cpf');

-- -----------------------------------------------------------------------------
-- 6. Índice na FK que faltava
-- -----------------------------------------------------------------------------
-- Todas as outras chaves estrangeiras de `lancamentos` têm índice. Sem este,
-- "o que já comprei deste fornecedor" varre a tabela inteira — e qualquer
-- alteração em `clientes_fornecedores` também, para conferir a referência.

create index if not exists lanc_clifor
  on public.lancamentos (clifor_id) where clifor_id is not null;

-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------

do $$
declare
  v_conta   uuid;
  v_cat     uuid;
  v_centro  uuid;
  v_hosp    uuid;
  v_socio   uuid;
  v_dist    uuid;
  v_lanc    uuid;
  v_aporte  uuid;
  v_extr    uuid;
  v_linha   uuid;
  v_total   numeric(14,2);
  v_base    numeric(14,2);
  v_ok      boolean;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('email', (select email from public.socios where pode_entrar limit 1))::text,
    true
  );

  select id into v_socio from public.socios where ativo order by nome_completo limit 1;

  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'trv', 'Corrente', 50000.00, date '2020-01-01') returning id into v_conta;
  insert into public.categorias (nome, tipo) values ('__teste__', 'Despesa') returning id into v_cat;
  insert into public.centros_custo (nome, tipo) values ('__teste__', 'Despesa') returning id into v_centro;

  -- 1. Distribuição arquivada sai do total do sócio.
  -- Medido pela DIFERENÇA, e não pelo valor absoluto: o banco já tem
  -- distribuições reais, e um teste que exige zero no fim só passaria num banco
  -- vazio — falharia justamente onde precisa rodar.
  select total_recebido into v_base from public.distribuido_por_socio where socio_id = v_socio;

  insert into public.distribuicoes (data, valor_total, conta_id)
    values (date '2026-07-05', 800.00, v_conta) returning id into v_dist;
  insert into public.distribuicao_socios (distribuicao_id, socio_id, nome_completo, cota, valor)
    select v_dist, v_socio, nome_completo, cota, 800.00
      from public.socios where id = v_socio;

  select total_recebido into v_total from public.distribuido_por_socio where socio_id = v_socio;
  if v_total <> v_base + 800.00 then
    raise exception 'A distribuição deveria somar 800 ao total do sócio (% para %), deu %',
      v_base, v_base + 800.00, v_total;
  end if;

  -- 2. O lançamento gerado tem origem 'Distribuição', e não 'Avulso'.
  if not exists (
    select 1 from public.distribuicao_socios ds
      join public.lancamentos l on l.id = ds.lancamento_id
     where ds.distribuicao_id = v_dist and l.origem = 'Distribuição'
  ) then
    raise exception 'O lançamento da distribuição deveria nascer com origem Distribuição';
  end if;

  -- Sendo origem gerada, não pode ser estornado pela tela de Lançamentos.
  select lancamento_id into v_lanc from public.distribuicao_socios where distribuicao_id = v_dist;
  v_ok := false;
  begin
    perform public.estornar_baixa(v_lanc);
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'Estornar o lançamento de uma distribuição deveria ter sido recusado';
  end if;

  update public.distribuicoes set ativo = false where id = v_dist;

  select total_recebido into v_total from public.distribuido_por_socio where socio_id = v_socio;
  if v_total <> v_base then
    raise exception
      'Arquivar a distribuição deveria devolver o total a %, mas ficou em %',
      v_base, v_total;
  end if;

  -- 3. Estorno de lançamento gerado tem de ser recusado.
  insert into public.aportes (socio_id, tipo, valor, data, conta_id)
    values (v_socio, 'Aporte', 300.00, date '2026-07-06', v_conta) returning id into v_aporte;

  select lancamento_id into v_lanc from public.aportes where id = v_aporte;

  v_ok := false;
  begin
    perform public.estornar_baixa(v_lanc);
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'Estornar o lançamento de um aporte deveria ter sido recusado';
  end if;

  -- 4. Estorno de avulso baixado continua funcionando; de previsto, não.
  insert into public.lancamentos (tipo, situacao, descricao, valor, data_vencimento,
    conta_id, categoria_id, centro_id)
    values ('Despesa', 'Prevista', '__teste__ boleto', 400.00, date '2026-07-10',
            v_conta, v_cat, v_centro)
    returning id into v_lanc;

  v_ok := false;
  begin
    perform public.estornar_baixa(v_lanc);
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'Estornar um lançamento ainda previsto deveria ter sido recusado';
  end if;

  perform public.baixar_lancamento(v_lanc, date '2026-07-12', 0, 0, 0, null);
  perform public.estornar_baixa(v_lanc);
  if (select situacao from public.lancamentos where id = v_lanc) <> 'Prevista' then
    raise exception 'Estornar um avulso baixado deveria voltá-lo a previsto';
  end if;

  -- 5. Marcar conciliado à mão tem de ser recusado.
  perform public.baixar_lancamento(v_lanc, date '2026-07-12', 0, 0, 0, null);

  v_ok := false;
  begin
    update public.lancamentos
       set conciliado = true, conciliado_em = now(), conciliado_por = v_socio
     where id = v_lanc;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'Marcar conciliado sem linha de extrato deveria ter sido recusado';
  end if;

  -- 6. Pelo caminho legítimo, continua funcionando.
  insert into public.extratos_importados (conta_id, arquivo_nome)
    values (v_conta, '__teste__.ofx') returning id into v_extr;
  insert into public.extrato_linhas (extrato_id, conta_id, data, descricao, valor, identificador_banco)
    values (v_extr, v_conta, date '2026-07-12', '__teste__ boleto', -400.00, 'FITID-T14')
    returning id into v_linha;

  update public.extrato_linhas
     set lancamento_id = v_lanc, conciliado_em = now() where id = v_linha;

  if not (select conciliado from public.lancamentos where id = v_lanc) then
    raise exception 'A conciliação pela linha de extrato deveria ter funcionado';
  end if;

  -- 7. CPF de hóspede não vai para o histórico.
  insert into public.hospedes (nome, cpf, contato)
    values ('__teste__', '98765432100', 'x') returning id into v_hosp;

  if exists (
    select 1 from public.audit_log
     where tabela = 'hospedes' and registro_id = v_hosp
       and (dados_depois ? 'cpf' or dados_antes ? 'cpf')
  ) then
    raise exception 'O CPF não deveria ter ido para o audit_log';
  end if;

  if not exists (
    select 1 from public.audit_log
     where tabela = 'hospedes' and registro_id = v_hosp and dados_depois ? 'nome'
  ) then
    raise exception 'O histórico deveria continuar registrando a criação do hóspede';
  end if;

  if exists (
    select 1 from public.audit_log
     where tabela = 'hospedes' and (dados_antes ? 'cpf' or dados_depois ? 'cpf')
  ) then
    raise exception 'Sobrou CPF de registros antigos no audit_log';
  end if;

  -- 8. O índice da FK existe.
  if not exists (select 1 from pg_indexes where indexname = 'lanc_clifor') then
    raise exception 'O índice lanc_clifor deveria ter sido criado';
  end if;

  -- Limpeza. A linha de extrato sai antes do lançamento, e desfazer o vínculo
  -- destrava o lançamento para o DELETE passar.
  update public.extrato_linhas set lancamento_id = null, conciliado_em = null,
    conciliado_por = null where extrato_id = v_extr;
  delete from public.extrato_linhas where extrato_id = v_extr;
  delete from public.extratos_importados where id = v_extr;
  delete from public.distribuicao_socios where distribuicao_id = v_dist;
  delete from public.distribuicoes where id = v_dist;
  delete from public.aportes where id = v_aporte;
  delete from public.lancamentos where conta_id = v_conta;
  delete from public.hospedes where id = v_hosp;
  delete from public.contas_bancarias where banco = '__teste__';
  delete from public.categorias where nome = '__teste__';
  delete from public.centros_custo where nome = '__teste__';
  delete from public.audit_log
    where dados_depois::text like '%__teste__%' or dados_antes::text like '%__teste__%';

  raise notice 'OK: distribuicao arquivada sai do total e tem origem propria, '
               'estorno so em compromisso, conciliado exige extrato, '
               'CPF fora do log, indice criado.';
end;
$$;
