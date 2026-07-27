import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  LogOut,
  Edit,
  Sun,
  Moon,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { EditProfileModal } from './EditProfileModal';
import { roleLabel } from '@/lib/roles';

type UserStatus = 'online' | 'away' | 'offline';

const statusConfig: Record<UserStatus, { label: string; color: string; dotClass: string }> = {
  online: { label: 'Online', color: 'bg-[hsl(var(--emerald))]', dotClass: 'bg-[hsl(var(--emerald))] shadow-[0_0_6px_hsl(160_84%_39%)]' },
  away: { label: 'Ausente', color: 'bg-[hsl(var(--amber))]', dotClass: 'bg-[hsl(var(--amber))] shadow-[0_0_6px_hsl(38_92%_50%)]' },
  offline: { label: 'Offline', color: 'bg-muted-foreground/50', dotClass: 'bg-muted-foreground/50' },
};

interface SidebarProfileProps {
  collapsed: boolean;
}

export function SidebarProfile({ collapsed }: SidebarProfileProps) {
  const { profile, signOut, refreshProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<UserStatus | null>(null);

  const currentStatus = ((profile as any)?.status as UserStatus) || 'online';
  const statusCfg = statusConfig[currentStatus] || statusConfig.online;

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : profile?.email?.[0]?.toUpperCase() || 'U';

  const displayRole = roleLabel(profile?.role);

  const handleStatusChange = async (status: UserStatus) => {
    if (!profile || updatingStatus) return;
    if (status === currentStatus) {
      setPopoverOpen(false);
      return;
    }
    setUpdatingStatus(status);
    try {
      // Sem .select() para evitar 403 quando RLS impede leitura pós-update
      const { error } = await supabase
        .from('profiles')
        .update({ status })
        .eq('id', profile.id);
      if (error) throw error;

      localStorage.setItem('credflow-status', status);
      await refreshProfile();
      toast.success(`Status alterado para ${statusConfig[status].label}`);
      setPopoverOpen(false);
    } catch (err: any) {
      toast.error('Não foi possível alterar o status', {
        description: err?.message || 'Erro desconhecido',
      });
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleSignOut = () => {
    setPopoverOpen(false);
    signOut();
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'w-full flex items-center gap-3 p-2 rounded-lg transition-all duration-200',
              'hover:bg-accent/50 cursor-pointer group',
              collapsed && 'justify-center p-2'
            )}
          >
            {/* Avatar with status dot */}
            <div className="relative shrink-0">
              <Avatar className="w-9 h-9">
                <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name || ''} />
                <AvatarFallback className="text-sm font-semibold bg-primary/20 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span
                className={cn(
                  'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-sidebar',
                  statusCfg.dotClass
                )}
              />
            </div>

            {!collapsed && (
              <>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium truncate">{profile?.full_name || 'Usuário'}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{displayRole}</p>
                </div>
                <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 transition-transform group-data-[state=open]:rotate-180" />
              </>
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className={cn(
            'w-72 p-0 overflow-hidden',
            'animate-in fade-in-0 slide-in-from-bottom-2 duration-200'
          )}
        >
          {/* Section 1: Profile Header */}
          <div className="p-4 flex items-center gap-3">
            <Avatar className="w-14 h-14 shrink-0">
              <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name || ''} />
              <AvatarFallback className="text-lg font-bold bg-primary/20 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-semibold truncate">{profile?.full_name || 'Usuário'}</p>
              <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
              <Badge variant="outline" className="mt-1 text-[10px] px-1.5 py-0">
                {displayRole}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Section 2: Status */}
          <div className="p-2">
            <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Status</p>
            {(Object.keys(statusConfig) as UserStatus[]).map((key) => {
              const cfg = statusConfig[key];
              const isActive = currentStatus === key;
              const isLoading = updatingStatus === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleStatusChange(key)}
                  disabled={updatingStatus !== null}
                  className={cn(
                    'w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm transition-colors',
                    isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                    updatingStatus !== null && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', cfg.dotClass)} />
                  <span>{cfg.label}</span>
                  {isLoading ? (
                    <Loader2 className="ml-auto w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  ) : isActive ? (
                    <span className="ml-auto text-xs text-muted-foreground">✓</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <Separator />

          {/* Section 3: Settings */}
          <div className="p-2">
            <button
              onClick={() => {
                setPopoverOpen(false);
                setEditModalOpen(true);
              }}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm hover:bg-accent/50 transition-colors"
            >
              <Edit className="w-4 h-4 text-muted-foreground" />
              <span>Editar Perfil</span>
            </button>

            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm hover:bg-accent/50 transition-colors"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Moon className="w-4 h-4 text-muted-foreground" />
              )}
              <span>{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>
            </button>
          </div>

          <Separator />

          {/* Section 4: Sign Out */}
          <div className="p-2">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <EditProfileModal open={editModalOpen} onOpenChange={setEditModalOpen} />
    </>
  );
}
