import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageShell } from '@/components/layout/PageShell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bot, Settings as SettingsIcon, BookOpen, Activity, Sparkle, History, Lock, Smartphone, FlaskConical } from 'lucide-react';
import AiAgentSetup from '@/components/ai/AiAgentSetup';
import AiKnowledgeBaseTab from '@/components/ai/AiKnowledgeBaseTab';
import AiAgentHistory from '@/components/ai/AiAgentHistory';
import QualifiedLeadsPanel from '@/components/ai/QualifiedLeadsPanel';
import AiAgentTestModal from '@/components/ai/AiAgentTestModal';
import AiStatusCard from '@/components/ai/AiStatusCard';
import AiUsagePanel from '@/components/ai/AiUsagePanel';

const VALID = ['setup', 'kb', 'usage', 'leads', 'history'] as const;
type TabKey = (typeof VALID)[number];

const MODEL_LABEL: Record<string, string> = {
  'google/gemini-2.5-flash': 'Gemini 2.5 Flash',
  'google/gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
  'google/gemini-2.5-pro': 'Gemini 2.5 Pro',
};

export default function AiHub() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as TabKey;
  const tab: TabKey = (VALID as readonly string[]).includes(raw) ? raw : 'setup';
  const setTab = (v: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', v);
    setParams(next, { replace: true });
  };

  const { data: company } = useQuery({
    queryKey: ['company-ai-flag', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from('companies').select('ai_agent_enabled').eq('id', companyId!).maybeSingle();
      return data;
    },
  });

  const enabled = !!company?.ai_agent_enabled;

  const { data: instances = [] } = useQuery({
    queryKey: ['whatsapp-instances', companyId],
    enabled: !!companyId && enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, display_name, status, phone_connected')
        .eq('company_id', companyId!)
        .order('created_at', { ascending: true })
        .limit(50);
      return data || [];
    },
  });
  const [instanceId, setInstanceId] = useState<string>('');
  const [testOpen, setTestOpen] = useState(false);

  const { data: agents = [] } = useQuery({
    queryKey: ['ai-agents', companyId],
    enabled: !!companyId && enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_agents').select('id, instance_id, name, emoji, is_active, model, paused_until')
        .eq('company_id', companyId!).limit(50);
      return data || [];
    },
  });

  useEffect(() => {
    if (!instanceId && instances[0]) setInstanceId(instances[0].id);
  }, [instances, instanceId]);

  const currentAgent = useMemo(
    () => agents.find((a: any) => a.instance_id === instanceId) || null,
    [agents, instanceId]
  );
  const currentInstance = useMemo(
    () => instances.find((i: any) => i.id === instanceId) || null,
    [instances, instanceId]
  );

  const isPaused = !!(currentAgent?.paused_until && new Date(currentAgent.paused_until) > new Date());
  const statusLabel = !currentAgent
    ? { label: 'Não configurado', cls: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground' }
    : isPaused
      ? { label: 'Pausado', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dot: 'bg-amber-400' }
      : currentAgent.is_active
        ? { label: 'Ativo', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' }
        : { label: 'Desativado', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20', dot: 'bg-rose-400' };

  // Stats curtas (taxa de sucesso simplificada)
  const { data: stats } = useQuery({
    queryKey: ['ai-hub-stats', companyId, currentAgent?.id],
    enabled: !!companyId && !!currentAgent?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from('ai_agent_runs')
        .select('status', { count: 'exact', head: false })
        .eq('agent_id', currentAgent!.id)
        .gte('created_at', since)
        .limit(1000);
      const total = data?.length || 0;
      const ok = (data || []).filter((r: any) => r.status === 'done').length;
      return { total, success: total > 0 ? Math.round((ok / total) * 100) : 0 };
    },
  });

  if (!enabled) {
    return (
      <PageShell title="Inteligência Artificial" subtitle="Add-on">
        <Card className="p-8 text-center space-y-3">
          <div className="w-14 h-14 rounded-xl bg-muted/50 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="font-semibold">Módulo IA de Atendimento</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Este módulo é um item adicional. Entre em contato com seu gerente comercial para
            contratar e liberar o uso de agentes IA na sua empresa.
          </p>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={
        <span className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-violet" />
          Inteligência Artificial
        </span>
      }
      subtitle="Configure o agente, base de conhecimento, consumo e leads qualificados"
    >
      {/* Status Card */}
      <AiStatusCard companyId={companyId || null} agent={currentAgent} />

      {/* Header bar com instância + ações */}
      <Card className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline" className={`${statusLabel.cls} gap-1.5`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusLabel.dot}`} />
              {statusLabel.label}
            </Badge>
            {stats && stats.total > 0 && (
              <span className="text-[11px] text-muted-foreground">
                Taxa de sucesso (7d): <strong className="text-foreground">{stats.success}%</strong> em {stats.total} runs
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setTestOpen(true)} disabled={!currentAgent}>
              <FlaskConical className="w-3.5 h-3.5 mr-1.5" />
              Testar agente
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link to="?tab=leads">
                <Sparkle className="w-3.5 h-3.5 mr-1.5" /> Leads
              </Link>
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5" />
            Instância WhatsApp:
          </span>
          {instances.length === 0 ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/settings?tab=whatsapp">Conectar um número primeiro</Link>
            </Button>
          ) : (
            <Select value={instanceId} onValueChange={setInstanceId}>
              <SelectTrigger className="h-8 max-w-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {instances.map((i: any) => {
                  const has = agents.some((a: any) => a.instance_id === i.id);
                  const connected = i.status === 'connected' || i.status === 'open';
                  return (
                    <SelectItem key={i.id} value={i.id}>
                      <span className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
                        {i.display_name || i.instance_name}
                        {i.phone_connected && <span className="text-[10px] text-muted-foreground">{i.phone_connected}</span>}
                        {has && <span className="text-[10px] text-violet ml-1">● agente</span>}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
        </div>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="setup" className="gap-1.5">
            <SettingsIcon className="w-3.5 h-3.5" /> Setup
          </TabsTrigger>
          <TabsTrigger value="kb" className="gap-1.5" disabled={!currentAgent}>
            <BookOpen className="w-3.5 h-3.5" /> Base de Conhecimento
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Consumo
          </TabsTrigger>
          <TabsTrigger value="leads" className="gap-1.5">
            <Sparkle className="w-3.5 h-3.5" /> Leads
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5" disabled={!currentAgent}>
            <History className="w-3.5 h-3.5" /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="mt-2">
          {instanceId ? (
            <AiAgentSetup instanceId={instanceId} instanceLabel={currentInstance?.display_name || currentInstance?.instance_name} instancePhone={currentInstance?.phone_connected} />
          ) : (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              Conecte uma instância WhatsApp em Configurações para configurar um agente.
            </Card>
          )}
        </TabsContent>

        <TabsContent value="kb" className="mt-2">
          <AiKnowledgeBaseTab agentId={currentAgent?.id || null} companyId={companyId || null} />
        </TabsContent>

        <TabsContent value="usage" className="mt-2">
          <AiUsagePanel />
        </TabsContent>

        <TabsContent value="leads" className="mt-2">
          <QualifiedLeadsPanel />
        </TabsContent>

        <TabsContent value="history" className="mt-2">
          <AiAgentHistory
            agentId={currentAgent?.id || null}
            agentName={currentAgent?.name}
          />
        </TabsContent>
      </Tabs>

      <AiAgentTestModal
        open={testOpen}
        onOpenChange={setTestOpen}
        agentId={currentAgent?.id || null}
        agentName={currentAgent?.name}
        agentEmoji={currentAgent?.emoji}
      />
    </PageShell>
  );
}
