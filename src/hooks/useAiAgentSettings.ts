import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { AiAgent } from '@/components/settings/ai/types';

const DEFAULT_FORM: Partial<AiAgent> = {
  name: 'Assistente',
  persona: 'Atendente cordial e prestativo',
  system_prompt: 'Você é um assistente virtual de pré-atendimento. Seja breve, humano e cordial. Faça uma pergunta por vez.',
  model: 'google/gemini-2.5-flash',
  is_active: true,
  business_hours_only: false,
  paused_until: null,
  max_turns: 15,
  handoff_keywords: ['atendente', 'humano', 'pessoa', 'cancelar'],
  response_delay_ms: 1500,
  debounce_seconds: 8,
  kb_document_ids: null,
};

export function useAiAgentSettings(companyId: string | undefined) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: company } = useQuery({
    queryKey: ['company-ai-flag', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from('companies').select('ai_agent_enabled').eq('id', companyId).maybeSingle();
      return data;
    },
    enabled: !!companyId,
  });

  const enabled = !!company?.ai_agent_enabled;

  const { data: agents = [] } = useQuery({
    queryKey: ['ai-agents', companyId],
    queryFn: async () => {
      if (!companyId) return [] as AiAgent[];
      const { data } = await supabase
        .from('ai_agents').select('*').eq('company_id', companyId).limit(50);
      return ((data || []) as unknown) as AiAgent[];
    },
    enabled: !!companyId && enabled,
  });

  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [form, setForm] = useState<Partial<AiAgent>>({});

  const existingAgent = useMemo(
    () => agents.find((a) => a.pipeline_id === selectedPipelineId),
    [agents, selectedPipelineId],
  );

  useEffect(() => {
    setForm(existingAgent ?? DEFAULT_FORM);
  }, [existingAgent]);

  const isPaused = !!(existingAgent?.paused_until && new Date(existingAgent.paused_until) > new Date());

  const save = useMutation({
    mutationFn: async () => {
      if (!companyId || !selectedPipelineId) throw new Error('Selecione um pipeline');
      const payload = {
        company_id: companyId,
        pipeline_id: selectedPipelineId,
        name: form.name || 'Assistente',
        persona: form.persona || '',
        system_prompt: form.system_prompt || '',
        model: form.model || 'google/gemini-2.5-flash',
        is_active: form.is_active ?? true,
        business_hours_only: form.business_hours_only ?? false,
        max_turns: form.max_turns || 15,
        handoff_keywords: form.handoff_keywords || [],
        response_delay_ms: form.response_delay_ms || 1500,
        debounce_seconds: Math.max(0, Math.min(60, form.debounce_seconds ?? 8)),
        kb_document_ids:
          Array.isArray(form.kb_document_ids) && form.kb_document_ids.length > 0
            ? form.kb_document_ids
            : null,
      };
      if (existingAgent) {
        const { error } = await supabase.from('ai_agents').update(payload).eq('id', existingAgent.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ai_agents').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-agents', companyId] });
      toast({ title: 'Agente salvo' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const togglePause = useMutation({
    mutationFn: async (pause: boolean) => {
      if (!existingAgent) throw new Error('Salve o agente antes');
      const until = pause ? new Date(Date.now() + 24 * 3600 * 1000).toISOString() : null;
      const { error } = await supabase
        .from('ai_agents').update({ paused_until: until }).eq('id', existingAgent.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-agents', companyId] });
      toast({ title: 'Status atualizado' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  return {
    enabled,
    agents,
    selectedPipelineId,
    setSelectedPipelineId,
    form,
    setForm,
    existingAgent,
    isPaused,
    save,
    togglePause,
  };
}
