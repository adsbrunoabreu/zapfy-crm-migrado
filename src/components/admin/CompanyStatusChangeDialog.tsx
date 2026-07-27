import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Loader2, History, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdateCompany } from '@/hooks/useCompanies';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type PlanStatus = 'active' | 'trial' | 'suspended' | 'cancelled';

const statusMeta: Record<PlanStatus, { label: string; cls: string }> = {
  active: { label: 'Ativo', cls: 'bg-emerald/20 text-emerald border-emerald/30' },
  trial: { label: 'Trial', cls: 'bg-amber/20 text-amber border-amber/30' },
  suspended: { label: 'Suspenso', cls: 'bg-rose/20 text-rose border-rose/30' },
  cancelled: { label: 'Cancelado', cls: 'bg-muted text-muted-foreground border-border' },
};

const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Descreva o motivo (mínimo 5 caracteres)')
    .max(500, 'Máximo 500 caracteres'),
});

interface AuditEntry {
  id: string;
  previous_status: string | null;
  new_status: string;
  reason: string;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  companyName: string;
  currentStatus?: PlanStatus;
  targetStatus: PlanStatus;
}

export function CompanyStatusChangeDialog({
  open,
  onOpenChange,
  companyId,
  companyName,
  currentStatus,
  targetStatus,
}: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const updateCompany = useUpdateCompany();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['company-status-audit', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_status_audit')
        .select('id, previous_status, new_status, reason, created_at')
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as AuditEntry[];
    },
    enabled: open && !!companyId,
    staleTime: 30_000,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = schema.safeParse({ reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (!companyId || !user) return;

    setSubmitting(true);
    try {
      // 1. Atualiza status da empresa
      await updateCompany.mutateAsync({ id: companyId, plan_status: targetStatus });

      // 2. Registra auditoria
      const { error: auditError } = await supabase.from('company_status_audit').insert([
        {
          company_id: companyId,
          previous_status: currentStatus ?? null,
          new_status: targetStatus,
          reason: parsed.data.reason,
          changed_by: user.id,
        },
      ]);
      if (auditError) throw auditError;

      qc.invalidateQueries({ queryKey: ['company-status-audit', companyId] });
      toast({
        title: `Status alterado para ${statusMeta[targetStatus].label}`,
        description: 'Auditoria registrada com sucesso.',
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Alterar status do plano</DialogTitle>
            <DialogDescription>
              Empresa <span className="text-foreground font-medium">{companyName}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-3">
              {currentStatus && (
                <Badge variant="outline" className={statusMeta[currentStatus].cls}>
                  {statusMeta[currentStatus].label}
                </Badge>
              )}
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <Badge variant="outline" className={statusMeta[targetStatus].cls}>
                {statusMeta[targetStatus].label}
              </Badge>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status-reason">Motivo da alteração *</Label>
              <Textarea
                id="status-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Ex.: Pagamento confirmado, reativando acesso da equipe..."
              />
              <div className="flex justify-between">
                {error ? (
                  <p className="text-xs text-rose">{error}</p>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Será registrado para auditoria
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{reason.length}/500</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <History className="w-3.5 h-3.5" />
                Histórico recente
              </div>
              {loadingHistory ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : history.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  Nenhuma alteração registrada ainda.
                </p>
              ) : (
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {history.map((h) => (
                    <div
                      key={h.id}
                      className="text-xs border border-border rounded-md p-2.5 space-y-1"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {h.previous_status && (
                          <Badge
                            variant="outline"
                            className={
                              statusMeta[h.previous_status as PlanStatus]?.cls ?? 'text-xs'
                            }
                          >
                            {statusMeta[h.previous_status as PlanStatus]?.label ??
                              h.previous_status}
                          </Badge>
                        )}
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <Badge
                          variant="outline"
                          className={statusMeta[h.new_status as PlanStatus]?.cls ?? 'text-xs'}
                        >
                          {statusMeta[h.new_status as PlanStatus]?.label ?? h.new_status}
                        </Badge>
                        <span className="text-muted-foreground ml-auto">
                          {format(new Date(h.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <p className="text-foreground/80 line-clamp-2">{h.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || currentStatus === targetStatus}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar alteração
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
