import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Mail, Send } from 'lucide-react';
import { useEmailTemplates, useSaveEmailTemplate, useDeleteEmailTemplate, EmailTemplate } from '@/hooks/useEmailTemplates';
import { TemplateEditorSheet, TemplateEditorValue } from './TemplateEditorSheet';
import { TemplateTestDialog } from './TemplateTestDialog';
import { toast } from 'sonner';

export const EmailTemplatesTab = () => {
  const { data: templates, isLoading } = useEmailTemplates();
  const save = useSaveEmailTemplate();
  const del = useDeleteEmailTemplate();
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState<EmailTemplate | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  const handleSave = async (v: TemplateEditorValue) => {
    await save.mutateAsync({
      id: v.id,
      slug: v.slug,
      name: v.name,
      subject: v.subject,
      html_body: v.html_body,
      text_body: v.text_body,
      variables: v.variables as any,
      is_active: v.is_active,
      company_id: null,
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir template?')) return;
    try { await del.mutateAsync(id); toast.success('Excluído'); }
    catch (e: any) { toast.error(e?.message || 'Erro'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Templates editáveis de e-mail enviados pela plataforma.</p>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo template
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="grid gap-2">
          {templates?.map((t) => (
            <Card key={t.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{t.name}</span>
                    <Badge variant="outline" className="text-xs shrink-0">{t.slug}</Badge>
                    {!t.is_active && <Badge variant="secondary" className="text-xs">Inativo</Badge>}
                    {t.company_id === null && <Badge variant="outline" className="text-xs">Sistema</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  title="Enviar teste"
                  onClick={() => { setTesting(t); setTestOpen(true); }}
                  disabled={!t.is_active}
                >
                  <Send className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(t.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
          {!templates?.length && <p className="text-sm text-muted-foreground text-center py-8">Nenhum template ainda</p>}
        </div>
      )}

      <TemplateEditorSheet
        open={open}
        onOpenChange={setOpen}
        type="email"
        initial={editing ? {
          id: editing.id,
          slug: editing.slug,
          name: editing.name,
          subject: editing.subject,
          html_body: editing.html_body,
          text_body: editing.text_body || '',
          variables: editing.variables || [],
          is_active: editing.is_active,
        } : null}
        onSave={handleSave}
      />

      <TemplateTestDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        type="email"
        template={testing ? {
          slug: testing.slug,
          name: testing.name,
          subject: testing.subject,
          html_body: testing.html_body,
          variables: testing.variables || [],
        } : null}
      />
    </div>
  );
};
