import { describe, it, expect } from 'vitest';
import {
  applyConversationUpdate,
  type ConversationLite,
} from './conversationListReducer';

type Conversation = ConversationLite & {
  company_id: string;
  instance_id: string | null;
  instance_name: string;
  provider: string | null;
  remote_jid: string;
  phone: string;
  contact_name: string | null;
  contact_photo_url: string | null;
  unread_count: number;
  closed_at: string | null;
  lead_id: string | null;
};

const mk = (over: Partial<Conversation>): Conversation => ({
  id: 'x',
  company_id: 'c1',
  instance_id: null,
  instance_name: 'i',
  provider: 'evolution',
  remote_jid: 'x@s',
  phone: '551199',
  contact_name: 'X',
  contact_photo_url: null,
  last_message_text: 'oi',
  last_message_at: '2026-05-19T12:00:00Z',
  unread_count: 0,
  is_archived: false,
  closed_at: null,
  lead_id: null,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-19T12:00:00Z',
  ...over,
});

describe('applyConversationUpdate', () => {
  it('faz UPDATE in-place sem remontar item quando a posição não muda', () => {
    const a = mk({ id: 'a', last_message_at: '2026-05-19T12:00:00Z' });
    const b = mk({ id: 'b', last_message_at: '2026-05-19T11:00:00Z' });
    const c = mk({ id: 'c', last_message_at: '2026-05-19T10:00:00Z' });
    const list = [a, b, c];

    // Novo UPDATE em `a` (já é o primeiro) com timestamp ainda mais novo.
    const updated = { ...a, unread_count: 3, last_message_at: '2026-05-19T12:30:00Z' };
    const next = applyConversationUpdate(list, updated, false)!;

    expect(next).not.toBe(list); // novo array (React precisa detectar mudança)
    expect(next.map((x) => x.id)).toEqual(['a', 'b', 'c']); // mesma ordem
    expect(next[1]).toBe(b); // vizinhos preservados (mesma referência)
    expect(next[2]).toBe(c);
    expect(next[0]).not.toBe(a); // o item atualizado é um novo objeto
    expect(next[0].unread_count).toBe(3);
  });

  it('reordena quando o timestamp empurra a conversa para o topo', () => {
    const a = mk({ id: 'a', last_message_at: '2026-05-19T12:00:00Z' });
    const b = mk({ id: 'b', last_message_at: '2026-05-19T11:00:00Z' });
    const c = mk({ id: 'c', last_message_at: '2026-05-19T10:00:00Z' });
    const list = [a, b, c];

    const updated = { ...c, last_message_at: '2026-05-19T13:00:00Z' };
    const next = applyConversationUpdate(list, updated, false)!;

    expect(next.map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(next[1]).toBe(a);
    expect(next[2]).toBe(b);
  });

  it('remove a conversa quando ela sai do filtro (archived mismatch)', () => {
    const a = mk({ id: 'a' });
    const b = mk({ id: 'b' });
    const list = [a, b];
    const next = applyConversationUpdate(list, { ...a, is_archived: true }, false)!;
    expect(next.map((x) => x.id)).toEqual(['b']);
    expect(next[0]).toBe(b);
  });

  it('insere uma conversa nova que entrou no filtro', () => {
    const a = mk({ id: 'a', last_message_at: '2026-05-19T12:00:00Z' });
    const list = [a];
    const novo = mk({ id: 'novo', last_message_at: '2026-05-19T13:00:00Z' });
    const next = applyConversationUpdate(list, novo, false)!;
    expect(next.map((x) => x.id)).toEqual(['novo', 'a']);
    expect(next[1]).toBe(a);
  });

  it('preserva preview otimista local mais recente dentro da janela de 5s', () => {
    const a = mk({
      id: 'a',
      last_message_at: '2026-05-19T12:00:03Z',
      last_message_text: 'otimista local',
    });
    const list = [a];
    const updated = {
      ...a,
      last_message_at: '2026-05-19T12:00:00Z',
      last_message_text: 'do servidor',
      unread_count: 1,
    };
    const next = applyConversationUpdate(list, updated, false)!;
    expect(next[0].last_message_text).toBe('otimista local');
    expect(next[0].last_message_at).toBe('2026-05-19T12:00:03Z');
    expect(next[0].unread_count).toBe(1); // outras props ainda mergeiam
  });
});
