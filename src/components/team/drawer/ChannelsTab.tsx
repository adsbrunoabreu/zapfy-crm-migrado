import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plug, Info } from 'lucide-react';
import { useInstanceAgents, useToggleInstanceAgent } from '@/hooks/useInstanceAgents';

interface Props {
  member: any;
}

export function ChannelsTab({ member }: Props) {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ['team-channels-instances', companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, phone_number, provider, is_active, status')
        .eq('company_id', companyId!)
        .eq('is_active', true)
        .order('instance_name')
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: links = [] } = useInstanceAgents();
  const toggle = useToggleInstanceAgent();

  const linksByInstance = new Map<string, Set<string>>();
  links.forEach((l) => {
    if (!linksByInstance.has(l.instance_id))
      linksByInstance.set(l.instance_id, new Set());
    linksByInstance.get(l.instance_id)!.add(l.user_id);
  });

  const isPrivileged = member?.role === 'company_admin' || member?.role === 'master';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!instances.length) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground">
        <Plug className="w-8 h-8 mx-auto mb-2 opacity-50" />
        Nenhum canal ativo para vincular.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Alert className="py-2">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          {isPrivileged
            ? 'Administradores acessam todos os canais por padrão. Vínculos abaixo são informativos.'
            : 'Canais sem vínculo ficam abertos a todos os usuários da empresa.'}
        </AlertDescription>
      </Alert>

      <div className="space-y-1.5">
        {instances.map((inst: any) => {
          const linked = linksByInstance.get(inst.id) ?? new Set();
          const enabled = linked.has(member.id);
          const open = linked.size === 0;
          return (
            <div
              key={inst.id}
              className="flex items-center justify-between rounded-md border border-border bg-card/40 p-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {inst.instance_name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {inst.phone_number || inst.provider} ·{' '}
                  {open ? 'aberta a todos' : `${linked.size} vinculado(s)`}
                </p>
              </div>
              <Switch
                checked={enabled}
                disabled={toggle.isPending || isPrivileged}
                onCheckedChange={(v) =>
                  toggle.mutate({
                    instance_id: inst.id,
                    user_id: member.id,
                    enabled: v,
                  })
                }
                className="data-[state=unchecked]:bg-muted border border-border shrink-0 ml-2"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
