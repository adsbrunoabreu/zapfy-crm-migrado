import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Lightbulb,
  Settings,
  Clock,
  Copy,
  Power,
  PauseCircle,
  AlertTriangle,
  ArrowRight,
  Wand2,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type AttemptRow = {
  id: string;
  company_id: string;
  conversation_id: string | null;
  message_kind: string;
  phase: string;
  origin: string;
  skip_reason: string | null;
  off_hours_enabled: boolean | null;
  welcome_enabled: boolean | null;
  wait_time_enabled: boolean | null;
  feature_enabled_now: boolean | null;
  is_phantom: boolean;
  created_at: string;
};

type ConvRow = {
  id: string;
  contact_name: string | null;
  phone: string;
  lead_id: string | null;
  instance_name: string;
};

type SuggestionLevel = 'info' | 'warn' | 'error';

type Suggestion = {
  title: string;
  description: string;
  fix: string;
  icon: any;
  level: SuggestionLevel;
  cta?: { label: string; to: string };
};

const KIND_LABEL: Record<string, string> = {
  off_hours: 'Fora do horário',
  welcome: 'Boas-vindas',
  wait_time: 'Tempo de espera',
  supervisor_alert: 'Alerta supervisor',
  rating: 'Avaliação',
};

/**
 * Heurísticas: a partir do skip_reason e estado das flags, sugerir uma correção.
 */
function buildSuggestion(row: AttemptRow): Suggestion | null {
  const reason = (row.skip_reason ?? '').toLowerCase();
  const kindLabel = KIND_LABEL[row.message_kind] ?? row.message_kind;

  // Feature desligada
  if (reason.endsWith('_disabled') || reason === 'feature_disabled') {
    const map: Record<string, { flag: string; section: string }> = {
      off_hours: { flag: 'off_hours_enabled', section: 'business_hours' },
      welcome: { flag: 'welcome_enabled', section: 'general' },
      wait_time: { flag: 'wait_time_enabled', section: 'general' },
    };
    const m = map[row.message_kind];
    return {
      title: `Automação "${kindLabel}" está desativada`,
      description: 'A tentativa foi bloqueada porque a flag de ativação está OFF nas configurações de atendimento.',
      fix: m
        ? `Vá em Configurações de Atendimento → ${m.section} e ative "${m.flag}". Se for intencional, considere desativar o gatilho que enfileirou (trigger DB).`
        : 'Reative a automação correspondente nas configurações de atendimento.',
      icon: Power,
      level: 'warn',
      cta: { label: 'Abrir Configurações', to: '/attendance-settings' },
    };
  }

  // Plano inativo
  if (reason.includes('plan_inactive') || reason.includes('company_inactive') || reason.includes('plan_status')) {
    return {
      title: 'Plano da empresa inativo/suspenso',
      description: 'O envio foi bloqueado porque a empresa não está com plano ativo.',
      fix: 'Verifique status do plano no painel Master ou em Faturamento. Reative o plano para liberar automações.',
      icon: AlertTriangle,
      level: 'error',
      cta: { label: 'Ver Faturamento', to: '/billing' },
    };
  }

  // Duplicado recente
  if (reason.includes('duplicate') || reason.includes('already_sent') || reason.includes('recent')) {
    return {
      title: 'Mensagem duplicada bloqueada',
      description: 'Já foi enviada uma mensagem desse tipo recentemente para essa conversa — anti-spam atuou.',
      fix: 'Se isso é repetitivo, aumente a janela de deduplicação ou revise o gatilho que está enfileirando múltiplas vezes (ex.: o lead reabriu a conversa).',
      icon: Copy,
      level: 'info',
    };
  }

  // Fora do horário (mensagem comum não-off_hours bloqueada por horário)
  if (reason.includes('off_hours') || reason.includes('outside_business_hours')) {
    return {
      title: 'Bloqueada por estar fora do horário',
      description: 'A automação respeitou os horários comerciais configurados e não disparou.',
      fix: 'Se deveria disparar mesmo fora do horário, ajuste os dias/horas em Configurações → Horário comercial. Sábados e feriados também contam.',
      icon: Clock,
      level: 'info',
      cta: { label: 'Ajustar horários', to: '/attendance-settings' },
    };
  }

  // Configuração ausente
  if (reason.includes('missing') || reason.includes('not_configured') || reason.includes('no_template') || reason.includes('empty_message')) {
    return {
      title: 'Configuração ausente',
      description: 'A mensagem não pôde ser montada porque uma configuração obrigatória está vazia (ex.: corpo da mensagem ou template).',
      fix: 'Preencha o texto da mensagem correspondente em Configurações de Atendimento. Garanta que variáveis dinâmicas tenham fallback.',
      icon: Settings,
      level: 'warn',
      cta: { label: 'Abrir Configurações', to: '/attendance-settings' },
    };
  }

  // Instância desconectada
  if (reason.includes('instance') && (reason.includes('offline') || reason.includes('disconnected') || reason.includes('not_connected'))) {
    return {
      title: 'Instância WhatsApp desconectada',
      description: 'A Evolution API rejeitou o envio porque a instância vinculada não está conectada.',
      fix: 'Reconecte a instância em Conexões/Instâncias. O sistema também tentará reconectar automaticamente em background.',
      icon: AlertTriangle,
      level: 'error',
      cta: { label: 'Ver Instâncias', to: '/instances' },
    };
  }

  // Conversa pausada / handoff humano
  if (reason.includes('paused') || reason.includes('handoff') || reason.includes('human_takeover')) {
    return {
      title: 'Conversa pausada / em atendimento humano',
      description: 'A automação respeitou a pausa porque um atendente assumiu ou o agente IA está em handoff.',
      fix: 'Se deveria disparar mesmo assim, despause a conversa ou revise as regras de handoff/pausa.',
      icon: PauseCircle,
      level: 'info',
    };
  }

  // Lead/conversa sem dados
  if (reason.includes('no_lead') || reason.includes('no_conversation') || reason.includes('missing_phone')) {
    return {
      title: 'Lead/conversa sem dados obrigatórios',
      description: 'Faltou referência de lead, telefone ou conversa válida para enviar.',
      fix: 'Garanta que a conversa esteja vinculada a um lead com telefone E.164 e que a instância esteja definida.',
      icon: Wrench,
      level: 'warn',
    };
  }

  // Phantom: enviou com flag OFF
  if (row.is_phantom) {
    return {
      title: '⚠️ Phantom: enviou com automação desligada',
      description: 'A flag estava OFF mas a mensagem mesmo assim foi entregue. Isso indica gatilho legado ou cache.',
      fix: 'Cancele itens pendentes na fila com o trigger automático e revise quem está chamando o sender (process-attendance-queue ou trigger DB).',
      icon: AlertTriangle,
      level: 'error',
    };
  }

  // Genérico
  if (reason) {
    return {
      title: `Skip: ${reason}`,
      description: 'Motivo de skip não mapeado em sugestões automáticas.',
      fix: 'Inspecione os detalhes técnicos no log original e ajuste a configuração relevante.',
      icon: Lightbulb,
      level: 'info',
    };
  }

  return null;
}

const LEVEL_STYLES: Record<SuggestionLevel, string> = {
  info: 'border-cyan/30 bg-cyan/5',
  warn: 'border-amber/30 bg-amber/5',
  error: 'border-rose/30 bg-rose/5',
};

const LEVEL_ICON_COLOR: Record<SuggestionLevel, string> = {
  info: 'text-cyan',
  warn: 'text-amber',
  error: 'text-rose',
};

export function SkipSuggestionsPanel({ conversationId, companyIdFilter }: { conversationId?: string | null; companyIdFilter?: string | null }) {
  const { profile, roles } = useAuth();
  const isMaster = roles.includes('master');
  const companyId = profile?.company_id ?? null;

  const attemptsQuery = useQuery({
    queryKey: ['skip-suggestions-attempts', companyId, isMaster, conversationId, companyIdFilter ?? 'auto'],
    queryFn: async () => {
      let q = supabase
        .from('attendance_auto_send_attempts')
        .select('id, company_id, conversation_id, message_kind, phase, origin, skip_reason, off_hours_enabled, welcome_enabled, wait_time_enabled, feature_enabled_now, is_phantom, created_at')
        .or('phase.eq.skipped,is_phantom.eq.true')
        .order('created_at', { ascending: false })
        .limit(300);
      // Master pode passar empresa específica via prop; demais caem no próprio company_id
      if (companyIdFilter) q = q.eq('company_id', companyIdFilter);
      else if (!isMaster && companyId) q = q.eq('company_id', companyId);
      if (conversationId) q = q.eq('conversation_id', conversationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AttemptRow[];
    },
    refetchInterval: 15_000,
  });

  const conversationIds = useMemo(() => {
    const ids = new Set<string>();
    (attemptsQuery.data ?? []).forEach(a => { if (a.conversation_id) ids.add(a.conversation_id); });
    return Array.from(ids);
  }, [attemptsQuery.data]);

  const conversationsQuery = useQuery({
    queryKey: ['skip-suggestions-convs', conversationIds],
    queryFn: async () => {
      if (!conversationIds.length) return new Map<string, ConvRow>();
      const { data } = await supabase
        .from('conversations')
        .select('id, contact_name, phone, lead_id, instance_name')
        .in('id', conversationIds)
        .limit(500);
      return new Map((data ?? []).map(c => [c.id, c as ConvRow]));
    },
    enabled: conversationIds.length > 0,
    staleTime: 60_000,
  });

  // Agrupar por (conversation_id + skip_reason) para evitar repetição
  const grouped = useMemo(() => {
    const map = new Map<string, { rows: AttemptRow[]; suggestion: Suggestion; conv?: ConvRow }>();
    (attemptsQuery.data ?? []).forEach(row => {
      const sug = buildSuggestion(row);
      if (!sug) return;
      const key = `${row.conversation_id ?? 'global'}::${row.message_kind}::${row.skip_reason ?? (row.is_phantom ? 'phantom' : 'unknown')}`;
      const existing = map.get(key);
      const conv = row.conversation_id ? conversationsQuery.data?.get(row.conversation_id) : undefined;
      if (existing) {
        existing.rows.push(row);
      } else {
        map.set(key, { rows: [row], suggestion: sug, conv });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.rows.length - a.rows.length);
  }, [attemptsQuery.data, conversationsQuery.data]);

  const summary = useMemo(() => {
    const byLevel = { info: 0, warn: 0, error: 0 };
    grouped.forEach(g => { byLevel[g.suggestion.level] += 1; });
    return byLevel;
  }, [grouped]);

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-background border-border">
        <div className="flex items-start gap-3">
          <Wand2 className="w-5 h-5 text-violet-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-foreground">Sugestões de correção</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Baseado nos últimos motivos de bloqueio (<strong>skip_reason</strong>) e tentativas phantom detectadas.
              {conversationId && <span className="ml-1 text-cyan">Filtrando esta conversa.</span>}
            </p>
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="text-rose">{summary.error} críticas</span>
              <span className="text-amber">{summary.warn} avisos</span>
              <span className="text-cyan">{summary.info} info</span>
            </div>
          </div>
        </div>
      </Card>

      <ScrollArea className="h-[560px]">
        <div className="space-y-2 pr-2">
          {attemptsQuery.isLoading ? (
            <p className="text-center text-sm text-muted-foreground py-10">Analisando tentativas...</p>
          ) : grouped.length === 0 ? (
            <Card className="p-8 bg-background border-border text-center">
              <Lightbulb className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">Nenhum problema detectado nas últimas tentativas.</p>
            </Card>
          ) : (
            grouped.map((g, idx) => {
              const Icon = g.suggestion.icon;
              const last = g.rows[0];
              return (
                <Card key={idx} className={cn('p-3 border', LEVEL_STYLES[g.suggestion.level])}>
                  <div className="flex items-start gap-3">
                    <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', LEVEL_ICON_COLOR[g.suggestion.level])} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-medium text-foreground">{g.suggestion.title}</h4>
                        <Badge variant="outline" className="border-border text-[10px] h-5">
                          {KIND_LABEL[last.message_kind] ?? last.message_kind}
                        </Badge>
                        <Badge variant="outline" className="border-border text-[10px] h-5">
                          {g.rows.length}× ocorrência{g.rows.length > 1 ? 's' : ''}
                        </Badge>
                        {last.skip_reason && (
                          <code className="text-[10px] text-muted-foreground bg-card px-1.5 py-0.5 rounded">
                            {last.skip_reason}
                          </code>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">{g.suggestion.description}</p>
                      <div className="mt-2 p-2 bg-muted/40 border border-border rounded text-xs">
                        <p className="text-[10px] uppercase tracking-wide text-emerald font-medium mb-1 flex items-center gap-1">
                          <Wrench className="w-3 h-3" /> Correção sugerida
                        </p>
                        <p className="text-foreground/90">{g.suggestion.fix}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {g.conv && (
                          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                            <ArrowRight className="w-3 h-3" />
                            {g.conv.contact_name || g.conv.phone}
                            {g.conv.instance_name && <span className="text-muted-foreground/80">· {g.conv.instance_name}</span>}
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground ml-auto">
                          última {formatDistanceToNow(new Date(last.created_at), { locale: ptBR, addSuffix: true })}
                        </span>
                        {g.suggestion.cta && (
                          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
                            <Link to={g.suggestion.cta.to}>{g.suggestion.cta.label}</Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
