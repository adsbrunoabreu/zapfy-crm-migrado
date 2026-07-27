import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, RefreshCw, ShieldOff, CheckCircle2, XCircle, Clock, Ghost } from 'lucide-react';
import { cn } from '@/lib/utils';

type Attempt = {
  id: string;
  company_id: string;
  conversation_id: string | null;
  message_kind: string;
  phase: 'started' | 'skipped' | 'sent' | 'failed';
  origin: string;
  off_hours_enabled: boolean | null;
  welcome_enabled: boolean | null;
  wait_time_enabled: boolean | null;
  feature_enabled_now: boolean | null;
  is_phantom: boolean;
  skip_reason: string | null;
  http_status: number | null;
  body_preview: string | null;
  instance_name: string | null;
  error_message: string | null;
  created_at: string;
};

const PHASE_META: Record<string, { label: string; icon: any; color: string }> = {
  started:  { label: 'Iniciado', icon: Clock,         color: 'bg-muted text-foreground border-border' },
  sent:     { label: 'Enviada',  icon: CheckCircle2,  color: 'bg-emerald/15 text-emerald border-emerald/30' },
  skipped:  { label: 'Bloqueada',icon: ShieldOff,     color: 'bg-amber/15 text-amber border-amber/30' },
  failed:   { label: 'Falha',    icon: XCircle,       color: 'bg-rose/15 text-rose border-rose/30' },
};

export function PhantomAttemptsPanel({ companyIdFilter }: { companyIdFilter?: string | null } = {}) {
  const [hours, setHours] = useState('24');
  const [filter, setFilter] = useState<'all' | 'phantom'>('phantom');

  const { data: attempts, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['auto-send-attempts', hours, filter, companyIdFilter ?? 'all'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - Number(hours) * 3600 * 1000).toISOString();
      let q = supabase
        .from('attendance_auto_send_attempts')
        .select('*')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(500);
      if (filter === 'phantom') q = q.eq('is_phantom', true);
      if (companyIdFilter) q = q.eq('company_id', companyIdFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Attempt[];
    },
    staleTime: 30_000,
  });

  const stats = useMemo(() => {
    const list = attempts || [];
    return {
      total: list.length,
      phantom: list.filter((a) => a.is_phantom).length,
      sent: list.filter((a) => a.phase === 'sent').length,
      skipped: list.filter((a) => a.phase === 'skipped').length,
      failed: list.filter((a) => a.phase === 'failed').length,
    };
  }, [attempts]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatCard label="Total" value={stats.total} icon={Clock} tone="zinc" />
        <StatCard label="Phantoms" value={stats.phantom} icon={Ghost} tone="rose" highlight />
        <StatCard label="Enviadas" value={stats.sent} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Bloqueadas" value={stats.skipped} icon={ShieldOff} tone="amber" />
        <StatCard label="Falhas" value={stats.failed} icon={XCircle} tone="rose" />
      </div>

      <Card className="p-3 bg-background border-border">
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-[200px] bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="phantom">⚠️ Apenas phantoms</SelectItem>
              <SelectItem value="all">Todas tentativas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="w-[160px] bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Última 1h</SelectItem>
              <SelectItem value="6">Últimas 6h</SelectItem>
              <SelectItem value="24">Últimas 24h</SelectItem>
              <SelectItem value="168">Últimos 7 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isFetching && 'animate-spin')} />
            Atualizar
          </Button>
          <div className="ml-auto text-[11px] text-muted-foreground/80">
            Phantom = mensagem enviada/processada com automação <strong>desativada</strong> no momento.
          </div>
        </div>
      </Card>

      <Card className="bg-background border-border">
        <ScrollArea className="h-[520px]">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground/80">Carregando…</div>
          ) : !attempts?.length ? (
            <div className="p-8 text-center text-sm text-muted-foreground/80">
              {filter === 'phantom' ? '✅ Nenhum envio fantasma detectado nesse período.' : 'Nenhuma tentativa encontrada.'}
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {attempts.map((a) => <AttemptRow key={a.id} a={a} />)}
            </div>
          )}
        </ScrollArea>
      </Card>
    </div>
  );
}

function AttemptRow({ a }: { a: Attempt }) {
  const phase = PHASE_META[a.phase] || PHASE_META.started;
  const PhaseIcon = phase.icon;
  return (
    <div className={cn('p-3 hover:bg-card/60 transition-colors', a.is_phantom && 'bg-rose/5')}>
      <div className="flex items-start gap-3">
        <Badge variant="outline" className={cn('shrink-0 gap-1.5 font-mono text-[10px]', phase.color)}>
          <PhaseIcon className="h-3 w-3" />
          {phase.label}
        </Badge>
        <Badge variant="outline" className="shrink-0 font-mono text-[10px] bg-card border-border text-foreground">
          {a.message_kind}
        </Badge>
        {a.is_phantom && (
          <Badge variant="outline" className="shrink-0 gap-1 font-mono text-[10px] bg-rose/15 text-rose border-rose/40 animate-pulse">
            <Ghost className="h-3 w-3" /> PHANTOM
          </Badge>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-foreground truncate">
            {a.body_preview || a.error_message || a.skip_reason || '—'}
          </div>
          <div className="text-[10px] text-muted-foreground/80 mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono">
            <span>origem: {a.origin}</span>
            {a.skip_reason && <span>motivo: {a.skip_reason}</span>}
            {a.http_status != null && <span>http: {a.http_status}</span>}
            {a.instance_name && <span>inst: {a.instance_name}</span>}
            <span>
              flags: off={String(a.off_hours_enabled)} welcome={String(a.welcome_enabled)} wait={String(a.wait_time_enabled)} → ativo_agora={String(a.feature_enabled_now)}
            </span>
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground/80 font-mono shrink-0">
          {format(new Date(a.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
        </div>
      </div>
      {a.is_phantom && (
        <div className="mt-2 ml-[88px] p-2 rounded border border-rose/30 bg-rose/5 text-[11px] text-rose flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Esta automação <strong>{a.message_kind}</strong> foi acionada mesmo com o flag desativado nas configurações. Verifique triggers Postgres antigos, fila pendente
            anterior à desativação, ou cache no cliente. A própria função bloqueou o envio antes de chegar ao WhatsApp se a fase for <em>skipped</em>.
          </span>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone, highlight }: { label: string; value: number; icon: any; tone: string; highlight?: boolean }) {
  const colors: Record<string, string> = {
    zinc: 'border-border text-foreground',
    emerald: 'border-emerald/30 text-emerald',
    amber: 'border-amber/30 text-amber',
    rose: 'border-rose/30 text-rose',
  };
  return (
    <Card className={cn('p-3 bg-background', colors[tone], highlight && value > 0 && 'ring-1 ring-rose/40')}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 opacity-80" />
        <span className="text-[10px] uppercase tracking-wider opacity-80">{label}</span>
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}
