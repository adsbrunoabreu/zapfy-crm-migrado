import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScheduleWizard } from '@/components/schedules/ScheduleWizard';
import { Sparkles } from 'lucide-react';
import { FilterBar } from '@/components/filters/FilterBar';
import { FilterSelect } from '@/components/filters/FilterSelect';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Calendar, Clock, Loader2, MoreHorizontal, User, Phone, MessageSquare,
  Trash2, AlertTriangle, CheckCircle2, XCircle, Image, Video, FileText, Music, Eye, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAllScheduledMessages, useDeleteScheduledMessage, ScheduledMessageWithLead } from '@/hooks/useScheduledMessages';
import { LeadDetailModal } from '@/components/pipelines/LeadDetailModal';

const statusConfig = {
  pending: { label: 'Pendente', icon: Clock, className: 'bg-amber/20 text-amber border-amber/30' },
  sent: { label: 'Enviado', icon: CheckCircle2, className: 'bg-emerald/20 text-emerald border-emerald/30' },
  failed: { label: 'Falhou', icon: XCircle, className: 'bg-destructive/20 text-destructive border-destructive/30' },
};

const messageTypeIcons = { text: MessageSquare, image: Image, video: Video, document: FileText, audio: Music };

export function ScheduledMessagesTab() {
  const [statusFilter, setStatusFilter] = useState<'pending' | 'sent' | 'failed' | 'all'>('all');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<ScheduledMessageWithLead | null>(null);
  const [selectedLead, setSelectedLead] = useState<ScheduledMessageWithLead['lead'] | null>(null);
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: messages, isLoading, refetch } = useAllScheduledMessages(statusFilter);
  const deleteMessage = useDeleteScheduledMessage();

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setWizardOpen(true);
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenLeadModal = (lead: ScheduledMessageWithLead['lead']) => {
    if (lead) { setSelectedLead(lead); setLeadModalOpen(true); }
  };

  const handleDelete = () => {
    if (messageToDelete) {
      deleteMessage.mutate(
        { messageId: messageToDelete.id, leadId: messageToDelete.lead_id },
        { onSuccess: () => { setDeleteConfirmOpen(false); setMessageToDelete(null); refetch(); } }
      );
    }
  };

  const formatSendAt = (s: string) => format(new Date(s), "dd 'de' MMM, HH:mm", { locale: ptBR });
  const truncate = (m: string, n = 50) => m.length <= n ? m : m.substring(0, n) + '...';

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" />Atualizar</Button>
        <Button onClick={() => setWizardOpen(true)}><Sparkles className="w-4 h-4 mr-2" />Nova mensagem agendada</Button>
      </div>

      <ScheduleWizard open={wizardOpen} onOpenChange={(v) => { setWizardOpen(v); if (!v) refetch(); }} />

      <FilterBar infoText={`${messages?.length || 0} mensagens encontradas`}>
        <FilterSelect
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'pending', label: 'Pendentes' },
            { value: 'sent', label: 'Enviados' },
            { value: 'failed', label: 'Falhou' },
          ]}
          placeholder="Status" width="w-[180px]"
        />
      </FilterBar>

      <Card className="glass-card overflow-hidden">
        {!messages || messages.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">Nenhuma mensagem agendada.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead>Lead</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Agendado para</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.map((message, index) => {
                const StatusIcon = statusConfig[message.status].icon;
                const TypeIcon = messageTypeIcons[message.message_type] || MessageSquare;
                return (
                  <TableRow key={message.id} className="border-border/50 hover:bg-secondary/30 animate-fade-in" style={{ animationDelay: `${index * 30}ms` }}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center"><User className="w-4 h-4 text-primary" /></div>
                        <div>
                          <p className="font-medium">{message.lead?.name || 'Lead removido'}</p>
                          {message.lead?.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{message.lead.phone}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild><span className="cursor-help">{truncate(message.message)}</span></TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[300px]"><p className="whitespace-pre-wrap">{message.message}</p></TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TypeIcon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground capitalize">{message.message_type}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{formatSendAt(message.send_at)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className={`${statusConfig[message.status].className} cursor-help`}>
                            <StatusIcon className="w-3 h-3 mr-1" />{statusConfig[message.status].label}
                          </Badge>
                        </TooltipTrigger>
                        {message.error_message && <TooltipContent side="bottom" className="max-w-[300px]"><p className="text-destructive">{message.error_message}</p></TooltipContent>}
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {message.lead && <DropdownMenuItem onClick={() => handleOpenLeadModal(message.lead)}><Eye className="w-4 h-4 mr-2" />Ver lead</DropdownMenuItem>}
                          {message.status !== 'sent' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { setMessageToDelete(message); setDeleteConfirmOpen(true); }}>
                                <Trash2 className="w-4 h-4 mr-2" />Cancelar agendamento
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" />Cancelar Agendamento</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja cancelar este agendamento?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete} disabled={deleteMessage.isPending}>
              {deleteMessage.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}Cancelar Agendamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedLead && <LeadDetailModal open={leadModalOpen} onOpenChange={(o) => { setLeadModalOpen(o); if (!o) refetch(); }} lead={selectedLead} />}
    </div>
  );
}
