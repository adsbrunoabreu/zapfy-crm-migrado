import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, Pause, RefreshCw, XCircle } from 'lucide-react';
import { DemoDataPanel } from '../DemoDataPanel';
import type { PlanStatus } from './types';

interface Props {
  companyId: string | null;
  companyName: string;
  companyStatus?: PlanStatus;
  companyUpdatePending: boolean;
  subscription: any;
  upsertPending: boolean;

  onStatusChange: (next: PlanStatus) => void;
  onRenew: () => void;
  onCancel: () => void;
  onRequestDelete: () => void;
}

export function ActionsTab({
  companyId,
  companyName,
  companyStatus,
  companyUpdatePending,
  subscription,
  upsertPending,
  onStatusChange,
  onRenew,
  onCancel,
  onRequestDelete,
}: Props) {
  return (
    <>
      <Card className="p-4 space-y-3">
        <div>
          <p className="text-sm font-medium">Status da empresa</p>
          <p className="text-xs text-muted-foreground">
            Suspende ou reativa o acesso da empresa imediatamente.
          </p>
        </div>
        <div className="flex gap-2">
          {companyStatus === 'suspended' ? (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onStatusChange('active')}
              disabled={companyUpdatePending}
            >
              <CheckCircle2 className="w-4 h-4 mr-2 text-emerald" />
              Ativar empresa
            </Button>
          ) : (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onStatusChange('suspended')}
              disabled={companyUpdatePending}
            >
              <Pause className="w-4 h-4 mr-2 text-rose" />
              Suspender empresa
            </Button>
          )}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div>
          <p className="text-sm font-medium">Assinatura</p>
          <p className="text-xs text-muted-foreground">
            Renove um novo período ou cancele a assinatura vigente.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onRenew}
            disabled={!subscription || upsertPending}
          >
            <RefreshCw className="w-4 h-4 mr-2 text-emerald" />
            Renovar período
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={onCancel}
            disabled={!subscription || subscription.status === 'canceled' || upsertPending}
          >
            <XCircle className="w-4 h-4 mr-2 text-rose" />
            Cancelar
          </Button>
        </div>
      </Card>

      {companyId && <DemoDataPanel companyId={companyId} companyName={companyName} />}

      <Separator />

      <div className="rounded-lg border border-rose/30 bg-rose/5 p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">Zona de perigo</p>
          <p className="text-xs text-muted-foreground">
            Exclui permanentemente a empresa. Só permitido se não houver usuários, leads ou conversas.
          </p>
        </div>
        <Button variant="destructive" onClick={onRequestDelete} className="w-full">
          <XCircle className="w-4 h-4 mr-2" />
          Excluir empresa permanentemente
        </Button>
      </div>
    </>
  );
}
