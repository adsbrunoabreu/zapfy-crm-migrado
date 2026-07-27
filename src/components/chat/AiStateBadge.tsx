import { useState } from 'react';
import { Bot, PauseCircle, UserRound, Play, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useConversationAiState } from '@/hooks/useConversationAiState';
import { useCompanyAddons } from '@/hooks/useCompanyAddons';

interface Props {
  conversationId: string;
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function AiStateBadge({ conversationId }: Props) {
  const { addons, isMaster } = useCompanyAddons();
  const { data, isLoading, resumeAi } = useConversationAiState(conversationId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Gate: somente empresas com add-on Agente IA (ou Master) veem este badge
  if (!isMaster && !addons.ai_agent) return null;

  if (isLoading || !data) return null;

  const isPaused =
    data.status === 'paused' &&
    (!data.paused_until || new Date(data.paused_until).getTime() > Date.now());
  const isHandoff = data.status === 'handoff';
  const isActive = data.status === 'active';

  // Não exibe nada para done/error ou paused expirado
  if (!isActive && !isPaused && !isHandoff) return null;

  const handleResume = async () => {
    try {
      await resumeAi.mutateAsync();
      toast.success('IA retomada nesta conversa');
      setConfirmOpen(false);
    } catch (err: any) {
      toast.error('Falha ao retomar IA', { description: err?.message });
    }
  };

  if (isActive) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-card/50 px-2 py-1 text-xs text-muted-foreground">
              <Bot className="h-3.5 w-3.5 text-primary" />
              <span className="hidden sm:inline">IA ativa</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>O Agente IA está respondendo nesta conversa</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const label = isHandoff
    ? 'Em atendimento humano'
    : `IA pausada${data.paused_until ? ` até ${formatTime(data.paused_until)}` : ''}`;

  const Icon = isHandoff ? UserRound : PauseCircle;

  return (
    <>
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1.5 rounded-md border border-amber/30 bg-amber/10 px-2 py-1 text-xs text-amber dark:text-amber">
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden md:inline">{label}</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => setConfirmOpen(true)}
          disabled={resumeAi.isPending}
        >
          {resumeAi.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Retomar IA</span>
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retomar atendimento pelo Agente IA?</AlertDialogTitle>
            <AlertDialogDescription>
              A IA voltará a responder automaticamente nesta conversa. Use isto quando você
              terminou seu atendimento humano e deseja devolver o controle ao agente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resumeAi.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleResume} disabled={resumeAi.isPending}>
              {resumeAi.isPending ? 'Retomando...' : 'Sim, retomar IA'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
