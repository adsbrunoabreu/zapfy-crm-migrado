import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LeadDetailModal } from '@/components/pipelines/LeadDetailModal';
import { ChatContactFirstDrawer } from '@/components/chat/ChatContactFirstDrawer';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string | null;
  contactId?: string | null;
  conversationId: string;
  defaultName?: string | null;
  defaultPhone?: string | null;
  defaultAvatarUrl?: string | null;
}

/**
 * Wrapper que adapta o drawer do chat:
 * - Se a conversa já tem lead_id, abre o LeadDetailModal em edição.
 * - Se tem contact_id (mas sem lead_id), carrega o contato e abre o drawer
 *   em modo "contato existente": campos editáveis + ações Salvar/Criar Lead.
 * - Caso contrário, abre o fluxo Contato → Lead (criação).
 */
export function ChatLeadDrawer({
  open,
  onOpenChange,
  leadId,
  contactId,
  conversationId,
  defaultName,
  defaultPhone,
  defaultAvatarUrl,
}: Props) {
  const { data: lead } = useQuery({
    queryKey: ['chat-lead-drawer', leadId],
    enabled: !!leadId && open,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, phone, email, value, status, notes, assigned_to, created_at')
        .eq('id', leadId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: existingContact } = useQuery({
    queryKey: ['chat-contact-drawer', contactId],
    enabled: !leadId && !!contactId && open,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, phone, email, avatar_url, source, notes, assigned_to')
        .eq('id', contactId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  if (!leadId) {
    // Aguardar carregar o contato existente para evitar abrir em modo "novo"
    if (contactId && !existingContact) return null;
    return (
      <ChatContactFirstDrawer
        open={open}
        onOpenChange={onOpenChange}
        conversationId={conversationId}
        defaultName={defaultName}
        defaultPhone={defaultPhone}
        defaultAvatarUrl={defaultAvatarUrl}
        existingContact={existingContact ?? null}
      />
    );
  }

  if (!lead) return null;

  return (
    <LeadDetailModal
      open={open}
      onOpenChange={onOpenChange}
      lead={lead}
    />
  );
}
