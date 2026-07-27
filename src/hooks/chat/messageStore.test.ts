import { describe, expect, it } from 'vitest';
import {
  compareMessages,
  isOutgoingPending,
  mergeBatch,
  mergeMessage,
  normalizeFull,
} from './messageStore';
import type { ChatMessage } from '@/hooks/useChatMessages';

const baseTime = Date.parse('2026-05-19T19:10:00.000Z');

const msg = (overrides: Partial<ChatMessage>): ChatMessage => {
  const id = overrides.id ?? crypto.randomUUID();
  const timestamp = overrides.timestamp ?? new Date(baseTime).toISOString();
  return {
    id,
    company_id: 'company-1',
    conversation_id: 'conversation-1',
    remote_jid: '5511999999999@s.whatsapp.net',
    message_id: overrides.message_id ?? id,
    client_id: overrides.client_id,
    provider: overrides.provider ?? 'evolution',
    provider_message_id: overrides.provider_message_id ?? null,
    from_me: overrides.from_me ?? true,
    message_type: overrides.message_type ?? 'text',
    content: overrides.content ?? null,
    media_url: overrides.media_url ?? null,
    media_storage_path: overrides.media_storage_path ?? null,
    media_mimetype: overrides.media_mimetype ?? null,
    file_name: overrides.file_name ?? null,
    duration: overrides.duration ?? null,
    latitude: overrides.latitude ?? null,
    longitude: overrides.longitude ?? null,
    quoted_message_id: overrides.quoted_message_id ?? null,
    reaction_emoji: overrides.reaction_emoji ?? null,
    status: overrides.status ?? 'sent',
    sender_name: overrides.sender_name ?? null,
    timestamp,
    created_at: overrides.created_at ?? timestamp,
    seq: overrides.seq,
    link_preview: overrides.link_preview ?? null,
  };
};

const ids = (messages: ChatMessage[]) => messages.map((m) => m.id);

describe('rotina de diagnóstico do chat: merge, dedupe e ordenação', () => {
  it('mantém mensagens queued/sending no fim da conversa enquanto aguardam confirmação', () => {
    const olderIncoming = msg({ id: 'received-older', from_me: false, status: 'sent', timestamp: new Date(baseTime + 1_000).toISOString(), seq: 10 });
    const queued = msg({ id: 'optimistic-client-1', message_id: 'optimistic-client-1', client_id: 'client-1', status: 'queued', content: 'ele pegou tudo que vc cotou', timestamp: new Date(baseTime + 20_000).toISOString() });
    const delayedIncoming = msg({ id: 'received-delayed', from_me: false, status: 'sent', timestamp: new Date(baseTime + 15_000).toISOString(), seq: 11 });

    const list = mergeMessage(mergeMessage([olderIncoming], queued), delayedIncoming);

    expect(isOutgoingPending(queued)).toBe(true);
    expect(ids(list)).toEqual(['received-older', 'received-delayed', 'optimistic-client-1']);
  });

  it('reconcilia a bolha otimista pelo client_id sem duplicar quando o registro real chega depois', () => {
    const optimistic = msg({
      id: 'optimistic-client-2',
      message_id: 'optimistic-client-2',
      client_id: 'client-2',
      status: 'queued',
      content: 'teste rápido',
      timestamp: new Date(baseTime + 30_000).toISOString(),
    });
    const real = msg({
      id: 'real-db-row-2',
      message_id: 'provider-message-2',
      provider_message_id: 'provider-message-2',
      client_id: 'client-2',
      status: 'sent',
      content: 'teste rápido',
      timestamp: new Date(baseTime + 30_500).toISOString(),
      seq: 12,
    });

    const list = mergeMessage([optimistic], real);

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 'real-db-row-2',
      client_id: 'client-2',
      message_id: 'provider-message-2',
      provider_message_id: 'provider-message-2',
      status: 'sent',
    });
  });

  it('colapsa eco real sem client_id quando ele corresponde a uma otimista órfã recente', () => {
    const optimistic = msg({
      id: 'optimistic-client-3',
      message_id: 'optimistic-client-3',
      client_id: 'client-3',
      status: 'queued',
      content: 'isso aí',
      timestamp: new Date(baseTime + 40_000).toISOString(),
    });
    const webhookEchoWithoutClientId = msg({
      id: 'webhook-row-3',
      message_id: 'provider-message-3',
      provider_message_id: 'provider-message-3',
      client_id: undefined,
      status: 'sent',
      content: 'isso aí',
      timestamp: new Date(baseTime + 42_000).toISOString(),
      seq: 13,
    });

    const list = mergeMessage([optimistic], webhookEchoWithoutClientId);

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 'webhook-row-3',
      client_id: 'client-3',
      message_id: 'provider-message-3',
      status: 'sent',
    });
  });

  it('usa provider_message_id para casar ACK/status fora de ordem sem regredir status', () => {
    const sent = msg({ id: 'real-db-row-4', message_id: 'provider-message-4', provider_message_id: 'provider-message-4', status: 'delivered', seq: 14 });
    const lateSentAck = msg({ id: 'ack-row-4', message_id: 'provider-message-4', provider_message_id: 'provider-message-4', status: 'sent', seq: 14 });
    const readAck = msg({ id: 'ack-row-4b', message_id: 'provider-message-4', provider_message_id: 'provider-message-4', status: 'read', seq: 14 });

    const list = mergeMessage(mergeMessage([sent], lateSentAck), readAck);

    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('read');
  });

  it('normaliza batches de catch-up removendo duplicatas por message_id/client_id/provider_message_id', () => {
    const optimistic = msg({ id: 'optimistic-client-5', message_id: 'optimistic-client-5', client_id: 'client-5', status: 'queued', content: 'ta', timestamp: new Date(baseTime + 50_000).toISOString() });
    const realByClient = msg({ id: 'real-db-row-5', message_id: 'provider-message-5', provider_message_id: 'provider-message-5', client_id: 'client-5', status: 'sent', content: 'ta', timestamp: new Date(baseTime + 51_000).toISOString(), seq: 15 });
    const duplicateByProvider = msg({ id: 'duplicate-row-5', message_id: 'provider-message-5-copy', provider_message_id: 'provider-message-5', status: 'delivered', content: 'ta', timestamp: new Date(baseTime + 51_500).toISOString(), seq: 16 });

    const list = normalizeFull([optimistic, realByClient, duplicateByProvider]);

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 'real-db-row-5',
      client_id: 'client-5',
      provider_message_id: 'provider-message-5',
      status: 'delivered',
    });
  });

  it('preserva ordem canônica timestamp → seq → created_at para evitar dia/bolha fora de posição', () => {
    const a = msg({ id: 'a', timestamp: new Date(baseTime + 1_000).toISOString(), created_at: new Date(baseTime + 5_000).toISOString(), seq: 2 });
    const b = msg({ id: 'b', timestamp: new Date(baseTime + 1_000).toISOString(), created_at: new Date(baseTime + 4_000).toISOString(), seq: 1 });
    const c = msg({ id: 'c', timestamp: new Date(baseTime + 2_000).toISOString(), created_at: new Date(baseTime + 2_000).toISOString(), seq: 3 });

    const list = [c, a, b].sort(compareMessages);

    expect(ids(list)).toEqual(['b', 'a', 'c']);
  });

  it('simula o cenário do vídeo: envio próprio não deve puxar a conversa para mensagens antigas', () => {
    const history = [
      msg({ id: 'old-in-1', from_me: false, status: 'sent', content: 'Não aparece pra mim não', timestamp: new Date(baseTime - 120_000).toISOString(), seq: 1 }),
      msg({ id: 'old-out-1', from_me: true, status: 'read', content: 'acessa esse', timestamp: new Date(baseTime - 90_000).toISOString(), seq: 2 }),
      msg({ id: 'old-out-2', from_me: true, status: 'read', content: 'agora foi?', timestamp: new Date(baseTime - 60_000).toISOString(), seq: 3 }),
    ];
    const queued = msg({ id: 'optimistic-client-video', message_id: 'optimistic-client-video', client_id: 'client-video', status: 'queued', content: 'ele pegou tudo que vc cotou', timestamp: new Date(baseTime + 1_000).toISOString() });
    const lateIncoming = msg({ id: 'late-in-video', from_me: false, status: 'sent', content: 'Peraí que eu tenho que consultar luna', timestamp: new Date(baseTime - 30_000).toISOString(), seq: 4 });
    const real = msg({ id: 'real-video', message_id: 'provider-video', provider_message_id: 'provider-video', client_id: 'client-video', status: 'sent', content: 'ele pegou tudo que vc cotou', timestamp: new Date(baseTime + 2_000).toISOString(), seq: 5 });

    const list = mergeBatch(mergeMessage(history, queued), [lateIncoming, real]);

    expect(ids(list)).toEqual(['old-in-1', 'old-out-1', 'old-out-2', 'late-in-video', 'real-video']);
    expect(list.filter((m) => m.content === 'ele pegou tudo que vc cotou')).toHaveLength(1);
  });

  it('colapsa eco com assinatura aplicada pelo provider contra otimista que tinha assinatura', () => {
    const optimistic = msg({
      id: 'optimistic-client-sig',
      message_id: 'optimistic-client-sig',
      client_id: 'client-sig',
      status: 'queued',
      content: 'Atendido por: João\n\nbom dia bom dia',
      timestamp: new Date(baseTime + 60_000).toISOString(),
    });
    const realWithoutSig = msg({
      id: 'real-sig-row',
      message_id: '3EB024F22BA0B35C7CC9C3',
      provider_message_id: null,
      client_id: undefined,
      status: 'delivered',
      content: 'bom dia bom dia',
      timestamp: new Date(baseTime + 61_000).toISOString(),
      seq: 99,
    });

    const list = mergeMessage([optimistic], realWithoutSig);

    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('real-sig-row');
    expect(list[0].status).toBe('delivered');
  });

  it('colapsa eco webhook (sem client_id, sem provider_message_id) contra linha real persistida pelo outbound', () => {
    const realFromOutbound = msg({
      id: 'real-outbound',
      message_id: 'WAID-1',
      provider_message_id: 'WAID-1',
      client_id: 'client-x',
      status: 'sent',
      content: 'oi tudo bem?',
      timestamp: new Date(baseTime + 1_000).toISOString(),
      seq: 200,
    });
    const echoWebhook = msg({
      id: 'webhook-echo',
      message_id: 'WAID-1',
      provider_message_id: null,
      client_id: undefined,
      status: 'delivered',
      content: 'oi tudo bem?',
      timestamp: new Date(baseTime + 1_500).toISOString(),
      seq: 201,
    });

    const list = mergeMessage([realFromOutbound], echoWebhook);

    expect(list).toHaveLength(1);
    expect(list[0].provider_message_id).toBe('WAID-1');
    expect(list[0].status).toBe('delivered');
  });

  it('NÃO colapsa duas mensagens reais legítimas com mesmo conteúdo enviadas com 6s de diferença', () => {
    const first = msg({
      id: 'real-a',
      message_id: 'WAID-A',
      provider_message_id: 'WAID-A',
      status: 'read',
      content: 'ok',
      timestamp: new Date(baseTime).toISOString(),
      seq: 300,
    });
    const second = msg({
      id: 'real-b',
      message_id: 'WAID-B',
      provider_message_id: 'WAID-B',
      status: 'sent',
      content: 'ok',
      timestamp: new Date(baseTime + 6_000).toISOString(),
      seq: 301,
    });

    const list = mergeMessage([first], second);

    expect(list).toHaveLength(2);
    expect(ids(list)).toEqual(['real-a', 'real-b']);
  });
});