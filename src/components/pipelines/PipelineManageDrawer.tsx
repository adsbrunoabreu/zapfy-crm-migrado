import { useState, useMemo, useEffect } from 'react';
import { Settings2, Pencil, Layers, Users, Trash2, AlertTriangle, Loader2, Lock } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { type Pipeline, type PipelineStage, useDeletePipeline } from '@/hooks/usePipelines';
import { EditPipelineForm } from './EditPipelineDialog';
import { ManageStagesContent } from './ManageStagesDialog';
import { PipelineMembersContent } from './PipelineMembersDialog';
import { useAuth } from '@/contexts/AuthContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type ManageTab = 'editar' | 'etapas' | 'membros' | 'excluir';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline | null;
  stages: PipelineStage[];
  defaultTab?: ManageTab;
  onDeleted?: () => void;
}

export function PipelineManageDrawer({
  open,
  onOpenChange,
  pipeline,
  stages,
  defaultTab = 'editar',
  onDeleted,
}: Props) {
  const [tab, setTab] = useState<ManageTab>(defaultTab);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deletePipeline = useDeletePipeline();
  const { isMaster, isCompanyAdmin } = useAuth();

  // RBAC: master = tudo; company_admin = editar/etapas/membros; user = somente leitura
  const perms = useMemo(() => ({
    canEdit: isCompanyAdmin,
    canManageStages: isCompanyAdmin,
    canManageMembers: isCompanyAdmin,
    canDelete: isMaster, // exclusão restrita ao Master
  }), [isMaster, isCompanyAdmin]);

  // Garantir que a aba ativa seja sempre permitida
  useEffect(() => {
    if (tab === 'excluir' && !perms.canDelete) setTab('editar');
    if (tab === 'membros' && !perms.canManageMembers) setTab('editar');
    if (tab === 'etapas' && !perms.canManageStages) setTab('editar');
  }, [tab, perms]);

  if (!pipeline) return null;

  const handleDelete = async () => {
    if (!perms.canDelete) return;
    try {
      await deletePipeline.mutateAsync(pipeline.id);
      setConfirmDelete(false);
      onOpenChange(false);
      onDeleted?.();
    } catch {
      /* toast no hook */
    }
  };

  const lockedTab = (label: string, icon: React.ReactNode, reason: string) => (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="h-7 px-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 cursor-not-allowed select-none rounded-sm"
            aria-disabled
          >
            {icon}
            {label}
            <Lock className="w-3 h-3 ml-0.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">{reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) setTab(defaultTab);
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl h-[100dvh] overflow-hidden p-0 flex flex-col bg-background border-l border-border"
      >
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-card border border-border flex items-center justify-center text-muted-foreground">
              <Settings2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-base text-foreground">Gerenciar pipeline</SheetTitle>
              <p className="text-xs text-muted-foreground truncate">{pipeline.name}</p>
            </div>
          </div>
        </SheetHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as ManageTab)} className="flex-1 min-h-0 flex flex-col">
          <div className="px-5 pt-3 pb-2 border-b border-border/60 shrink-0">
            <TabsList className="bg-muted/40 border border-border h-9 p-1 w-full justify-start gap-1">
              <TabsTrigger
                value="editar"
                disabled={!perms.canEdit}
                className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed data-[state=active]:bg-accent data-[state=active]:text-foreground"
              >
                <Pencil className="w-3.5 h-3.5" /> Editar
              </TabsTrigger>
              {perms.canManageStages ? (
                <TabsTrigger
                  value="etapas"
                  className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground data-[state=active]:bg-accent data-[state=active]:text-foreground"
                >
                  <Layers className="w-3.5 h-3.5" /> Etapas
                </TabsTrigger>
              ) : lockedTab('Etapas', <Layers className="w-3.5 h-3.5" />, 'Apenas administradores podem gerenciar etapas')}
              {perms.canManageMembers ? (
                <TabsTrigger
                  value="membros"
                  className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground data-[state=active]:bg-accent data-[state=active]:text-foreground"
                >
                  <Users className="w-3.5 h-3.5" /> Membros
                </TabsTrigger>
              ) : lockedTab('Membros', <Users className="w-3.5 h-3.5" />, 'Apenas administradores podem gerenciar membros')}
              {perms.canDelete ? (
                <TabsTrigger
                  value="excluir"
                  className="h-7 text-xs gap-1.5 text-destructive/80 hover:text-destructive data-[state=active]:bg-destructive/15 data-[state=active]:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </TabsTrigger>
              ) : lockedTab('Excluir', <Trash2 className="w-3.5 h-3.5" />, 'Exclusão restrita ao Master')}
            </TabsList>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="px-5 py-5">
              <TabsContent value="editar" className="mt-0">
                <EditPipelineForm
                  pipeline={pipeline}
                  showCancel={false}
                />
              </TabsContent>

              <TabsContent value="etapas" className="mt-0">
                <ManageStagesContent
                  pipelineId={pipeline.id}
                  stages={stages}
                  scrollable={false}
                />
              </TabsContent>

              <TabsContent value="membros" className="mt-0">
                <PipelineMembersContent
                  pipelineId={pipeline.id}
                  showCancel={false}
                  scrollable={false}
                />
              </TabsContent>

              {perms.canDelete && (
                <TabsContent value="excluir" className="mt-0">
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-foreground">Zona de perigo</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Excluir este pipeline remove permanentemente todas as suas etapas e desassocia
                          os leads vinculados. Esta ação não pode ser desfeita.
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setConfirmDelete(true)}
                        className="gap-1.5"
                      >
                        <Trash2 className="w-4 h-4" />
                        Excluir pipeline
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              )}
            </div>
          </div>
        </Tabs>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir pipeline "{pipeline.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação remove permanentemente o pipeline, todas as suas etapas e desassocia os leads. Não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletePipeline.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleDelete(); }}
                disabled={deletePipeline.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletePipeline.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Excluir pipeline
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
