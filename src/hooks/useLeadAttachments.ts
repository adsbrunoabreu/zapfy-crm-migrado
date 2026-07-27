import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useCreateLeadActivity } from './useLeadActivities';

const BUCKET = 'lead-attachments';
const SIGNED_URL_EXPIRY = 60 * 60; // 1 hora

export interface LeadAttachment {
  id: string;
  lead_id: string;
  company_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
  category?: 'general' | 'medical';
}

export function useLeadAttachments(leadId: string | null, category?: 'general' | 'medical') {
  return useQuery({
    queryKey: ['lead-attachments', leadId, category ?? 'all'],
    queryFn: async () => {
      if (!leadId) return [];

      let q = supabase
        .from('lead_attachments')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
      if (category) q = q.eq('category', category);
      const { data, error } = await q;

      if (error) throw error;

      const attachments = data as LeadAttachment[];

      // Gerar signed URLs para cada anexo (bucket é privado)
      const withSignedUrls = await Promise.all(
        attachments.map(async (att) => {
          // file_url armazena o path no storage (ex: companyId/leadId/timestamp.ext)
          // Se for uma URL completa legada, extrair o path
          let storagePath = att.file_url;
          const bucketMarker = `/${BUCKET}/`;
          if (storagePath.includes(bucketMarker)) {
            storagePath = storagePath.split(bucketMarker).pop() ?? storagePath;
          }

          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);

          return {
            ...att,
            file_url: signed?.signedUrl ?? att.file_url,
            // Guardar path original para delete
            _storage_path: storagePath,
          };
        })
      );

      return withSignedUrls;
    },
    enabled: !!leadId,
  });
}


export function useUploadAttachment() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const createActivity = useCreateLeadActivity();

  return useMutation({
    mutationFn: async ({ leadId, file, category }: { leadId: string; file: File; category?: 'general' | 'medical' }) => {
      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      const fileExt = file.name.split('.').pop();
      const storagePath = `${profile.company_id}/${leadId}/${Date.now()}.${fileExt}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      // Salvar o path do storage (não URL pública) no DB
      const { data, error } = await supabase
        .from('lead_attachments')
        .insert({
          lead_id: leadId,
          company_id: profile.company_id,
          file_name: file.name,
          file_url: storagePath,
          file_type: file.type,
          file_size: file.size,
          uploaded_by: profile.id,
          category: category ?? 'general',
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data as LeadAttachment;
    },
    onSuccess: async (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead-attachments', variables.leadId] });

      
      try {
        await createActivity.mutateAsync({
          leadId: variables.leadId,
          actionType: 'attachment_added',
          description: `Arquivo "${variables.file.name}" anexado`,
          metadata: {
            file_name: variables.file.name,
            file_type: variables.file.type,
            file_size: variables.file.size,
          }
        });
      } catch (e) {
        console.error('Erro ao registrar atividade:', e);
      }
      
      toast.success('Arquivo anexado!');
    },
    onError: (error) => {
      toast.error('Erro ao anexar arquivo: ' + error.message);
    },
  });
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  const createActivity = useCreateLeadActivity();

  return useMutation({
    mutationFn: async ({ attachmentId, leadId, fileUrl, fileName }: { attachmentId: string; leadId: string; fileUrl: string; fileName?: string }) => {
      // Extrair storage path — suporta tanto path puro quanto URL completa/signed
      let storagePath = fileUrl;
      const bucketMarker = `/${BUCKET}/`;
      if (storagePath.includes(bucketMarker)) {
        storagePath = storagePath.split(bucketMarker).pop() ?? storagePath;
        // Remover query params de signed URL
        storagePath = storagePath.split('?')[0];
      }

      await supabase.storage.from(BUCKET).remove([storagePath]);

      const { error } = await supabase
        .from('lead_attachments')
        .delete()
        .eq('id', attachmentId);

      if (error) throw error;
      return { leadId, fileName };
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['lead-attachments', data.leadId] });
      
      if (data.fileName) {
        try {
          await createActivity.mutateAsync({
            leadId: data.leadId,
            actionType: 'attachment_removed',
            description: `Arquivo "${data.fileName}" removido`,
            metadata: {
              file_name: data.fileName,
            }
          });
        } catch (e) {
          console.error('Erro ao registrar atividade:', e);
        }
      }
      
      toast.success('Arquivo excluído!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir arquivo: ' + error.message);
    },
  });
}
