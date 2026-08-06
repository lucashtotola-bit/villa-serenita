-- =============================================================================
-- Villa Serenità — Distribuição de lucro
-- =============================================================================
-- Decisão tomada com o dono em 05/08/2026, corrigindo uma lacuna do desenho
-- original: o sistema calculava quanto cabia a cada sócio, mas não tinha como
-- registrar uma retirada que de fato acontecesse.
--
-- Antes disso ficou claro que **prestação de contas é um relatório mensal de
-- acompanhamento**, e não um evento de partilha: nem todo mês tem distribuição.
-- Por isso a distribuição é AVULSA — acontece quando os sócios decidem, na data
-- que decidirem, podendo apontar para uma competência de referência ou não.
--
-- Três regras que vieram junto:
--   - o rateio SUGERE a cota de cada um, mas o valor é ajustável: um sócio pode
--     deixar a parte dele no caixa. A soma das partes tem de bater com o total.
--   - distribuição NÃO abate aporte em aberto. Devolver aporte já tem mecanismo
--     próprio; misturar os dois esconderia quanto o sócio ainda tem a receber.
--   - retirada não é despesa. Ela sai do caixa mas fica FORA do resultado —
--     mesma lógica de aporte e transferência. Contar como despesa faria o mês
--     seguinte parecer prejuízo por causa da partilha do mês anterior.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Distribuição como tipo de lançamento
-- -----------------------------------------------------------------------------

alter table public.lancamentos drop constraint lanc_tipo_valido;
alter table public.lancamentos add constraint lanc_tipo_valido check (
  tipo in ('Receita', 'Despesa', 'Transferência', 'Aporte', 'Devolução', 'Distribuição')
);

comment on column public.lancamentos.tipo is
  'Receita e Despesa formam o resultado. Transferência, Aporte, Devolução e '
  'Distribuição movem o saldo das contas mas ficam fora do resultado.';

-- A view precisa saber que distribuição sai do caixa.
drop view public.saldos_contas;
create view public.saldos_contas
with (security_invoker = true) as
select
  c.id                as conta_id,
  c.banco,
  c.apelido,
  c.tipo,
  c.saldo_inicial,
  c.data_saldo_inicial,
  c.saldo_inicial + coalesce(sum(
    case
      when l.tipo in ('Receita', 'Aporte')                     then  l.valor
      when l.tipo in ('Despesa', 'Devolução', 'Distribuição')  then -l.valor
      when l.sentido = 'Entrada'                               then  l.valor
      else                                                          -l.valor
    end
  ), 0)               as saldo_atual
from public.contas_bancarias c
left join public.lancamentos l
       on l.conta_id = c.id
      and l.ativo
      and l.situacao = 'Realizada'
      and l.data_pagamento > c.data_saldo_inicial
where c.ativo
group by c.id, c.banco, c.apelido, c.tipo, c.saldo_inicial, c.data_saldo_inicial;

grant select on public.saldos_contas to authenticated;
revoke all on public.saldos_contas from anon;

-- -----------------------------------------------------------------------------
-- distribuicoes
-- -----------------------------------------------------------------------------

create table public.distribuicoes (
  id                      uuid          primary key default gen_random_uuid(),
  data                    date          not null default current_date,
  valor_total             numeric(14,2) not null,
  /** Mês a que a retirada se refere. Opcional: pode cobrir a safra inteira. */
  competencia_referencia  date,
  conta_id                uuid          not null references public.contas_bancarias(id),
  observacao              text,
  ativo                   boolean       not null default true,
  criado_em               timestamptz   not null default now(),
  criado_por              uuid          default public.socio_atual_id() references public.socios(id),

  constraint distrib_valor_positivo check (valor_total > 0),
  constraint distrib_competencia_no_dia_1 check (
    competencia_referencia is null
    or competencia_referencia = date_trunc('month', competencia_referencia)::date
  )
);

create index distrib_data on public.distribuicoes (data);
create index distrib_competencia on public.distribuicoes (competencia_referencia);

comment on table public.distribuicoes is
  'Retirada de lucro pelos sócios. Avulsa: não depende de fechamento, porque '
  'nem toda prestação de contas tem partilha.';
comment on column public.distribuicoes.competencia_referencia is
  'Apenas informativo, para o relatório. A retirada não pertence ao mês nem o '
  'altera — o resultado da competência continua sendo o mesmo.';

create table public.distribuicao_socios (
  id               uuid          primary key default gen_random_uuid(),
  distribuicao_id  uuid          not null references public.distribuicoes(id) on delete cascade,
  socio_id         uuid          not null references public.socios(id),
  /** Copiado na hora: o registro de hoje continua legível se o nome mudar. */
  nome_completo    text          not null,
  cota             numeric(5,2)  not null,
  valor            numeric(14,2) not null,
  lancamento_id    uuid          references public.lancamentos(id),
  criado_em        timestamptz   not null default now(),

  -- Zero é válido: o sócio pode abrir mão da parte dele naquela retirada.
  constraint distrib_socio_valor_nao_negativo check (valor >= 0)
);

create unique index distrib_socio_unico
  on public.distribuicao_socios (distribuicao_id, socio_id);
create index distrib_socio_lancamento on public.distribuicao_socios (lancamento_id);

-- A soma das partes tem de fechar com o total retirado.
-- DEFERRABLE pelo mesmo motivo das parcelas de nota fiscal: permite gravar a
-- distribuição e suas partes na mesma transação, sem estourar na primeira linha.
create or replace function public.tg_distribuicao_soma_partes()
returns trigger
language plpgsql
as $$
declare
  v_dist  uuid;
  v_total numeric(14,2);
  v_soma  numeric(14,2);
begin
  v_dist := coalesce(new.distribuicao_id, old.distribuicao_id);

  select valor_total into v_total from public.distribuicoes where id = v_dist;
  if v_total is null then
    return null;  -- a própria distribuição foi removida
  end if;

  select coalesce(sum(valor), 0) into v_soma
    from public.distribuicao_socios where distribuicao_id = v_dist;

  if v_soma <> v_total then
    raise exception
      'A divisão entre os sócios (R$ %) não fecha com o total distribuído (R$ %).',
      to_char(v_soma, 'FM999G999G990D00'), to_char(v_total, 'FM999G999G990D00');
  end if;

  return null;
end;
$$;

create constraint trigger distribuicao_partes_somam_o_total
  after insert or update or delete on public.distribuicao_socios
  deferrable initially deferred
  for each row execute function public.tg_distribuicao_soma_partes();

-- -----------------------------------------------------------------------------
-- Cada parte vira uma saída de caixa
-- -----------------------------------------------------------------------------
-- Um lançamento POR SÓCIO, e não um único pelo total: cada um recebe a parte
-- dele numa transferência separada, então o extrato do banco vai mostrar quatro
-- saídas. Com quatro lançamentos, cada uma encontra o seu par na conciliação;
-- com um só, nenhuma encontraria.
--
-- Quem abriu mão da parte (valor zero) não gera lançamento: não houve
-- movimento no banco para conciliar.

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
    conta_id, criado_por
  ) values (
    'Distribuição', 'Realizada',
    format('Distribuição de lucro — %s', v_nome),
    new.valor, d.data, d.data,
    d.conta_id, d.criado_por
  )
  returning id into v_lanc;

  update public.distribuicao_socios set lancamento_id = v_lanc where id = new.id;
  return null;
end;
$$;

create trigger distribuicao_gera_lancamento
  after insert on public.distribuicao_socios
  for each row execute function public.tg_distribuicao_gera_lancamento();

-- -----------------------------------------------------------------------------
-- Quanto já foi distribuído
-- -----------------------------------------------------------------------------

create view public.distribuido_por_socio
with (security_invoker = true) as
select
  s.id          as socio_id,
  s.nome_curto,
  s.nome_completo,
  coalesce(sum(ds.valor), 0) as total_recebido
from public.socios s
left join public.distribuicao_socios ds on ds.socio_id = s.id
left join public.distribuicoes d on d.id = ds.distribuicao_id and d.ativo
where s.ativo
group by s.id, s.nome_curto, s.nome_completo;

comment on view public.distribuido_por_socio is
  'Total de lucro já retirado por cada sócio. Não se confunde com saldo_aportes: '
  'aporte é dinheiro que o sócio tem a receber de volta; distribuição é lucro '
  'que ele já recebeu.';

-- -----------------------------------------------------------------------------
-- Rotina
-- -----------------------------------------------------------------------------

create trigger distribuicoes_audit
  after insert or update or delete on public.distribuicoes
  for each row execute function public.tg_audit();
create trigger distribuicao_socios_audit
  after insert or update or delete on public.distribuicao_socios
  for each row execute function public.tg_audit();

-- -----------------------------------------------------------------------------
-- Segurança
-- -----------------------------------------------------------------------------

alter table public.distribuicoes       enable row level security;
alter table public.distribuicao_socios enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['distribuicoes', 'distribuicao_socios']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.usuario_autorizado())',
      t || '_leitura', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.usuario_autorizado())',
      t || '_insercao', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.usuario_autorizado()) with check (public.usuario_autorizado())',
      t || '_edicao', t
    );
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- Refazer a divisão antes de gravar exige remover linhas, como nas parcelas.
create policy distrib_socios_exclusao on public.distribuicao_socios
  for delete to authenticated using (public.usuario_autorizado());
grant delete on public.distribuicao_socios to authenticated;

grant select on public.distribuido_por_socio to authenticated;
revoke all   on public.distribuido_por_socio from anon;

-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------

do $$
declare
  v_conta   uuid;
  v_primeiro uuid;
  v_dist    uuid;
  v_dist2   uuid;
  v_saldo   numeric(14,2);
  v_qtd     int;
  v_socios  int;
  v_parte   numeric(14,2);
  v_total   numeric(14,2);
  v_ok      boolean;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('email', (select email from public.socios where pode_entrar limit 1))::text,
    true
  );

  -- O rateio do teste é calculado a partir da quantidade real de sócios, e não
  -- fixado em quatro: a conferência não pode passar a mentir no dia em que a
  -- sociedade mudar de tamanho.
  select count(*) into v_socios from public.socios where ativo;
  select id into v_primeiro from public.socios where ativo order by nome_curto limit 1;
  v_parte := round(8000.00 / v_socios, 2);

  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'dist', 'Corrente', 20000.00, date '2020-01-01') returning id into v_conta;

  -- 1. Distribuição com as partes somando o total é aceita.
  insert into public.distribuicoes (data, valor_total, conta_id, observacao)
    values (date '2026-07-20', 8000.00, v_conta, '__teste__')
    returning id into v_dist;

  -- A sobra do arredondamento vai para o primeiro, como na tela.
  insert into public.distribuicao_socios (distribuicao_id, socio_id, nome_completo, cota, valor)
  select v_dist, s.id, s.nome_completo, s.cota,
         case when s.id = v_primeiro then 8000.00 - v_parte * (v_socios - 1) else v_parte end
    from public.socios s where s.ativo;

  -- 2. Cada parte virou uma saída de caixa própria, para conciliar uma a uma.
  select count(*) into v_qtd
    from public.distribuicao_socios ds
    join public.lancamentos l on l.id = ds.lancamento_id
   where ds.distribuicao_id = v_dist and l.tipo = 'Distribuição';
  if v_qtd <> v_socios then
    raise exception 'Cada sócio deveria ter gerado um lançamento, gerou % de %', v_qtd, v_socios;
  end if;

  -- 3. A retirada sai do saldo da conta.
  select saldo_atual into v_saldo from public.saldos_contas where conta_id = v_conta;
  if v_saldo <> 12000.00 then
    raise exception 'Saldo deveria cair para 12.000 (20.000 - 8.000), está em %', v_saldo;
  end if;

  -- 4. E NÃO entra como despesa: o resultado do mês não muda.
  select coalesce(sum(valor), 0) into v_total
    from public.lancamentos
   where conta_id = v_conta and tipo = 'Despesa' and ativo;
  if v_total <> 0 then
    raise exception 'Distribuição não pode virar despesa (achou R$ %)', v_total;
  end if;

  -- 5. Partes que não somam o total têm de ser recusadas.
  --    Numa distribuição NOVA, com um sócio só: repetir sócio na distribuição
  --    anterior dispararia o índice único, e o teste passaria pelo motivo errado.
  v_ok := false;
  begin
    insert into public.distribuicoes (data, valor_total, conta_id, observacao)
      values (date '2026-07-22', 5000.00, v_conta, '__teste__')
      returning id into v_dist2;

    insert into public.distribuicao_socios (distribuicao_id, socio_id, nome_completo, cota, valor)
      select v_dist2, s.id, s.nome_completo, s.cota, 500.00
        from public.socios s where s.id = v_primeiro;

    set constraints public.distribuicao_partes_somam_o_total immediate;
  exception when others then v_ok := true;
  end;
  set constraints public.distribuicao_partes_somam_o_total deferred;
  if not v_ok then
    raise exception 'Divisão que não fecha com o total deveria ter sido recusada';
  end if;

  -- 6. Sócio que abre mão da parte não gera lançamento — não houve movimento
  --    no banco, logo não há nada para conciliar.
  insert into public.distribuicoes (data, valor_total, conta_id, observacao)
    values (date '2026-07-25', 1000.00, v_conta, '__teste__')
    returning id into v_dist2;

  insert into public.distribuicao_socios (distribuicao_id, socio_id, nome_completo, cota, valor)
  select v_dist2, s.id, s.nome_completo, s.cota,
         case when s.id = v_primeiro then 1000.00 else 0 end
    from public.socios s where s.ativo;

  select count(*) into v_qtd
    from public.distribuicao_socios
   where distribuicao_id = v_dist2 and lancamento_id is not null;
  if v_qtd <> 1 then
    raise exception 'Só o sócio que recebeu deveria ter lançamento, achou %', v_qtd;
  end if;

  -- 7. O total já distribuído aparece por sócio.
  select total_recebido into v_total
    from public.distribuido_por_socio where socio_id = v_primeiro;
  if v_total <= 0 then
    raise exception 'O total distribuído ao sócio deveria ser maior que zero';
  end if;

  -- Limpeza. As partes apontam para os lançamentos, então saem ANTES deles —
  -- na ordem inversa, a integridade referencial recusaria o DELETE.
  delete from public.distribuicao_socios
   where distribuicao_id in (v_dist, v_dist2);
  delete from public.distribuicoes where id in (v_dist, v_dist2);
  delete from public.lancamentos where conta_id = v_conta;
  delete from public.contas_bancarias where banco = '__teste__';
  delete from public.audit_log
    where dados_depois::text like '%__teste__%' or dados_antes::text like '%__teste__%';

  raise notice 'OK: distribuicao sai do caixa, nao vira despesa, soma travada, um lancamento por socio.';
end;
$$;
