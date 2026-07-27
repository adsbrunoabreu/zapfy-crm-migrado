import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Briefcase,
  MessageSquare,
  Calendar,
  Paperclip,
  History,
  Stethoscope,
  ExternalLink,
  Save,
  Ticket,
  Phone,
  Mail,
  MapPin,
  FileText,
} from 'lucide-react';
import { ContactTicketsTab } from './ContactTicketsTab';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  useContact,
  useContactOpportunities,
  useContactConversations,
  useContactAppointments,
  useContactAttachments,
  useContactActivityTimeline,
  useUpdateContact,
  type Contact,
} from '@/hooks/useContacts';
import { useCompanyVertical } from '@/hooks/useCompanyVertical';
import { formatLeadCode } from '@/lib/format';
import { cn } from '@/lib/utils';

interface ContactDrawerProps {
  contactId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fmtCurrency = (v: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));

const fmtDate = (d: string | null | undefined) =>
  d ? format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—';

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?';
}

export function ContactDrawer({ contactId, open, onOpenChange }: ContactDrawerProps) {
  const navigate = useNavigate();
  const { data: vertical } = useCompanyVertical();
  const { data: contact, isLoading } = useContact(contactId);
  const { data: opportunities } = useContactOpportunities(contactId);
  const { data: conversations } = useContactConversations(contactId);
  const { data: appointments } = useContactAppointments(contactId);
  const { data: attachments } = useContactAttachments(contactId);
  const { data: activities } = useContactActivityTimeline(contactId);
  const updateContact = useUpdateContact();

  const [form, setForm] = useState<Partial<Contact>>({});

  useEffect(() => {
    if (contact) setForm(contact);
  }, [contact?.id]);

  const handleSave = () => {
    if (!contact) return;
    const { id: _id, company_id, tenant_seq, created_at, updated_at, created_by,
      phone_normalized, assignee, ...patch } = form as any;
    updateContact.mutate({ id: contact.id, ...patch });
  };

  const activeOpps = (opportunities || []).filter((o: any) => o.status !== 'won' && o.status !== 'lost').length;
  const totalValue = (opportunities || []).reduce((s: number, o: any) => s + Number(o.value || 0), 0);

  if (!open || !contactId) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl h-[100dvh] overflow-hidden p-0 flex flex-col bg-background border-l border-border"
      >
        {/* Header com avatar real do contato */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Avatar className="w-12 h-12 border-2 border-primary/30 shrink-0">
              {contact?.avatar_url && <AvatarImage src={contact.avatar_url} alt={contact.name} />}
              <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">
                {contact ? initials(contact.name) : <User className="w-5 h-5" />}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 text-left">
              <SheetTitle className="text-base truncate">{contact?.name || 'Contato'}</SheetTitle>
              {contact && (
                <SheetDescription asChild>
                  <div className="flex items-center gap-2 flex-wrap text-xs mt-0.5">
                    <span className="text-muted-foreground font-mono">
                      {formatLeadCode(contact.tenant_seq || 0)}
                    </span>
                    {contact.phone && (
                      <span className="text-muted-foreground inline-flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {contact.phone}
                      </span>
                    )}
                    {activeOpps > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-4">
                        {activeOpps} oportunidades ativas
                      </Badge>
                    )}
                    {totalValue > 0 && (
                      <span className="text-emerald font-medium">{fmtCurrency(totalValue)}</span>
                    )}
                  </div>
                </SheetDescription>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {isLoading ? (
            <div className="p-5 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <Tabs defaultValue="overview" className="w-full">
              {/* TabsList no padrão do app */}
              <div className="px-5 pt-4 sticky top-0 z-10 bg-background border-b border-border">
                <TabsList className="w-full justify-start flex-wrap h-auto bg-transparent p-0 gap-1 border-0">
                  <TabTriggerWithIcon value="overview" icon={<User className="w-3.5 h-3.5" />} label="Visão Geral" />
                  <TabTriggerWithIcon
                    value="opportunities"
                    icon={<Briefcase className="w-3.5 h-3.5" />}
                    label="Oportunidades"
                    count={opportunities?.length}
                  />
                  <TabTriggerWithIcon
                    value="conversations"
                    icon={<MessageSquare className="w-3.5 h-3.5" />}
                    label="Conversas"
                    count={conversations?.length}
                  />
                  <TabTriggerWithIcon
                    value="appointments"
                    icon={<Calendar className="w-3.5 h-3.5" />}
                    label="Agendamentos"
                    count={appointments?.length}
                  />
                  <TabTriggerWithIcon
                    value="attachments"
                    icon={<Paperclip className="w-3.5 h-3.5" />}
                    label="Anexos"
                    count={attachments?.length}
                  />
                  <TabTriggerWithIcon value="tickets" icon={<Ticket className="w-3.5 h-3.5" />} label="Tickets" />
                  <TabTriggerWithIcon value="activities" icon={<History className="w-3.5 h-3.5" />} label="Atividades" />
                  {vertical === 'medical' && (
                    <TabTriggerWithIcon value="medical" icon={<Stethoscope className="w-3.5 h-3.5" />} label="Clínico" />
                  )}
                </TabsList>
              </div>

              <div className="px-5 py-5 space-y-5">
                {/* Visão Geral */}
                <TabsContent value="overview" className="space-y-5 mt-0">
                  <Section icon={<User className="w-4 h-4 text-primary" />} title="Dados pessoais">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Nome" value={form.name || ''} onChange={v => setForm(p => ({ ...p, name: v }))} />
                      <Field label="Telefone" value={form.phone || ''} onChange={v => setForm(p => ({ ...p, phone: v }))} />
                      <Field label="E-mail" value={form.email || ''} onChange={v => setForm(p => ({ ...p, email: v }))} />
                      <Field label="CPF / CNPJ" value={form.document || ''} onChange={v => setForm(p => ({ ...p, document: v }))} />
                      <Field label="Data de Nascimento" type="date" value={form.birth_date || ''} onChange={v => setForm(p => ({ ...p, birth_date: v }))} />
                      <Field label="Empresa" value={form.company_name || ''} onChange={v => setForm(p => ({ ...p, company_name: v }))} />
                      <Field label="Origem" value={form.source || ''} onChange={v => setForm(p => ({ ...p, source: v }))} />
                    </div>
                  </Section>

                  <Section icon={<MapPin className="w-4 h-4 text-primary" />} title="Endereço">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Cidade" value={form.city || ''} onChange={v => setForm(p => ({ ...p, city: v }))} />
                      <Field label="Estado" value={form.state || ''} onChange={v => setForm(p => ({ ...p, state: v }))} />
                      <Field label="CEP" value={form.zip_code || ''} onChange={v => setForm(p => ({ ...p, zip_code: v }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Endereço completo</Label>
                      <Input
                        value={form.address || ''}
                        onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                        placeholder="Rua, número, complemento..."
                      />
                    </div>
                  </Section>

                  <Section icon={<FileText className="w-4 h-4 text-primary" />} title="Observações">
                    <Textarea
                      value={form.notes || ''}
                      onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                      rows={4}
                      placeholder="Notas internas sobre este contato..."
                    />
                  </Section>

                  <div className="text-xs text-muted-foreground border-t border-border pt-3">
                    Criado em {fmtDate(contact?.created_at)} · Última atualização {fmtDate(contact?.updated_at)}
                  </div>
                </TabsContent>

                {/* Oportunidades */}
                <TabsContent value="opportunities" className="space-y-2 mt-0">
                  {(opportunities || []).length === 0 && <EmptyState text="Nenhuma oportunidade ainda" />}
                  {(opportunities || []).map((o: any) => (
                    <button
                      type="button"
                      key={o.id}
                      onClick={() => navigate(`/pipelines?lead=${o.id}`)}
                      className="w-full text-left rounded-xl border border-border bg-card/40 hover:bg-card hover:border-primary/30 transition-colors p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-mono">{formatLeadCode(o.tenant_seq || 0)}</span>
                            <span className="font-medium text-sm truncate">{o.name}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                            <span>{o.pipeline?.name}</span>
                            <span>·</span>
                            <span>{o.stage?.name}</span>
                            <span>·</span>
                            <span className="text-emerald font-medium">{fmtCurrency(o.value)}</span>
                          </div>
                        </div>
                        <Badge variant={o.status === 'won' ? 'default' : o.status === 'lost' ? 'destructive' : 'secondary'}>
                          {o.status}
                        </Badge>
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      </div>
                    </button>
                  ))}
                </TabsContent>

                {/* Conversas */}
                <TabsContent value="conversations" className="space-y-2 mt-0">
                  {(conversations || []).length === 0 && <EmptyState text="Nenhuma conversa vinculada" />}
                  {(conversations || []).map((c: any) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => navigate(`/chat?conversation=${c.id}`)}
                      className="w-full text-left rounded-xl border border-border bg-card/40 hover:bg-card hover:border-primary/30 transition-colors p-3 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{c.contact_name || c.phone}</div>
                        <div className="text-xs text-muted-foreground">
                          Última mensagem: {fmtDate(c.last_message_at)}
                          {c.unread_count > 0 && <Badge className="ml-2" variant="destructive">{c.unread_count}</Badge>}
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </TabsContent>

                {/* Agendamentos */}
                <TabsContent value="appointments" className="space-y-2 mt-0">
                  {(appointments || []).length === 0 && <EmptyState text="Nenhum agendamento" />}
                  {(appointments || []).map((a: any) => (
                    <div key={a.id} className="rounded-xl border border-border bg-card/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{a.title || 'Agendamento'}</div>
                          <div className="text-xs text-muted-foreground">{fmtDate(a.scheduled_at)} · {a.duration_minutes ?? 30}min</div>
                        </div>
                        <Badge variant="outline">{a.status}</Badge>
                      </div>
                      {a.notes && <p className="text-xs text-muted-foreground mt-2">{a.notes}</p>}
                    </div>
                  ))}
                </TabsContent>

                {/* Anexos */}
                <TabsContent value="attachments" className="space-y-2 mt-0">
                  {(attachments || []).length === 0 && <EmptyState text="Nenhum anexo" />}
                  {(attachments || []).map((f: any) => (
                    <a
                      key={f.id}
                      href={f.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-border bg-card/40 hover:bg-card hover:border-primary/30 transition-colors p-3 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm truncate">{f.file_name}</div>
                          <div className="text-xs text-muted-foreground">{fmtDate(f.created_at)}</div>
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    </a>
                  ))}
                </TabsContent>

                {/* Tickets */}
                <TabsContent value="tickets" className="mt-0">
                  <ContactTicketsTab
                    contactId={contactId}
                    leadIds={(opportunities || []).map((o: any) => o.id)}
                    phone={contact?.phone_normalized || contact?.phone || null}
                  />
                </TabsContent>

                {/* Atividades */}
                <TabsContent value="activities" className="mt-0">
                  {(activities || []).length === 0 && <EmptyState text="Sem atividades registradas" />}
                  {(activities || []).length > 0 && (
                    <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
                      {(activities || []).map((a: any) => (
                        <div key={a.id} className="border-l-2 border-primary/30 pl-3 py-1">
                          <div className="text-sm">{a.description}</div>
                          <div className="text-xs text-muted-foreground">
                            {a.user?.full_name || a.user?.email || 'Sistema'} · {fmtDate(a.created_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Clínico */}
                {vertical === 'medical' && (
                  <TabsContent value="medical" className="mt-0">
                    <Section icon={<Stethoscope className="w-4 h-4 text-primary" />} title="Dados clínicos">
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Convênio" value={form.insurance || ''} onChange={v => setForm(p => ({ ...p, insurance: v }))} />
                        <Field label="Gênero" value={form.gender || ''} onChange={v => setForm(p => ({ ...p, gender: v }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Alergias</Label>
                        <Textarea
                          value={form.allergies || ''}
                          onChange={e => setForm(p => ({ ...p, allergies: e.target.value }))}
                          rows={3}
                        />
                      </div>
                    </Section>
                  </TabsContent>
                )}
              </div>
            </Tabs>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-background/95 backdrop-blur px-5 py-3 shrink-0">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            <Button onClick={handleSave} disabled={updateContact.isPending}>
              <Save className="w-4 h-4 mr-2" />
              Salvar Alterações
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TabTriggerWithIcon({
  value,
  icon,
  label,
  count,
}: {
  value: string;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        'h-9 px-3 text-xs rounded-md border border-transparent',
        'data-[state=active]:bg-card data-[state=active]:border-border data-[state=active]:text-foreground',
        'text-muted-foreground hover:text-foreground transition-colors',
      )}
    >
      <span className="mr-1.5 inline-flex">{icon}</span>
      {label}
      {typeof count === 'number' && count > 0 && (
        <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
          {count}
        </Badge>
      )}
    </TabsTrigger>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card/40 p-4 space-y-4">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        {icon}
        {title}
      </h4>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/20 text-center text-sm text-muted-foreground py-10">
      {text}
    </div>
  );
}
