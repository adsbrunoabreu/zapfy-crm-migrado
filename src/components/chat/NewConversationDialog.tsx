import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Phone, UserSquare2, Search, Users, X, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useContacts, type Contact } from '@/hooks/useContacts';
import { useToast } from '@/hooks/use-toast';
import { evolutionApi } from '@/services/evolutionApi';

/**
 * Canonicaliza remote_jid para o mesmo formato que o webhook do Evolution grava:
 * somente dígitos, sem sufixo @s.whatsapp.net, e removendo o 9º dígito de celular BR
 * (55 + DDD + 9XXXXXXXX → 55 + DDD + XXXXXXXX). Mantém sufixo @g.us para grupos.
 * Espelho exato de public.canonical_remote_jid no Postgres — sem isso a conversa
 * criada pelo dialog e a upsertada pelo webhook divergem e geram duplicata.
 */
function canonicalRemoteJid(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return '';
  if (/@g\.us$/i.test(s)) {
    const d = s.replace(/@g\.us$/i, '').replace(/\D/g, '');
    return d ? `${d}@g.us` : '';
  }
  let digits = s.replace(/@s\.whatsapp\.net$/i, '').replace(/@c\.us$/i, '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 13 && digits.startsWith('55') && digits[4] === '9') {
    digits = digits.slice(0, 4) + digits.slice(5);
  }
  return digits;
}
import type { Conversation } from '@/hooks/useConversations';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (conversation: Conversation) => void;
}

function normalizePhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

// Chave BR-aware: remove o 9º dígito de celular (55 + DDD + 9XXXXXXXX) para
// que números digitados com ou sem o 9 batam com o mesmo contato.
function brPhoneMatchKey(raw: string | null | undefined): string {
  const d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 13 && d.startsWith('55') && d[4] === '9') {
    return d.slice(0, 4) + d.slice(5);
  }
  return d;
}

function formatBRPhone(raw: string): string {
  const d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  // Remove DDI 55 para exibição
  const local = d.startsWith('55') ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return raw;
}

function initials(name: string | null) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export function NewConversationDialog({ open, onOpenChange, onCreated }: Props) {
  const { profile } = useAuth();
  const companyId = profile?.company_id || null;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'contact' | 'manual'>('contact');
  const [phone, setPhone] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactId, setContactId] = useState<string>('');
  const [contactSearch, setContactSearch] = useState('');
  const [instanceName, setInstanceName] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const { data: contacts = [], isLoading: loadingContacts } = useContacts();

  const { data: instances = [] } = useQuery({
    queryKey: ['whatsapp-instances-active', companyId],
    enabled: !!companyId && open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, display_name, status, provider')
        .eq('company_id', companyId!)
        .order('display_name', { ascending: true })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (!open) {
      setPhone(''); setContactName(''); setContactId(''); setContactSearch('');
      setSubmitting(false); setTab('contact');
    }
  }, [open]);

  useEffect(() => {
    if (!open || !instances.length || instanceName) return;
    const connected = instances.find((i: any) => i.status === 'connected' || i.status === 'open');
    setInstanceName((connected || instances[0]).instance_name);
  }, [open, instances, instanceName]);

  const sortedContacts = useMemo<Contact[]>(() => {
    return contacts
      .filter((c) => !!(c.phone || c.phone_normalized))
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));
  }, [contacts]);

  const filteredContacts = useMemo<Contact[]>(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return sortedContacts;
    const qDigits = q.replace(/\D/g, '');
    const qKey = qDigits ? brPhoneMatchKey(qDigits.length >= 10 && !qDigits.startsWith('55') ? `55${qDigits}` : qDigits) : '';
    return sortedContacts.filter((c) => {
      const nameMatch = (c.name || '').toLowerCase().includes(q);
      const cDigits = (c.phone_normalized || (c.phone || '').replace(/\D/g, ''));
      const cKey = brPhoneMatchKey(cDigits);
      const phoneMatch = qDigits.length > 0 && (
        cDigits.includes(qDigits) ||
        (qKey && cKey && (cKey.includes(qKey) || qKey.includes(cKey)))
      );
      const emailMatch = !!c.email && c.email.toLowerCase().includes(q);
      return nameMatch || phoneMatch || emailMatch;
    });
  }, [sortedContacts, contactSearch]);

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === contactId) || null,
    [contacts, contactId]
  );

  const canSubmit = (() => {
    if (!companyId || !instanceName || submitting) return false;
    if (tab === 'manual') return normalizePhone(phone).length >= 12;
    return !!(selectedContact?.phone || selectedContact?.phone_normalized);
  })();

  const handleSubmit = async () => {
    if (!companyId || !instanceName) return;
    const sourcePhone = tab === 'manual'
      ? phone
      : (selectedContact?.phone_normalized || selectedContact?.phone || '');
    const fullPhone = normalizePhone(sourcePhone);
    if (!fullPhone || fullPhone.length < 12) {
      toast({ title: 'Telefone inválido', description: 'Informe DDD + número.', variant: 'destructive' });
      return;
    }
    const selectedInstance = instances.find((i: any) => i.instance_name === instanceName);
    const provider = selectedInstance?.provider === 'cloud_api' ? 'cloud_api' : 'evolution';
    const remoteJid = provider === 'cloud_api' ? fullPhone : canonicalRemoteJid(fullPhone);

    // Lookup BR-tolerante para reaproveitar contato salvo mesmo quando o
    // usuário digitou o número sem o 9º dígito do celular (ou vice-versa).
    let matchedContact: { id: string; name: string | null; avatar_url: string | null } | null = null;
    const matchKey = brPhoneMatchKey(fullPhone);
    if (tab === 'contact' && selectedContact) {
      matchedContact = { id: selectedContact.id, name: selectedContact.name, avatar_url: selectedContact.avatar_url ?? null };
    } else if (companyId && matchKey) {
      const { data: found } = await supabase
        .from('contacts')
        .select('id, name, avatar_url')
        .eq('company_id', companyId)
        .eq('phone_match_key', matchKey)
        .limit(1)
        .maybeSingle();
      if (found) matchedContact = found as any;
    }

    const finalName = matchedContact?.name
      || (tab === 'contact' ? (selectedContact?.name || null) : (contactName.trim() || null));

    setSubmitting(true);
    try {
      if (provider === 'evolution') {
        try {
          const check: any = await evolutionApi.checkNumber(fullPhone);
          const skipped = check?.skipped === true;
          const arr = Array.isArray(check) ? check : (check ? [check] : []);
          const first = arr[0];
          const definitivelyMissing =
            !skipped && (arr.length === 0 || first?.exists === false);

          if (definitivelyMissing) {
            toast({
              title: 'Número não encontrado no WhatsApp',
              description: `O número +${fullPhone} não está cadastrado no WhatsApp. Confira o DDD e o dígito 9 antes de tentar novamente.`,
              variant: 'destructive',
            });
            setSubmitting(false);
            return;
          }

          if (skipped) {
            toast({
              title: 'Validação indisponível',
              description: 'Não foi possível confirmar o número no WhatsApp agora. A conversa será criada mesmo assim.',
            });
          }
        } catch (e: any) {
          console.warn('[checkNumber] falhou silenciosamente', e?.message);
          toast({
            title: 'Não foi possível validar o número',
            description: 'Seguindo com a criação da conversa.',
          });
        }
      }

      const contactAvatar = matchedContact?.avatar_url || selectedContact?.avatar_url || null;

      // Cria/recupera conversa via RPC SECURITY DEFINER — evita disputas com RLS
      // (a função valida empresa/plano e atribui ao próprio criador).
      const { data: convData, error } = await supabase.rpc('create_manual_conversation', {
        _instance_id: selectedInstance?.id || null,
        _instance_name: instanceName,
        _provider: provider,
        _remote_jid: remoteJid,
        _phone: fullPhone,
        _contact_name: finalName,
        _contact_id: matchedContact?.id || (tab === 'contact' ? selectedContact?.id || null : null),
        _contact_photo_url: contactAvatar,
      } as any);

      if (error) throw error;
      const conv = convData as unknown as Conversation;

      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onOpenChange(false);
      if (conv) onCreated(conv);
    } catch (err: any) {
      toast({
        title: 'Erro ao iniciar conversa',
        description: err?.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <DialogTitle className="text-lg">Nova conversa</DialogTitle>
          <DialogDescription>
            Selecione um contato salvo ou digite um número manualmente.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="space-y-2">
            <Label htmlFor="instance">Instância WhatsApp</Label>
            <Select value={instanceName} onValueChange={setInstanceName}>
              <SelectTrigger id="instance">
                <SelectValue placeholder="Selecione uma instância" />
              </SelectTrigger>
              <SelectContent>
                {instances.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Nenhuma instância cadastrada.
                  </div>
                )}
                {instances.map((i: any) => {
                  const isOn = i.status === 'connected' || i.status === 'open';
                  return (
                    <SelectItem key={i.instance_name} value={i.instance_name}>
                      <span className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${isOn ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        {i.display_name || i.instance_name}
                        <span className="text-[10px] text-muted-foreground">
                          {isOn ? 'conectada' : i.status}
                        </span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="contact">
                <UserSquare2 className="w-3.5 h-3.5 mr-1.5" /> Contato salvo
              </TabsTrigger>
              <TabsTrigger value="manual">
                <Phone className="w-3.5 h-3.5 mr-1.5" /> Número manual
              </TabsTrigger>
            </TabsList>

            <TabsContent value="contact" className="space-y-3 mt-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="contact-search">Buscar contato</Label>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {loadingContacts ? '…' : `${filteredContacts.length} de ${sortedContacts.length}`}
                  </span>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="contact-search"
                    placeholder="Nome, telefone ou e-mail…"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="pl-8 pr-8"
                    autoFocus
                  />
                  {contactSearch && (
                    <button
                      type="button"
                      onClick={() => setContactSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Limpar busca"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="border border-border/60 rounded-md max-h-72 overflow-y-auto divide-y divide-border/30 bg-card/30">
                {loadingContacts ? (
                  <div className="flex items-center justify-center gap-2 p-6 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando contatos…
                  </div>
                ) : sortedContacts.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                    <Users className="w-6 h-6 text-muted-foreground/40" />
                    Nenhum contato cadastrado ainda.
                  </div>
                ) : filteredContacts.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    Nenhum contato encontrado para "{contactSearch}".
                  </div>
                ) : (
                  filteredContacts.map((c) => {
                    const isSel = contactId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setContactId(c.id)}
                        className={`w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-secondary/40 transition ${
                          isSel ? 'bg-primary/10' : ''
                        }`}
                      >
                        <Avatar className="w-8 h-8 shrink-0">
                          {c.avatar_url && <AvatarImage src={c.avatar_url} alt={c.name} />}
                          <AvatarFallback className="bg-primary/15 text-primary text-[11px] font-semibold">
                            {initials(c.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{c.name}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {formatBRPhone(c.phone || c.phone_normalized || '')}
                            {c.email && <span className="ml-2 opacity-70">· {c.email}</span>}
                          </div>
                        </div>
                        {isSel && <Check className="w-4 h-4 text-primary shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="manual" className="space-y-3 mt-3">
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone (com DDD)</Label>
                <Input
                  id="phone"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                />
                <p className="text-[11px] text-muted-foreground">
                  Adicionamos automaticamente o DDI 55 se não for informado.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nome do contato (opcional)</Label>
                <Input
                  id="name"
                  placeholder="Como deseja identificar este contato"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/60 bg-card/30">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Iniciar conversa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NewConversationDialog;
