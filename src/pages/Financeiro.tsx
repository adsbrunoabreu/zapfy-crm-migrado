import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageShell } from '@/components/layout/PageShell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutDashboard, ArrowDownCircle, ArrowUpCircle, Tags, FileText, BarChart3 } from 'lucide-react';
import {
  FinancialDashboard,
  FinancialDashboardFiltersBar,
  getDefaultFinancialFilters,
  type FinancialDashboardFilters,
} from '@/components/financeiro/FinancialDashboard';
import { EntriesTable } from '@/components/financeiro/EntriesTable';
import { CategoriesPanel } from '@/components/financeiro/CategoriesPanel';
import { BudgetsPanel, BudgetsFiltersBar, getDefaultBudgetsFilters, type BudgetsFilters } from '@/components/financeiro/BudgetsPanel';
import { DRETab } from '@/components/financeiro/dre/DRETab';
import { useAuth } from '@/contexts/AuthContext';
import { useReportsRealtime } from '@/hooks/useReportsRealtime';

type TabKey = 'overview' | 'budgets' | 'receivables' | 'payables' | 'categories' | 'dre';
const VALID: TabKey[] = ['overview', 'budgets', 'receivables', 'payables', 'categories', 'dre'];

export default function Financeiro() {
  const { profile } = useAuth();
  useReportsRealtime(profile?.company_id ?? undefined);
  const [params, setParams] = useSearchParams();
  const tab = useMemo<TabKey>(() => {
    const t = params.get('tab') as TabKey | null;
    return t && VALID.includes(t) ? t : 'overview';
  }, [params]);

  const [filters, setFilters] = useState<FinancialDashboardFilters>(() => getDefaultFinancialFilters());
  const [budgetFilters, setBudgetFilters] = useState<BudgetsFilters>(() => getDefaultBudgetsFilters());

  useEffect(() => {
    if (!params.get('tab')) {
      const n = new URLSearchParams(params);
      n.set('tab', 'overview');
      setParams(n, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (v: string) => {
    const n = new URLSearchParams(params);
    n.set('tab', v);
    setParams(n, { replace: true });
  };

  return (
    <PageShell
      title="Financeiro"
      subtitle="Painel financeiro espelhando as fichas do pipeline, contas a pagar/receber e categorias."
      actions={
        tab === 'overview' ? (
          <FinancialDashboardFiltersBar value={filters} onChange={setFilters} />
        ) : tab === 'budgets' ? (
          <BudgetsFiltersBar value={budgetFilters} onChange={setBudgetFilters} />
        ) : undefined
      }
    >
      <Tabs value={tab} onValueChange={onChange}>
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <LayoutDashboard className="w-4 h-4 mr-2" />Visão geral
          </TabsTrigger>
          <TabsTrigger value="budgets" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <FileText className="w-4 h-4 mr-2" />Orçamentos
          </TabsTrigger>
          <TabsTrigger value="receivables" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <ArrowDownCircle className="w-4 h-4 mr-2" />A receber
          </TabsTrigger>
          <TabsTrigger value="payables" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <ArrowUpCircle className="w-4 h-4 mr-2" />A pagar
          </TabsTrigger>
          <TabsTrigger value="categories" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Tags className="w-4 h-4 mr-2" />Categorias
          </TabsTrigger>
          <TabsTrigger value="dre" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <BarChart3 className="w-4 h-4 mr-2" />DRE
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4"><FinancialDashboard filters={filters} /></TabsContent>
        <TabsContent value="budgets" className="mt-4"><BudgetsPanel filters={budgetFilters} /></TabsContent>
        <TabsContent value="receivables" className="mt-4"><EntriesTable kind="receivable" /></TabsContent>
        <TabsContent value="payables" className="mt-4"><EntriesTable kind="payable" /></TabsContent>
        <TabsContent value="categories" className="mt-4"><CategoriesPanel /></TabsContent>
        <TabsContent value="dre" className="mt-4"><DRETab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
