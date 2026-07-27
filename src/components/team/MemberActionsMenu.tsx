import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Target, Activity, Edit, Ban, CheckCircle, Trash2 } from 'lucide-react';

export interface TeamMemberLite {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive?: boolean;
}

interface Props {
  member: TeamMemberLite;
  isSelf: boolean;
  onSetGoal: () => void;
  onViewActivity: () => void;
  onEditRole: () => void;
  onToggleActive: () => void;
  onRemove: () => void;
}

export function MemberActionsMenu({
  member,
  isSelf,
  onSetGoal,
  onViewActivity,
  onEditRole,
  onToggleActive,
  onRemove,
}: Props) {
  const isActive = member.isActive !== false;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover z-50">
        <DropdownMenuLabel className="text-xs font-bold text-muted-foreground truncate max-w-[200px]">
          {member.name}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSetGoal}>
          <Target className="w-4 h-4 mr-2" />
          Definir Meta
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onViewActivity}>
          <Activity className="w-4 h-4 mr-2" />
          Ver atividade
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onEditRole}>
          <Edit className="w-4 h-4 mr-2" />
          Editar função
        </DropdownMenuItem>
        {!isSelf && (
          <DropdownMenuItem onClick={onToggleActive}>
            {isActive ? (
              <>
                <Ban className="w-4 h-4 mr-2 text-[hsl(var(--amber))]" />
                <span className="text-[hsl(var(--amber))]">Desativar Usuário</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2 text-[hsl(var(--emerald))]" />
                <span className="text-[hsl(var(--emerald))]">Ativar Usuário</span>
              </>
            )}
          </DropdownMenuItem>
        )}
        {!isSelf && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={onRemove}>
              <Trash2 className="w-4 h-4 mr-2" />
              Remover
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
