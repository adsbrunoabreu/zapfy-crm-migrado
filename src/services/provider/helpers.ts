import { ProviderError } from '@/services/providers';

/** Remove dados sensíveis (tokens, apikey) de mensagens de erro. */
export function scrubError(err: unknown): string {
  let raw = '';
  if (err instanceof ProviderError) raw = err.message;
  else if (err instanceof Error) raw = err.message;
  else raw = typeof err === 'string' ? err : JSON.stringify(err);

  return raw
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, '$1***')
    .replace(/(apikey["'\s:=]+)[A-Za-z0-9._-]{8,}/gi, '$1***')
    .replace(/(accessToken["'\s:=]+)[A-Za-z0-9._-]{8,}/gi, '$1***')
    .replace(/(appSecret["'\s:=]+)[A-Za-z0-9._-]{8,}/gi, '$1***');
}

export function mediaTypeFromMime(mime: string | undefined): string {
  if (!mime) return 'document';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}
