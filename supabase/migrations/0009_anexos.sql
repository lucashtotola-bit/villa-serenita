-- =============================================================================
-- Villa Serenità — Módulo 7: anexos
-- =============================================================================
-- Decisões 17 a 20 de spec/decisoes-modelagem.md.
--
-- MUDANÇA DE RUMO (04/08/2026, decidida com o dono): o anexo da nota fiscal
-- deixa de ser obrigatório para salvar.
--
-- O raciocínio anterior era "o problema é falta de controle das notas, logo o
-- sistema não pode aceitar nota sem documento". Ele ignorava que um bloqueio
-- duro produz dado PIOR do que o que tenta evitar: quando o PDF ainda não
-- chegou, o usuário ou desiste de registrar (e a nota some — o problema
-- original) ou anexa qualquer arquivo só para passar (e o anexo perde sentido).
--
-- O objetivo real não é impedir nota sem anexo; é não deixar nenhuma ser
-- esquecida. Isso se resolve com visibilidade, não com bloqueio:
--   - a nota é salva normalmente, com ou sem arquivo
--   - fica listada em `notas_fiscais_sem_anexo`, para alerta na tela inicial
--   - e o MÊS NÃO FECHA enquanto houver nota sem documento
--
-- O arquivo oficial vive no Supabase Storage. A cópia no Drive do Lucas é
-- espelho para o contador, e sua ausência nunca bloqueia o trabalho.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Nome de arquivo sem acentos
-- -----------------------------------------------------------------------------
-- Convenção do projeto: NF-{numero}-{emitente}.pdf, sem acentos, para não
-- quebrar em nenhum sistema de arquivos nem no Drive.

create or replace function public.sem_acentos(p_texto text)
returns text
language sql
immutable
as $$
  select translate(
    p_texto,
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
  );
$$;

-- -----------------------------------------------------------------------------
-- anexos
-- -----------------------------------------------------------------------------

create table public.anexos (
  id               uuid        primary key default gen_random_uuid(),
  nome_arquivo     text        not null,
  tipo_documento   text        not null default 'Outro',
  mime_type        text,
  tamanho_bytes    bigint,
  /** Caminho dentro do bucket do Supabase Storage — a fonte oficial. */
  caminho_storage  text        not null,

  -- Espelho no Google Drive. Nasce Pendente e sobe quando der.
  drive_status     text        not null default 'Pendente',
  drive_id         text,
  drive_url        text,
  drive_tentativas int         not null default 0,
  drive_erro       text,
  drive_enviado_em timestamptz,

  /** Anexo que este substitui. A versão anterior fica arquivada, não some. */
  substitui_id     uuid        references public.anexos(id),

  -- Vínculo: exatamente uma das colunas abaixo é preenchida.
  nota_fiscal_id   uuid        references public.notas_fiscais(id) on delete cascade,
  reserva_id       uuid        references public.reservas(id) on delete cascade,
  lancamento_id    uuid        references public.lancamentos(id) on delete cascade,
  extrato_id       uuid        references public.extratos_importados(id) on delete cascade,
  fechamento_id    uuid        references public.fechamentos(id) on delete cascade,

  observacao       text,
  ativo            boolean     not null default true,
  criado_em        timestamptz not null default now(),
  criado_por       uuid        default public.socio_atual_id() references public.socios(id),

  constraint anexo_nome_preenchido check (length(trim(nome_arquivo)) > 0),
  constraint anexo_caminho_preenchido check (length(trim(caminho_storage)) > 0),
  constraint anexo_tipo_valido check (
    tipo_documento in ('Nota fiscal', 'Comprovante', 'Extrato', 'Contrato',
                       'Prestação de contas', 'Outro')
  ),
  constraint anexo_drive_status_valido check (
    drive_status in ('Pendente', 'Enviado', 'Falhou', 'Dispensado')
  ),
  constraint anexo_tamanho_valido check (tamanho_bytes is null or tamanho_bytes > 0),

  -- Exatamente um vínculo. É isso que o campo genérico "entidade + id" não
  -- conseguiria garantir, e o motivo de as colunas serem separadas.
  constraint anexo_vinculo_unico check (
    (case when nota_fiscal_id is not null then 1 else 0 end) +
    (case when reserva_id     is not null then 1 else 0 end) +
    (case when lancamento_id  is not null then 1 else 0 end) +
    (case when extrato_id     is not null then 1 else 0 end) +
    (case when fechamento_id  is not null then 1 else 0 end) = 1
  )
);

create unique index anexo_caminho_unico on public.anexos (caminho_storage);
create index anexo_nota_fiscal on public.anexos (nota_fiscal_id) where nota_fiscal_id is not null;
create index anexo_reserva on public.anexos (reserva_id) where reserva_id is not null;
create index anexo_lancamento on public.anexos (lancamento_id) where lancamento_id is not null;
create index anexo_drive_pendentes on public.anexos (criado_em)
  where drive_status in ('Pendente', 'Falhou');

comment on column public.anexos.drive_status is
  'Pendente = ainda não subiu ao Drive. O arquivo já está salvo e utilizável; '
  'a fila é só do espelho para o contador.';
comment on constraint anexo_vinculo_unico on public.anexos is
  'Um anexo pertence a exatamente uma coisa. Colunas separadas em vez de campo '
  'genérico, para o banco poder garantir que o destino existe.';

-- Substituir arquiva a versão anterior automaticamente (decisão 19).
create or replace function public.tg_anexo_substitui()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.substitui_id is not null then
    update public.anexos set ativo = false where id = new.substitui_id;
  end if;
  return null;
end;
$$;

create trigger anexo_substitui
  after insert on public.anexos
  for each row execute function public.tg_anexo_substitui();

-- -----------------------------------------------------------------------------
-- Notas sem documento
-- -----------------------------------------------------------------------------
-- Substitui a antiga obrigatoriedade. Em vez de impedir o registro, expõe a
-- pendência — e é ela que segura o fechamento do mês.

create view public.notas_fiscais_sem_anexo
with (security_invoker = true) as
select
  nf.id,
  nf.numero,
  nf.serie,
  nf.data_emissao,
  nf.valor_total,
  cf.nome        as emitente,
  s.nome_curto   as destinatario,
  date_trunc('month', nf.data_emissao)::date as competencia,
  current_date - nf.data_emissao             as dias_aguardando
from public.notas_fiscais nf
join public.clientes_fornecedores cf on cf.id = nf.emitente_id
join public.socios s on s.id = nf.destinatario_socio_id
where nf.ativo
  and not exists (
    select 1 from public.anexos a
     where a.nota_fiscal_id = nf.id and a.ativo
  );

comment on view public.notas_fiscais_sem_anexo is
  'Notas registradas cujo documento ainda não foi enviado. Alimenta o alerta '
  'da tela inicial e bloqueia o fechamento do mês da emissão.';

-- -----------------------------------------------------------------------------
-- Fechar o mês passa a exigir os documentos
-- -----------------------------------------------------------------------------
-- Mesma função da 0008, com uma conferência a mais. É aqui que a exigência do
-- anexo passa a viver: não na hora de registrar, mas na hora de prestar contas.

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

  delete from public.fechamentos where competencia = v_inicio;

  insert into public.fechamentos (
    competencia, status, total_receitas, total_despesas, resultado, fechado_por
  )
  values (v_inicio, 'Fechado', v_receitas, v_despesas, v_resultado, public.socio_atual_id())
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
  'Fecha o mês e congela o resultado. Recusa se houver lançamento não '
  'conciliado ou nota fiscal sem documento.';

-- -----------------------------------------------------------------------------
-- Fila do Google Drive
-- -----------------------------------------------------------------------------

create view public.anexos_pendentes_drive
with (security_invoker = true) as
select
  a.id,
  a.nome_arquivo,
  a.caminho_storage,
  a.tipo_documento,
  a.drive_status,
  a.drive_tentativas,
  a.drive_erro,
  a.criado_em,
  -- Pasta de destino, na estrutura combinada com o dono.
  case
    when a.nota_fiscal_id is not null then
      'Notas fiscais/' || to_char(a.criado_em, 'YYYY') || '/' ||
      coalesce((select s.nome_curto
                  from public.notas_fiscais nf
                  join public.socios s on s.id = nf.destinatario_socio_id
                 where nf.id = a.nota_fiscal_id), 'Outros')
    when a.reserva_id    is not null then 'Comprovantes de reservas/' || to_char(a.criado_em, 'YYYY')
    when a.lancamento_id is not null then 'Comprovantes financeiros/' || to_char(a.criado_em, 'YYYY')
    when a.extrato_id    is not null then 'Extratos bancarios/'       || to_char(a.criado_em, 'YYYY')
    else                                  'Prestacao de contas/'      || to_char(a.criado_em, 'YYYY')
  end as pasta_destino
from public.anexos a
where a.ativo and a.drive_status in ('Pendente', 'Falhou');

comment on view public.anexos_pendentes_drive is
  'O que ainda falta espelhar no Drive, já com a pasta de destino calculada. '
  'Consumida pela Edge Function que faz o envio.';

-- -----------------------------------------------------------------------------
-- Armazenamento dos arquivos
-- -----------------------------------------------------------------------------
-- O bucket e as políticas do Storage pertencem a outro papel do banco, e em
-- alguns projetos a SQL Editor não tem permissão para criá-los. Se for o caso,
-- a migração segue normalmente e o aviso abaixo diz o que fazer pelo painel —
-- nenhuma tabela depende disso para existir.

do $$
begin
  begin
    insert into storage.buckets (id, name, public)
    values ('anexos', 'anexos', false)
    on conflict (id) do nothing;
  exception when others then
    raise warning
      'Não foi possível criar o bucket "anexos" por aqui. Crie no painel: '
      'Storage > New bucket > nome "anexos", deixando "Public bucket" DESMARCADO.';
  end;

  begin
    execute $p$
      create policy anexos_storage_leitura on storage.objects
        for select to authenticated
        using (bucket_id = 'anexos' and public.usuario_autorizado())
    $p$;
    execute $p$
      create policy anexos_storage_envio on storage.objects
        for insert to authenticated
        with check (bucket_id = 'anexos' and public.usuario_autorizado())
    $p$;
  exception
    when insufficient_privilege or duplicate_object then
      raise warning
        'Não foi possível criar as políticas do bucket "anexos" por aqui. '
        'Crie-as no painel: Storage > anexos > Policies, permitindo select e '
        'insert apenas para usuários autenticados.';
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rotina
-- -----------------------------------------------------------------------------

create trigger anexos_audit after insert or update or delete on public.anexos
  for each row execute function public.tg_audit();

-- -----------------------------------------------------------------------------
-- Segurança
-- -----------------------------------------------------------------------------

alter table public.anexos enable row level security;

create policy anexos_leitura on public.anexos
  for select to authenticated using (public.usuario_autorizado());
create policy anexos_insercao on public.anexos
  for insert to authenticated with check (public.usuario_autorizado());
create policy anexos_edicao on public.anexos
  for update to authenticated
  using (public.usuario_autorizado()) with check (public.usuario_autorizado());

grant select, insert, update on public.anexos to authenticated;
grant select on public.anexos_pendentes_drive  to authenticated;
grant select on public.notas_fiscais_sem_anexo to authenticated;
revoke all on public.anexos                    from anon;
revoke all on public.anexos_pendentes_drive    from anon;
revoke all on public.notas_fiscais_sem_anexo   from anon;

-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------

do $$
declare
  v_conta  uuid;
  v_cat    uuid;
  v_centro uuid;
  v_forn   uuid;
  v_socio  uuid;
  v_nf     uuid;
  v_anexo  uuid;
  v_novo   uuid;
  v_pasta  text;
  v_qtd    int;
  v_ok     boolean;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('email', (select email from public.socios where pode_entrar limit 1))::text,
    true
  );

  select id into v_socio from public.socios where pode_receber_nf order by nome_curto limit 1;

  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'anx', 'Corrente', 0, date '2020-01-01') returning id into v_conta;
  insert into public.categorias (nome, tipo) values ('__teste__', 'Despesa') returning id into v_cat;
  insert into public.centros_custo (nome, tipo) values ('__teste__', 'Despesa') returning id into v_centro;
  insert into public.clientes_fornecedores (nome, relacao, documento, contato)
    values ('__teste__', 'Fornecedor', '22233344455', 'x') returning id into v_forn;

  -- 1. Remoção de acentos, para o nome de arquivo combinado.
  if public.sem_acentos('Emissão Serrana Ltda') <> 'Emissao Serrana Ltda' then
    raise exception 'sem_acentos() não limpou corretamente';
  end if;

  -- 2. Anexo tem de ter exatamente um vínculo.
  v_ok := false;
  begin
    insert into public.anexos (nome_arquivo, caminho_storage) values ('x.pdf', 'a/x.pdf');
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'Anexo sem vínculo deveria ter sido recusado'; end if;

  -- 3. Nota fiscal SEM anexo agora é aceita — e fica listada como pendente.
  insert into public.notas_fiscais (numero, data_emissao, valor_total, emitente_id,
    destinatario_socio_id, categoria_id, centro_id, conta_id)
  values ('__teste__', date '2026-07-01', 500.00, v_forn, v_socio, v_cat, v_centro, v_conta)
  returning id into v_nf;

  if not exists (select 1 from public.notas_fiscais_sem_anexo where id = v_nf) then
    raise exception 'A nota sem anexo deveria aparecer como pendente';
  end if;

  -- 4. O mês da emissão não pode fechar com nota sem documento.
  v_ok := false;
  begin
    perform public.fechar_periodo(date '2026-07-01');
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'Fechar mês com nota sem documento deveria ser recusado';
  end if;

  -- 5. Anexado o documento, a pendência some.
  insert into public.anexos (nome_arquivo, tipo_documento, caminho_storage, nota_fiscal_id)
  values ('NF-__teste__-fornecedor.pdf', 'Nota fiscal', 'nf/__teste__.pdf', v_nf)
  returning id into v_anexo;

  select count(*) into v_qtd from public.notas_fiscais_sem_anexo where id = v_nf;
  if v_qtd <> 0 then raise exception 'A pendência deveria ter sumido após o anexo'; end if;

  -- 6. A pasta de destino no Drive é calculada corretamente.
  select pasta_destino into v_pasta from public.anexos_pendentes_drive where id = v_anexo;
  if v_pasta not like 'Notas fiscais/%' then
    raise exception 'Pasta de destino inesperada: %', v_pasta;
  end if;

  -- 7. Substituir arquiva o anterior sozinho, sem apagar nada.
  insert into public.anexos (nome_arquivo, tipo_documento, caminho_storage,
    nota_fiscal_id, substitui_id)
  values ('NF-__teste__-fornecedor-v2.pdf', 'Nota fiscal', 'nf/__teste__-v2.pdf', v_nf, v_anexo)
  returning id into v_novo;

  if (select ativo from public.anexos where id = v_anexo) then
    raise exception 'A versão anterior deveria ter sido arquivada';
  end if;
  if not exists (select 1 from public.anexos where id = v_anexo) then
    raise exception 'A versão anterior deveria continuar existindo, apenas arquivada';
  end if;

  -- Limpeza. O vínculo de substituição aponta de um anexo para outro, então
  -- precisa ser desfeito antes do DELETE.
  update public.anexos set substitui_id = null where nota_fiscal_id = v_nf;
  delete from public.anexos where nota_fiscal_id = v_nf;
  delete from public.nf_parcelas where nota_fiscal_id = v_nf;
  delete from public.notas_fiscais where id = v_nf;
  delete from public.lancamentos where conta_id = v_conta;
  delete from public.clientes_fornecedores where nome = '__teste__';
  delete from public.contas_bancarias where banco = '__teste__';
  delete from public.categorias where nome = '__teste__';
  delete from public.centros_custo where nome = '__teste__';
  delete from public.audit_log
    where dados_depois::text like '%__teste__%' or dados_antes::text like '%__teste__%';

  raise notice 'OK: NF sem anexo e aceita mas fica pendente; mes nao fecha com pendencia.';
end;
$$;
