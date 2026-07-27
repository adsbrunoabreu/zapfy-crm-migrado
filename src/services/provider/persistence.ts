import { supabase } from '@/integrations/supabase/client';
import type { ChatMessage, ProviderType } from '@/types/providers';

export interface InstanceRow {
  id: string;
  company_id: string;
  provider: ProviderType;
  instance_name: string;
  phone_number: string | null;
  config: Record<string, unknown>;
  is_active: boolean;
  status: string;
}

export interface ConversationRow {
  id: string;
  company_id: string;
  instance_id: string | null;
  instance_name: string | null;
  remote_jid: string | null;
  phone: string | null;
  provider: ProviderType | null;
}

export async function fetchInstanceById(id: string): Promise<InstanceRow | null> {
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .select('id, company_id, provider, instance_name, phone_number, config, is_active, status')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[ProviderService] fetchInstanceById error:', error.message);
    return null;
  }
  return (data as InstanceRow | null) ?? null;
}

export async function fetchInstanceByName(
  companyId: string,
  instanceName: string,
): Promise<InstanceRow | null> {
  if (!instanceName) return null;
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .select('id, company_id, provider, instance_name, phone_number, config, is_active, status')
    .eq('company_id', companyId)
    .eq('instance_name', instanceName)
    .maybeSingle();
  if (error) {
    console.error('[ProviderService] fetchInstanceByName error:', error.message);
    return null;
  }
  return (data as InstanceRow | null) ?? null;
}

export async function upsertConversation(
  instance: InstanceRow,
  msg: ChatMessage,
): Promise<ConversationRow> {
  const remoteJid = msg.fromJid;
  const phone = msg.fromJid;

  const { data, error } = await supabase
    .from('conversations')
    .upsert(
      {
        company_id: instance.company_id,
        instance_name: instance.instance_name,
        instance_id: instance.id,
        provider: instance.provider,
        remote_jid: remoteJid,
        phone,
        last_message_text: msg.content,
        last_message_at: msg.timestamp.toISOString(),
      },
      { onConflict: 'company_id,instance_name,remote_jid' },
    )
    .select('id, company_id, instance_id, instance_name, remote_jid, phone, provider')
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Falha ao upsert conversa: ${error?.message ?? 'sem dado'}`);
  }
  return data as ConversationRow;
}

export async function persistMessage(
  instance: InstanceRow,
  conversationId: string,
  msg: ChatMessage,
): Promise<string> {
  const { data, error } = await supabase
    .from('chat_messages')
    .upsert(
      [{
        company_id: instance.company_id,
        conversation_id: conversationId,
        remote_jid: msg.fromJid,
        message_id: msg.providerMessageId,
        provider: msg.provider,
        provider_message_id: msg.providerMessageId,
        provider_raw_payload: msg.rawPayload as never,
        webhook_received_at: new Date().toISOString(),
        from_me: msg.fromMe,
        message_type: msg.messageType,
        content: msg.content,
        media_url: msg.media?.url ?? null,
        media_mimetype: msg.media?.mimeType ?? null,
        file_name: msg.media?.fileName ?? null,
        duration: msg.media?.durationSec ?? null,
        status: msg.status,
        timestamp: msg.timestamp.toISOString(),
        interactive_payload: msg.interactivePayload as never,
      }],
      { onConflict: 'company_id,message_id' },
    )
    .select('id')
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Falha ao persistir chat_message: ${error?.message ?? 'sem dado'}`);
  }
  return data.id;
}
