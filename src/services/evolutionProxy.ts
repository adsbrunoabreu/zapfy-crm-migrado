import { supabase } from '@/integrations/supabase/client';
import { extractFunctionErrorAsync } from '@/lib/edgeError';

export async function invokeEvolutionProxy<T = unknown>(
  action: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (sessionError || !token) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const { data, error } = await supabase.functions.invoke('evolution-proxy', {
    body: { action, params },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
    const message = await extractFunctionErrorAsync(error);
    if (message.toLowerCase().includes('sessão expirada')) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
    throw new Error(message);
  }

  return data as T;
}
