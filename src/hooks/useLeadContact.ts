import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ContactConversation {
  id: string;
  phone: string | null;
  contact_name: string | null;
  contact_photo_url: string | null;
  lead_id: string | null;
  last_message_at: string | null;
}

const SELECT = 'id, phone, contact_name, contact_photo_url, lead_id, last_message_at';

/**
 * Returns the WhatsApp contact (conversation) linked to this lead, or a
 * suggestion matched by phone number if no link exists yet.
 */
export function useLeadContact(leadId: string | null, leadPhone: string | null) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  return useQuery({
    queryKey: ['lead-contact', leadId, leadPhone, companyId],
    enabled: !!leadId && !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<{
      linked: ContactConversation | null;
      suggested: ContactConversation | null;
    }> => {
      if (!leadId || !companyId) return { linked: null, suggested: null };

      // 1) Conversation already linked to this lead
      const { data: linkedRows } = await supabase
        .from('conversations')
        .select(SELECT)
        .eq('company_id', companyId)
        .eq('lead_id', leadId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1);

      const linked = (linkedRows?.[0] as ContactConversation) || null;
      if (linked) return { linked, suggested: null };

      // 2) Suggested by matching phone
      const phone = (leadPhone || '').trim();
      if (!phone) return { linked: null, suggested: null };

      const { data: suggestedRows } = await supabase
        .from('conversations')
        .select(SELECT)
        .eq('company_id', companyId)
        .eq('phone', phone)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1);

      const suggested = (suggestedRows?.[0] as ContactConversation) || null;
      return { linked: null, suggested };
    },
  });
}

/**
 * Search conversations (contacts) by name or phone within current company.
 */
export function useSearchContacts(query: string) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const q = query.trim();

  return useQuery({
    queryKey: ['contacts-search', companyId, q],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: async (): Promise<ContactConversation[]> => {
      if (!companyId) return [];
      let req = supabase
        .from('conversations')
        .select(SELECT)
        .eq('company_id', companyId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(20);

      if (q) {
        const safe = q.replace(/[%,]/g, '');
        req = req.or(`contact_name.ilike.%${safe}%,phone.ilike.%${safe}%`);
      }

      const { data, error } = await req;
      if (error) throw error;
      return (data || []) as ContactConversation[];
    },
  });
}

/**
 * Link a WhatsApp contact (conversation) to a lead.
 * - Unlinks any other conversation currently bound to this lead.
 * - Sets lead_id on the chosen conversation.
 * - Updates lead.phone and (if empty) lead.name from the contact.
 */
export function useLinkContactToLead() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      leadId: string;
      conversationId: string;
      phone: string | null;
      contactName: string | null;
      currentLeadName: string | null;
    }) => {
      const { leadId, conversationId, phone, contactName, currentLeadName } = params;

      // Detecta vínculo existente para diferenciar 'linked' vs 'changed'
      const { data: priorRows } = await supabase
        .from('conversations')
        .select('id, phone, contact_name')
        .eq('lead_id', leadId)
        .limit(1);
      const prior = (priorRows?.[0] as { id: string; phone: string | null; contact_name: string | null } | undefined) || null;

      // 1) Unlink any other conversation currently linked to this lead
      const { error: unlinkErr } = await supabase
        .from('conversations')
        .update({ lead_id: null })
        .eq('lead_id', leadId)
        .neq('id', conversationId);
      if (unlinkErr) throw unlinkErr;

      // 2) Link selected conversation to this lead
      const { error: linkErr } = await supabase
        .from('conversations')
        .update({ lead_id: leadId })
        .eq('id', conversationId);
      if (linkErr) throw linkErr;

      // 3) Update lead with the contact phone (and name when missing)
      const leadPatch: Record<string, any> = {};
      if (phone) leadPatch.phone = phone;
      if (!currentLeadName?.trim() && contactName?.trim()) leadPatch.name = contactName.trim();
      if (Object.keys(leadPatch).length > 0) {
        const { error: leadErr } = await supabase
          .from('leads')
          .update(leadPatch)
          .eq('id', leadId);
        if (leadErr) throw leadErr;
      }

      // 4) Audit log
      const isChange = !!prior && prior.id !== conversationId;
      const newLabel = `${contactName || 'Contato'}${phone ? ` (${phone})` : ''}`;
      const oldLabel = prior ? `${prior.contact_name || 'Contato'}${prior.phone ? ` (${prior.phone})` : ''}` : '';
      if (profile?.company_id) {
        await supabase.from('lead_activities').insert({
          company_id: profile.company_id,
          lead_id: leadId,
          user_id: profile.id,
          action_type: isChange ? 'contact_changed' : 'contact_linked',
          description: isChange
            ? `Contato do WhatsApp trocado de "${oldLabel}" para "${newLabel}"`
            : `Contato do WhatsApp vinculado: "${newLabel}"`,
          metadata: {
            conversation_id: conversationId,
            phone,
            contact_name: contactName,
            previous_conversation_id: prior?.id || null,
            previous_phone: prior?.phone || null,
            previous_contact_name: prior?.contact_name || null,
          },
        });
      }

      return { phone, contactName };
    },
    onSuccess: (_data, vars) => {
      toast.success('Contato vinculado à oportunidade');
      qc.invalidateQueries({ queryKey: ['lead-contact', vars.leadId] });
      qc.invalidateQueries({ queryKey: ['lead-full', vars.leadId] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['pipelines'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['lead-activities', vars.leadId] });
    },
    onError: (err: any) => {
      toast.error('Falha ao vincular contato', { description: err?.message });
    },
  });
}
