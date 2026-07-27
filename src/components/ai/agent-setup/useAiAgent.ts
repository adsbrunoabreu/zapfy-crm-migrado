import { useEffect, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AgentForm, DEFAULT_FORM } from './constants';

export function useAiAgent(companyId: string | undefined, instanceId: string, onAgentSaved?: (id: string) => void) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: agent } = useQuery({
    queryKey: ['ai-agent-instance', companyId, instanceId],
    enabled: !!companyId && !!instanceId,
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_agents').select('*')
        .eq('company_id', companyId!)
        .eq('instance_id', instanceId)
        .maybeSingle();
      return data;
    },
  });

  const [form, setForm] = useState<AgentForm>(DEFAULT_FORM);

  useEffect(() => {
    if (agent) {
      setForm({
        ...DEFAULT_FORM,
        ...(agent as any),
        qualification_questions: Array.isArray((agent as any).qualification_questions)
          ? (agent as any).qualification_questions : [],
        collect_fields: Array.isArray((agent as any).collect_fields)
          ? (agent as any).collect_fields : DEFAULT_FORM.collect_fields,
        available_hours: ((agent as any).available_hours as any) || DEFAULT_FORM.available_hours,
      });
    } else {
      setForm(DEFAULT_FORM);
    }
  }, [agent?.id, instanceId]);

  const save = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('Empresa não identificada');
      const payload: any = {
        company_id: companyId,
        instance_id: instanceId,
        name: form.name || 'Assistente',
        emoji: form.emoji || null,
        persona: form.persona || '',
        tone: form.tone || 'casual',
        system_prompt: form.system_prompt || '',
        model: form.model,
        is_active: !!form.is_active,
        business_hours_only: !!form.business_hours_only,
        max_turns: Math.max(3, Math.min(50, form.max_turns || 15)),
        handoff_keywords: form.handoff_keywords || [],
        response_delay_ms: Math.max(0, form.response_delay_ms || 0),
        debounce_seconds: Math.max(0, Math.min(60, form.debounce_seconds ?? 8)),
        qualification_questions: form.qualification_questions || [],
        collect_fields: form.collect_fields || [],
        available_hours: form.available_hours,
        offer_scheduling: !!form.offer_scheduling,
        offer_timing: form.offer_timing || 'qualified',
        auto_confirmation: !!form.auto_confirmation,
        reminder_enabled: !!form.reminder_enabled,
        send_discount_coupon: !!form.send_discount_coupon,
        detect_negative_sentiment: !!form.detect_negative_sentiment,
        kb_document_ids: Array.isArray(form.kb_document_ids) && form.kb_document_ids.length > 0
          ? form.kb_document_ids : null,
      };
      if (agent?.id) {
        const { error } = await supabase.from('ai_agents').update(payload).eq('id', agent.id);
        if (error) throw error;
        return agent.id;
      }
      const { data, error } = await supabase.from('ai_agents').insert(payload).select('id').single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast({ title: 'Configuração salva' });
      qc.invalidateQueries({ queryKey: ['ai-agents', companyId] });
      qc.invalidateQueries({ queryKey: ['ai-agent-instance', companyId, instanceId] });
      qc.invalidateQueries({ queryKey: ['ai-agent-history', id] });
      if (onAgentSaved && id) onAgentSaved(id);
    },
    onError: (e: any) => toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' }),
  });

  const upd = useCallback(<K extends keyof AgentForm>(k: K, v: AgentForm[K]) =>
    setForm((f) => ({ ...f, [k]: v })), []);

  const addQuestion = useCallback(() =>
    setForm((f) => ({ ...f, qualification_questions: [...(f.qualification_questions || []), ''] })), []);

  const editQuestion = useCallback((i: number, v: string) =>
    setForm((f) => {
      const next = [...(f.qualification_questions || [])];
      next[i] = v;
      return { ...f, qualification_questions: next };
    }), []);

  const removeQuestion = useCallback((i: number) =>
    setForm((f) => ({
      ...f,
      qualification_questions: (f.qualification_questions || []).filter((_, idx) => idx !== i),
    })), []);

  const moveQuestion = useCallback((i: number, dir: -1 | 1) =>
    setForm((f) => {
      const arr = [...(f.qualification_questions || [])];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return f;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...f, qualification_questions: arr };
    }), []);

  const toggleField = useCallback((field: string) =>
    setForm((f) => {
      const has = f.collect_fields.includes(field);
      return {
        ...f,
        collect_fields: has ? f.collect_fields.filter((x) => x !== field) : [...f.collect_fields, field],
      };
    }), []);

  const updateDay = useCallback((day: string, patch: Partial<{ enabled: boolean; start: string; end: string }>) =>
    setForm((f) => ({
      ...f,
      available_hours: { ...f.available_hours, [day]: { ...f.available_hours[day], ...patch } },
    })), []);

  return {
    agent, form, setForm, save,
    upd, addQuestion, editQuestion, removeQuestion, moveQuestion, toggleField, updateDay,
    qc, toast,
  };
}
