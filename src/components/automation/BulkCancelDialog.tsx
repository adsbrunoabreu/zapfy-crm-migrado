import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const KINDS = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'off_hours', label: 'Fora do horário' },
  { value: 'welcome', label: 'Boas-vindas' },
  { value: 'wait_time', label: 'Tempo de espera' },
  { value: 'supervisor_alert', label: 'Alerta supervisor' },
  { value: 'rating', label: 'Avaliação' },
];

interface Props {
  /** Pré-filtra por empresa específica (ex.: empresa selecionada na auditoria) */
  defaultCompanyId?: string | null;
  /** Pré-filtra por conversa específica */
  defaultConversationId?: string | null;
  /** Texto do botão (default "Cancelar em massa") */
  triggerLabel?: string;
  /** Variante do botão */
  triggerVariant?: 'default' | 'outline' | 'destructive' | 'ghost';
  /** Tamanho do botão */
  triggerSize?: 'sm' | 'default' | 'lg';
  /** Callback após sucesso */
  onCancelled?: (count: number) => void;
}

export function BulkCancelDialog({
  defaultCompanyId = null,
  defaultConversationId = null,
  triggerLabel = 'Cancelar em massa',
  triggerVariant = 'destructive',
  triggerSize = 'sm',
  onCancelled,
}: Props) {
  const { roles } = useAuth();
  const isMaster = roles.includes('master');
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('all');
  const [olderMin, setOlderMin] = useState<string>('');
  const [reason, setReason] = useState('Cancelamento em massa pelo admin');
  const [confirmText, setConfirmText] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('cancel_attendance_queue_bulk', {
        _reason: reason || 'Cancelamento em massa pelo admin',
        _company_id: defaultCompanyId ?? null,
        _conversation_id: defaultConversationId ?? null,
        _message_kind: kind === 'all' ? null : kind,
        _older_than_minutes: olderMin ? parseInt(olderMin, 10) : null,
        _max_items: 1000,
      } as any);
      if (error) throw error;
      const result = data as { ok: boolean; cancelled?: number; error?: string };
      if (!result?.ok) throw new Error(result?.error ?? 'Falha desconhecida');
      return result.cancelled ?? 0;
    },
    onSuccess: (count) => {
      toast.success(
        count === 0
          ? 'Nenhum item correspondia aos filtros.'
          : `${count} mensagem(ns) cancelada(s) com sucesso.`
      );
      qc.invalidateQueries({ queryKey: ['automation-queue'] });
      qc.invalidateQueries({ queryKey: ['conv-timeline'] });
      qc.invalidateQueries({ queryKey: ['auto-send-attempts'] });
      qc.invalidateQueries({ queryKey: ['skip-suggestions-attempts'] });
      qc.invalidateQueries({ queryKey: ['automation-audit-logs'] });
      setOpen(false);
      setConfirmText('');
      onCancelled?.(count);
    },
    onError: (err: any) => {
      toast.error(`Erro: ${err?.message ?? 'falha ao cancelar'}`);
    },
  });

  const canConfirm = confirmText.trim().toUpperCase() === 'CANCELAR' && !mutation.isPending;

  const scopeLabel = defaultConversationId
    ? 'apenas desta conversa'
    : defaultCompanyId
      ? (isMaster ? 'da empresa selecionada' : 'da sua empresa')
      : (isMaster ? 'de TODAS as empresas' : 'da sua empresa');

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}>
          <Trash2 className="w-4 h-4 mr-2" />
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-background border-border max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-foreground">
            <AlertTriangle className="w-5 h-5 text-amber" />
            Remoção em massa de mensagens automáticas
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            Esta ação cancela todas as mensagens com status <strong className="text-foreground">pendente</strong> ou{' '}
            <strong className="text-foreground">processando</strong> {scopeLabel}, marcando como{' '}
            <code className="text-rose text-xs">failed</code>. Itens já enviados não são afetados.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs text-muted-foreground">Tipo de mensagem</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="mt-1 bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map(k => (
                  <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">
              Apenas itens com mais de (minutos) — opcional
            </Label>
            <Input
              type="number"
              min={0}
              placeholder="ex.: 30 (vazio = todos)"
              value={olderMin}
              onChange={(e) => setOlderMin(e.target.value)}
              className="mt-1 bg-card border-border"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Motivo (registrado no log)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              className="mt-1 bg-card border-border"
            />
          </div>

          <div className="rounded border border-rose/30 bg-rose/5 p-2.5">
            <Label className="text-xs text-rose font-medium">
              Para confirmar, digite <code className="bg-card px-1 rounded">CANCELAR</code>
            </Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="CANCELAR"
              className="mt-1 bg-card border-rose/40 font-mono uppercase"
              autoComplete="off"
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            Limite por execução: 1000 itens. Cada cancelamento gera entrada de auditoria.
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending} className="border-border">
            Voltar
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm}
            onClick={(e) => {
              e.preventDefault();
              if (canConfirm) mutation.mutate();
            }}
            className="bg-rose hover:bg-rose text-white"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Cancelando...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" /> Cancelar agora
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
