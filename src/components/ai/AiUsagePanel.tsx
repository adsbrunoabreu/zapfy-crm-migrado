import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { MessageSquare, Coins, Hash, CalendarClock, AlertTriangle, Ban, ArrowUpRight } from 'lucide-react';

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtNum(v: number) {
  return v.toLocaleString('pt-BR');
}

export default function AiUsagePanel() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  const { data: limits } = useQuery({
    queryKey: ['ai-limits-panel', companyId],
    enabled: !!companyId,
    staleTime: 120_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_agent_limits')
        .select('monthly_message_cap, monthly_token_cap, currently_blocked, blocked_reason')
        .eq('company_id', companyId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: addon } = useQuery({
    queryKey: ['ai-addon-panel', companyId],
    enabled: !!companyId,
    staleTime: 120_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('company_addons')
        .select('included_messages, overage_price_per_message, monthly_price, is_active')
        .eq('company_id', companyId!)
        .eq('addon_slug', 'ai_agent')
        .eq('is_active', true)
        .maybeSingle();
      return data;
    },
  });

  const { data: usage } = useQuery({
    queryKey: ['ai-usage-panel', companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('ai_agent_runs')
        .select('messages_consumed, tokens_in, tokens_out, cost_brl, status')
        .eq('company_id', companyId!)
        .gte('created_at', start.toISOString())
        .limit(5000);
      const rows = data || [];
      return {
        msgs: rows.reduce((s, r: any) => s + (r.messages_consumed || 0), 0),
        tokens: rows.reduce((s, r: any) => s + (r.tokens_in || 0) + (r.tokens_out || 0), 0),
        cost: rows.reduce((s, r: any) => s + Number(r.cost_brl || 0), 0),
        runs: rows.length,
      };
    },
  });

  const msgCap = limits?.monthly_message_cap || addon?.included_messages || 0;
  const tokenCap = limits?.monthly_token_cap || 0;
  const used = usage?.msgs || 0;
  const tokens = usage?.tokens || 0;
  const cost = usage?.cost || 0;
  const msgPct = msgCap > 0 ? Math.min(100, Math.round((used / msgCap) * 100)) : 0;
  const tokenPct = tokenCap > 0 ? Math.min(100, Math.round((tokens / tokenCap) * 100)) : 0;
  const isHard = msgCap > 0 && used >= msgCap;
  const isSoft = msgCap > 0 && msgPct >= 80 && !isHard;

  const nextRenewal = new Date();
  nextRenewal.setMonth(nextRenewal.getMonth() + 1);
  nextRenewal.setDate(1);

  return (
    <div className="space-y-4">
      {isHard && (
        <Card className="p-4 border-l-4 border-l-rose-500 bg-rose/5">
          <div className="flex items-start gap-3">
            <Ban className="w-5 h-5 text-rose shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="font-semibold text-rose">Limite de mensagens atingido</p>
              <p className="text-xs text-muted-foreground">
                Seu agente não enviará novas respostas até a renovação ou o ajuste do plano. Fale com o comercial para liberar mais mensagens.
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/subscription">
                Ver plano <ArrowUpRight className="w-3.5 h-3.5 ml-1.5" />
              </Link>
            </Button>
          </div>
        </Card>
      )}
      {isSoft && (
        <Card className="p-4 border-l-4 border-l-amber-500 bg-amber/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="font-semibold text-amber">Você atingiu {msgPct}% do limite</p>
              <p className="text-xs text-muted-foreground">
                Considere ampliar seu pacote para evitar bloqueio do agente neste ciclo.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground tracking-wide flex items-center gap-1">
            <MessageSquare className="w-3.5 h-3.5" /> MENSAGENS
          </p>
          <p className="text-2xl font-semibold">{fmtNum(used)}</p>
          <p className="text-[11px] text-muted-foreground">de {msgCap > 0 ? fmtNum(msgCap) : '∞'}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground tracking-wide flex items-center gap-1">
            <Coins className="w-3.5 h-3.5" /> CUSTO
          </p>
          <p className="text-2xl font-semibold">{fmtBRL(cost)}</p>
          <p className="text-[11px] text-muted-foreground">Ciclo atual</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground tracking-wide flex items-center gap-1">
            <Hash className="w-3.5 h-3.5" /> TOKENS
          </p>
          <p className="text-2xl font-semibold">{fmtNum(tokens)}</p>
          <p className="text-[11px] text-muted-foreground">de {tokenCap > 0 ? fmtNum(tokenCap) : '∞'}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground tracking-wide flex items-center gap-1">
            <CalendarClock className="w-3.5 h-3.5" /> PRÓXIMA RENOVAÇÃO
          </p>
          <p className="text-2xl font-semibold">
            {nextRenewal.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </p>
          <p className="text-[11px] text-muted-foreground">{usage?.runs || 0} interações</p>
        </Card>
      </div>

      {(msgCap > 0 || tokenCap > 0) && (
        <Card className="p-4 space-y-3">
          {msgCap > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Mensagens</span>
                <span className="font-medium">{msgPct}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${isHard ? 'bg-rose' : isSoft ? 'bg-amber' : 'bg-emerald'}`}
                  style={{ width: `${msgPct}%` }}
                />
              </div>
            </div>
          )}
          {tokenCap > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Tokens</span>
                <span className="font-medium">{tokenPct}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-cyan transition-all" style={{ width: `${tokenPct}%` }} />
              </div>
            </div>
          )}
        </Card>
      )}

      {addon && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Plano IA contratado</p>
              <p className="text-sm font-medium">
                {fmtBRL(Number(addon.monthly_price || 0))}/mês ·{' '}
                {fmtNum(addon.included_messages || 0)} msgs incluídas
              </p>
              <p className="text-[11px] text-muted-foreground">
                Mensagem excedente: {fmtBRL(Number(addon.overage_price_per_message || 0))}
              </p>
            </div>
            <Badge variant="outline" className="bg-emerald/10 text-emerald border-emerald/20">
              Ativo
            </Badge>
          </div>
        </Card>
      )}
    </div>
  );
}
