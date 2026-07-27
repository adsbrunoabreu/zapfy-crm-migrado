import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { TEMPLATE_VARIABLES, detectVariables, slugify } from './templateVariables';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { WhatsAppPreview } from '@/components/messaging/WhatsAppPreview';

type Template = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  body: string;
  media_url: string | null;
  media_mimetype: string | null;
  media_filename: string | null;
  is_active: boolean;
  created_at: string;
};

export function MessageTemplatesTab() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Template | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Template | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['message-templates', profile?.company_id],
    enabled: !!profile?.company_id,
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .order('name', { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as Template[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (t: Partial<Template> & { _id?: string }) => {
      const payload = {
        company_id: profile?.company_id,
        name: t.name!,
        slug: t.slug || slugify(t.name || ''),
        category: t.category || null,
        body: t.body!,
        media_url: t.media_url || null,
        media_mimetype: t.media_mimetype || null,
        media_filename: t.media_filename || null,
        variables: detectVariables(t.body || ''),
        is_active: t.is_active ?? true,
      };
      if (t._id) {
        const { error } = await supabase.from('message_templates').update(payload).eq('id', t._id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('message_templates').insert({ ...payload, created_by: profile?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Template salvo');
      qc.invalidateQueries({ queryKey: ['message-templates'] });
      setOpen(false); setEditing(null);
    },
    onError: (e: any) => toast.error('Erro ao salvar', { description: e.message }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('message_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Removido'); qc.invalidateQueries({ queryKey: ['message-templates'] }); setConfirmDel(null); },
  });

  const startNew = () => { setEditing({ id: '', name: '', slug: '', category: '', body: '', media_url: null, media_mimetype: null, media_filename: null, is_active: true, created_at: '' }); setOpen(true); };
  const startEdit = (t: Template) => { setEditing(t); setOpen(true); };
  const duplicate = (t: Template) => { setEditing({ ...t, id: '', name: t.name + ' (cópia)', slug: '' }); setOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Crie textos reutilizáveis com variáveis do lead — use em fluxos ou no agendamento individual.</p>
        <Button onClick={startNew}><Plus className="h-4 w-4 mr-2" />Novo template</Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : templates.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum template criado ainda.</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{t.name}</div>
                  {t.category ? <div className="text-xs text-muted-foreground">{t.category}</div> : null}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => startEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => duplicate(t)}><Copy className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setConfirmDel(t)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{t.body}</p>
              <div className="flex flex-wrap gap-1 mt-auto pt-2">
                {detectVariables(t.body).slice(0, 4).map((v) => (
                  <Badge key={v} variant="secondary" className="text-[10px]">{`{{${v}}}`}</Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <TemplateDialog open={open} onOpenChange={setOpen} value={editing} onSave={(v) => upsert.mutate(v)} saving={upsert.isPending} />

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(v) => { if (!v) setConfirmDel(null); }}
        title="Remover template?"
        description={confirmDel?.name}
        confirmLabel="Remover"
        onConfirm={() => confirmDel && del.mutate(confirmDel.id)}
      />
    </div>
  );
}

function TemplateDialog({
  open, onOpenChange, value, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: Template | null;
  onSave: (v: Partial<Template> & { _id?: string }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [body, setBody] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaMime, setMediaMime] = useState('');
  const [mediaName, setMediaName] = useState('');
  const textareaId = 'tpl-body';

  // Sync from incoming value
  if (value && open && name === '' && body === '' && value.body !== '') {
    setName(value.name); setCategory(value.category || ''); setBody(value.body);
    setMediaUrl(value.media_url || ''); setMediaMime(value.media_mimetype || ''); setMediaName(value.media_filename || '');
  }
  if (!open && (name || body)) {
    // reset on close
    setTimeout(() => { setName(''); setCategory(''); setBody(''); setMediaUrl(''); setMediaMime(''); setMediaName(''); }, 200);
  }

  const insertVar = (k: string) => {
    const el = document.getElementById(textareaId) as HTMLTextAreaElement | null;
    const tag = `{{${k}}}`;
    if (!el) { setBody(body + tag); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + tag + body.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + tag.length, start + tag.length); });
  };

  const handleSave = () => {
    if (!name.trim() || !body.trim()) { toast.error('Preencha nome e mensagem'); return; }
    onSave({
      _id: value?.id || undefined,
      name: name.trim(),
      slug: value?.slug || slugify(name),
      category: category.trim() || null,
      body,
      media_url: mediaUrl.trim() || null,
      media_mimetype: mediaMime.trim() || null,
      media_filename: mediaName.trim() || null,
      is_active: true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{value?.id ? 'Editar template' : 'Novo template'}</DialogTitle></DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Boas-vindas" />
            </div>
            <div>
              <Label>Categoria (opcional)</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex.: Vendas, SDR…" />
            </div>
            <div>
              <Label htmlFor={textareaId}>Mensagem</Label>
              <Textarea id={textareaId} value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Olá {{primeiro_nome}}, tudo bem?" />
            </div>
            <div>
              <Label>Variáveis disponíveis</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button key={v.key} type="button" onClick={() => insertVar(v.key)}
                    className="text-[11px] px-2 py-0.5 rounded border border-border bg-muted/40 hover:bg-muted text-muted-foreground">
                    {`{{${v.key}}}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3">
                <Label>Mídia (URL opcional)</Label>
                <Input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://…" />
              </div>
              {mediaUrl && (
                <>
                  <Input value={mediaMime} onChange={(e) => setMediaMime(e.target.value)} placeholder="mimetype (ex.: image/png)" />
                  <Input className="col-span-2" value={mediaName} onChange={(e) => setMediaName(e.target.value)} placeholder="nome do arquivo" />
                </>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Pré-visualização</Label>
            <WhatsAppPreview
              body={body}
              lead={null}
              fallbackToExamples
              mediaUrl={mediaUrl || null}
              mediaMimetype={mediaMime || null}
              mediaFilename={mediaName || null}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
