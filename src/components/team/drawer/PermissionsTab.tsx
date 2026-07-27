import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useUpdateMemberRole } from '@/hooks/useUpdateMemberRole';
import { TENANT_ROLE_OPTIONS, type AppRole } from '@/lib/roles';

type TenantRole = Exclude<AppRole, 'master'>;

interface Props {
  member: any;
  isSelf: boolean;
  onStateChange?: (s: { dirty: boolean; isPending: boolean; save: () => void }) => void;
}

const normalize = (r?: string): TenantRole => {
  if (r === 'company_admin' || r === 'admin') return 'admin';
  if (r === 'gestor') return 'gestor';
  if (r === 'financeiro') return 'financeiro';
  return 'agente';
};

const SCOPE: Record<TenantRole, string[]> = {
  admin: [
    'Acesso total ao tenant',
    'Gerencia equipe, canais, integrações e financeiro',
    'Acessa todos os relatórios',
  ],
  gestor: [
    'Vê todos os leads, conversas e pipelines da empresa',
    'Gerencia metas, equipes e cadastros operacionais',
    'Sem acesso a billing/integrações sensíveis',
  ],
  financeiro: [
    'Acesso total ao módulo financeiro/billing',
    'Visualização (read-only) de leads, pipes e relatórios',
    'Não opera chat nem altera cadastros',
  ],
  agente: [
    'Vê apenas leads atribuídos a ele',
    'Acessa só os canais vinculados',
    'Não gerencia equipe nem configurações',
  ],
};

export function PermissionsTab({ member, isSelf, onStateChange }: Props) {
  const [role, setRole] = useState<TenantRole>(normalize(member?.role));
  const update = useUpdateMemberRole();

  useEffect(() => {
    setRole(normalize(member?.role));
  }, [member?.id, member?.role]);

  const isMaster = member?.role === 'master';
  const dirty = role !== normalize(member?.role);

  const handleSave = () => update.mutate({ memberId: member.id, newRole: role });

  useEffect(() => {
    if (!onStateChange) return;
    onStateChange({
      dirty: dirty && !isSelf && !isMaster,
      isPending: update.isPending,
      save: handleSave,
    });
  }, [dirty, isSelf, isMaster, update.isPending, role]);

  return (
    <div className="space-y-3">
      {(isMaster || isSelf) && (
        <Alert className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            {isMaster
              ? 'Este usuário é Master. A função não pode ser alterada por aqui.'
              : 'Você não pode alterar a própria função.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Função</Label>
        <Select
          value={role}
          onValueChange={(v) => setRole(v as TenantRole)}
          disabled={isSelf || isMaster}
        >
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

      <div className="rounded-lg border border-border bg-card/40 p-3 text-sm space-y-1.5">
        <p className="font-medium text-xs">Escopo de acesso</p>
        <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
          {SCOPE[role].map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      {!onStateChange && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="glow"
            disabled={!dirty || update.isPending || isSelf || isMaster}
            onClick={handleSave}
          >
            {update.isPending && (
              <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
            )}
            Salvar função
          </Button>
        </div>
      )}
    </div>
  );
}
