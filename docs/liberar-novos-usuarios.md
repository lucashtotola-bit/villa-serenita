# Liberar acesso de um novo usuário

Vale só para os **quatro sócios** (Lucas, Michel, Gilson, Rosimere). O sistema não tem conceito
de "usuário" separado de "sócio" — quem tem `pode_entrar` marcado e um e-mail cadastrado, entra;
quem não tem, não entra. Não existe cadastro de funcionário/contador com login próprio hoje; se
isso vier a ser necessário, é uma decisão de arquitetura nova, não este procedimento.

Não dá para fazer pela tela do aplicativo — a tabela `socios` só é gravada por quem tem acesso
direto ao banco (por desenho: nenhum sócio pode se autopromover nem alterar o cadastro dos
outros pela interface). Por isso o passo a passo é sempre pelo painel do Supabase.

## Passo a passo

1. Peça à pessoa o e-mail exato da conta Google que ela vai usar para entrar.
2. Abra o [painel do Supabase](https://supabase.com/dashboard) do projeto.
3. Vá em **Table Editor** → tabela `socios`.
4. Encontre a linha da pessoa (os quatro já existem, criados na fundação do sistema).
5. Edite duas colunas:
   - `email` — o e-mail do passo 1, **todo em minúsculas** (o banco recusa e-mail com maiúscula).
   - `pode_entrar` — marque como `true`.
6. Salve.
7. Peça para a pessoa abrir o sistema e clicar em **"Entrar com Google"**, usando exatamente essa conta.

## Alternativa por SQL (mais rápido se for mexer em mais de um sócio)

No **SQL Editor**, em vez do Table Editor:

```sql
update public.socios
set email = 'email.da.pessoa@gmail.com', pode_entrar = true
where nome_completo = 'Nome Completo do Sócio';

-- conferir o resultado
select nome_completo, email, pode_entrar, pode_receber_nf, ativo
from public.socios
order by nome_completo;
```

## Se der "Acesso não autorizado"

- Confira se o e-mail no banco está **idêntico** ao e-mail usado no login (sem espaço, tudo minúsculo).
- Confira se `pode_entrar` ficou `true` de verdade (o `select` acima mostra na hora).
- Peça para a pessoa sair e tentar de novo — às vezes o Google mantém a sessão de uma conta
  errada aberta no navegador.

## Duas colunas que não fazem parte deste procedimento

Ligar `pode_entrar` não mexe nelas — são permissões à parte, e cada uma tem uma regra de negócio
por trás (documentada no `CLAUDE.md` da raiz). Não marque nenhuma das duas "só para facilitar":

- **`pode_receber_nf`** — hoje só Lucas e Michel podem receber nota fiscal em nome próprio
  (o sítio não tem CNPJ). Mudar isso é uma decisão de negócio, não um ajuste de acesso.
- **`pode_desfazer_conciliacao`** — hoje é privilégio exclusivo do Lucas, por decisão registrada.
  Ligar para outro sócio muda quem pode reabrir um mês fechado, e isso fica no histórico do sistema.
