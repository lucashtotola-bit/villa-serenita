-- =============================================================================
-- Villa Serenità — histórico legível, e log que para de inchar
-- =============================================================================
-- Itens M2 e "tela de histórico" da revisão de 06/08/2026.
--
-- O sistema grava toda alteração desde a migração 0001, com autor e horário —
-- e ninguém consegue ler. A etapa 9 previa "histórico de ações"; a gravação
-- existia, a leitura não. Dado que se acumula sem ser lido é só custo.
--
-- DUAS MUDANÇAS, PELO MESMO MOTIVO
--
-- 1. O UPDATE passa a gravar só o que MUDOU, e não duas cópias inteiras do
--    registro. Uma NF em 12x produzia 37 linhas de auditoria, várias com o
--    JSON completo — no plano gratuito (500 MB) a auditoria ia ocupar mais
--    espaço que os dados. Guardar o delta não é só economia: quem abre o
--    histórico quer saber O QUE mudou, e hoje precisaria comparar dois JSONs
--    grandes na cabeça para descobrir.
--
-- 2. UPDATE que não muda nada deixa de virar linha. Os gatilhos de propagação
--    (transferência, arquivamento) tocam linhas que às vezes já estão no
--    estado desejado, e cada toque desses virava um registro vazio no
--    histórico.
--
-- O QUE NÃO MUDA: INSERT e DELETE continuam guardando o registro inteiro. No
-- INSERT não há "antes" para comparar, e no DELETE o que importa é justamente
-- o que deixou de existir.
-- =============================================================================

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
  v_velho  jsonb;
  v_novo   jsonb;
begin
  -- NEW não existe em DELETE e OLD não existe em INSERT: referenciar o campo
  -- errado aborta a operação, então cada caso é tratado separadamente.
  if tg_op = 'DELETE' then
    v_id := old.id; v_velho := to_jsonb(old); v_novo := null;
  elsif tg_op = 'UPDATE' then
    v_id := new.id; v_velho := to_jsonb(old); v_novo := to_jsonb(new);
  else
    v_id := new.id; v_velho := null;          v_novo := to_jsonb(new);
  end if;

  -- Dado pessoal sensível não entra no log (migração 0014). Fica antes do
  -- cálculo do delta, para não reaparecer por outro caminho.
  if tg_table_name = 'hospedes' then
    v_velho := v_velho - 'cpf';
    v_novo  := v_novo  - 'cpf';
  end if;

  if tg_op = 'UPDATE' then
    -- Só as chaves que de fato mudaram, dos dois lados. `atualizado_em` fica
    -- de fora: muda em toda alteração e não informa nada que `criado_em` do
    -- próprio log já não diga.
    select jsonb_object_agg(k, v_velho -> k), jsonb_object_agg(k, v_novo -> k)
      into v_antes, v_depois
      from jsonb_each(v_novo) as e(k, valor)
     where k <> 'atualizado_em'
       and v_velho -> k is distinct from v_novo -> k;

    -- Nada mudou de verdade: não vira linha.
    if v_depois is null then
      return null;
    end if;
  else
    v_antes  := v_velho;
    v_depois := v_novo;
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

comment on function public.tg_audit is
  'Registra quem alterou o quê e quando. No UPDATE guarda apenas os campos '
  'que mudaram — o histórico fica legível e o log para de inchar.';

-- -----------------------------------------------------------------------------
-- A visão que a tela consome
-- -----------------------------------------------------------------------------
-- O nome da tabela é do banco, não da casa: "contratos_divida" não quer dizer
-- nada para quem abre a tela. A tradução mora aqui, e não no aplicativo, para
-- uma tabela nova não aparecer como código cru só porque alguém esqueceu de
-- atualizar a lista do outro lado.

create or replace view public.historico
with (security_invoker = true) as
select
  a.id,
  a.criado_em,
  a.tabela,
  a.registro_id,
  a.acao,
  coalesce(s.nome_curto, a.usuario_email, 'Sistema') as autor,
  case a.tabela
    when 'lancamentos'             then 'Lançamento'
    when 'transferencias'          then 'Transferência'
    when 'notas_fiscais'           then 'Nota fiscal'
    when 'nf_parcelas'             then 'Parcela de nota fiscal'
    when 'contratos_divida'        then 'Contrato de dívida'
    when 'divida_parcelas'         then 'Parcela de dívida'
    when 'reservas'                then 'Reserva'
    when 'reserva_acomodacoes'     then 'Casa da reserva'
    when 'acomodacoes'             then 'Acomodação'
    when 'hospedes'                then 'Hóspede'
    when 'clientes_fornecedores'   then 'Cliente ou fornecedor'
    when 'categorias'              then 'Categoria'
    when 'centros_custo'           then 'Centro de custo'
    when 'contas_bancarias'        then 'Conta bancária'
    when 'socios'                  then 'Sócio'
    when 'safras'                  then 'Safra'
    when 'safra_etapas'            then 'Etapa da safra'
    when 'cafe_vendas'             then 'Venda de café'
    when 'cafe_estoque_movimentos' then 'Movimento de estoque'
    when 'aportes'                 then 'Aporte'
    when 'distribuicoes'           then 'Distribuição de lucro'
    when 'distribuicao_socios'     then 'Parte da distribuição'
    when 'fechamentos'             then 'Fechamento do mês'
    when 'anexos'                  then 'Anexo'
    when 'extratos_importados'     then 'Extrato importado'
    when 'extrato_linhas'          then 'Linha de extrato'
    else a.tabela
  end as entidade,
  a.dados_antes,
  a.dados_depois
from public.audit_log a
left join public.socios s on s.email = a.usuario_email;

comment on view public.historico is
  'O audit_log em forma legível: quem, quando, o quê, e apenas os campos que '
  'mudaram. É a leitura que faltava desde a migração 0001.';

grant select on public.historico to authenticated;
revoke all   on public.historico from anon;

-- O filtro da tela é por período, e é sempre do mais recente para o mais
-- antigo. O índice de 0001 já cobre isso; este serve ao recorte por tipo.
create index if not exists audit_log_tabela_data
  on public.audit_log (tabela, criado_em desc);

-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------

do $$
declare
  v_cat    uuid;
  v_hosp   uuid;
  v_antes  jsonb;
  v_depois jsonb;
  v_qtd    int;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('email', (select email from public.socios where pode_entrar limit 1))::text,
    true
  );

  insert into public.categorias (nome, tipo) values ('__teste__', 'Despesa') returning id into v_cat;

  -- 1. INSERT continua guardando o registro inteiro.
  select dados_depois into v_depois from public.audit_log
   where tabela = 'categorias' and registro_id = v_cat and acao = 'INSERT';
  if not (v_depois ? 'nome' and v_depois ? 'tipo' and v_depois ? 'ativo') then
    raise exception 'O INSERT deveria guardar o registro inteiro';
  end if;

  -- 2. UPDATE guarda só o que mudou, dos dois lados.
  update public.categorias set nome = '__teste__ 2' where id = v_cat;

  select dados_antes, dados_depois into v_antes, v_depois
    from public.audit_log
   where tabela = 'categorias' and registro_id = v_cat and acao = 'UPDATE'
   order by criado_em desc limit 1;

  if v_depois ->> 'nome' <> '__teste__ 2' or v_antes ->> 'nome' <> '__teste__' then
    raise exception 'O delta deveria conter o nome, antes e depois';
  end if;
  if v_depois ? 'tipo' or v_depois ? 'ativo' then
    raise exception 'O delta não deveria trazer campos que não mudaram: %', v_depois;
  end if;
  if v_depois ? 'atualizado_em' then
    raise exception 'atualizado_em não deveria entrar no delta';
  end if;

  -- 3. UPDATE que não muda nada não vira linha.
  select count(*) into v_qtd from public.audit_log
   where tabela = 'categorias' and registro_id = v_cat and acao = 'UPDATE';

  update public.categorias set nome = '__teste__ 2' where id = v_cat;

  if (select count(*) from public.audit_log
       where tabela = 'categorias' and registro_id = v_cat and acao = 'UPDATE') <> v_qtd then
    raise exception 'UPDATE sem mudança real não deveria virar registro';
  end if;

  -- 4. O CPF continua fora do log, inclusive no delta.
  insert into public.hospedes (nome, cpf, contato)
    values ('__teste__', '32132132132', 'x') returning id into v_hosp;
  update public.hospedes set cpf = '45645645645', nome = '__teste__ b' where id = v_hosp;

  if exists (
    select 1 from public.audit_log
     where tabela = 'hospedes' and registro_id = v_hosp
       and (dados_antes ? 'cpf' or dados_depois ? 'cpf')
  ) then
    raise exception 'O CPF não pode entrar no log nem pelo delta';
  end if;

  -- 5. A visão traduz a tabela e identifica o autor.
  if not exists (
    select 1 from public.historico
     where registro_id = v_cat and entidade = 'Categoria' and autor is not null
  ) then
    raise exception 'A visão historico deveria mostrar a categoria com autor';
  end if;

  -- Limpeza.
  delete from public.hospedes where id = v_hosp;
  delete from public.categorias where id = v_cat;
  delete from public.audit_log where registro_id in (v_cat, v_hosp);

  raise notice 'OK: insert inteiro, update so o delta, update vazio nao registra, '
               'CPF fora, visao traduz a tabela.';
end;
$$;
