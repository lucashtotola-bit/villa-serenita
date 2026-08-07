// =============================================================================
// Villa Serenità — espelho dos anexos no Google Drive
// =============================================================================
// Etapa 8. O arquivo OFICIAL vive no Supabase Storage; esta função sobe uma
// CÓPIA para o Drive do Lucas, na estrutura combinada, para o contador
// continuar acessando como sempre.
//
// A distinção importa: se o Drive estiver fora do ar, ou a autorização expirar,
// ninguém fica impedido de trabalhar. O anexo já está salvo e utilizável; só o
// espelho fica para depois, marcado como 'Pendente'.
//
// A autorização mora AQUI, no servidor, e nunca no computador de ninguém.
// Quando o Gilson anexa uma nota, é a autorização do Lucas que sobe o arquivo.
//
// Segredos (Edge Functions → Secrets no painel):
//   GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET · GOOGLE_REFRESH_TOKEN
//   DRIVE_PASTA_RAIZ (opcional — sem ele, a função cria a própria pasta)
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY a própria Supabase injeta.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const TIPO_PASTA = 'application/vnd.google-apps.folder'
const NOME_RAIZ = 'Villa Serenita'

/** Quantos anexos por chamada. Evita estourar o tempo limite da função. */
const LOTE = 20

/** Depois disto, o anexo para de ser tentado sozinho e espera ação humana. */
const TENTATIVAS_MAX = 5

type Pendente = {
  id: string
  nome_arquivo: string
  caminho_storage: string
  tipo_documento: string
  drive_tentativas: number
  pasta_destino: string
}

// -----------------------------------------------------------------------------
// Google
// -----------------------------------------------------------------------------

/**
 * Troca o token de atualização por um de acesso.
 *
 * O de acesso vale uma hora; o de atualização não expira — desde que o app
 * esteja publicado em Produção. Em modo de teste o Google o invalida a cada 7
 * dias, que é o risco mais crítico mapeado no plano do projeto.
 */
async function tokenDeAcesso(): Promise<string> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
      refresh_token: Deno.env.get('GOOGLE_REFRESH_TOKEN') ?? '',
      grant_type: 'refresh_token',
    }),
  })

  const corpo = await r.json()
  if (!r.ok) {
    // invalid_grant quase sempre significa autorização revogada ou expirada —
    // e vale dizer isso em vez de repassar o código cru.
    const dica =
      corpo.error === 'invalid_grant'
        ? ' A autorização do Google foi revogada ou expirou. Gere um novo token '
          + 'de atualização e confirme que o app está publicado em Produção.'
        : ''
    throw new Error(`Google recusou a autenticação (${corpo.error ?? r.status}).${dica}`)
  }

  return corpo.access_token as string
}

async function drive(token: string, caminho: string, init?: RequestInit) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/${caminho}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  })
  if (!r.ok) {
    throw new Error(`Drive respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`)
  }
  return r.json()
}

/** Acha uma subpasta pelo nome, ou cria. */
async function subpasta(token: string, pai: string, nome: string): Promise<string> {
  const q = [
    `'${pai}' in parents`,
    `name = '${nome.replace(/'/g, "\\'")}'`,
    `mimeType = '${TIPO_PASTA}'`,
    'trashed = false',
  ].join(' and ')

  const achou = await drive(token, `files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`)
  if (achou.files?.length) return achou.files[0].id

  const nova = await drive(token, 'files?fields=id', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: nome, mimeType: TIPO_PASTA, parents: [pai] }),
  })
  return nova.id
}

/**
 * A pasta raiz do espelho.
 *
 * Tenta primeiro a configurada. Com o escopo `drive.file` o app só enxerga o
 * que ele mesmo criou, então uma pasta feita à mão no Drive costuma responder
 * 404 — e aí a função cria a sua própria e segue trabalhando, em vez de falhar.
 * Depois de criada, ela pode ser movida e compartilhada à vontade: o ID não
 * muda, e o acesso do app é ao arquivo, não ao lugar.
 */
async function raiz(token: string): Promise<string> {
  const configurada = Deno.env.get('DRIVE_PASTA_RAIZ')
  if (configurada) {
    try {
      const p = await drive(token, `files/${configurada}?fields=id,trashed`)
      if (!p.trashed) return p.id
    } catch {
      // Cai para a pasta própria, logo abaixo.
    }
  }

  const q = `name = '${NOME_RAIZ}' and mimeType = '${TIPO_PASTA}' and trashed = false`
  const achou = await drive(token, `files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`)
  if (achou.files?.length) return achou.files[0].id

  const nova = await drive(token, 'files?fields=id', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: NOME_RAIZ, mimeType: TIPO_PASTA }),
  })
  return nova.id
}

/** Sobe o arquivo e devolve id e link. Multipart: metadados + conteúdo juntos. */
async function enviar(
  token: string,
  pasta: string,
  nome: string,
  tipo: string,
  dados: Uint8Array,
): Promise<{ id: string; link: string }> {
  const limite = `villa${crypto.randomUUID().replace(/-/g, '')}`
  const cabeca = new TextEncoder().encode(
    `--${limite}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify({ name: nome, parents: [pasta] }) +
      `\r\n--${limite}\r\n` +
      `Content-Type: ${tipo}\r\n\r\n`,
  )
  const cauda = new TextEncoder().encode(`\r\n--${limite}--\r\n`)

  const corpo = new Uint8Array(cabeca.length + dados.length + cauda.length)
  corpo.set(cabeca, 0)
  corpo.set(dados, cabeca.length)
  corpo.set(cauda, cabeca.length + dados.length)

  const r = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/related; boundary=${limite}`,
      },
      body: corpo,
    },
  )

  if (!r.ok) {
    throw new Error(`Envio ao Drive falhou (${r.status}): ${(await r.text()).slice(0, 300)}`)
  }

  const j = await r.json()
  return { id: j.id, link: j.webViewLink }
}

// -----------------------------------------------------------------------------
// Rotina
// -----------------------------------------------------------------------------

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const { data: pendentes, error } = await supabase
    .from('anexos_pendentes_drive')
    .select('id, nome_arquivo, caminho_storage, tipo_documento, drive_tentativas, pasta_destino')
    .lt('drive_tentativas', TENTATIVAS_MAX)
    .order('criado_em')
    .limit(LOTE)

  if (error) {
    return Response.json({ erro: error.message }, { status: 500 })
  }
  if (!pendentes?.length) {
    return Response.json({ enviados: 0, falhas: 0, mensagem: 'Nada pendente.' })
  }

  let token: string
  try {
    token = await tokenDeAcesso()
  } catch (e) {
    // Sem token nada sobe: marcar cada anexo individualmente só encheria o
    // histórico com a mesma mensagem. O erro é da configuração, não deles.
    return Response.json({ erro: (e as Error).message }, { status: 502 })
  }

  const idRaiz = await raiz(token)
  // Uma pasta resolvida uma vez por execução: um mês de notas do mesmo sócio
  // são dezenas de anexos no mesmo lugar.
  const cache = new Map<string, string>()

  let enviados = 0
  const falhas: string[] = []

  for (const a of pendentes as Pendente[]) {
    try {
      const { data: arquivo, error: erroDown } = await supabase.storage
        .from('anexos')
        .download(a.caminho_storage)
      if (erroDown || !arquivo) {
        throw new Error(`Arquivo não encontrado no Storage: ${erroDown?.message ?? a.caminho_storage}`)
      }

      let pasta = idRaiz
      let acumulado = ''
      for (const parte of a.pasta_destino.split('/').filter(Boolean)) {
        acumulado += `/${parte}`
        const emCache = cache.get(acumulado)
        pasta = emCache ?? (await subpasta(token, pasta, parte))
        cache.set(acumulado, pasta)
      }

      const { id, link } = await enviar(
        token,
        pasta,
        a.nome_arquivo,
        arquivo.type || 'application/octet-stream',
        new Uint8Array(await arquivo.arrayBuffer()),
      )

      await supabase
        .from('anexos')
        .update({
          drive_status: 'Enviado',
          drive_id: id,
          drive_url: link,
          drive_erro: null,
          drive_enviado_em: new Date().toISOString(),
        })
        .eq('id', a.id)

      enviados++
    } catch (e) {
      const msg = (e as Error).message
      falhas.push(`${a.nome_arquivo}: ${msg}`)

      // Conta a tentativa. Passando do limite o anexo para de ser tentado
      // sozinho — repetir para sempre um erro que não muda só gasta cota.
      await supabase
        .from('anexos')
        .update({
          drive_status: 'Falhou',
          drive_tentativas: a.drive_tentativas + 1,
          drive_erro: msg.slice(0, 500),
        })
        .eq('id', a.id)
    }
  }

  return Response.json({ enviados, falhas: falhas.length, detalhes: falhas })
})
