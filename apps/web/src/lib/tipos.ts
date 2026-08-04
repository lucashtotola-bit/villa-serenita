/** Um sócio da Villa Serenità, como está na tabela `socios`. */
export type Socio = {
  id: string
  nome_completo: string
  nome_curto: string
  /** Nulo enquanto o sócio não for usuário do aplicativo. */
  email: string | null
  cota: number
  /** Se faz login. Ser sócio (ter cota) não implica acessar o sistema. */
  pode_entrar: boolean
  /** Regra inviolável: só Lucas e Michel podem receber nota fiscal. */
  pode_receber_nf: boolean
  /** Regra inviolável: só o Lucas desfaz conciliação de período fechado. */
  pode_desfazer_conciliacao: boolean
  ativo: boolean
}
