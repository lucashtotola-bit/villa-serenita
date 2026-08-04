# Villa Serenità

Sistema de gestão da Villa Serenità (Santa Teresa · ES) — hospedagem em três acomodações e
produção de café, com controle financeiro da sociedade familiar.

Uso interno dos quatro sócios. Não é um produto para terceiros.

## Estrutura

```
CLAUDE.md            regras de negócio invioláveis + arquitetura (leia primeiro)
spec/                especificação viva — NÃO entra no build
  prototipo/         protótipo navegável que define o comportamento e o visual
  Documentacao do projeto.md
  legado-electron/   primeiro empacotamento, guardado como referência
  referencias/       capturas enviadas pelo dono
apps/
  web/               o aplicativo (React + Vite + TypeScript)
  desktop/           janela Electron + instalador (última etapa do projeto)
supabase/
  migrations/        schema versionado
  seed.sql           cadastros básicos reais
  functions/         Edge Functions (envio ao Google Drive)
.github/workflows/   publicação automática
```

## Como funciona

- **Banco e login:** Supabase (Postgres, Auth com Google, Storage, RLS).
- **Acesso:** restrito aos quatro sócios; qualquer outro e-mail é recusado.
- **Anexos:** guardados no Supabase e espelhados numa pasta compartilhada do Google Drive.
- **Distribuição:** o `.exe` abre a versão publicada na nuvem — atualizações não exigem reinstalar.

As invariantes contábeis (rateio 25%, aportes fora do rateio, conciliação, parcelamento de notas
fiscais) são garantidas no banco, não apenas na interface. Detalhes em `CLAUDE.md`.

## Etapas

| # | Etapa | Estado |
|---|---|---|
| 0 | Estrutura do repositório | ✅ |
| 1 | Fundação + Cadastros | — |
| 2 | Financeiro base | — |
| 3 | Notas fiscais + dívidas | — |
| 4 | Reservas + Calendário | — |
| 5 | Café + Safras | — |
| 6 | Conciliação (OFX real) | — |
| 7 | Prestação de contas + aportes | — |
| 8 | Google Drive real | — |
| 9 | Visão geral, alertas e histórico | — |
| 10 | Instalador `.exe` | — |
