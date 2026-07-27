import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type MessageType = 'text' | 'image' | 'video' | 'document' | 'audio';

export interface ScheduledMessage {
  id: string;
  lead_id: string;
  company_id: string;
  message: string;
  send_at: string;
  sent_at: string | null;
  status: 'pending' | 'sent' | 'failed';
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  message_type: MessageType;
  media_url: string | null;
  media_caption: string | null;
  media_filename: string | null;
  media_mimetype: string | null;
}

export interface ScheduledMessageWithLead extends ScheduledMessage {
  lead?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    value: number | null;
    status: 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
    notes: string | null;
    assigned_to: string | null;
    created_at: string;
    pipeline_id: string;
    stage_id: string;
    avatar_url: string | null;
    company_id: string;
  };
}

export function useAllScheduledMessages(statusFilter?: 'pending' | 'sent' | 'failed' | 'all') {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['all-scheduled-messages', profile?.company_id, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('scheduled_messages')
        .select(`
          *,
          lead:leads(id, name, phone, email, value, status, notes, assigned_to, created_at, pipeline_id, stage_id, avatar_url, company_id)
        `)
        .order('send_at', { ascending: false });

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []) as ScheduledMessageWithLead[];
    },
    enabled: !!profile,
  });
}

export function useScheduledMessages(leadId: string | null) {
  return useQuery({
    queryKey: ['scheduled-messages', leadId],
    queryFn: async () => {
      if (!leadId) return [];

      const { data, error } = await supabase
        .from('scheduled_messages')
        .select('*')
        .eq('lead_id', leadId)
        .order('send_at', { ascending: true });

      if (error) throw error;
      return data as ScheduledMessage[];
    },
    enabled: !!leadId,
  });
}

export function useUploadScheduledMedia() {
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ file }: { file: File }) => {
      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.company_id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('scheduled-media')
        .upload(fileName, file);

      if (error) throw error;

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('scheduled-media')
        .createSignedUrl(data.path, 7200); // 2 hours for scheduling

      if (signedUrlError || !signedUrlData?.signedUrl) throw new Error('Failed to create signed URL');

      return {
        url: signedUrlData.signedUrl,
        filename: file.name,
        mimetype: file.type,
      };
    },
    onError: (error) => {
      toast.error('Erro ao fazer upload: ' + error.message);
    },
  });
}

interface CreateScheduledMessageParams {
  leadId: string;
  message: string;
  sendAt: Date;
  messageType?: MessageType;
  mediaUrl?: string | null;
  mediaCaption?: string | null;
  mediaFilename?: string | null;
  mediaMimetype?: string | null;
}

export function useCreateScheduledMessage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      leadId, 
      message, 
      sendAt,
      messageType = 'text',
      mediaUrl = null,
      mediaCaption = null,
      mediaFilename = null,
      mediaMimetype = null,
    }: CreateScheduledMessageParams) => {
      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      const { data, error } = await supabase
        .from('scheduled_messages')
        .insert({
          lead_id: leadId,
          company_id: profile.company_id,
          message,
          send_at: sendAt.toISOString(),
          created_by: profile.id,
          message_type: messageType,
          media_url: mediaUrl,
          media_caption: mediaCaption,
          media_filename: mediaFilename,
          media_mimetype: mediaMimetype,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ScheduledMessage;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages', variables.leadId] });
      toast.success('Mensagem agendada!');
    },
    onError: (error) => {
      toast.error('Erro ao agendar mensagem: ' + error.message);
    },
  });
}

export function useDeleteScheduledMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, leadId }: { messageId: string; leadId: string }) => {
      const { error } = await supabase
        .from('scheduled_messages')
        .delete()
        .eq('id', messageId);

      if (error) throw error;
      return leadId;
    },
    onSuccess: (leadId) => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages', leadId] });
      queryClient.invalidateQueries({ queryKey: ['all-scheduled-messages'] });
      toast.success('Agendamento cancelado!');
    },
    onError: (error) => {
      toast.error('Erro ao cancelar agendamento: ' + error.message);
    },
  });
}

interface UpdateScheduledMessageParams {
  messageId: string;
  leadId: string;
  message: string;
  sendAt: Date;
  messageType?: MessageType;
  mediaUrl?: string | null;
  mediaCaption?: string | null;
  mediaFilename?: string | null;
  mediaMimetype?: string | null;
}

export function useUpdateScheduledMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      messageId, 
      leadId, 
      message, 
      sendAt,
      messageType = 'text',
      mediaUrl = null,
      mediaCaption = null,
      mediaFilename = null,
      mediaMimetype = null,
    }: UpdateScheduledMessageParams) => {
      const { data, error } = await supabase
        .from('scheduled_messages')
        .update({
          message,
          send_at: sendAt.toISOString(),
          status: 'pending',
          error_message: null,
          sent_at: null,
          message_type: messageType,
          media_url: mediaUrl,
          media_caption: mediaCaption,
          media_filename: mediaFilename,
          media_mimetype: mediaMimetype,
        })
        .eq('id', messageId)
        .select()
        .single();

      if (error) throw error;
      return { data, leadId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages', result.leadId] });
      toast.success('Mensagem reagendada!');
    },
    onError: (error) => {
      toast.error('Erro ao reagendar: ' + error.message);
    },
  });
}
