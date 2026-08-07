#!/bin/bash
# =============================================================================
# Villa Serenità — aplica todas as migrações num Postgres local
# =============================================================================
# Roda ANTES de pedir para o dono executar qualquer migração no Supabase.
#
# Sobe um cluster descartável, aplica as migrações em ordem e para no primeiro
# erro. Os blocos `do $$` de conferência que cada migração carrega no fim são o
# teste de verdade; isto aqui só dá a eles um lugar para rodar.
#
#   bash supabase/testes/testar.sh              # banco vazio
#   SEMEAR=1 bash supabase/testes/testar.sh     # banco já em uso
#
# Rodar nos DOIS modos não é zelo: cada um esconde uma classe de erro que o
# outro pega. Ver o README.
# =============================================================================
set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG="$(cd "$AQUI/../migrations" && pwd)"
PGDATA="${PGDATA_TESTE:-$AQUI/.pgdata}"
PORTA="${PGPORT_TESTE:-55432}"

# -----------------------------------------------------------------------------
# Onde estão os binários do Postgres
# -----------------------------------------------------------------------------
achar_bin() {
  if command -v psql >/dev/null 2>&1; then
    dirname "$(command -v psql)"
    return
  fi
  # Instalação padrão no Windows, da mais nova para a mais antiga.
  for v in 18 17 16 15 14; do
    if [ -x "/c/Program Files/PostgreSQL/$v/bin/psql.exe" ]; then
      echo "/c/Program Files/PostgreSQL/$v/bin"
      return
    fi
  done
  return 1
}

PGBIN="${PGBIN_TESTE:-$(achar_bin)}" || {
  echo "Não encontrei o PostgreSQL. Instale-o, ou aponte PGBIN_TESTE para a"
  echo "pasta bin da instalação (a que contém psql e initdb)."
  exit 1
}

# Funções, e não variáveis: o caminho no Windows tem espaço em "Program Files"
# e a expansão sem aspas parte o comando em dois.
psqlv() { "$PGBIN/psql" -h 127.0.0.1 -p "$PORTA" -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
pgctl() { "$PGBIN/pg_ctl" "$@"; }

# -----------------------------------------------------------------------------
# Cluster descartável
# -----------------------------------------------------------------------------
if [ ! -d "$PGDATA" ]; then
  echo "Criando cluster de teste em $PGDATA"
  "$PGBIN/initdb" -D "$PGDATA" -U postgres -E UTF8 --locale=C -A trust >/dev/null 2>&1 || {
    echo "initdb falhou."; exit 1
  }
fi

if ! psqlv -c 'select 1' >/dev/null 2>&1; then
  pgctl -D "$PGDATA" -o "-p $PORTA" -l "$AQUI/.pg.log" start >/dev/null 2>&1
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    psqlv -c 'select 1' >/dev/null 2>&1 && break
    sleep 1
  done
fi

if ! psqlv -c 'select 1' >/dev/null 2>&1; then
  echo "Não consegui subir o Postgres na porta $PORTA. Veja $AQUI/.pg.log"
  exit 1
fi

# -----------------------------------------------------------------------------
# Banco do zero a cada execução
# -----------------------------------------------------------------------------
psqlv -c "drop database if exists villa_teste;"      >/dev/null 2>&1
psqlv -c "drop role if exists anon;"                 >/dev/null 2>&1
psqlv -c "drop role if exists authenticated;"        >/dev/null 2>&1
psqlv -c "create database villa_teste;"              >/dev/null 2>&1

if ! saida=$(psqlv -d villa_teste -f "$AQUI/shim.sql" 2>&1); then
  echo "O simulacro do ambiente Supabase falhou:"
  echo "$saida" | grep -v '^NOTICE' | head -10
  exit 1
fi

# -----------------------------------------------------------------------------
# As migrações, em ordem
# -----------------------------------------------------------------------------
for f in "$MIG"/0*.sql; do
  nome=$(basename "$f")

  # O seed entra no meio da fila, e não no começo: as migrações antigas criam
  # as tabelas que ele povoa. Ver o README para o porquê de existir.
  if [ "${SEMEAR:-0}" = "1" ] && [ "$nome" = "${SEMEAR_ANTES_DE:-0013_juros_multa_desconto.sql}" ]; then
    if seed=$(psqlv -d villa_teste -f "$AQUI/dados_reais.sql" 2>&1); then
      echo "  --  banco populado (simulando uso real)"
    else
      echo "SEED FALHOU"; echo "$seed" | grep -v '^NOTICE' | head -10; exit 1
    fi
  fi

  if saida=$(psqlv -d villa_teste -f "$f" 2>&1); then
    echo "  ok  $nome   $(echo "$saida" | grep -o 'OK:.*' | head -1)"
  else
    echo
    echo "=============================================="
    echo "FALHOU: $nome"
    echo "=============================================="
    echo "$saida" | grep -v '^NOTICE' | head -25
    exit 1
  fi
done

echo
echo "TODAS AS MIGRACOES PASSARAM"

# -----------------------------------------------------------------------------
# A última precisa poder rodar duas vezes
# -----------------------------------------------------------------------------
# O SQL Editor do Supabase confirma cada comando na hora, e não a migração
# inteira ao final. Uma que falhe no bloco de conferência deixa o DDL aplicado,
# e a segunda tentativa esbarra nele. Já aconteceu em produção.
echo
echo "### REAPLICANDO A ULTIMA (idempotencia) ###"
ultima=$(ls "$MIG"/0*.sql | tail -1)
if saida=$(psqlv -d villa_teste -f "$ultima" 2>&1); then
  echo "  ok  $(basename "$ultima") roda duas vezes sem erro"
else
  echo "  FALHOU ao reaplicar $(basename "$ultima"):"
  echo "$saida" | grep -v '^NOTICE' | head -12
  exit 1
fi
