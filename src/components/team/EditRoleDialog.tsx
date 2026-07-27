import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useUpdateMemberRole } from '@/hooks/useUpdateMemberRole';
import { TENANT_ROLE_OPTIONS, type AppRole } from '@/lib/roles';

type TenantRole = Exclude<AppRole, 'master'>;

interface EditRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: { id: string; name: string; email: string; role: string } | null;
}

const normalize = (r: string): TenantRole => {
  if (r === 'company_admin') return 'admin';
  if (r === 'user') return 'agente';
  if (r === 'admin' || r === 'gestor' || r === 'financeiro' || r === 'agente') return r;
  return 'agente';
};

export function EditRoleDialog({ open, onOpenChange, member }: EditRoleDialogProps) {
  const [selectedRole, setSelectedRole] = useState<TenantRole>('agente');
  const { mutate: updateRole, isPending } = useUpdateMemberRole();

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && member) {
      setSelectedRole(normalize(member.role));
    }
    onOpenChange(newOpen);
  };

  const handleSave = () => {
    if (!member) return;

    updateRole(
      { memberId: member.id, newRole: selectedRole },
      {
        onSuccess: () => onOpenChange(false),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Função</DialogTitle>
          <DialogDescription>
            Altere a função do membro na equipe
          </DialogDescription>
        </DialogHeader>

        {member && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="font-medium text-primary">
                  {member.name?.[0]?.toUpperCase() || '?'}
                </span>
              </div>
              <div>
                <p className="font-medium">{member.name}</p>
                <p className="text-sm text-muted-foreground">{member.email}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Nova função</label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as TenantRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TENANT_ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span>{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedRole === 'admin' && normalize(member.role) !== 'admin' && (
              <Alert className="border-amber/50 bg-amber/10">
                <AlertTriangle className="h-4 w-4 text-amber" />
                <AlertDescription className="text-amber">
                  Administradores podem gerenciar toda a equipe e configurações da empresa.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isPending || !member}>
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar Alterações'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
