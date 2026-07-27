/**
 * useHsmTemplates — hook React Query para templates HSM (oficiais Meta)
 * sincronizados em `whatsapp_hsm_templates`.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface HsmTemplate {
  id: string;
  company_id: string;
  instance_id: string;
  meta_template_id: string | null;
  name: string;
  language: string;
  category: string; // MARKETING | UTILITY | AUTHENTICATION
  status: string;   // APPROVED | PENDING | REJECTED | PAUSED | UNKNOWN
  components: any[];
  last_synced_at: string;
}

export function useHsmTemplates(instanceId: string | null | undefined) {
  return useQuery({
    queryKey: ['hsm-templates', instanceId],
    enabled: !!instanceId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<HsmTemplate[]> => {
      if (!instanceId) return [];
      const { data, error } = await (supabase as any)
        .from('whatsapp_hsm_templates')
        .select('*')
        .eq('instance_id', instanceId)
        .order('status', { ascending: true })
        .order('name', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as HsmTemplate[];
    },
  });
}

export function useSyncHsmTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (instanceId: string) => {
      const { data, error } = await supabase.functions.invoke('cloud-api-templates', {
        body: { action: 'sync', instanceId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (_d, instanceId) => {
      qc.invalidateQueries({ queryKey: ['hsm-templates', instanceId] });
    },
  });
}

export interface SendHsmInput {
  instanceId: string;
  conversationId: string;
  templateName: string;
  language: string;
  bodyVariables?: string[];
  headerVariables?: string[];
}

export function useSendHsmTemplate() {
  return useMutation({
    mutationFn: async (input: SendHsmInput) => {
      const { data, error } = await supabase.functions.invoke('cloud-api-templates', {
        body: { action: 'send', ...input },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { ok: boolean; messageId: string };
    },
  });
}

/** Extrai variáveis {{1}}, {{2}}… de um component body/header. */
export function extractVariables(text: string): string[] {
  if (!text) return [];
  const set = new Set<string>();
  const re = /{{\s*(\d+)\s*}}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) set.add(m[1]);
  return Array.from(set).sort((a, b) => Number(a) - Number(b));
}

/** Substitui {{1}} por values[0] etc. */
export function renderTemplateText(text: string, values: string[]): string {
  return text.replace(/{{\s*(\d+)\s*}}/g, (_, n) => {
    const idx = Number(n) - 1;
    return values[idx] ?? `{{${n}}}`;
  });
}
