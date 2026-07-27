import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Loader2, User, Tag as TagIcon, Check, CheckCircle2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useLeadSources } from '@/hooks/useLeadSources';
import { useCreateContact, useUpdateContact } from '@/hooks/useContacts';
import { useCreateLead } from '@/hooks/useLeads';
import { useTags } from '@/hooks/useTags';
import { useAddTagToLead } from '@/hooks/useLeadTags';
import { TagChip, TagCreateRow } from '@/components/settings/TagsManager';
import { useContactPhoto } from '@/components/chat/chatHelpers';

interface ExistingContact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatar_url?: string | null;
  source?: string | null;
  notes?: string | null;
  assigned_to?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  defaultName?: string | null;
  defaultPhone?: string | null;
  defaultAvatarUrl?: string | null;
  /** Quando presente, o drawer abre em modo edição/criar-lead com os dados do contato salvo. */
  existingContact?: ExistingContact | null;
}

type Step = 'contact' | 'lead';

function normalizePhone(phone: string): string {
  let c = phone.replace(/\D/g, '');
  if (!c.startsWith('55') && (c.length === 10 || c.length === 11)) c = '55' + c;
  return c;
}

export function ChatContactFirstDrawer({ open, onOpenChange, conversationId, defaultName, defaultPhone, defaultAvatarUrl, existingContact }: Props) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data: teamMembers } = useTeamMembers();
  const { data: sources = [] } = useLeadSources({ onlyActive: true });
  const { data: allTags = [] } = useTags();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const createLead = useCreateLead();
  const addTagToLead = useAddTagToLead();

  const [step, setStep] = useState<Step>('contact');
  const [contactId, setContactId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [source, setSource] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    if (existingContact) {
      setStep('lead');
      setContactId(existingContact.id);
      setName(existingContact.name || '');
      setPhone(existingContact.phone || defaultPhone || '');
      setEmail(existingContact.email || '');
      setAssignedTo(existingContact.assigned_to || null);
      setSource(existingContact.source || '');
      setNotes(existingContact.notes || '');
      setSelectedTagIds(new Set());
      return;
    }
    setStep('contact');
    setContactId(null);
    setName(defaultName || defaultPhone || '');
    setPhone(defaultPhone || '');
    setEmail('');
    setAssignedTo(null);
    setSource('');
    setNotes('');
    setSelectedTagIds(new Set());
  }, [open, defaultName, defaultPhone, existingContact]);

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedTags = useMemo(
    () => allTags.filter((t) => selectedTagIds.has(t.id)),
    [allTags, selectedTagIds],
  );
  const availableTags = useMemo(
    () => allTags.filter((t) => !selectedTagIds.has(t.id)),
    [allTags, selectedTagIds],
  );

  const handleCreateContact = async () => {
    const clean = name.trim();
    if (!clean) {
      toast.error('Informe o nome do contato');
      return;
    }
    try {
      const normPhone = phone.trim() ? normalizePhone(phone) : null;
      const created: any = await createContact.mutateAsync({
        name: clean,
        phone: normPhone,
        email: email.trim() || null,
        source: source || null,
        notes: notes.trim() || null,
        assigned_to: assignedTo,
      } as any);
      setContactId(created.id);
      // Avança a UI imediatamente — vínculo da conversa, aplicação de
      // tags e invalidações rodam em background.
      setStep('lead');

      void (supabase as any)
        .from('conversations')
        .update({ contact_id: created.id, contact_name: clean })
        .eq('id', conversationId)
        .then(() => {
          qc.invalidateQueries({ queryKey: ['conversations'] });
        });

      // Aplica tags selecionadas ao contato recém-criado.
      const tagsToApply = Array.from(selectedTagIds);
      if (tagsToApply.length > 0) {
        void (supabase as any)
          .from('contact_tags')
          .insert(tagsToApply.map((tag_id) => ({ contact_id: created.id, tag_id })))
          .then(({ error }: any) => {
            if (error) {
              console.error('[ChatContactFirstDrawer] erro ao aplicar tags ao contato:', error);
              toast.error('Contato criado, mas falha ao aplicar tags: ' + (error.message || ''));
            } else {
              qc.invalidateQueries({ queryKey: ['contact-tags', created.id] });
            }
          });
      }
    } catch (err: any) {
      // useCreateContact já dispara toast de erro
    }
  };



  const handleCreateLead = async () => {
    if (!contactId) {
      toast.error('Contato não identificado. Reabra a conversa e tente novamente.');
      return;
    }
    try {
      const created: any = await createLead.mutateAsync({
        name: name.trim(),
        phone: phone.trim() ? normalizePhone(phone) : null,
        email: email.trim() || null,
        notes: notes.trim() || null,
        assigned_to: assignedTo,
        source: source || null,
        contact_id: contactId,
        pipeline_id: null,
        stage_id: null,
        status: 'new',
        _silent: true,
      } as any);

      // Aplicar tags
      const tagsToApply = Array.from(selectedTagIds);
      if (tagsToApply.length > 0) {
        await Promise.all(
          tagsToApply.map((tagId) => {
            const t = allTags.find((x) => x.id === tagId);
            return addTagToLead.mutateAsync({
              leadId: created.id,
              tagId,
              tagName: t?.name,
              tagColor: t?.color || undefined,
            }).catch(() => null);
          }),
        );
      }

      // Vincular conversa ao lead
      const { error: convErr } = await (supabase as any)
        .from('conversations')
        .update({ lead_id: created.id })
        .eq('id', conversationId);
      if (convErr) {
        console.error('[ChatContactFirstDrawer] erro ao vincular conversa ao lead:', convErr);
        toast.error('Lead criado, mas falha ao vincular à conversa: ' + (convErr.message || ''));
      }
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['chat-lead-drawer'] });

      toast.success('Lead criado!');
      onOpenChange(false);
    } catch (err: any) {
      console.error('[ChatContactFirstDrawer] erro ao criar lead:', err);
      toast.error('Erro ao criar lead: ' + (err?.message || 'desconhecido'));
    }
  };

  const handleSaveContact = async () => {
    if (!contactId) return;
    const clean = name.trim();
    if (!clean) {
      toast.error('Informe o nome do contato');
      return;
    }
    try {
      const normPhone = phone.trim() ? normalizePhone(phone) : null;
      await updateContact.mutateAsync({
        id: contactId,
        name: clean,
        phone: normPhone,
        email: email.trim() || null,
        source: source || null,
        notes: notes.trim() || null,
        assigned_to: assignedTo,
      } as any);

      await (supabase as any)
        .from('conversations')
        .update({ contact_name: clean })
        .eq('id', conversationId);
      qc.invalidateQueries({ queryKey: ['conversations'] });
    } catch {
      // toast já é disparado pelo hook
    }
  };

  const getInitials = (n: string) =>
    n.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

  const photoUrl = useContactPhoto(phone || defaultPhone || '', defaultAvatarUrl ?? null, conversationId);
  const [photoExpanded, setPhotoExpanded] = useState(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl h-[100dvh] overflow-hidden p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { if (photoUrl) setPhotoExpanded(true); }}
              className={`shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${photoUrl ? 'cursor-zoom-in hover:opacity-90 transition-opacity' : 'cursor-default'}`}
              aria-label={photoUrl ? 'Ampliar foto do contato' : 'Foto do contato'}
              disabled={!photoUrl}
            >
              <Avatar className="w-11 h-11 border-2 border-primary/30">
                {photoUrl && <AvatarImage src={photoUrl} alt={name || 'Contato'} />}
                <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">
                  {step === 'contact' && !name.trim() ? (
                    <Plus className="w-5 h-5" />
                  ) : (
                    getInitials(name)
                  )}
                </AvatarFallback>
              </Avatar>
            </button>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base truncate">
                {name.trim() || 'Novo contato'}
              </SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {step === 'contact'
                  ? 'Preencha os dados iniciais do contato'
                  : existingContact
                  ? 'Edite os dados ou crie a oportunidade'
                  : 'Contato salvo. Deseja transformar em oportunidade?'}
              </p>
            </div>
          </div>
        </SheetHeader>

        {step === 'lead' && (
          <div className="mx-5 mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex items-start gap-3 shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-medium text-foreground">
                {existingContact ? 'Contato já salvo na lista.' : 'Contato salvo na lista de contatos.'}
              </p>
              <p className="text-muted-foreground mt-0.5">
                {existingContact
                  ? 'Você pode editar os dados, criar uma oportunidade agora ou fechar.'
                  : 'Você pode criar agora uma oportunidade vinculada ou fechar e fazer isso depois.'}
              </p>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="px-5 py-5 space-y-5">
            <section className="rounded-xl border border-border bg-card/40 p-4 space-y-5">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                Informações
              </h4>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nome</label>
                <input
                  autoFocus={step === 'contact'}
                  
                  className="w-full h-10 rounded-md border border-border/60 bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  placeholder="Informe o nome do contato"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Telefone</label>
                  <input
                    
                    className="w-full h-10 rounded-md border border-border/60 bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">E-mail</label>
                  <input
                    type="email"
                    
                    className="w-full h-10 rounded-md border border-border/60 bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Responsável</label>
                  <select
                    
                    className="w-full h-10 rounded-md border border-border/60 bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                    value={assignedTo || ''}
                    onChange={(e) => setAssignedTo(e.target.value || null)}
                  >
                    <option value="">Não atribuído</option>
                    {teamMembers?.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Origem</label>
                  <select
                    
                    className="w-full h-10 rounded-md border border-border/60 bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    <option value="">Selecione...</option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.label}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Observações</label>
                <textarea
                  rows={3}
                  
                  placeholder="Adicione observações sobre este contato..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                />
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <TagIcon className="w-4 h-4 text-primary" />
                Tags
              </h4>

              <div className="flex flex-wrap gap-1.5">
                {selectedTags.length === 0 ? (
                  <span className="text-xs text-muted-foreground/60">Nenhuma tag selecionada</span>
                ) : (
                  selectedTags.map((tag) => (
                    <TagChip
                      key={tag.id}
                      tag={tag}
                      onRemove={() => toggleTag(tag.id)}
                    />
                  ))
                )}
              </div>

              {availableTags.length > 0 && (
                <div className="border-t border-border/50 pt-2">
                  <p className="text-[11px] text-muted-foreground mb-1.5">Disponíveis</p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableTags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className="hover:opacity-80 transition-opacity"
                      >
                        <TagChip tag={tag} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-border/50 pt-2">
                <TagCreateRow
                  compact
                  placeholder="Nova tag..."
                  onCreated={(tag) => toggleTag(tag.id)}
                />
              </div>

              {step === 'lead' && selectedTags.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  As tags acima serão aplicadas ao lead.
                </p>
              )}
            </section>

            <p className="text-xs text-muted-foreground">
              {step === 'contact'
                ? 'O contato será salvo na sua lista de Contatos. Após salvar, você poderá transformá-lo em lead.'
                : 'O lead herdará nome, telefone, e-mail, origem, responsável e tags do contato.'}
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border shrink-0 space-y-2">
          {step === 'contact' ? (
            <Button
              onClick={handleCreateContact}
              disabled={createContact.isPending || !name.trim()}
              className="w-full h-10"
            >
              {createContact.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Criar Contato
            </Button>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="h-10">
                Fechar
              </Button>
              <Button
                variant="secondary"
                onClick={handleSaveContact}
                disabled={updateContact.isPending || !name.trim()}
                className="h-10"
              >
                {updateContact.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Salvar
              </Button>
              <Button
                onClick={handleCreateLead}
                disabled={createLead.isPending}
                className="h-10"
              >
                {createLead.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Criar Lead
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
      <Dialog open={photoExpanded} onOpenChange={setPhotoExpanded}>
        <DialogContent className="p-0 bg-transparent border-0 shadow-none max-w-[90vw] sm:max-w-md flex items-center justify-center">
          {photoUrl && (
            <img
              src={photoUrl}
              alt={name || 'Foto do contato'}
              className="w-full h-auto rounded-lg object-contain max-h-[80vh]"
            />
          )}
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

export default ChatContactFirstDrawer;
