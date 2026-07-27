// Limites e validações de mídia para envio via WhatsApp/Evolution.
// Limites baseados nas restrições oficiais do WhatsApp Business API,
// com margem de segurança para o payload do edge function.

export type MediaCategory = 'image' | 'video' | 'audio' | 'document';

export interface MediaLimit {
  maxBytes: number;
  label: string;
  acceptedMimes: RegExp;
}

export const MEDIA_LIMITS: Record<MediaCategory, MediaLimit> = {
  image: {
    maxBytes: 5 * 1024 * 1024, // 5 MB (WhatsApp)
    label: '5 MB',
    acceptedMimes: /^image\/(jpeg|jpg|png|webp|gif)$/i,
  },
  video: {
    maxBytes: 16 * 1024 * 1024, // 16 MB (WhatsApp)
    label: '16 MB',
    acceptedMimes: /^video\/(mp4|3gpp|quicktime|webm)$/i,
  },
  audio: {
    maxBytes: 16 * 1024 * 1024, // 16 MB (WhatsApp)
    label: '16 MB',
    acceptedMimes: /^audio\/(ogg|mpeg|mp4|aac|amr|webm|wav)/i,
  },
  document: {
    maxBytes: 20 * 1024 * 1024, // 20 MB (limite local — WhatsApp aceita até 100 MB,
                                 // mas mantemos 20 MB pra performance do upload)
    label: '20 MB',
    acceptedMimes: /.*/, // documentos: qualquer MIME
  },
};

export function categorizeFile(file: File): MediaCategory {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export interface ValidationResult {
  ok: boolean;
  category: MediaCategory;
  error?: { title: string; description: string };
}

/**
 * Valida arquivo antes do upload. Retorna { ok: false, error } com
 * mensagens em português prontas para exibir em toast.
 */
export function validateMediaFile(file: File): ValidationResult {
  const category = categorizeFile(file);
  const limit = MEDIA_LIMITS[category];

  // 1. Arquivo vazio
  if (file.size === 0) {
    return {
      ok: false,
      category,
      error: {
        title: 'Arquivo vazio',
        description: 'O arquivo selecionado está vazio. Escolha outro arquivo.',
      },
    };
  }

  // 2. MIME type não suportado (apenas para imagem/vídeo/áudio — documentos aceitam tudo)
  if (category !== 'document' && file.type && !limit.acceptedMimes.test(file.type)) {
    const friendlyTypes: Record<MediaCategory, string> = {
      image: 'JPG, PNG, WEBP ou GIF',
      video: 'MP4, 3GP, MOV ou WEBM',
      audio: 'OGG, MP3, M4A, AAC, AMR ou WAV',
      document: '',
    };
    return {
      ok: false,
      category,
      error: {
        title: 'Formato não suportado',
        description: `O WhatsApp aceita apenas ${friendlyTypes[category]} para ${category === 'image' ? 'imagens' : category === 'video' ? 'vídeos' : 'áudios'}. Tipo recebido: ${file.type}.`,
      },
    };
  }

  // 3. Tamanho excedido
  if (file.size > limit.maxBytes) {
    const categoryLabel: Record<MediaCategory, string> = {
      image: 'imagens',
      video: 'vídeos',
      audio: 'áudios',
      document: 'arquivos',
    };
    return {
      ok: false,
      category,
      error: {
        title: 'Arquivo muito grande',
        description: `Limite para ${categoryLabel[category]}: ${limit.label}. Este arquivo tem ${formatBytes(file.size)}.`,
      },
    };
  }

  return { ok: true, category };
}
