import { supabase } from '@/integrations/supabase/client';
import type { ProviderCredentials, ProviderType } from '@/types/providers';

/**
 * Por padrão grava as credenciais como JSON cru em `whatsapp_instances.config`
 * (protegido por RLS). Se a edge function `provider-credentials-vault` estiver
 * disponível, delega para ela cifrar com AES-256-GCM em repouso.
 */
export async function encryptCredentials(
  creds: ProviderCredentials,
): Promise<Record<string, unknown>> {
  try {
    const { data, error } = await supabase.functions.invoke('provider-credentials-vault', {
      body: { action: 'encrypt', credentials: creds },
    });
    if (!error && data?.encrypted) {
      return { _v: 1, encrypted: data.encrypted };
    }
  } catch {
    // edge function ausente → fallback abaixo
  }
  return creds as unknown as Record<string, unknown>;
}

export async function decryptCredentials(
  providerType: ProviderType,
  config: Record<string, unknown>,
): Promise<ProviderCredentials> {
  if (config && typeof config.encrypted === 'string') {
    const { data, error } = await supabase.functions.invoke('provider-credentials-vault', {
      body: { action: 'decrypt', encrypted: config.encrypted },
    });
    if (error || !data?.credentials) {
      throw new Error(`Falha ao decifrar credenciais: ${error?.message ?? 'vault indisponível'}`);
    }
    return data.credentials as ProviderCredentials;
  }
  // Fallback: config armazenado em claro
  return { ...(config as object), type: providerType } as ProviderCredentials;
}
