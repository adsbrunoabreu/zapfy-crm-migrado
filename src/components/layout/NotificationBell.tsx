import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface NotificationRow {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
  message: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

interface Props {
  collapsed?: boolean;
}

export function NotificationBell({ collapsed }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ['app-notifications', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_notifications' as any)
        .select('id, type, severity, title, message, link, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as unknown as NotificationRow[];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Realtime para notificações novas
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`app-notifs-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'app_notifications', filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ['app-notifications', user.id] })
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, qc]);

  const unread = items.filter((n) => !n.read_at).length;

  const markAllRead = useMutation({
    mutationFn: async () => {
      const ids = items.filter((n) => !n.read_at).map((n) => n.id);
      if (ids.length === 0) return;
      await (supabase as any)
        .from('app_notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', ids);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-notifications', user?.id] }),
  });

  const handleClick = async (n: NotificationRow) => {
    if (!n.read_at) {
      await (supabase as any)
        .from('app_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', n.id);
      qc.invalidateQueries({ queryKey: ['app-notifications', user?.id] });
    }
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative w-full h-9 justify-start text-left px-3', collapsed && 'h-9 w-9 justify-center px-0')}
          aria-label="Notificações"
        >
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center rounded-full"
            >
              {unread > 9 ? '9+' : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="right" className="w-80 p-0">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="text-sm font-medium">Notificações</span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markAllRead.mutate()}>
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma notificação
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const sevColor =
                  n.severity === 'error' ? 'text-destructive'
                  : n.severity === 'warning' ? 'text-[hsl(var(--amber))]'
                  : 'text-foreground';
                return (
                  <li
                    key={n.id}
                    className={cn(
                      'p-3 cursor-pointer hover:bg-accent/40 transition-colors',
                      !n.read_at && 'bg-accent/20'
                    )}
                    onClick={() => handleClick(n)}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read_at && (
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium leading-snug', sevColor)}>
                          {n.title}
                        </p>
                        {n.message && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {format(new Date(n.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
