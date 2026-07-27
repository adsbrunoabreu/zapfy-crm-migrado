import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

type Bucket = { label: string; count: number; href: string; severity: 'high' | 'med' };

const THRESHOLDS = {
  message_insert: 10, // erros de persistência em 24h
  retry_dead: 20,     // retries esgotados em 24h
  proxy_error: 5,     // erros do proxy Evolution em 24h
};

async function fetchAlerts(): Promise<Bucket[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [insertErr, retryDead, proxyErr] = await Promise.all([
    supabase
      .from('system_logs')
      .select('id', { count: 'exact', head: true })
      .eq('event', 'message_insert')
      .eq('level', 'error')
      .gte('created_at', since),
    supabase
      .from('webhook_retry_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'dead')
      .gte('updated_at', since),
    supabase
      .from('system_logs')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'evolution-proxy')
      .eq('level', 'error')
      .gte('created_at', since),
  ]);

  const out: Bucket[] = [];
  if ((insertErr.count ?? 0) >= THRESHOLDS.message_insert)
    out.push({
      label: `${insertErr.count} falhas ao persistir mensagens (24h)`,
      count: insertErr.count!,
      href: '/admin/messaging?tab=messages',
      severity: 'high',
    });
  if ((retryDead.count ?? 0) >= THRESHOLDS.retry_dead)
    out.push({
      label: `${retryDead.count} retries esgotados (24h)`,
      count: retryDead.count!,
      href: '/admin/messaging?tab=retries',
      severity: 'high',
    });
  if ((proxyErr.count ?? 0) >= THRESHOLDS.proxy_error)
    out.push({
      label: `${proxyErr.count} erros no proxy Evolution (24h)`,
      count: proxyErr.count!,
      href: '/admin/messaging?tab=evolution',
      severity: 'med',
    });
  return out;
}

export default function MessagingAlertBanner() {
  const { data } = useQuery({
    queryKey: ['messaging-alerts-24h'],
    queryFn: fetchAlerts,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (!data || data.length === 0) return null;

  return (
    <div className="mx-4 mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-destructive mb-1">
            Problemas recorrentes detectados nas últimas 24h
          </div>
          <ul className="space-y-1">
            {data.map((b) => (
              <li key={b.label}>
                <Link
                  to={b.href}
                  className="text-xs text-foreground hover:underline inline-flex items-center gap-1"
                >
                  <span
                    className={
                      b.severity === 'high'
                        ? 'inline-block h-1.5 w-1.5 rounded-full bg-destructive'
                        : 'inline-block h-1.5 w-1.5 rounded-full bg-amber-500'
                    }
                  />
                  {b.label}
                  <ChevronRight className="h-3 w-3 opacity-60" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
