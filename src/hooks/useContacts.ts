import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface Contact {
  id: string;
  company_id: string;
  tenant_seq: number | null;
  name: string;
  phone: string | null;
  phone_normalized: string | null;
  email: string | null;
  document: string | null;
  birth_date: string | null;
  gender: string | null;
  avatar_url: string | null;
  company_name: string | null;
  source: string | null;
  notes: string | null;
  country: string | null;
  zip_code: string | null;
  address: string | null;
  address_number: string | null;
  address_complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  medical_patient_id: string | null;
  allergies: string | null;
  insurance: string | null;
  assigned_to: string | null;
  created_by: string | null;
  last_interaction_at: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  // joined
  assignee?: { id: string; full_name: string | null; email: string } | null;
  // computed via subqueries on the page
  active_opportunities?: number;
  total_opportunities?: number;
}

const SELECT_BASE = `
  *,
  assignee:profiles!assigned_to(id, full_name, email)
`;

const sb = supabase as any;

/** List all contacts for the user's company. */
export function useContacts() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['contacts', profile?.company_id],
    enabled: !!profile?.company_id,
    staleTime: 60_000,
    queryFn: async (): Promise<Contact[]> => {
      const { data, error } = await sb
        .from('contacts')
        .select(SELECT_BASE)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data || []) as Contact[];
    },
  });
}

/** Single contact detail. */
export function useContact(id: string | null | undefined) {
  return useQuery({
    queryKey: ['contact', id],
    enabled: !!id,
    staleTime: 60_000,
    queryFn: async (): Promise<Contact | null> => {
      if (!id) return null;
      const { data, error } = await sb
        .from('contacts')
        .select(SELECT_BASE)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as Contact | null;
    },
  });
}

/** Opportunities (leads/cards) for a contact. */
export function useContactOpportunities(contactId: string | null | undefined) {
  return useQuery({
    queryKey: ['contact-opportunities', contactId],
    enabled: !!contactId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('leads')
        .select(`
          id, name, value, status, created_at, updated_at, closed_at, tenant_seq,
          pipeline:pipelines(id, name),
          stage:pipeline_stages(id, name, color),
          assignee:profiles!assigned_to(id, full_name, email)
        `)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

/** Conversations for a contact. */
export function useContactConversations(contactId: string | null | undefined) {
  return useQuery({
    queryKey: ['contact-conversations', contactId],
    enabled: !!contactId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('conversations')
        .select('id, phone, contact_name, contact_photo_url, last_message_at, unread_count, channel')
        .eq('contact_id', contactId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

/** Appointments for a contact. */
export function useContactAppointments(contactId: string | null | undefined) {
  return useQuery({
    queryKey: ['contact-appointments', contactId],
    enabled: !!contactId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('appointments')
        .select('id, title, scheduled_at, duration_minutes, status, notes')
        .eq('contact_id', contactId)
        .order('scheduled_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

/** Attachments (from all opportunities of the contact). */
export function useContactAttachments(contactId: string | null | undefined) {
  return useQuery({
    queryKey: ['contact-attachments', contactId],
    enabled: !!contactId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('lead_attachments')
        .select('id, file_name, file_url, file_size, mime_type, created_at, lead_id')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

/** Unified activity timeline for a contact (lead activities scoped by contact_id). */
export function useContactActivityTimeline(contactId: string | null | undefined) {
  return useQuery({
    queryKey: ['contact-activities', contactId],
    enabled: !!contactId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('lead_activities')
        .select(`
          id, action_type, description, metadata, created_at, lead_id,
          user:profiles!user_id(id, full_name, email)
        `)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

/** Counts of active opportunities per contact (single grouped query). */
export function useContactsOpportunityCounts(contactIds: string[]) {
  const enabled = contactIds.length > 0;
  return useQuery({
    queryKey: ['contacts-opp-counts', contactIds.join(',')],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, { total: number; active: number; lastValue: number }>> => {
      const { data, error } = await supabase
        .from('leads')
        .select('contact_id, status, value')
        .in('contact_id', contactIds)
        .limit(5000);
      if (error) throw error;
      const map: Record<string, { total: number; active: number; lastValue: number }> = {};
      (data || []).forEach((row: any) => {
        if (!row.contact_id) return;
        const entry = map[row.contact_id] ?? { total: 0, active: 0, lastValue: 0 };
        entry.total += 1;
        if (row.status !== 'won' && row.status !== 'lost') entry.active += 1;
        entry.lastValue += Number(row.value || 0);
        map[row.contact_id] = entry;
      });
      return map;
    },
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Contact> & { id: string }) => {
      const { error } = await sb.from('contacts').update(updates).eq('id', id);
      if (error) throw error;
      return { id, updates };
    },
    onSuccess: ({ id }) => {
      toast.success('Contato atualizado');
      qc.invalidateQueries({ queryKey: ['contact', id] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (err: any) => toast.error('Erro ao atualizar contato: ' + (err?.message || '')),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from('contacts').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      toast.success('Contato excluído');
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (err: any) => toast.error('Erro ao excluir contato: ' + (err?.message || '')),
  });
}

export function useBulkDeleteContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await sb.from('contacts').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Contatos excluídos');
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (err: any) => toast.error('Erro ao excluir: ' + (err?.message || '')),
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (payload: Partial<Contact>) => {
      if (!profile?.company_id) throw new Error('Empresa não encontrada');
      const { data, error } = await sb
        .from('contacts')
        .insert({
          ...payload,
          company_id: profile.company_id,
          created_by: profile.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Contact;
    },
    onSuccess: (created) => {
      toast.success('Contato criado');
      // Atualiza o cache localmente em vez de refetch (a lista pode ter
      // até 2000 linhas). Mantém invalidate em background para sincronizar
      // joins (assignee) eventualmente.
      qc.setQueryData<Contact[]>(['contacts', profile?.company_id], (old) =>
        old ? [created as Contact, ...old] : old,
      );
      qc.invalidateQueries({ queryKey: ['contacts'], refetchType: 'none' });
    },

    onError: (err: any) => toast.error('Erro ao criar contato: ' + (err?.message || '')),
  });
}
