# Testar as migrações antes de rodar no Supabase

Aplica todas as migrações num PostgreSQL local e para no primeiro erro.

```bash
bash supabase/testes/testar.sh              # banco vazio
SEMEAR=1 bash supabase/testes/testar.sh     # banco já em uso
```

**Rode os dois.** Não é zelo: cada modo esconde uma classe de erro que o outro
pega, e a diferença já custou três rodadas de retrabalho.

Precisa de um PostgreSQL instalado (só os binários — o script cria e sobe o
cluster sozinho, num diretório ignorado pelo Git). Se `psql` não estiver no
PATH, aponte `PGBIN_TESTE` para a pasta `bin` da instalação.

## Por que isto existe

As migrações deste projeto já se autotestam: cada uma termina num bloco
`do $$` que cria dados descartáveis, tenta violar cada regra, exige a recusa e
limpa tudo. Um `raise exception` aborta a migração inteira.

O que faltava era um lugar para esses blocos rodarem **antes** de o dono colar
a migração no SQL Editor. Sem isso, cada erro custava uma ida e volta com ele —
e o erro só aparecia depois de metade da migração já ter sido aplicada.

## Os arquivos

| | |
|---|---|
| `testar.sh` | sobe o cluster, aplica as migrações em ordem, reaplica a última |
| `shim.sql` | simulacro do ambiente Supabase: papéis `anon`/`authenticated`, `auth.jwt()`, `auth.uid()`, schema `storage` |
| `dados_reais.sql` | povoa o banco como se estivesse em uso — só com `SEMEAR=1` |

O `shim.sql` existe porque as migrações usam coisas que o Supabase fornece e um
Postgres nu não tem. O `auth.jwt()` lê o mesmo GUC que o PostgREST preenche
(`request.jwt.claims`), então `set_config` nos blocos de teste funciona igual
aos dois lados.

## As três armadilhas que este harness pega

Cada uma causou uma falha real. Todas passariam despercebidas sem o modo
correspondente.

### 1. Asserção absoluta sobre agregado por sócio

`saldo_aportes` e `distribuido_por_socio` **nunca são zero num banco em uso**, e
sócio não dá para criar no teste — a soma das cotas tem de fechar 100%. Um
teste que exija "o total ficou zero depois de arquivar" passa em banco vazio e
falha em produção.

Meça sempre a **diferença** contra um baseline capturado antes:

```sql
select saldo_em_aberto into v_base from public.saldo_aportes where socio_id = v_socio;
-- ... age ...
if (select saldo_em_aberto from public.saldo_aportes where socio_id = v_socio) <> v_base then
```

É para isso que `SEMEAR=1` existe. Ele povoa aportes de dois sócios, uma
devolução e uma distribuição já registrada.

### 2. Coluna gerada em gatilho `BEFORE`

O Postgres só calcula colunas geradas **depois** dos gatilhos `BEFORE`. Dentro
de um deles, uma coluna gerada chega **nula** em `NEW` e preenchida em `OLD` —
uma diferença fabricada pelo motor, que nada tem a ver com o usuário ter
editado algo.

Um gatilho que compare `to_jsonb(old)` com `to_jsonb(new)` precisa descontá-las,
e descobrindo pelo catálogo em vez de por lista fixa:

```sql
select array_agg(attname) from pg_attribute
 where attrelid = tg_relid and attgenerated <> '' and not attisdropped;
```

Hoje só `cafe_vendas.valor_total` é gerada. A lista fixa funcionaria — até
alguém acrescentar a segunda.

### 3. Migração que não pode ser rodada duas vezes

O SQL Editor do Supabase **confirma cada comando na hora**, e não a migração
inteira ao final. Uma que falhe no bloco de conferência deixa o DDL já
aplicado, e a segunda tentativa esbarra nele com `already exists`.

Toda migração precisa começar derrubando o que vai recriar:

```sql
drop trigger if exists x on public.y;
create trigger x ...
```

O passo final do script reaplica a última migração justamente para provar isso.

## Quando uma migração falhar aqui

O erro traz o arquivo, a linha e o contexto do `raise`. Vale ler antes de
mexer: nas três falhas que motivaram este harness, **duas eram do teste, não da
migração** — a regra estava certa e a asserção é que assumia banco vazio.
