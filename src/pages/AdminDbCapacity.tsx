import { useState } from 'react';
import { Database, Info, RefreshCw } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDatabaseOverview, useCompanyUsageOverview, type CompanyUsage } from '@/hooks/useDbCapacity';
import { DatabaseOverviewCards } from '@/components/admin/db-capacity/DatabaseOverviewCards';
import { TopTablesPanel } from '@/components/admin/db-capacity/TopTablesPanel';
import { CompanyConsumptionTable } from '@/components/admin/db-capacity/CompanyConsumptionTable';
import { CompanyUsageDrawer } from '@/components/admin/db-capacity/CompanyUsageDrawer';

export default function AdminDbCapacity() {
  const overview = useDatabaseOverview();
  const usage = useCompanyUsageOverview();
  const [selected, setSelected] = useState<CompanyUsage | null>(null);
  const [open, setOpen] = useState(false);

  const refreshing = overview.isFetching || usage.isFetching;
  const refresh = () => { overview.refetch(); usage.refetch(); };

  return (
    <PageShell
      icon={<Database className="w-5 h-5" />}
      title="Capacidade do banco"
      subtitle="Visão geral de consumo do banco de dados, top tabelas e uso por empresa."
      actions={
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      }
    >
      <div className="space-y-4">
        <Alert className="border-border bg-muted/30">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs text-muted-foreground">
            Backups automáticos e aumento de capacidade da infraestrutura são gerenciados pela plataforma Lovable Cloud.
            Este painel é informativo e ajuda a identificar empresas e tabelas com maior crescimento. Limites e expurgo on-demand
            podem ser adicionados em uma próxima onda.
          </AlertDescription>
        </Alert>

        <DatabaseOverviewCards
          overview={overview.data}
          totalMediaBytes={usage.data?.total_media_bytes}
          loading={overview.isLoading}
        />

        <TopTablesPanel tables={overview.data?.top_tables} loading={overview.isLoading} />

        <CompanyConsumptionTable
          companies={usage.data?.companies}
          loading={usage.isLoading}
          onSelect={(c) => { setSelected(c); setOpen(true); }}
        />

        <CompanyUsageDrawer company={selected} open={open} onOpenChange={setOpen} />
      </div>
    </PageShell>
  );
}
