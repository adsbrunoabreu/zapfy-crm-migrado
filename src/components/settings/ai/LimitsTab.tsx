import { memo, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Save, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { REASON_LABEL, type AiAgentLimitsRow } from './types';

interface LimitsStatus {
  currently_blocked?: boolean;
  reason?: string | null;
  blocked_until?: string | null;
  usage?: { today_msgs?: number; month_msgs?: number; month_tokens?: number; month_cost_brl?: number };
  limits?: { daily_message_cap?: number; monthly_message_cap?: number; monthly_token_cap?: number; monthly_cost_cap_brl?: number };
}

function UsageBoxBase({ label, value, cap }: { label: string; value: string; cap: string }) {
  return (
    <div className="rounded border border-border bg-muted/30 p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
      <p className="text-[10px] text-muted-foreground">{cap}</p>
    </div>
  );
}
const UsageBox = memo(UsageBoxBase);

function LimitsTabBase({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: row, isLoading } = useQuery({
    queryKey: ['ai-agent-limits', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_agent_limits')
        .select('*').eq('company_id', companyId).maybeSingle();
      return (data as unknown) as AiAgentLimitsRow | null;
    },
    staleTime: 60_000,
  });

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['ai-agent-limits-status', companyId],
    queryFn: async () => {
      const { data } = await supabase.rpc('check_ai_agent_limits', { _company_id: companyId });
      return data as unknown as LimitsStatus;
    },
    refetchInterval: 60_000,
  });

  const [form, setForm] = useState<Partial<AiAgentLimitsRow>>({});
  useEffect(() => {
    if (row) setForm(row);
    else setForm({
      daily_message_cap: 0, monthly_message_cap: 0, monthly_token_cap: 0,
      monthly_cost_cap_brl: 0, block_when_exceeded: true, send_block_message: true,
      block_message_to_client: 'No momento estou indisponível. Em breve um atendente humano falará com você.',
      notify_admins_on_block: true,
      allow_single_agent_fallback: true,
    });
  }, [row]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        company_id: companyId,
        daily_message_cap: Math.max(0, Number(form.daily_message_cap || 0)),
        monthly_message_cap: Math.max(0, Number(form.monthly_message_cap || 0)),
        monthly_token_cap: Math.max(0, Number(form.monthly_token_cap || 0)),
        monthly_cost_cap_brl: Math.max(0, Number(form.monthly_cost_cap_brl || 0)),
        block_when_exceeded: !!form.block_when_exceeded,
        send_block_message: !!form.send_block_message,
        block_message_to_client: (form.block_message_to_client || '').slice(0, 500),
        notify_admins_on_block: !!form.notify_admins_on_block,
        allow_single_agent_fallback: form.allow_single_agent_fallback !== false,
      };
      const { error } = await supabase
        .from('ai_agent_limits')
        .upsert(payload, { onConflict: 'company_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Limites salvos' });
      qc.invalidateQueries({ queryKey: ['ai-agent-limits', companyId] });
      refetchStatus();
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' }),
  });

  const unblock = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('ai_agent_limits')
        .update({
          currently_blocked: false, blocked_until: null,
          blocked_reason: null, blocked_at: null,
        })
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Agente desbloqueado' });
      qc.invalidateQueries({ queryKey: ['ai-agent-limits', companyId] });
      refetchStatus();
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) {
    return <div className="p-6 text-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 mx-auto animate-spin" /></div>;
  }

  const u = status?.usage || {};
  const lim = status?.limits || {};
  const isBlocked = !!status?.currently_blocked;
  const reason = status?.reason as string | null;

  const fmtBrl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtNum = (n: number) => Number(n || 0).toLocaleString('pt-BR');

  return (
    <div className="space-y-4">
      <Card className={`p-4 ${isBlocked ? 'border-destructive/40 bg-destructive/5' : 'border-emerald/30 bg-emerald/5'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {isBlocked
                ? <XCircle className="w-4 h-4 text-destructive" />
                : <CheckCircle2 className="w-4 h-4 text-emerald" />}
              <p className="font-medium text-sm">
                {isBlocked ? 'Agente bloqueado' : 'Agente operando dentro dos limites'}
              </p>
            </div>
            {isBlocked && (
              <p className="text-xs text-muted-foreground">
                Motivo: <strong>{REASON_LABEL[reason || ''] || reason}</strong>
                {status?.blocked_until && <> · até {format(new Date(status.blocked_until), "dd/MM HH:mm", { locale: ptBR })}</>}
              </p>
            )}
          </div>
          {isBlocked && (
            <Button size="sm" variant="outline" onClick={() => unblock.mutate()} disabled={unblock.isPending}>
              {unblock.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              Desbloquear agora
            </Button>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <p className="font-medium text-sm mb-3">Uso atual</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <UsageBox label="Mensagens hoje" value={fmtNum(u.today_msgs ?? 0)} cap={(lim.daily_message_cap ?? 0) > 0 ? `/ ${fmtNum(lim.daily_message_cap!)}` : '· sem limite'} />
          <UsageBox label="Mensagens no mês" value={fmtNum(u.month_msgs ?? 0)} cap={(lim.monthly_message_cap ?? 0) > 0 ? `/ ${fmtNum(lim.monthly_message_cap!)}` : '· sem limite'} />
          <UsageBox label="Tokens no mês" value={fmtNum(u.month_tokens ?? 0)} cap={(lim.monthly_token_cap ?? 0) > 0 ? `/ ${fmtNum(lim.monthly_token_cap!)}` : '· sem limite'} />
          <UsageBox label="Custo no mês" value={fmtBrl(u.month_cost_brl ?? 0)} cap={(lim.monthly_cost_cap_brl ?? 0) > 0 ? `/ ${fmtBrl(lim.monthly_cost_cap_brl!)}` : '· sem limite'} />
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <div>
          <p className="font-medium text-sm">Limites operacionais</p>
          <p className="text-xs text-muted-foreground">Use <strong>0</strong> para "sem limite". Janelas resetam automaticamente conforme o fuso da empresa.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Mensagens por dia</Label>
            <Input type="number" min={0}
              value={form.daily_message_cap ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, daily_message_cap: Number(e.target.value) }))} />
          </div>
          <div className="space-y-2">
            <Label>Mensagens por mês</Label>
            <Input type="number" min={0}
              value={form.monthly_message_cap ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, monthly_message_cap: Number(e.target.value) }))} />
          </div>
          <div className="space-y-2">
            <Label>Tokens por mês (in + out)</Label>
            <Input type="number" min={0}
              value={form.monthly_token_cap ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, monthly_token_cap: Number(e.target.value) }))} />
          </div>
          <div className="space-y-2">
            <Label>Teto de custo por mês (R$)</Label>
            <Input type="number" min={0} step="0.01"
              value={form.monthly_cost_cap_brl ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, monthly_cost_cap_brl: Number(e.target.value) }))} />
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Bloquear agente ao exceder</p>
              <p className="text-xs text-muted-foreground">Se desligado, apenas registra/notifica sem parar o agente.</p>
            </div>
            <Switch
              checked={!!form.block_when_exceeded}
              onCheckedChange={(v) => setForm((f) => ({ ...f, block_when_exceeded: v }))} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Notificar administradores por e-mail</p>
              <p className="text-xs text-muted-foreground">1 e-mail por dia enquanto o bloqueio estiver ativo.</p>
            </div>
            <Switch
              checked={!!form.notify_admins_on_block}
              onCheckedChange={(v) => setForm((f) => ({ ...f, notify_admins_on_block: v }))} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Enviar mensagem ao cliente quando bloquear</p>
              <p className="text-xs text-muted-foreground">Avisa apenas 1x por janela de bloqueio para não soar robótico.</p>
            </div>
            <Switch
              checked={!!form.send_block_message}
              onCheckedChange={(v) => setForm((f) => ({ ...f, send_block_message: v }))} />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border">
            <div className="pr-3">
              <p className="text-sm">Usar único agente ativo se não houver pipeline padrão</p>
              <p className="text-xs text-muted-foreground">
                Quando ligado, conversas sem pipeline definida usam automaticamente o único agente ativo da empresa.
                Quando desligado, a IA não responde e exige configuração manual de pipeline padrão.
              </p>
            </div>
            <Switch
              checked={form.allow_single_agent_fallback !== false}
              onCheckedChange={(v) => setForm((f) => ({ ...f, allow_single_agent_fallback: v }))} />
          </div>

          <div className="space-y-2">
            <Label>Mensagem ao cliente</Label>
            <Textarea
              rows={3} maxLength={500}
              disabled={!form.send_block_message}
              value={form.block_message_to_client || ''}
              onChange={(e) => setForm((f) => ({ ...f, block_message_to_client: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">Máx 500 caracteres.</p>
          </div>
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">
          {save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar limites
        </Button>
      </Card>
    </div>
  );
}

export const LimitsTab = memo(LimitsTabBase);
