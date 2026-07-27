import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Smartphone, Webhook } from 'lucide-react';
import ProviderSelector from '@/components/ProviderSelector';
import InstanceQueueSettings from '@/components/settings/InstanceQueueSettings';
import { usePlanLimitGuard } from '@/hooks/usePlanLimitGuard';
import { PlanLimitDialog } from '@/components/billing/PlanLimitDialog';
import { PlanLimitBanner } from '@/components/billing/PlanLimitBanner';

import { useWhatsAppInstances } from '@/hooks/useWhatsAppInstances';
import {
  callProxy,
  evolutionWebhookUrl,
  extractOwnerPhone,
  findInstanceInList,
  isInstanceConnected,
} from '@/components/settings/connections/proxyUtils';
import type { WhatsAppInstance } from '@/components/settings/connections/types';
import { InstanceRow } from '@/components/settings/connections/InstanceRow';
import { CreateInstanceDialog } from '@/components/settings/connections/CreateInstanceDialog';
import { QrCodeDialog } from '@/components/settings/connections/QrCodeDialog';
import { DeleteInstanceDialog } from '@/components/settings/connections/DeleteInstanceDialog';
import { TestMessageDialog } from '@/components/settings/connections/TestMessageDialog';
import { ReconnectCloudDialog } from '@/components/settings/connections/ReconnectCloudDialog';
import { CloudWebhookDialog } from '@/components/settings/connections/CloudWebhookDialog';

export default function ConnectionsSettings() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const planGuard = usePlanLimitGuard();
  const companyId = profile?.company_id;

  const { instances, loading, fetchInstances } = useWhatsAppInstances(companyId);

  const [planLimitDialogOpen, setPlanLimitDialogOpen] = useState(false);
  const [providerSelectorOpen, setProviderSelectorOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [qrInstance, setQrInstance] = useState<WhatsAppInstance | null>(null);
  const [qrInitial, setQrInitial] = useState<string | null>(null);

  const [deleteInstance, setDeleteInstance] = useState<WhatsAppInstance | null>(null);
  const [testInstance, setTestInstance] = useState<WhatsAppInstance | null>(null);
  const [reconnectInstance, setReconnectInstance] = useState<WhatsAppInstance | null>(null);
  const [webhookInstance, setWebhookInstance] = useState<WhatsAppInstance | null>(null);

  // ---- Row action handlers ----
  const handleOpenQr = useCallback((inst: WhatsAppInstance) => {
    setQrInitial(null);
    setQrInstance(inst);
  }, []);

  const handleOpenTest = useCallback((inst: WhatsAppInstance) => setTestInstance(inst), []);
  const handleOpenReconnect = useCallback((inst: WhatsAppInstance) => setReconnectInstance(inst), []);
  const handleShowWebhook = useCallback((inst: WhatsAppInstance) => setWebhookInstance(inst), []);
  const handleOpenDelete = useCallback((inst: WhatsAppInstance) => setDeleteInstance(inst), []);

  const handleCheckStatus = useCallback(
    async (inst: WhatsAppInstance) => {
      try {
        const state = await callProxy('connectionState', { instanceName: inst.instance_name });
        const isOpen = isInstanceConnected(state);
        const updatePayload: Record<string, unknown> = { status: isOpen ? 'connected' : 'disconnected' };

        if (isOpen) {
          try {
            const all = await callProxy('fetchInstances', {});
            const match = findInstanceInList(all, inst.instance_name);
            const phone = extractOwnerPhone(match) || extractOwnerPhone(all);
            if (phone) updatePayload.phone_connected = phone;
          } catch {
            /* ignore */
          }
        } else {
          updatePayload.phone_connected = null;
        }

        await (supabase as any).from('whatsapp_instances').update(updatePayload).eq('id', inst.id);
        try {
          await (supabase as any).rpc('log_instance_sync', {
            _instance_name: inst.instance_name,
            _phone: (updatePayload.phone_connected as string | undefined) || null,
            _success: isOpen,
          });
        } catch {
          /* best effort */
        }

        toast({
          title: isOpen ? 'Conectado' : 'Desconectado',
          description: `"${inst.display_name}" está ${isOpen ? 'conectada' : 'desconectada'}.`,
        });
        fetchInstances();
      } catch {
        toast({ title: 'Erro', description: 'Não foi possível verificar o status.', variant: 'destructive' });
      }
    },
    [fetchInstances, toast]
  );

  const handleLogout = useCallback(
    async (inst: WhatsAppInstance) => {
      try {
        await callProxy('logoutInstance', { instanceName: inst.instance_name });
        await (supabase as any)
          .from('whatsapp_instances')
          .update({ status: 'disconnected', phone_connected: null })
          .eq('id', inst.id);
        toast({ title: 'Desconectado', description: `"${inst.display_name}" foi desconectada.` });
        fetchInstances();
      } catch {
        toast({ title: 'Erro', description: 'Não foi possível desconectar.', variant: 'destructive' });
      }
    },
    [fetchInstances, toast]
  );

  const handleReapplyWebhook = useCallback(
    async (inst: WhatsAppInstance) => {
      try {
        const result: any = await callProxy('setWebhook', {
          instanceName: inst.instance_name,
          webhookUrl: evolutionWebhookUrl(),
        });
        if (result?.success === false) throw new Error('Resposta não-OK');
        toast({ title: 'Webhook aplicado', description: `Eventos atualizados em "${inst.display_name}".` });
      } catch (err: any) {
        toast({
          title: 'Erro',
          description: err?.message || 'Não foi possível aplicar o webhook.',
          variant: 'destructive',
        });
      }
    },
    [toast]
  );

  const handleReapplyWebhookAll = useCallback(async () => {
    if (instances.length === 0) return;
    toast({
      title: 'Aplicando webhook…',
      description: `Reconfigurando ${instances.length} instância(s).`,
    });
    let ok = 0;
    for (const inst of instances) {
      try {
        await callProxy('setWebhook', {
          instanceName: inst.instance_name,
          webhookUrl: evolutionWebhookUrl(),
        });
        ok++;
      } catch {
        /* segue */
      }
    }
    toast({ title: 'Webhooks atualizados', description: `${ok}/${instances.length} aplicadas com sucesso.` });
  }, [instances, toast]);

  const handleReprocessMessages = useCallback(
    async (inst: WhatsAppInstance) => {
      toast({
        title: 'Reprocessando mensagens…',
        description: `Analisando histórico de "${inst.display_name}".`,
      });
      try {
        const { data, error } = await supabase.functions.invoke('cloud-reprocess-messages', {
          body: { instance_id: inst.id },
        });
        if (error) throw new Error((error as any)?.message || 'Falha ao invocar função.');
        const recovered = (data as any)?.recovered ?? 0;
        const failedPending = (data as any)?.failed_pending ?? 0;
        const scanned = (data as any)?.scanned ?? 0;
        toast({
          title: 'Reprocessamento concluído',
          description: `${recovered} texto(s) recuperado(s) e ${failedPending} pendente(s) marcada(s) como falha. ${scanned} mensagem(ns) analisadas.`,
        });
      } catch (err: any) {
        toast({
          title: 'Erro',
          description: err?.message || 'Falha no reprocessamento.',
          variant: 'destructive',
        });
      }
    },
    [toast]
  );

  const handleCreated = useCallback(
    (newInst: WhatsAppInstance, qrBase64: string | null) => {
      if (qrBase64) {
        setQrInitial(qrBase64);
        setQrInstance(newInst);
      } else {
        // Fetch QR via connectInstance from inside dialog after small delay
        setTimeout(() => {
          setQrInitial(null);
          setQrInstance(newInst);
        }, 1500);
      }
    },
    []
  );

  if (loading) {
    return (
      <Card className="glass-card p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-display text-xl font-semibold">Conexões WhatsApp</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Gerencie suas instâncias de WhatsApp conectadas ao sistema
            </p>
          </div>
          <div className="flex items-center gap-2">
            {instances.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReapplyWebhookAll}
                title="Reaplicar webhook em todas as instâncias"
              >
                <Webhook className="w-4 h-4 mr-2" />
                Reaplicar webhooks
              </Button>
            )}
            <Button
              variant="glow"
              onClick={() => setProviderSelectorOpen(true)}
              disabled={!planGuard.canAddInstance}
              title={planGuard.instanceBlockedReason ?? undefined}
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Conexão
            </Button>
          </div>
        </div>

        {!planGuard.canAddInstance && planGuard.instanceBlockedReason && (
          <PlanLimitBanner message={planGuard.instanceBlockedReason} className="mb-4" />
        )}

        <ProviderSelector open={providerSelectorOpen} onOpenChange={setProviderSelectorOpen} />

        <PlanLimitDialog
          open={planLimitDialogOpen}
          onOpenChange={setPlanLimitDialogOpen}
          resource="instances"
          message={planGuard.instanceBlockedReason ?? undefined}
        />

        {instances.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Smartphone className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-medium text-lg mb-1">Nenhuma instância</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Crie sua primeira instância WhatsApp para começar a enviar e receber mensagens.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {instances.map((inst) => (
              <InstanceRow
                key={inst.id}
                instance={inst}
                onConnect={handleOpenQr}
                onTest={handleOpenTest}
                onCheckStatus={handleCheckStatus}
                onReconnect={handleOpenReconnect}
                onReprocess={handleReprocessMessages}
                onShowWebhook={handleShowWebhook}
                onReapplyWebhook={handleReapplyWebhook}
                onLogout={handleLogout}
                onDelete={handleOpenDelete}
              />
            ))}
          </div>
        )}
      </Card>

      <div className="mt-6">
        <InstanceQueueSettings />
      </div>

      <CreateInstanceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        companyId={companyId}
        canAddInstance={planGuard.canAddInstance}
        onPlanLimitHit={() => setPlanLimitDialogOpen(true)}
        onCreated={handleCreated}
        onRefetch={fetchInstances}
      />

      <QrCodeDialog
        open={!!qrInstance}
        onOpenChange={(o) => !o && setQrInstance(null)}
        instance={qrInstance}
        initialQr={qrInitial}
        companyId={companyId}
        onRefetch={fetchInstances}
      />

      <DeleteInstanceDialog
        open={!!deleteInstance}
        onOpenChange={(o) => !o && setDeleteInstance(null)}
        instance={deleteInstance}
        onDeleted={fetchInstances}
      />

      <TestMessageDialog
        open={!!testInstance}
        onOpenChange={(o) => !o && setTestInstance(null)}
        instance={testInstance}
      />

      <ReconnectCloudDialog
        open={!!reconnectInstance}
        onOpenChange={(o) => !o && setReconnectInstance(null)}
        instance={reconnectInstance}
        onRefetch={fetchInstances}
      />

      <CloudWebhookDialog
        instance={webhookInstance}
        onOpenChange={(o) => !o && setWebhookInstance(null)}
      />
    </>
  );
}
