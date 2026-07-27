import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Copy, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { AVAILABLE_EVENTS, generateSecret } from './constants';

export interface WebhookFormState {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  instance_ids: string[];
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  form: WebhookFormState;
  setForm: (next: WebhookFormState) => void;
  instances: Array<{ id: string; display_name: string }>;
  saving: boolean;
  onSave: () => void;
}

export function WebhookForm({ open, onOpenChange, form, setForm, instances, saving, onSave }: Props) {
  const showInstanceFilter = form.events.includes('message.received') || form.events.includes('message.sent');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-border max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{form.id ? 'Editar webhook' : 'Novo webhook'}</DialogTitle>
          <DialogDescription>
            Cada webhook recebe os eventos selecionados, assinados com HMAC-SHA256.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 -mx-1 px-1">
          <div>
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Integração n8n" />
          </div>

          <div>
            <Label>URL de destino</Label>
            <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://seu-n8n.com/webhook/..." />
          </div>

          <div>
            <Label>Segredo (HMAC)</Label>
            <div className="flex gap-2">
              <Input
                value={form.secret}
                onChange={(e) => setForm({ ...form, secret: e.target.value })}
                className="font-mono text-xs"
              />
              <Button type="button" variant="outline" onClick={() => setForm({ ...form, secret: generateSecret() })}>
                <RefreshCw className="h-4 w-4 mr-1" /> Gerar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => { navigator.clipboard.writeText(form.secret); toast.success('Copiado'); }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground/80 mt-1">
              Será usado para assinar cada requisição (header <code>X-Webhook-Signature</code>).
            </p>
          </div>

          <div>
            <Label>Eventos</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {AVAILABLE_EVENTS.map((ev) => {
                const checked = form.events.includes(ev.value);
                return (
                  <label
                    key={ev.value}
                    className="flex items-start gap-2 p-2 border border-border rounded-md cursor-pointer hover:bg-card"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setForm({
                          ...form,
                          events: v ? [...form.events, ev.value] : form.events.filter((e) => e !== ev.value),
                        });
                      }}
                    />
                    <div>
                      <div className="text-sm text-foreground">{ev.label}</div>
                      <code className="text-[10px] text-muted-foreground/80">{ev.value}</code>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {showInstanceFilter && (
            <div>
              <Label>Filtrar instâncias WhatsApp (opcional)</Label>
              <p className="text-xs text-muted-foreground/80 mb-2">
                Vazio = todas. Aplica-se aos eventos de mensagem.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {instances.map((inst) => {
                  const checked = form.instance_ids.includes(inst.id);
                  return (
                    <label
                      key={inst.id}
                      className="flex items-center gap-2 p-2 border border-border rounded-md cursor-pointer hover:bg-card"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setForm({
                            ...form,
                            instance_ids: v
                              ? [...form.instance_ids, inst.id]
                              : form.instance_ids.filter((i) => i !== inst.id),
                          });
                        }}
                      />
                      <span className="text-sm text-foreground">{inst.display_name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between p-3 border border-border rounded-md">
            <div>
              <Label>Ativo</Label>
              <p className="text-xs text-muted-foreground/80">Desative para pausar envios sem perder a configuração.</p>
            </div>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
