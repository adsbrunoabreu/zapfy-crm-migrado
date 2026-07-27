import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useMedicalPieBreakdowns, type PieSlice } from '@/hooks/medical/useMedicalPieBreakdowns';
import { Stethoscope, UserRound, ShieldPlus, Building2 } from 'lucide-react';

interface Props {
  practiceId: string;
  filters: {
    from?: Date;
    to?: Date;
    doctorId?: string | null;
    procedureId?: string | null;
  };
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(217 91% 60%)',
  'hsl(160 84% 45%)',
  'hsl(38 92% 55%)',
  'hsl(280 75% 60%)',
  'hsl(0 84% 60%)',
  'hsl(190 80% 50%)',
  'hsl(50 90% 55%)',
];

function truncate(s: string, n = 18) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function PieCard({ title, icon, data }: { title: string; icon: React.ReactNode; data: PieSlice[] }) {
  const total = data.reduce((s, d) => s + Number(d.count || 0), 0);
  const MAX = 6;
  const sorted = [...data].sort((a, b) => Number(b.count) - Number(a.count));
  const hasOverflow = sorted.length > MAX;
  const head = hasOverflow ? sorted.slice(0, MAX - 1) : sorted.slice(0, MAX);
  const rest = hasOverflow ? sorted.slice(MAX - 1) : [];
  const restTotal = rest.reduce((s, d) => s + Number(d.count || 0), 0);
  const top = [
    ...head.map((d) => ({ name: d.name, value: Number(d.count) })),
    ...(restTotal > 0 ? [{ name: `Outros (${rest.length})`, value: restTotal }] : []),
  ];

  return (
    <Card className="p-4 lg:p-5 animate-fade-in h-full flex flex-col">
      <div className="mb-3 flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {icon}
        </div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>

      {top.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground py-8">
          Nenhum registro
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-3 min-h-0">
          <div className="w-[55%] h-[180px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={top}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={36}
                  outerRadius={64}
                  paddingAngle={2}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                >
                  {top.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                    color: 'hsl(var(--foreground))',
                  }}
                  formatter={(value: number, name: string) => {
                    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                    return [`${value} (${pct}%)`, name];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex-1 min-w-0 flex flex-col gap-1.5">
            {top.map((item, i) => (
              <li key={i} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span
                  className="w-2 h-2 rounded-sm shrink-0"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="truncate" title={item.name}>{truncate(item.name, 14)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function MedicalPieBreakdowns({ practiceId, filters }: Props) {
  const { data, isLoading } = useMedicalPieBreakdowns(practiceId, filters);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-5 w-32 mb-3" />
            <Skeleton className="h-[220px] w-full" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <PieCard
        title="Procedimentos"
        icon={<Stethoscope className="w-4 h-4" />}
        data={data?.procedures ?? []}
      />
      <PieCard
        title="Médicos"
        icon={<UserRound className="w-4 h-4" />}
        data={data?.doctors ?? []}
      />
      <PieCard
        title="Convênios"
        icon={<ShieldPlus className="w-4 h-4" />}
        data={data?.insurances ?? []}
      />
      <PieCard
        title="Hospitais"
        icon={<Building2 className="w-4 h-4" />}
        data={data?.hospitals ?? []}
      />
    </div>
  );
}
