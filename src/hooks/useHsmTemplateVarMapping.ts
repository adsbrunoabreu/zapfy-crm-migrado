/**
 * useHsmTemplateVarMapping — get/upsert do mapeamento de variáveis de um
 * template Meta (HSM) por (instância, nome, idioma). Escopo da empresa.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface HsmVarMapping {
  header_tokens: string[];
  body_tokens: string[];
}

interface Key {
  instanceId: string;
  templateName: string;
  language: string;
}

export function useHsmTemplateVarMapping({ instanceId, templateName, language }: Key) {
  return useQuery({
    queryKey: ['hsm-var-mapping', instanceId, templateName, language],
    enabled: !!instanceId && !!templateName && !!language,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<HsmVarMapping | null> => {
      const { data, error } = await (supabase as any)
        .from('whatsapp_hsm_template_var_mappings')
        .select('header_tokens, body_tokens')
        .eq('instance_id', instanceId)
        .eq('template_name', templateName)
        .eq('language', language)
        .maybeSingle();
      if (error) throw error;
      return (data as HsmVarMapping | null) ?? null;
    },
  });
}

export function useSaveHsmVarMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      instanceId: string;
      templateName: string;
      language: string;
      headerTokens: string[];
      bodyTokens: string[];
    }) => {
      const { error } = await (supabase as any)
        .from('whatsapp_hsm_template_var_mappings')
        .upsert(
          {
            company_id: input.companyId,
            instance_id: input.instanceId,
            template_name: input.templateName,
            language: input.language,
            header_tokens: input.headerTokens,
            body_tokens: input.bodyTokens,
          },
          { onConflict: 'company_id,instance_id,template_name,language' },
        );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({
        queryKey: ['hsm-var-mapping', vars.instanceId, vars.templateName, vars.language],
      });
    },
  });
}
