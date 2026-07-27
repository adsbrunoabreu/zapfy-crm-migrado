import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, MessageCircle, Send } from 'lucide-react';
import { useWhatsappTemplates, useSaveWhatsappTemplate, useDeleteWhatsappTemplate, WhatsappTemplate } from '@/hooks/useWhatsappTemplates';
import { TemplateEditorSheet, TemplateEditorValue } from './TemplateEditorSheet';
import { TemplateTestDialog } from './TemplateTestDialog';
import { toast } from 'sonner';

export const WhatsappTemplatesTab = () => {
  const { data: templates, isLoading } = useWhatsappTemplates();
  const save = useSaveWhatsappTemplate();
  const del = useDeleteWhatsappTemplate();
  const [editing, setEditing] = useState<WhatsappTemplate | null>(null);
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState<WhatsappTemplate | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  const handleSave = async (v: TemplateEditorValue) => {
    await save.mutateAsync({
      id: v.id,
      slug: v.slug,
      name: v.name,
      body: v.body,
      variables: v.variables as any,
      is_active: v.is_active,
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
        <p className="text-sm text-muted-foreground">
          Templates de notificações via WhatsApp enviadas pelo sistema (apenas Master).
        </p>
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
                <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{t.name}</span>
                    <Badge variant="outline" className="text-xs shrink-0">{t.slug}</Badge>
                    {!t.is_active && <Badge variant="secondary" className="text-xs">Inativo</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{t.body}</p>
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
        type="whatsapp"
        initial={editing ? {
          id: editing.id,
          slug: editing.slug,
          name: editing.name,
          body: editing.body,
          variables: editing.variables || [],
          is_active: editing.is_active,
        } : null}
        onSave={handleSave}
      />

      <TemplateTestDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        type="whatsapp"
        template={testing ? {
          slug: testing.slug,
          name: testing.name,
          body: testing.body,
          variables: testing.variables || [],
        } : null}
      />
    </div>
  );
};
