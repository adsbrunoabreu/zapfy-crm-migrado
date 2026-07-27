import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Users, UserMinus } from 'lucide-react';
import { initials, roleLabelMap, type AppRole } from './types';

interface User {
  id: string;
  full_name?: string | null;
  email: string;
  avatar_url?: string | null;
  role: string;
  is_active: boolean;
}

interface Props {
  users: User[];
  onRoleChange: (userId: string, role: AppRole) => void;
  onToggleActive: (userId: string, isActive: boolean) => void;
  onRemoveUser: (userId: string) => void;
}

export function UsersTab({ users, onRoleChange, onToggleActive, onRemoveUser }: Props) {
  if (users.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
        Nenhum usuário vinculado a esta empresa.
      </Card>
    );
  }

  return (
    <>
      {users.map((u) => (
        <Card key={u.id} className="p-3">
          <div className="flex items-center gap-3">
            <Avatar className="w-9 h-9">
              <AvatarImage src={u.avatar_url || undefined} />
              <AvatarFallback className="text-xs">{initials(u.full_name, u.email)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{u.full_name || u.email}</p>
              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
            </div>

            <Select value={u.role} onValueChange={(v) => onRoleChange(u.id, v as AppRole)}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agente">{roleLabelMap.agente}</SelectItem>
                <SelectItem value="gestor">{roleLabelMap.gestor}</SelectItem>
                <SelectItem value="financeiro">{roleLabelMap.financeiro}</SelectItem>
                <SelectItem value="admin">{roleLabelMap.admin}</SelectItem>
                <SelectItem value="master">{roleLabelMap.master}</SelectItem>
              </SelectContent>
            </Select>

            <Switch checked={u.is_active} onCheckedChange={(c) => onToggleActive(u.id, c)} />

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-rose"
              onClick={() => onRemoveUser(u.id)}
              title="Remover da empresa"
            >
              <UserMinus className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      ))}
    </>
  );
}
