import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Bot, Sparkles, ShoppingBag, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCompaniesWithAddons,
  useToggleCompanyAddon,
  type AddonField,
  type CompanyAddonRow,
} from '@/hooks/useAdminAddons';
import { cn } from '@/lib/utils';

const ADDON_LABELS: Record<AddonField, string> = {
  ai_agent_enabled: 'Agente IA',
  automations_enabled: 'Automações',
  ecommerce_enabled: 'e-Commerce',
};

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: 'Ativa', className: 'bg-emerald/10 text-emerald border-emerald/30' },
    trial: { label: 'Trial', className: 'bg-cyan/10 text-cyan border-cyan/30' },
    suspended: { label: 'Suspensa', className: 'bg-amber/10 text-amber border-amber/30' },
    canceled: { label: 'Cancelada', className: 'bg-destructive/10 text-destructive border-destructive/30' },
  };
  const v = map[status ?? 'active'] ?? { label: status ?? '—', className: 'bg-muted text-muted-foreground' };
  return <Badge variant="outline" className={v.className}>{v.label}</Badge>;
}

function ActiveAddonsChips({ row }: { row: CompanyAddonRow }) {
  const items: Array<{ on: boolean; icon: typeof Bot; label: string; cls: string }> = [
    { on: row.ai_agent_enabled, icon: Bot, label: 'IA', cls: 'bg-violet-500/10 text-violet-300 border-violet-500/30' },
    { on: row.automations_enabled, icon: Sparkles, label: 'Auto', cls: 'bg-amber/10 text-amber border-amber/30' },
    { on: row.ecommerce_enabled, icon: ShoppingBag, label: 'Loja', cls: 'bg-emerald/10 text-emerald border-emerald/30' },
  ];
  const active = items.filter((i) => i.on);
  if (!active.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {active.map((i) => (
        <span key={i.label}
          className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px]', i.cls)}>
          <i.icon className="h-3 w-3" /> {i.label}
        </span>
      ))}
    </div>
  );
}

export function CompaniesTab() {
  const { data: companies = [], isLoading } = useCompaniesWithAddons();
  const toggle = useToggleCompanyAddon();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return companies.filter((c) => {
      if (statusFilter !== 'all' && (c.status ?? 'active') !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!c.name.toLowerCase().includes(q) && !(c.cnpj ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [companies, search, statusFilter]);

  const handleToggle = async (row: CompanyAddonRow, field: AddonField, value: boolean) => {
    try {
      await toggle.mutateAsync({ companyId: row.id, field, value });
      toast.success(`${ADDON_LABELS[field]} ${value ? 'ativado' : 'desativado'} para ${row.name}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao atualizar add-on');
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 bg-background border-border">
        <div className="flex flex-col md:flex-row gap-2 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou CNPJ..."
              className="pl-8 bg-card border-border"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-48 bg-card border-border">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="active">Ativas</SelectItem>
              <SelectItem value="trial">Trial</SelectItem>
              <SelectItem value="suspended">Suspensas</SelectItem>
              <SelectItem value="canceled">Canceladas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="bg-background border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Empresa</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Add-ons em uso</TableHead>
              <TableHead className="text-center">
                <div className="inline-flex items-center gap-1.5">
                  <Bot className="h-3.5 w-3.5" /> Agente IA
                </div>
              </TableHead>
              <TableHead className="text-center">
                <div className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> Automações
                </div>
              </TableHead>
              <TableHead className="text-center">
                <div className="inline-flex items-center gap-1.5">
                  <ShoppingBag className="h-3.5 w-3.5" /> Loja
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin inline-block text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  Nenhuma empresa encontrada.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((c) => (
              <TableRow key={c.id} className="border-border">
                <TableCell>
                  <div className="font-medium">{c.name}</div>
                  {c.cnpj && <div className="text-xs text-muted-foreground">{c.cnpj}</div>}
                </TableCell>
                <TableCell>
                  <span className="text-sm">{c.plan_name ?? '—'}</span>
                </TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                </TableCell>
                <TableCell>
                  <ActiveAddonsChips row={c} />
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={c.ai_agent_enabled}
                    onCheckedChange={(v) => handleToggle(c, 'ai_agent_enabled', v)}
                    disabled={toggle.isPending}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={c.automations_enabled}
                    onCheckedChange={(v) => handleToggle(c, 'automations_enabled', v)}
                    disabled={toggle.isPending}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={c.ecommerce_enabled}
                    onCheckedChange={(v) => handleToggle(c, 'ecommerce_enabled', v)}
                    disabled={toggle.isPending}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
