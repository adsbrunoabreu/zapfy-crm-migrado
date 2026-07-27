import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Plus, Webhook } from 'lucide-react';

import { generateSecret, type WebhookRecord } from './webhooks/constants';
import { WebhookRow } from './webhooks/WebhookRow';
import { WebhookForm, type WebhookFormState } from './webhooks/WebhookForm';
import { DeliveriesPanel } from './webhooks/DeliveriesPanel';
import { DocsPanel } from './webhooks/DocsPanel';

const emptyForm = (): WebhookFormState => ({
  id: '', name: '', url: '', secret: generateSecret(),
  events: [], instance_ids: [], is_active: true,
});

export default function WebhookSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState('webhooks');

  const { data: profile } = useQuery({
    queryKey: ['user-profile', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles').select('company_id').eq('id', user!.id).maybeSingle();
      return data;
    },
  });
  const companyId = profile?.company_id;

  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ['webhooks', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhooks').select('*').eq('company_id', companyId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as WebhookRecord[];
    },
  });

  const { data: instances = [] } = useQuery({
    queryKey: ['whatsapp-instances-for-webhooks', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('id,display_name,instance_name')
        .eq('company_id', companyId!)
        .eq('is_active', true);
      return (data ?? []) as Array<{ id: string; display_name: string; instance_name: string }>;
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<WebhookFormState>(emptyForm());
  const [deleting, setDeleting] = useState<WebhookRecord | null>(null);

  function openCreate() {
    setForm(emptyForm());
    setOpen(true);
  }
  function openEdit(wh: WebhookRecord) {
    setForm({
      id: wh.id, name: wh.name, url: wh.url, secret: wh.secret,
      events: wh.events, instance_ids: wh.instance_ids, is_active: wh.is_active,
    });
    setOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('Sem empresa');
      if (!form.name.trim()) throw new Error('Nome obrigatório');
      try { new URL(form.url); } catch { throw new Error('URL inválida'); }
      if (!form.secret || form.secret.length < 16)
        throw new Error('Segredo deve ter ao menos 16 caracteres');
      if (form.events.length === 0) throw new Error('Selecione ao menos um evento');

      const payload = {
        company_id: companyId,
        name: form.name.trim(),
        url: form.url.trim(),
        secret: form.secret.trim(),
        events: form.events,
        instance_ids: form.instance_ids,
        is_active: form.is_active,
      };
      if (form.id) {
        const { error } = await supabase.from('webhooks').update(payload).eq('id', form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('webhooks').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Webhook salvo');
      qc.invalidateQueries({ queryKey: ['webhooks', companyId] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? 'Erro ao salvar'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('webhooks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Webhook removido');
      qc.invalidateQueries({ queryKey: ['webhooks', companyId] });
      setDeleting(null);
    },
    onError: (e: any) => toast.error(e.message ?? 'Erro'),
  });

  const testMut = useMutation({
    mutationFn: async (webhookId: string) => {
      const { data, error } = await supabase.functions.invoke('webhooks-dispatcher', {
        body: { action: 'test', webhook_id: webhookId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Evento de teste disparado');
      qc.invalidateQueries({ queryKey: ['webhook-deliveries', companyId] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Falha ao disparar teste'),
  });

  return (
    <Card className="p-6 bg-background border-border">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-card rounded-lg border border-border">
            <Webhook className="h-5 w-5 text-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Webhooks de saída</h3>
            <p className="text-sm text-muted-foreground/80">
              Receba eventos do CRM em sistemas como n8n, Make ou Zapier.
            </p>
          </div>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" /> Novo webhook
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="deliveries">Entregas</TabsTrigger>
          <TabsTrigger value="docs">Documentação</TabsTrigger>
        </TabsList>

        <TabsContent value="webhooks" className="mt-4 space-y-3">
          {isLoading && (
            <div className="text-muted-foreground/80 text-sm py-8 text-center">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Carregando…
            </div>
          )}
          {!isLoading && webhooks.length === 0 && (
            <div className="border border-dashed border-border rounded-lg p-10 text-center text-muted-foreground/80">
              Nenhum webhook configurado.
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" /> Criar o primeiro
                </Button>
              </div>
            </div>
          )}
          {webhooks.map((wh) => (
            <WebhookRow
              key={wh.id}
              webhook={wh}
              instancesCount={instances.length}
              onEdit={() => openEdit(wh)}
              onDelete={() => setDeleting(wh)}
              onTest={() => testMut.mutate(wh.id)}
              testing={testMut.isPending}
            />
          ))}
        </TabsContent>

        <TabsContent value="deliveries" className="mt-4">
          <DeliveriesPanel companyId={companyId} webhooks={webhooks} />
        </TabsContent>

        <TabsContent value="docs" className="mt-4">
          <DocsPanel />
        </TabsContent>
      </Tabs>

      <WebhookForm
        open={open}
        onOpenChange={setOpen}
        form={form}
        setForm={setForm}
        instances={instances}
        saving={saveMut.isPending}
        onSave={() => saveMut.mutate()}
      />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent className="bg-background border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.name}" será removido. As entregas históricas também serão apagadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive"
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
