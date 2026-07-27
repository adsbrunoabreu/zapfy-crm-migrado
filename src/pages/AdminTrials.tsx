import { useMemo, useState } from 'react';
import { Hourglass, RefreshCw, Search, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface TrialCompany {
  id: string;
  name: string;
  email: string | null;
  plan_status: string;
  trial_ends_at: string | null;
  created_at: string;
}

function useTrialCompanies() {
  return useQuery({
    queryKey: ['admin', 'trial-companies'],
    staleTime: 60_000,
    queryFn: async (): Promise<TrialCompany[]> => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, email, plan_status, trial_ends_at, created_at')
        .eq('plan_status', 'trial')
        .order('trial_ends_at', { ascending: true, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as TrialCompany[];
    },
  });
}

function formatHoursLeft(ms: number): string {
  if (ms <= 0) return 'expirado';
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}min`;
  return `${h}h ${m}min`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

type TabKey = 'active' | 'expired' | 'all';

export default function AdminTrials() {
  const { data, isLoading, isFetching, refetch } = useTrialCompanies();
  const [tab, setTab] = useState<TabKey>('active');
  const [q, setQ] = useState('');

  const enriched = useMemo(() => {
    const now = Date.now();
    return (data ?? []).map((c) => {
      const ends = c.trial_ends_at ? new Date(c.trial_ends_at).getTime() : null;
      const ms = ends == null ? null : ends - now;
      const expired = ms != null && ms <= 0;
      return { ...c, ms, expired };
    });
  }, [data]);

  const counts = useMemo(() => ({
    active: enriched.filter((c) => !c.expired).length,
    expired: enriched.filter((c) => c.expired).length,
    all: enriched.length,
  }), [enriched]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return enriched.filter((c) => {
      if (tab === 'active' && c.expired) return false;
      if (tab === 'expired' && !c.expired) return false;
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        (c.email ?? '').toLowerCase().includes(term)
      );
    });
  }, [enriched, tab, q]);

  return (
    <PageShell
      icon={<Hourglass className="w-5 h-5" />}
      title="Trials ativos e expirados"
      subtitle="Acompanhe horas restantes do trial de 24h e identifique empresas que precisam migrar para um plano pago."
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SummaryCard
            icon={<Clock className="w-4 h-4" />}
            label="Trials ativos"
            value={counts.active}
            tone="primary"
            loading={isLoading}
          />
          <SummaryCard
            icon={<AlertTriangle className="w-4 h-4" />}
            label="Trials expirados"
            value={counts.expired}
            tone="rose"
            loading={isLoading}
          />
          <SummaryCard
            icon={<CheckCircle2 className="w-4 h-4" />}
            label="Total em trial"
            value={counts.all}
            tone="muted"
            loading={isLoading}
          />
        </div>

        <Card className="p-3 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <TabsList>
              <TabsTrigger value="active">Ativos ({counts.active})</TabsTrigger>
              <TabsTrigger value="expired">Expirados ({counts.expired})</TabsTrigger>
              <TabsTrigger value="all">Todos ({counts.all})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full sm:max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por empresa ou e-mail"
              className="pl-8 h-9"
            />
          </div>
        </Card>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Termina em</TableHead>
                <TableHead className="text-right">Tempo restante</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-12">
                    Nenhuma empresa encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => {
                  const expired = c.expired;
                  const urgent = !expired && c.ms != null && c.ms <= 6 * 60 * 60 * 1000;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <Link to={`/admin/companies?id=${c.id}`} className="hover:underline">
                          {c.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{c.email ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDateTime(c.created_at)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDateTime(c.trial_ends_at)}</TableCell>
                      <TableCell className={`text-right text-sm tabular-nums ${
                        expired ? 'text-rose' : urgent ? 'text-[hsl(var(--amber))]' : 'text-foreground'
                      }`}>
                        {c.ms == null ? '—' : formatHoursLeft(c.ms)}
                      </TableCell>
                      <TableCell className="text-right">
                        {expired ? (
                          <Badge variant="outline" className="border-rose/40 bg-rose/10 text-rose">
                            Expirado
                          </Badge>
                        ) : urgent ? (
                          <Badge variant="outline" className="border-[hsl(var(--amber)/0.40)] bg-[hsl(var(--amber)/0.10)] text-[hsl(var(--amber))]">
                            Urgente
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                            Ativo
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </PageShell>
  );
}

function SummaryCard({
  icon, label, value, tone, loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'primary' | 'rose' | 'muted';
  loading: boolean;
}) {
  const toneCls =
    tone === 'rose'
      ? 'text-rose bg-rose/10 border-rose/30'
      : tone === 'primary'
        ? 'text-primary bg-primary/10 border-primary/30'
        : 'text-muted-foreground bg-muted/40 border-border';
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${toneCls}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="h-6 w-12 mt-1" />
        ) : (
          <p className="text-xl font-semibold tabular-nums">{value}</p>
        )}
      </div>
    </Card>
  );
}
