import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { slugArquivo } from '../lib/formato'
import { traduzirErro } from './cadastros'

const BUCKET = 'anexos'

export type Anexo = {
  id: string
  nome_arquivo: string
  caminho_storage: string
  criado_em: string
}

/** Anexos ativos de uma nota fiscal, do mais novo para o mais antigo. */
export function useAnexosDeNf(notaFiscalId: string) {
  return useQuery({
    queryKey: ['anexos', 'nota-fiscal', notaFiscalId],
    queryFn: async (): Promise<Anexo[]> => {
      const { data, error } = await supabase
        .from('anexos')
        .select('id, nome_arquivo, caminho_storage, criado_em')
        .eq('nota_fiscal_id', notaFiscalId)
        .eq('ativo', true)
        .order('criado_em', { ascending: false })
      if (error) throw new Error(traduzirErro(error))
      return data ?? []
    },
  })
}

/**
 * Sobe o arquivo pro Storage e registra o anexo. Se o registro falhar, o
 * arquivo recém-enviado é removido — sem isso, ficaria um arquivo órfão no
 * bucket, sem nenhuma linha em `anexos` apontando pra ele.
 *
 * Quando já existe um anexo anterior (`substituiId`), o banco arquiva a
 * versão antiga sozinho (trigger da migração 0009) — aqui só é preciso
 * informar o vínculo.
 */
export function useEnviarAnexoNf(notaFiscalId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ arquivo, substituiId }: { arquivo: File; substituiId?: string }) => {
      const caminho = `notas-fiscais/${notaFiscalId}/${Date.now()}-${slugArquivo(arquivo.name)}`

      const { error: erroUpload } = await supabase.storage
        .from(BUCKET)
        .upload(caminho, arquivo, { contentType: arquivo.type || undefined })
      if (erroUpload) throw new Error('Não foi possível enviar o arquivo: ' + erroUpload.message)

      const { error: erroInsercao } = await supabase.from('anexos').insert({
        nome_arquivo: arquivo.name,
        tipo_documento: 'Nota fiscal',
        mime_type: arquivo.type || null,
        tamanho_bytes: arquivo.size,
        caminho_storage: caminho,
        nota_fiscal_id: notaFiscalId,
        substitui_id: substituiId ?? null,
      })

      if (erroInsercao) {
        await supabase.storage.from(BUCKET).remove([caminho])
        throw new Error(traduzirErro(erroInsercao))
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['anexos', 'nota-fiscal', notaFiscalId] })
      qc.invalidateQueries({ queryKey: ['notas-fiscais-sem-anexo'] })
    },
  })
}

/** Link temporário (1h) para abrir o documento — o bucket é privado. */
export function useAbrirAnexo() {
  return useMutation({
    mutationFn: async (caminhoStorage: string) => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(caminhoStorage, 3600)
      if (error) throw new Error('Não foi possível abrir o arquivo: ' + error.message)
      return data.signedUrl
    },
    onSuccess: (url) => {
      window.open(url, '_blank', 'noopener')
    },
  })
}
