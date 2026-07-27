import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTags, useCreateTag, type Tag } from '@/hooks/useTags';
import { useLeadTags, useAddTagToLead, useRemoveTagFromLead } from '@/hooks/useLeadTags';
import { usePipelines } from '@/hooks/usePipelines';
import { useCreateLead, useUpdateLead } from '@/hooks/useLeads';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Save, Plus, Check, Loader2, ExternalLink, ChevronDown,
} from 'lucide-react';
import { ImageLightbox } from '@/components/chat/ImageLightbox';
import { Input } from '@/components/ui/input';
import { CepInput } from '@/components/forms/CepInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BirthDateInput } from '@/components/ui/birth-date-input';
import { LeadHistoryTimeline } from './LeadHistoryTimeline';
import { TagChip, TagCreateRow } from '@/components/settings/TagsManager';

import { LeadDetailModal } from '@/components/pipelines/LeadDetailModal';
import { useConversationTicketsHistory } from '@/hooks/useAttendanceTickets';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import type { Conversation } from '@/hooks/useConversations';
import { useNavigate } from 'react-router-dom';
import { getPhoneDisplay } from '@/lib/phoneDisplay';
import { cn } from '@/lib/utils';

interface ContactDetailDrawerProps {
  conversation: Conversation;
  contactPhoto: string | null;
  open: boolean;
  onClose: () => void;
  initialSection?: 'perfil' | 'notas' | 'tickets' | 'endereco' | 'pipeline' | 'historico';
}

interface LeadData {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  notes: string | null;
  value: number | null;
  document?: string | null;
  company_name?: string | null;
  birth_date?: string | null;
  zip_code?: string | null;
  address?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

type CollapsibleKey = 'perfil' | 'endereco' | 'notas';

export default function ContactDetailDrawer({ conversation, contactPhoto, open, onClose, initialSection }: ContactDetailDrawerProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: tags = [] } = useTags();
  const { data: pipelines = [] } = usePipelines();
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const addTag = useAddTagToLead();
  const removeTag = useRemoveTagFromLead();
  const createTag = useCreateTag();

  const [lead, setLead] = useState<LeadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openSections, setOpenSections] = useState<Set<CollapsibleKey>>(new Set());
  const [createLeadOpen, setCreateLeadOpen] = useState(false);

  const toggleSection = useCallback((key: CollapsibleKey, value?: boolean) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      const shouldOpen = value ?? !prev.has(key);
      if (shouldOpen) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  // Editable fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [document, setDocument] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [birthDate, setBirthDate] = useState<string>('');
  const [selectedPipeline, setSelectedPipeline] = useState<string>('');
  const [selectedStage, setSelectedStage] = useState<string>('');

  // Address
  const [zip, setZip] = useState('');
  const [address, setAddress] = useState('');
  const [addrNumber, setAddrNumber] = useState('');
  const [addrComplement, setAddrComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [stateUF, setStateUF] = useState('');
  const [country, setCountry] = useState('BR');
  

  const { data: leadTags = [] } = useLeadTags(lead?.id || null);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  // Dirty-tracking
  const dirtyFields = useRef<Set<string>>(new Set());
  const markDirty = useCallback((field: string) => {
    dirtyFields.current.add(field);
  }, []);
  const clearDirty = useCallback(() => {
    dirtyFields.current.clear();
  }, []);

  const SELECT_FIELDS =
    'id, name, phone, email, pipeline_id, stage_id, notes, value, document, company_name, birth_date, zip_code, address, address_number, address_complement, neighborhood, city, state, country';

  const applyLeadData = useCallback((data: any, respectDirty: boolean) => {
    const dirty = respectDirty ? dirtyFields.current : new Set<string>();
    setLead(data);
    if (!dirty.has('name')) setName(data.name || '');
    if (!dirty.has('email')) setEmail(data.email || '');
    if (!dirty.has('notes')) setNotes(data.notes || '');
    if (!dirty.has('document')) setDocument(data.document || '');
    if (!dirty.has('companyName')) setCompanyName(data.company_name || '');
    if (!dirty.has('birthDate')) setBirthDate(data.birth_date ? String(data.birth_date).slice(0, 10) : '');
    if (!dirty.has('selectedPipeline')) setSelectedPipeline(data.pipeline_id || '');
    if (!dirty.has('selectedStage')) setSelectedStage(data.stage_id || '');
    if (!dirty.has('zip')) setZip(data.zip_code || '');
    if (!dirty.has('address')) setAddress(data.address || '');
    if (!dirty.has('addrNumber')) setAddrNumber(data.address_number || '');
    if (!dirty.has('addrComplement')) setAddrComplement(data.address_complement || '');
    if (!dirty.has('neighborhood')) setNeighborhood(data.neighborhood || '');
    if (!dirty.has('city')) setCity(data.city || '');
    if (!dirty.has('stateUF')) setStateUF(data.state || '');
    if (!dirty.has('country')) setCountry(data.country || 'BR');
  }, []);

  // Fetch lead
  useEffect(() => {
    if (!open || !profile?.company_id) return;

    const fetchLead = async () => {
      setLoading(true);
      clearDirty();

      if (conversation.lead_id) {
        const { data } = await supabase
          .from('leads')
          .select(SELECT_FIELDS)
          .eq('id', conversation.lead_id)
          .single();

        if (data) {
          applyLeadData(data, false);
          setLoading(false);
          return;
        }
      }

      const { data } = await supabase
        .from('leads')
        .select(SELECT_FIELDS)
        .eq('company_id', profile.company_id!)
        .eq('phone', conversation.phone)
        .limit(1)
        .maybeSingle();

      if (data) {
        applyLeadData(data, false);
        if (!conversation.lead_id) {
          await (supabase as any)
            .from('conversations')
            .update({ lead_id: data.id })
            .eq('id', conversation.id);
        }
      } else {
        setLead(null);
        setName(conversation.contact_name || conversation.phone);
        setEmail('');
        setNotes('');
        setDocument('');
        setCompanyName('');
        setWebsite('');
        setBirthDate('');
        setSelectedPipeline('');
        setSelectedStage('');
        setZip(''); setAddress(''); setAddrNumber(''); setAddrComplement('');
        setNeighborhood(''); setCity(''); setStateUF(''); setCountry('BR');
      }

      setLoading(false);
    };

    fetchLead();
  }, [open, conversation.id, conversation.lead_id, conversation.phone, conversation.contact_name, profile?.company_id, applyLeadData, clearDirty]);

  // Realtime
  useEffect(() => {
    if (!open || !lead?.id) return;
    const leadId = lead.id;
    const channel = supabase
      .channel(`lead-detail-${leadId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads', filter: `id=eq.${leadId}` },
        async () => {
          const { data } = await supabase
            .from('leads')
            .select(SELECT_FIELDS)
            .eq('id', leadId)
            .single();
          if (data) applyLeadData(data, true);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'leads', filter: `id=eq.${leadId}` },
        () => { setLead(null); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [open, lead?.id, applyLeadData]);

  // initialSection: abre collapsible relevante e faz scroll até a seção
  useEffect(() => {
    if (!open || !initialSection) return;
    if (initialSection === 'perfil' || initialSection === 'endereco' || initialSection === 'notas') {
      toggleSection(initialSection, true);
    }
    const t = window.setTimeout(() => {
      const el = window.document.querySelector(`[data-drawer-section="${initialSection}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 220);
    return () => window.clearTimeout(t);
  }, [open, initialSection, toggleSection]);

  const currentPipeline = pipelines.find(p => p.id === selectedPipeline);
  const stages = currentPipeline?.stages || [];
  const currentStage = stages.find((s: any) => s.id === selectedStage);

  // ViaCEP — autopreenchimento via <CepInput />
  const applyCepFields = useCallback((f: { address: string; neighborhood: string; city: string; state: string }) => {
    if (f.address) { markDirty('address'); setAddress(f.address); }
    if (f.neighborhood) { markDirty('neighborhood'); setNeighborhood(f.neighborhood); }
    if (f.city) { markDirty('city'); setCity(f.city); }
    if (f.state) { markDirty('stateUF'); setStateUF(f.state); }
    setCountry('BR');
  }, []);

  const buildPayload = () => ({
    name,
    email: email || null,
    notes: notes || null,
    document: document || null,
    company_name: companyName || null,
    birth_date: birthDate || null,
    zip_code: zip || null,
    address: address || null,
    address_number: addrNumber || null,
    address_complement: addrComplement || null,
    neighborhood: neighborhood || null,
    city: city || null,
    state: stateUF || null,
    country: country || null,
  });

  const handleSave = async () => {
    if (!profile?.company_id) return;
    setSaving(true);
    try {
      const payload = buildPayload();

      if (lead) {
        await updateLead.mutateAsync({ id: lead.id, ...payload } as any);
      } else {
        const result = await createLead.mutateAsync({
          phone: conversation.phone,
          status: 'new',
          pipeline_id: null,
          stage_id: null,
          _silent: true,
          ...payload,
        } as any);
        setLead(result as any);
        await (supabase as any)
          .from('conversations')
          .update({ lead_id: result.id })
          .eq('id', conversation.id);
      }

      if (name !== conversation.contact_name) {
        await (supabase as any)
          .from('conversations')
          .update({ contact_name: name })
          .eq('id', conversation.id);
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }

      clearDirty();
      toast.success('Contato salvo!');
    } catch {
      toast.error('Erro ao salvar contato');
    } finally {
      setSaving(false);
    }
  };

  const ensureLead = useCallback(async (): Promise<LeadData | null> => {
    if (lead) return lead;
    if (!profile?.company_id) return null;
    try {
      const result: any = await createLead.mutateAsync({
        phone: conversation.phone,
        name: name || conversation.contact_name || conversation.phone,
        status: 'new',
        _silent: true,
      } as any);
      setLead(result);
      await (supabase as any)
        .from('conversations')
        .update({ lead_id: result.id })
        .eq('id', conversation.id);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      return result;
    } catch {
      toast.error('Erro ao criar contato');
      return null;
    }
  }, [lead, profile?.company_id, conversation.id, conversation.phone, conversation.contact_name, name, createLead, queryClient]);

  const handleToggleTag = async (tag: Tag) => {
    const target = await ensureLead();
    if (!target) return;
    const existing = leadTags.find(lt => lt.tag_id === tag.id);
    if (existing) {
      await removeTag.mutateAsync({ leadId: target.id, tagId: tag.id, tagName: tag.name });
    } else {
      await addTag.mutateAsync({ leadId: target.id, tagId: tag.id, tagName: tag.name, tagColor: tag.color || undefined });
    }
  };

  const getInitials = (n: string) => n.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  const phoneInfo = getPhoneDisplay(conversation.phone);

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl h-[100dvh] overflow-hidden p-0 flex flex-col"
        >
          {/* HEADER */}
          <SheetHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => contactPhoto && setPhotoOpen(true)}
                disabled={!contactPhoto}
                className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:opacity-90 transition disabled:cursor-default disabled:hover:opacity-100"
                aria-label={contactPhoto ? 'Ver foto do contato' : 'Sem foto do contato'}
              >
                <Avatar className="w-11 h-11">
                  {contactPhoto && <AvatarImage src={contactPhoto} />}
                  <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">
                    {getInitials(name || '?')}
                  </AvatarFallback>
                </Avatar>
              </button>

              <div className="min-w-0 flex-1">
                <SheetTitle className="text-base truncate flex items-center gap-1.5">
                  <span className="truncate">{name || 'Novo contato'}</span>
                  {lead && (
                    <button
                      type="button"
                      onClick={() => navigate(`/leads?focus=${lead.id}`)}
                      className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                      title="Abrir lead"
                      aria-label="Abrir lead"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}
                </SheetTitle>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-mono gap-1">
                    <span aria-hidden>{phoneInfo.flagEmoji}</span>
                    <span>{phoneInfo.dialCode || ''} {phoneInfo.nationalNumber || conversation.phone}</span>
                  </Badge>
                  {currentStage && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                      <span className="w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: currentStage.color || '#6366f1' }} />
                      {currentStage.name}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                    {lead ? 'Lead' : 'Novo contato'}
                  </Badge>
                </div>
              </div>
            </div>
          </SheetHeader>

          {/* BODY */}
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <div className="px-5 py-5 space-y-5">

              {/* Tags */}
              <section className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Tags</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setShowTagSelector((v) => !v)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Adicionar
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {leadTags.length === 0 ? (
                    <span className="text-xs text-muted-foreground/60">Nenhuma tag</span>
                  ) : (
                    leadTags.map(lt => lt.tag && (
                      <TagChip
                        key={lt.id}
                        tag={lt.tag}
                        onRemove={() => handleToggleTag(lt.tag!)}
                        removing={removeTag.isPending}
                      />
                    ))
                  )}
                </div>
                {showTagSelector && (
                  <div className="border border-border/50 rounded-lg p-2 space-y-2 bg-background">
                    <div className="max-h-[140px] overflow-y-auto space-y-0.5">
                      {tags.map(tag => {
                        const isSelected = leadTags.some(lt => lt.tag_id === tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => handleToggleTag(tag)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent/50 transition-colors"
                          >
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#6366f1' }} />
                            <span className="flex-1 text-left">{tag.name}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                    <TagCreateRow
                      compact
                      placeholder="Nova tag..."
                      onCreated={async (tag) => {
                        const target = await ensureLead();
                        if (target) {
                          await addTag.mutateAsync({
                            leadId: target.id,
                            tagId: tag.id,
                            tagName: tag.name,
                            tagColor: tag.color || undefined,
                          });
                        }
                      }}
                    />
                  </div>
                )}
              </section>

              {/* Pipeline & Etapa */}
              {lead?.pipeline_id ? (
                <section data-drawer-section="pipeline" className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold">Pipeline & Etapa</h4>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCreateLeadOpen(true)}>
                      Editar lead
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {currentPipeline?.name || '—'}{currentStage ? ` · ${currentStage.name}` : ''}
                  </div>
                </section>
              ) : lead ? (
                <section className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold">Transformar em lead</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Atribua um pipeline e etapa para iniciar o atendimento comercial.
                    </p>
                  </div>
                  <Button size="sm" className="h-8 text-xs shrink-0" onClick={() => setCreateLeadOpen(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Criar lead
                  </Button>
                </section>
              ) : null}

              {/* Tickets */}
              <section data-drawer-section="tickets" className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
                <h4 className="text-sm font-semibold">Tickets</h4>
                <TicketsHistorySection conversationId={conversation.id} />
              </section>

              {/* Perfil completo (Collapsible) */}
              <DrawerCollapsible
                sectionKey="perfil"
                label="Perfil completo"
                open={openSections.has('perfil')}
                onToggle={(v) => toggleSection('perfil', v)}
              >
                <FieldRow label="Nome">
                  <Input value={name} onChange={(e) => { markDirty('name'); setName(e.target.value); }} placeholder="Nome do contato" className="h-8 text-sm" />
                </FieldRow>
                <FieldRow label="E-mail">
                  <Input type="email" value={email} onChange={(e) => { markDirty('email'); setEmail(e.target.value); }} placeholder="email@exemplo.com" className="h-8 text-sm" />
                </FieldRow>
                <FieldRow label="Telefone">
                  <div className="flex gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 h-8 rounded-md border border-input bg-muted/40 text-sm shrink-0 font-mono">
                      <span aria-hidden>{phoneInfo.flagEmoji}</span>
                      {phoneInfo.countryCode && <span className="text-xs text-muted-foreground">{phoneInfo.countryCode}</span>}
                      <span>{phoneInfo.dialCode || '+?'}</span>
                    </span>
                    <Input value={phoneInfo.nationalNumber || conversation.phone} disabled className="h-8 text-sm" />
                  </div>
                </FieldRow>
                <FieldRow label="Empresa">
                  <Input value={companyName} onChange={(e) => { markDirty('companyName'); setCompanyName(e.target.value); }} placeholder="Empresa do lead" className="h-8 text-sm" />
                </FieldRow>
                <FieldRow label="Site">
                  <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="www.exemplo.com.br" className="h-8 text-sm" />
                </FieldRow>
                <FieldRow label="Documento">
                  <Input value={document} onChange={(e) => { markDirty('document'); setDocument(e.target.value); }} placeholder="CPF / CNPJ" className="h-8 text-sm" />
                </FieldRow>
                <FieldRow label="Nascimento">
                  <BirthDateInput value={birthDate} onChange={(iso) => { markDirty('birthDate'); setBirthDate(iso || ''); }} />
                </FieldRow>
              </DrawerCollapsible>

              {/* Endereço (Collapsible) */}
              <DrawerCollapsible
                sectionKey="endereco"
                label="Endereço"
                open={openSections.has('endereco')}
                onToggle={(v) => toggleSection('endereco', v)}
              >
                <FieldRow label="CEP">
                  <CepInput
                    value={zip}
                    onChange={(v) => { markDirty('zip'); setZip(v); }}
                    onAddressFound={applyCepFields}
                    className="h-8 text-sm"
                  />
                </FieldRow>
                <FieldRow label="Logradouro">
                  <Input value={address} onChange={(e) => { markDirty('address'); setAddress(e.target.value); }} placeholder="Rua, avenida..." className="h-8 text-sm" />
                </FieldRow>
                <div className="grid grid-cols-2 gap-2">
                  <FieldRow label="Número">
                    <Input value={addrNumber} onChange={(e) => { markDirty('addrNumber'); setAddrNumber(e.target.value); }} className="h-8 text-sm" />
                  </FieldRow>
                  <FieldRow label="Complemento">
                    <Input value={addrComplement} onChange={(e) => { markDirty('addrComplement'); setAddrComplement(e.target.value); }} className="h-8 text-sm" />
                  </FieldRow>
                </div>
                <FieldRow label="Bairro">
                  <Input value={neighborhood} onChange={(e) => { markDirty('neighborhood'); setNeighborhood(e.target.value); }} className="h-8 text-sm" />
                </FieldRow>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <FieldRow label="Cidade">
                      <Input value={city} onChange={(e) => { markDirty('city'); setCity(e.target.value); }} className="h-8 text-sm" />
                    </FieldRow>
                  </div>
                  <FieldRow label="UF">
                    <Input value={stateUF} onChange={(e) => { markDirty('stateUF'); setStateUF(e.target.value.toUpperCase().slice(0, 2)); }} className="h-8 text-sm" />
                  </FieldRow>
                </div>
              </DrawerCollapsible>

              {/* Notas (Collapsible) */}
              <DrawerCollapsible
                sectionKey="notas"
                label="Notas internas"
                open={openSections.has('notas')}
                onToggle={(v) => toggleSection('notas', v)}
              >
                <textarea
                  value={notes}
                  onChange={(e) => { markDirty('notes'); setNotes(e.target.value); }}
                  placeholder="Notas internas sobre o contato..."
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </DrawerCollapsible>

              {/* Histórico */}
              <section data-drawer-section="historico" className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
                <h4 className="text-sm font-semibold">Histórico</h4>
                <LeadHistoryTimeline leadId={lead?.id || null} />
              </section>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="p-4 border-t border-border shrink-0">
            <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full h-9">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {lead ? 'Salvar alterações' : 'Criar contato'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ImageLightbox
        open={photoOpen && !!contactPhoto}
        images={contactPhoto ? [{ id: 'contact-photo', src: contactPhoto, alt: name || 'Contato' }] : []}
        onClose={() => setPhotoOpen(false)}
      />


      {createLeadOpen && lead && (
        <LeadDetailModal
          open={createLeadOpen}
          onOpenChange={(v) => {
            setCreateLeadOpen(v);
            if (!v) queryClient.invalidateQueries({ queryKey: ['conversations'] });
          }}
          lead={{
            id: lead.id,
            name: lead.name || name,
            phone: lead.phone || conversation.phone || null,
            email: lead.email || email || null,
            value: (lead as any).value ?? null,
            status: (lead as any).status ?? 'new',
            notes: lead.notes || notes || null,
            assigned_to: (lead as any).assigned_to ?? null,
            created_at: (lead as any).created_at ?? new Date().toISOString(),
          }}
        />
      )}

    </>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function DrawerCollapsible({
  sectionKey,
  label,
  open,
  onToggle,
  children,
}: {
  sectionKey: CollapsibleKey;
  label: string;
  open: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onToggle} data-drawer-section={sectionKey}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between rounded-xl border border-border bg-card/40 px-4 py-3 hover:bg-accent/30 transition-colors"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

const TICKET_STATUS_LABEL: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em atendimento',
  closed: 'Encerrado',
  reopened: 'Reaberto',
};
const TICKET_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  open: 'secondary',
  in_progress: 'default',
  closed: 'outline',
  reopened: 'secondary',
};

function TicketsHistorySection({ conversationId }: { conversationId: string }) {
  const { data: tickets, isLoading } = useConversationTicketsHistory(conversationId);
  const { data: members } = useTeamMembers();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!tickets || tickets.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">Nenhum ticket aberto para este contato.</p>;
  }
  const memberName = (id: string | null) =>
    id ? members?.find((m) => m.id === id)?.name || 'Atendente' : 'Sem atendente';

  return (
    <div className="space-y-2">
      {tickets.map((t) => (
        <div key={t.id} className="border border-border/40 rounded-md p-2 space-y-1 bg-background/40">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-foreground">{t.ticket_code}</span>
            <Badge variant={TICKET_STATUS_VARIANT[t.status] || 'outline'} className="text-[10px] px-1.5 py-0 h-4">
              {TICKET_STATUS_LABEL[t.status] || t.status}
            </Badge>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Aberto {format(new Date(t.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} · {memberName(t.assigned_to)}
          </div>
          {t.closed_at && (
            <div className="text-[11px] text-muted-foreground">
              Encerrado {format(new Date(t.closed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              {t.close_reason ? ` · ${t.close_reason}` : ''}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
