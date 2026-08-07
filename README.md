# Villa Serenità

Sistema de gestão da Villa Serenità (Santa Teresa · ES) — hospedagem em três acomodações e
produção de café, com controle financeiro da sociedade familiar.

Uso interno dos quatro sócios. Não é um produto para terceiros.

## Estrutura

```
CLAUDE.md               regras de negócio invioláveis + arquitetura (leia primeiro)
spec/                   especificação viva — NÃO entra no build
  prototipo/            protótipo navegável que definiu o comportamento e o visual
  Documentacao do projeto.md   auditoria do protótipo — histórico, não editar
  decisoes-modelagem.md        por que o banco ficou desenhado assim — histórico, não editar
  legado-electron/      primeiro empacotamento, abandonado em favor do PWA — só referência
  referencias/           capturas enviadas pelo dono
apps/
  web/                  o aplicativo (React + Vite + TypeScript), único que roda em produção
supabase/
  migrations/           schema versionado — cada uma se autotesta ao final
  testes/                harness local para rodar as migrações antes do Supabase de verdade
  functions/             Edge Functions (envio ao Google Drive)
.github/workflows/       robô diário que mantém o Supabase ativo (plano gratuito pausa por inatividade)
```

## Como funciona

- **Banco e login:** Supabase (Postgres, Auth com Google, Storage, RLS).
- **Acesso:** restrito aos quatro sócios; qualquer outro e-mail é recusado.
- **Anexos:** guardados no Supabase e espelhados numa pasta compartilhada do Google Drive.
- **Distribuição:** aplicativo web instalável (PWA) — abre a versão publicada na nuvem, sem instalador
  e sem reinstalar a cada atualização.

As invariantes contábeis (rateio 25%, aportes fora do rateio, conciliação, parcelamento de notas
fiscais) são garantidas no banco, não apenas na interface. Detalhes em `CLAUDE.md`.

## Etapas

Todas as etapas do plano original foram concluídas. A 10 (instalador `.exe`) foi substituída,
por decisão registrada em `CLAUDE.md` (04/08/2026), por um PWA instalável — já entregue.

| # | Etapa | Estado |
|---|---|---|
| 0 | Estrutura do repositório | ✅ |
| 1 | Fundação + Cadastros | ✅ |
| 2 | Financeiro base | ✅ |
| 3 | Notas fiscais + dívidas | ✅ |
| 4 | Reservas + Calendário | ✅ |
| 5 | Café + Safras | ✅ |
| 6 | Conciliação (OFX real) | ✅ |
| 7 | Prestação de contas + aportes | ✅ |
| 8 | Google Drive real | ✅ |
| 9 | Visão geral, alertas e histórico | ✅ |
| ~~10~~ | ~~Instalador `.exe`~~ → PWA instalável | ✅ |

Depois do plano original, o sistema recebeu mais uma rodada de amadurecimento — não estava
prevista nas etapas acima, mas ficou registrada nas migrações `0011` a `0018`: juros/multa/desconto
na baixa, correções de uma revisão de arquitetura, gravação de pai e filhos numa transação só,
edição restrita (arquivar em vez de editar) para aporte/venda de café/distribuição, histórico
legível por trigger, e fechamento mensal versionado (reabrir não apaga o anterior).

## Estado do projeto e manutenção

Em 07/08/2026: as 18 migrações passam no harness local (`supabase/testes/testar.sh`) em banco
vazio **e** em banco já semeado (`SEMEAR=1`), inclusive o teste de idempotência; `npm run build`
e `npm run lint` (em `apps/web`) rodam limpos. Isso é o que "projeto em ordem" significa aqui —
vale reconferir os três antes de qualquer entrega.

Se for retomar depois de um tempo parado, ou precisar consertar algo:

1. **Leia `CLAUDE.md` primeiro.** É o único documento que precisa estar sempre atual — regras de
   negócio, arquitetura e o que não fazer. Os arquivos em `spec/` são histórico (por que cada
   decisão foi tomada) e não devem ser reescritos, só lidos.
2. **Toda mudança de regra de negócio começa no `CLAUDE.md`**, com a data da revisão — só depois
   vira migração ou tela.
3. **Toda migração nova segue o padrão das 18 existentes:** começa derrubando o que recria
   (`drop ... if exists`) e termina num bloco `do $$` que tenta quebrar a própria regra. Rode-a
   localmente nos dois modos do harness antes de colar no SQL Editor do Supabase — o
   `supabase/testes/README.md` explica os três erros que já custaram retrabalho.
4. **Um ponto de atenção operacional:** o espelhamento de anexos para o Google Drive
   (`supabase/functions/espelhar-drive`) usa um *refresh token* que o Google invalida a cada 7 dias
   enquanto o app OAuth estiver em modo "Testing" no Google Cloud Console — se os anexos pararem de
   ir para o Drive, confira isso antes de suspeitar de outra coisa.
5. **Deploy:** o `public/_redirects` sugere publicação num host com integração automática ao Git
   (padrão Cloudflare Pages) — não configurado dentro deste repositório. Vale confirmar no painel
   do provedor qual comando de build (`npm run build`, saída em `apps/web/dist`) e qual branch estão
   apontados, para não haver surpresa numa manutenção futura.
