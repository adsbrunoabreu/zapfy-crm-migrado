/**
 * DemoDataCard — exibe contagem de dados de exemplo da empresa e
 * permite que o admin remova tudo de uma vez (apaga somente registros
 * marcados com is_demo=true).
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Loader2, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Counts {
  leads?: number;
  conversations?: number;
  appointments?: number;
  tags?: number;
  pipelines?: number;
  professionals?: number;
}

interface Props {
  companyId: string;
}

export default function DemoDataCard({ companyId }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: counts, isLoading } = useQuery({
    queryKey: ['demo-data-counts', companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('count_company_demo_data' as any, {
        p_company_id: companyId,
      });
      if (error) throw error;
      return (data ?? {}) as Counts;
    },
  });

  const total =
    (counts?.leads ?? 0) +
    (counts?.conversations ?? 0) +
    (counts?.appointments ?? 0) +
    (counts?.tags ?? 0) +
    (counts?.pipelines ?? 0) +
    (counts?.professionals ?? 0);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('delete_company_demo_data' as any, {
        p_company_id: companyId,
      });
      if (error) throw error;
      return data as Counts;
    },
    onSuccess: (data) => {
      const removed =
        (data?.leads ?? 0) +
        (data?.conversations ?? 0) +
        (data?.appointments ?? 0) +
        (data?.tags ?? 0) +
        (data?.pipelines ?? 0) +
        (data?.professionals ?? 0);
      toast.success(`${removed} registros de exemplo removidos.`);
      setOpen(false);
      // Invalida tudo que pode mostrar dados demo
      queryClient.invalidateQueries({ queryKey: ['demo-data-counts', companyId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline_stages'] });
      queryClient.invalidateQueries({ queryKey: ['appointment-professionals'] });
      queryClient.invalidateQueries({ queryKey: ['appointment-reasons'] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Erro ao remover dados de exemplo.');
    },
  });

  return (
    <Card className="glass-card p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
          <FlaskConical className="w-5 h-5 text-primary" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Dados de exemplo</h3>
          <p className="text-sm text-muted-foreground">
            Sua conta foi criada com leads, conversas e agendamentos fictícios para você
            explorar o sistema. Quando estiver pronto para começar de verdade, remova-os.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : total === 0 ? (
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-4 text-center">
          Nenhum dado de exemplo restante. Sua operação está limpa ✨
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            <Pill label="Leads" value={counts?.leads ?? 0} />
            <Pill label="Conversas" value={counts?.conversations ?? 0} />
            <Pill label="Agendamentos" value={counts?.appointments ?? 0} />
            <Pill label="Tags" value={counts?.tags ?? 0} />
            <Pill label="Pipelines" value={counts?.pipelines ?? 0} />
            <Pill label="Profissionais" value={counts?.professionals ?? 0} />
          </div>

          <div className="flex justify-end pt-2 border-t border-border">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setOpen(true)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Excluir dados de exemplo
            </Button>
          </div>
        </>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir dados de exemplo?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os leads, conversas, agendamentos, tags e pipelines marcados como exemplo
              serão removidos permanentemente. Seus dados reais não serão afetados. Essa ação
              não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Pill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-secondary/40 text-foreground">
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
