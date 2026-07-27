import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton dedicado da tela de Chat — preserva o layout 3-painéis (instâncias |
 * lista de conversas | janela ativa) para evitar a sensação de "tela presa"
 * enquanto o chunk da página é baixado.
 */
export function ChatSkeleton() {
  return (
    <div className="h-full flex bg-background">
      {/* Coluna instâncias (estreita) */}
      <div className="w-16 border-r border-border/40 p-3 space-y-3 hidden md:flex md:flex-col">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="w-10 h-10 rounded-full" />
        ))}
      </div>
      {/* Coluna lista de conversas */}
      <div className="w-full md:w-80 border-r border-border/40 flex flex-col">
        <div className="p-4 border-b border-border/30 space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div className="p-3 space-y-2 flex-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Janela ativa */}
      <div className="flex-1 hidden md:flex flex-col">
        <div className="p-4 border-b border-border/30 flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex-1 p-6 space-y-3">
          <Skeleton className="h-12 w-2/3 rounded-2xl" />
          <Skeleton className="h-12 w-1/2 rounded-2xl ml-auto" />
          <Skeleton className="h-12 w-3/5 rounded-2xl" />
          <Skeleton className="h-12 w-1/3 rounded-2xl ml-auto" />
        </div>
        <div className="p-3 border-t border-border/30">
          <Skeleton className="h-11 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton para Financeiro/DRE/Relatórios — KPIs + gráficos.
 */
export function FinancialSkeleton() {
  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-72" />
        </div>
        <Skeleton className="h-10 w-64" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
