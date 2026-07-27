import { useState, useEffect } from 'react';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useTransferLead } from '@/hooks/useTransferLead';

interface TransferLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: {
    id: string;
    name: string;
    assigned_to: string | null;
    assignee?: { full_name: string | null; email: string } | null;
  } | null;
}

export function TransferLeadDialog({ open, onOpenChange, lead }: TransferLeadDialogProps) {
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const { data: teamMembers, isLoading: loadingMembers } = useTeamMembers();
  const transferLead = useTransferLead();

  // Reset selection when dialog opens/closes or lead changes
  useEffect(() => {
    if (open) {
      setSelectedMemberId('');
    }
  }, [open, lead?.id]);

  const handleTransfer = () => {
    if (!lead || !selectedMemberId) return;

    const newAssigneeId = selectedMemberId === 'unassigned' ? null : selectedMemberId;
    const newAssignee = teamMembers?.find(m => m.id === newAssigneeId);
    const newAssigneeName = newAssignee?.name || 'Não atribuído';

    transferLead.mutate(
      { 
        leadId: lead.id, 
        newAssigneeId,
        oldAssigneeId: lead.assigned_to,
        oldAssigneeName: currentAssigneeName,
        newAssigneeName,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  };

  const currentAssigneeName = lead?.assignee?.full_name || lead?.assignee?.email || 'Não atribuído';

  // Filter out current assignee from options
  const availableMembers = teamMembers?.filter(m => m.id !== lead?.assigned_to) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            Transferir Lead
          </DialogTitle>
          <DialogDescription>
            Transfira este lead para outro membro da equipe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Lead</p>
            <p className="font-medium">{lead?.name}</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Responsável atual</p>
            <p className="font-medium">{currentAssigneeName}</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Transferir para</p>
            <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um membro da equipe" />
              </SelectTrigger>
              <SelectContent>
                {lead?.assigned_to && (
                  <SelectItem value="unassigned">
                    <span className="text-muted-foreground">Remover atribuição</span>
                  </SelectItem>
                )}
                {loadingMembers ? (
                  <div className="flex items-center justify-center p-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                ) : (
                  availableMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                          <span className="text-xs font-medium text-primary">
                            {member.name[0]}
                          </span>
                        </div>
                        <span>{member.name}</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            O lead será atribuído ao novo responsável e aparecerá na lista dele imediatamente.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleTransfer}
            disabled={!selectedMemberId || transferLead.isPending}
          >
            {transferLead.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Transferindo...
              </>
            ) : (
              <>
                <ArrowRightLeft className="w-4 h-4 mr-2" />
                Transferir
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
