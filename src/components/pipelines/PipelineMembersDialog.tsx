import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Users } from 'lucide-react';
import { usePipelineMembers, useUpdatePipelineMembers } from '@/hooks/usePipelines';
import { useTeamMembers } from '@/hooks/useTeamMembers';

interface ContentProps {
  pipelineId: string;
  onSaved?: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
  scrollable?: boolean;
}

export function PipelineMembersContent({ pipelineId, onSaved, onCancel, showCancel = true, scrollable = true }: ContentProps) {
  const { data: team = [], isLoading: loadingTeam } = useTeamMembers();
  const { data: members = [], isLoading: loadingMembers } = usePipelineMembers(pipelineId);
  const update = useUpdatePipelineMembers();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    setSelected(new Set(members.map(m => m.user_id)));
  }, [members]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filtered = team.filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    await update.mutateAsync({ pipelineId, userIds: [...selected] });
    onSaved?.();
  };

  const isLoading = loadingTeam || loadingMembers;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar usuário..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className={`space-y-1 pr-1 ${scrollable ? 'max-h-[40vh] overflow-y-auto' : ''}`}>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum usuário encontrado.</p>
        ) : (
          filtered.map(member => (
            <label
              key={member.id}
              className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
            >
              <Checkbox
                checked={selected.has(member.id)}
                onCheckedChange={() => toggle(member.id)}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{member.name}</p>
                <p className="text-xs text-muted-foreground truncate">{member.email}</p>
              </div>
            </label>
          ))
        )}
      </div>

      <div className="flex justify-between items-center pt-3 border-t border-border">
        <p className="text-xs text-muted-foreground">{selected.size} selecionado(s)</p>
        <div className="flex gap-2">
          {showCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={update.isPending}>Cancelar</Button>
          )}
          <Button variant="glow" onClick={handleSave} disabled={update.isPending}>
            {update.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
}

export function PipelineMembersDialog({ open, onOpenChange, pipelineId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4" /> Membros do pipeline
          </DialogTitle>
          <DialogDescription>
            Selecione quais usuários têm acesso a este pipeline. Se nenhum for selecionado, todos da empresa terão acesso.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          <PipelineMembersContent
            pipelineId={pipelineId}
            onSaved={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
