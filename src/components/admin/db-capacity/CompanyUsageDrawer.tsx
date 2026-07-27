import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompanyGrowth, formatBytes, formatNumber, type CompanyUsage } from '@/hooks/useDbCapacity';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

interface Props {
  company: CompanyUsage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompanyUsageDrawer({ company, open, onOpenChange }: Props) {
  const { data, isLoading } = useCompanyGrowth(company?.company_id ?? null, 30);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl h-[100dvh] overflow-hidden p-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="p-6 flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle>{company?.company_name ?? 'Empresa'}</SheetTitle>
          <SheetDescription>
            Plano: {company?.plan_name ?? '—'} · Status: {company?.company_status ?? '—'}
          </SheetDescription>
        </SheetHeader>

        {company && (
          <div className="mt-5 space-y-5">
            <section>
              <h4 className="text-xs uppercase text-muted-foreground mb-2">Detalhamento</h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Leads', formatNumber(company.leads_count)],
                  ['Mensagens', formatNumber(company.messages_count)],
                  ['Conversas', formatNumber(company.conversations_count)],
                  ['Agendamentos', formatNumber(company.appointments_count)],
                  ['Produtos', formatNumber(company.products_count)],
                  ['Pedidos', formatNumber(company.orders_count)],
                  ['Logs do sistema', formatNumber(company.logs_count)],
                  ['Storage de mídia', formatBytes(company.media_bytes)],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-md border border-border bg-card p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="text-sm font-medium tabular-nums mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-md border border-border bg-card p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total estimado</p>
                <p className="text-xl font-semibold tabular-nums mt-0.5">{formatBytes(company.estimated_total_bytes)}</p>
              </div>
            </section>

            <section>
              <h4 className="text-xs uppercase text-muted-foreground mb-2">Crescimento (30 dias)</h4>
              <div className="rounded-md border border-border bg-card p-3 h-[220px]">
                {isLoading ? (
                  <Skeleton className="w-full h-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data?.series ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(d) => d.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Line type="monotone" dataKey="leads" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="messages" stroke="hsl(var(--accent-foreground))" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="orders" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          </div>
        )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
