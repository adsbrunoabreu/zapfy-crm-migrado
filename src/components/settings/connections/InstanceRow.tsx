import { memo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  QrCode,
  Smartphone,
  RefreshCw,
  LogOut,
  Trash2,
  Webhook,
  Send,
  KeyRound,
  Wand2,
} from 'lucide-react';
import { formatPhoneBR } from '@/lib/phoneFormat';
import {
  COEX_PHASE_LABEL,
  coexPhaseTone,
  formatRelativeTime,
  STATUS_CONFIG,
  type WhatsAppInstance,
} from '@/components/settings/connections/types';

interface InstanceRowProps {
  instance: WhatsAppInstance;
  onConnect: (inst: WhatsAppInstance) => void;
  onTest: (inst: WhatsAppInstance) => void;
  onCheckStatus: (inst: WhatsAppInstance) => void;
  onReconnect: (inst: WhatsAppInstance) => void;
  onReprocess: (inst: WhatsAppInstance) => void;
  onShowWebhook: (inst: WhatsAppInstance) => void;
  onReapplyWebhook: (inst: WhatsAppInstance) => void;
  onLogout: (inst: WhatsAppInstance) => void;
  onDelete: (inst: WhatsAppInstance) => void;
}

function InstanceRowBase({
  instance: inst,
  onConnect,
  onTest,
  onCheckStatus,
  onReconnect,
  onReprocess,
  onShowWebhook,
  onReapplyWebhook,
  onLogout,
  onDelete,
}: InstanceRowProps) {
  const cfg = STATUS_CONFIG[inst.status] || STATUS_CONFIG.disconnected;
  const StatusIcon = cfg.icon;

  const handleConnect = useCallback(() => onConnect(inst), [onConnect, inst]);
  const handleTest = useCallback(() => onTest(inst), [onTest, inst]);
  const handleCheck = useCallback(() => onCheckStatus(inst), [onCheckStatus, inst]);
  const handleReconnect = useCallback(() => onReconnect(inst), [onReconnect, inst]);
  const handleReprocess = useCallback(() => onReprocess(inst), [onReprocess, inst]);
  const handleShowWebhook = useCallback(() => onShowWebhook(inst), [onShowWebhook, inst]);
  const handleReapply = useCallback(() => onReapplyWebhook(inst), [onReapplyWebhook, inst]);
  const handleLogout = useCallback(() => onLogout(inst), [onLogout, inst]);
  const handleDelete = useCallback(() => onDelete(inst), [onDelete, inst]);

  const isCloud = inst.provider === 'cloud_api';
  const isConnected = inst.status === 'connected';

  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-card/50 hover:bg-accent/30 transition-colors">
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-sm">{inst.display_name}</h4>
            {inst.mode === 'coexistence' && (
              <Badge
                variant="outline"
                className="bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))] border-[hsl(var(--primary)/0.20)] text-[10px] py-0 h-4"
              >
                Coexistência
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {inst.instance_name}
            {inst.phone_connected && ` • ${formatPhoneBR(inst.phone_connected)}`}
          </p>
          <p
            className="text-[10px] text-muted-foreground/70 mt-0.5 flex items-center gap-1"
            title={inst.updated_at ? new Date(inst.updated_at).toLocaleString('pt-BR') : 'Nunca sincronizado'}
          >
            <RefreshCw className="w-2.5 h-2.5" />
            Última sincronização: {formatRelativeTime(inst.updated_at)}
          </p>
          {inst.mode === 'coexistence' && inst.coexistence_state && (
            <div className="mt-1 space-y-0.5">
              <p className={`text-[10px] flex items-center gap-1 ${coexPhaseTone(inst.coexistence_state.contacts_status)}`}>
                <span className="font-medium">Contatos:</span>
                {COEX_PHASE_LABEL[inst.coexistence_state.contacts_status || ''] || inst.coexistence_state.contacts_status || 'Aguardando'}
              </p>
              <p className={`text-[10px] flex items-center gap-1 ${coexPhaseTone(inst.coexistence_state.history_status)}`}>
                <span className="font-medium">Histórico (6 meses):</span>
                {COEX_PHASE_LABEL[inst.coexistence_state.history_status || ''] || inst.coexistence_state.history_status || 'Aguardando'}
              </p>
              {inst.coexistence_state.error && (
                <p className="text-[10px] text-[hsl(var(--destructive))]" title={inst.coexistence_state.error}>
                  Erro: {String(inst.coexistence_state.error).slice(0, 60)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="outline" className={cfg.color}>
          <StatusIcon className="w-3 h-3 mr-1" />
          {cfg.label}
        </Badge>

        <div className="flex items-center gap-1">
          {!isConnected && !isCloud && (
            <Button variant="outline" size="sm" onClick={handleConnect}>
              <QrCode className="w-4 h-4 mr-1.5" />
              Conectar
            </Button>
          )}

          {(isConnected || isCloud) && (
            <Button variant="outline" size="sm" onClick={handleTest} title="Enviar mensagem de teste">
              <Send className="w-4 h-4 mr-1.5" />
              Testar
            </Button>
          )}

          {!isCloud && (
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={handleCheck} title="Verificar status">
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}

          {isCloud && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReconnect}
              title="Atualizar Access Token da API Oficial (Meta)"
            >
              <KeyRound className="w-4 h-4 mr-1.5" />
              Reconectar
            </Button>
          )}

          {isCloud && (
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8"
              onClick={handleReprocess}
              title="Reprocessar mensagens — recupera texto de stubs e marca pendentes antigas como falha"
            >
              <Wand2 className="w-4 h-4" />
            </Button>
          )}

          {isCloud ? (
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8"
              onClick={handleShowWebhook}
              title="Ver Callback URL e Verify Token do webhook"
            >
              <Webhook className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8"
              onClick={handleReapply}
              title="Reaplicar webhook (todos os eventos)"
            >
              <Webhook className="w-4 h-4" />
            </Button>
          )}

          {isConnected && !isCloud && (
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-[hsl(var(--amber))]"
              onClick={handleLogout}
              title="Desconectar"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 text-destructive"
            onClick={handleDelete}
            title="Remover instância"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export const InstanceRow = memo(InstanceRowBase);
