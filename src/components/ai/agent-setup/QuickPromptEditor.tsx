import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  agentId?: string;
  value: string;
  onChange: (v: string) => void;
  onSaved: () => void;
}

export function QuickPromptEditor({ agentId, value, onChange, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  const save = async () => {
    if (!agentId) { onChange(draft); setEditing(false); return; }
    if (!draft.trim()) {
      toast({ title: 'System message não pode estar vazio', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('ai_agents').update({ system_prompt: draft }).eq('id', agentId);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    onChange(draft);
    setEditing(false);
    onSaved();
  };

  return (
    <Card className="p-4 space-y-3 border-l-4 border-l-amber-500">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Wand2 className="w-4 h-4 text-amber" />
            System Message
          </p>
          <p className="text-[11px] text-muted-foreground">
            ⭐ Campo mais editado. Edite aqui para mudanças rápidas — gera versão automática no Histórico.
          </p>
        </div>
        {!editing && <Button size="sm" onClick={() => setEditing(true)}>Editar</Button>}
      </div>

      {editing ? (
        <>
          <Textarea
            rows={6}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="font-mono text-xs"
            placeholder="Você é um assistente virtual..."
          />
          <p className="text-[10px] text-muted-foreground">
            💡 Use {'{{nome_lead}}'} ou outras variáveis dinâmicas no prompt.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Salvar
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setDraft(value); setEditing(false); }} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </>
      ) : (
        <pre className="text-xs whitespace-pre-wrap font-mono p-3 rounded bg-muted/30 border border-border max-h-40 overflow-auto">
          {value || '(vazio)'}
        </pre>
      )}
    </Card>
  );
}
