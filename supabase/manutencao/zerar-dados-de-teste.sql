-- =============================================================================
-- Villa Serenità — zera todos os dados de teste, mantendo só o sítio em si
-- =============================================================================
-- Uso único: cole no SQL Editor do Supabase e rode uma vez, antes de começar a
-- usar o sistema para valer. NÃO é uma migração — não muda schema, política nem
-- trigger nenhum, só apaga linhas. Depois de rodar, pode fechar esta aba.
--
-- Mantém intactos:  socios (os 4 sócios), acomodacoes (as 3 casas)
-- Apaga tudo o mais: todo cadastro, reserva, lançamento, nota fiscal, dívida,
--                    safra/café, extrato importado, aporte, distribuição,
--                    fechamento, anexo e o histórico de alterações.
--
-- TRUNCATE não dispara os triggers de arquivar/auditar linha a linha (eles só
-- existem para INSERT/UPDATE/DELETE) — a limpeza sai direto, sem os efeitos em
-- cascata que "arquivar" teria (não precisa: estamos apagando os dois lados).
--
-- O que isto NÃO limpa, porque mora fora do banco — faça à parte:
--   • Supabase Storage, bucket "anexos": apague os arquivos pelo painel
--     (Storage → anexos → selecionar tudo → excluir). Apagar só a linha da
--     tabela `anexos` no banco não libera o arquivo físico.
--   • Google Drive: a pasta "Villa Serenita" com os anexos espelhados.
-- =============================================================================

begin;

truncate table
  -- financeiro
  public.lancamentos,
  public.transferencias,
  public.audit_log,
  -- notas fiscais e dívidas
  public.notas_fiscais,
  public.nf_parcelas,
  public.contratos_divida,
  public.divida_parcelas,
  -- reservas
  public.reservas,
  public.reserva_acomodacoes,
  -- café e safra
  public.safras,
  public.safra_etapas,
  public.cafe_estoque_movimentos,
  public.cafe_vendas,
  -- conciliação
  public.extratos_importados,
  public.extrato_linhas,
  -- fechamento e capital
  public.fechamentos,
  public.fechamento_socios,
  public.aportes,
  public.distribuicoes,
  public.distribuicao_socios,
  -- anexos (só a linha do banco — o arquivo em si precisa ser removido à parte)
  public.anexos,
  -- cadastros básicos
  public.categorias,
  public.centros_custo,
  public.hospedes,
  public.clientes_fornecedores,
  public.contas_bancarias
  restart identity cascade;

-- Conferência: os dois cadastros fixos continuam intactos, e tudo o mais está
-- zerado. Se alguma linha aparecer abaixo do esperado, o `rollback` no fim
-- desfaz tudo — nada fica pela metade.
do $$
declare
  v_socios int; v_acomodacoes int; v_resto int;
begin
  select count(*) into v_socios from public.socios;
  select count(*) into v_acomodacoes from public.acomodacoes;

  select
    (select count(*) from public.lancamentos) +
    (select count(*) from public.transferencias) +
    (select count(*) from public.audit_log) +
    (select count(*) from public.notas_fiscais) +
    (select count(*) from public.contratos_divida) +
    (select count(*) from public.reservas) +
    (select count(*) from public.safras) +
    (select count(*) from public.cafe_estoque_movimentos) +
    (select count(*) from public.cafe_vendas) +
    (select count(*) from public.extratos_importados) +
    (select count(*) from public.fechamentos) +
    (select count(*) from public.aportes) +
    (select count(*) from public.distribuicoes) +
    (select count(*) from public.anexos) +
    (select count(*) from public.categorias) +
    (select count(*) from public.centros_custo) +
    (select count(*) from public.hospedes) +
    (select count(*) from public.clientes_fornecedores) +
    (select count(*) from public.contas_bancarias)
  into v_resto;

  if v_socios <> 4 then
    raise exception 'esperava 4 sócios depois da limpeza, achei %', v_socios;
  end if;
  if v_acomodacoes <> 3 then
    raise exception 'esperava 3 acomodações depois da limpeza, achei %', v_acomodacoes;
  end if;
  if v_resto <> 0 then
    raise exception 'sobrou % linha(s) fora de sócios/acomodações — limpeza incompleta', v_resto;
  end if;

  raise notice 'OK: 4 sócios e 3 acomodações intactos; todo o resto zerado.';
end $$;

commit;
