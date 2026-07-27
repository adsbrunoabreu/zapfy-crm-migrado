import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import DOMPurify from 'dompurify';

export interface TemplateEditorValue {
  id?: string;
  slug: string;
  name: string;
  subject?: string;
  html_body?: string;
  text_body?: string;
  body?: string;
  variables: string[];
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  type: 'email' | 'whatsapp';
  initial?: TemplateEditorValue | null;
  onSave: (value: TemplateEditorValue) => Promise<void>;
}

const empty = (type: 'email' | 'whatsapp'): TemplateEditorValue => ({
  slug: '',
  name: '',
  subject: type === 'email' ? '' : undefined,
  html_body: type === 'email' ? '' : undefined,
  text_body: type === 'email' ? '' : undefined,
  body: type === 'whatsapp' ? '' : undefined,
  variables: [],
  is_active: true,
});

export const TemplateEditorSheet = ({ open, onOpenChange, type, initial, onSave }: Props) => {
  const [val, setVal] = useState<TemplateEditorValue>(empty(type));
  const [saving, setSaving] = useState(false);
  const [varInput, setVarInput] = useState('');

  useEffect(() => {
    if (open) setVal(initial ?? empty(type));
  }, [open, initial, type]);

  const submit = async () => {
    if (!val.slug || !val.name) return toast.error('Slug e nome são obrigatórios');
    if (type === 'email' && (!val.subject || !val.html_body)) return toast.error('Assunto e HTML obrigatórios');
    if (type === 'whatsapp' && !val.body) return toast.error('Corpo da mensagem obrigatório');
    setSaving(true);
    try {
      await onSave(val);
      toast.success('Template salvo');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const addVar = () => {
    const v = varInput.trim().replace(/[{}\s]/g, '');
    if (!v) return;
    if (val.variables.includes(v)) return;
    setVal({ ...val, variables: [...val.variables, v] });
    setVarInput('');
  };

  const removeVar = (v: string) =>
    setVal({ ...val, variables: val.variables.filter((x) => x !== v) });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl h-[100dvh] overflow-hidden p-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="p-6 flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle>{initial ? 'Editar template' : 'Novo template'}</SheetTitle>
          <SheetDescription>
            Use <code className="text-xs bg-muted px-1 rounded">{'{{variavel}}'}</code> para inserir valores dinâmicos.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Slug (identificador)</Label>
              <Input
                value={val.slug}
                onChange={(e) => setVal({ ...val, slug: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                placeholder="welcome"
                disabled={!!initial}
              />
            </div>
            <div>
              <Label>Nome</Label>
              <Input value={val.name} onChange={(e) => setVal({ ...val, name: e.target.value })} placeholder="Boas-vindas" />
            </div>
          </div>

          {type === 'email' ? (
            <>
              <div>
                <Label>Assunto</Label>
                <Input value={val.subject ?? ''} onChange={(e) => setVal({ ...val, subject: e.target.value })} />
              </div>

              <Tabs defaultValue="html">
                <TabsList>
                  <TabsTrigger value="html">HTML</TabsTrigger>
                  <TabsTrigger value="text">Texto</TabsTrigger>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>
                <TabsContent value="html">
                  <Textarea
                    value={val.html_body ?? ''}
                    onChange={(e) => setVal({ ...val, html_body: e.target.value })}
                    rows={14}
                    className="font-mono text-xs"
                  />
                </TabsContent>
                <TabsContent value="text">
                  <Textarea
                    value={val.text_body ?? ''}
                    onChange={(e) => setVal({ ...val, text_body: e.target.value })}
                    rows={10}
                    placeholder="Versão em texto puro (opcional)"
                  />
                </TabsContent>
                <TabsContent value="preview">
                  <div
                    className="border rounded p-4 bg-background min-h-[200px] prose prose-invert max-w-none text-sm"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(val.html_body ?? '') }}
                  />
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <div>
              <Label>Mensagem</Label>
              <Textarea
                value={val.body ?? ''}
                onChange={(e) => setVal({ ...val, body: e.target.value })}
                rows={8}
              />
            </div>
          )}

          <div>
            <Label>Variáveis disponíveis</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={varInput}
                onChange={(e) => setVarInput(e.target.value)}
                placeholder="user_name"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVar(); } }}
              />
              <Button type="button" variant="outline" onClick={addVar}>Adicionar</Button>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {val.variables.map((v) => (
                <Badge key={v} variant="secondary" className="cursor-pointer" onClick={() => removeVar(v)}>
                  {`{{${v}}}`} ✕
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={val.is_active} onCheckedChange={(c) => setVal({ ...val, is_active: c })} />
            <Label>Ativo</Label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
