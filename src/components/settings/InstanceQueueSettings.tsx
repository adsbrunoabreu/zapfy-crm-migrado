import { useMemo } from 'react';
import { Loader2, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useInstances } from '@/hooks/useInstances';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useInstanceAgents, useToggleInstanceAgent } from '@/hooks/useInstanceAgents';

export default function InstanceQueueSettings() {
  const { data: instances = [], isLoading: lInst } = useInstances();
  const { data: members = [], isLoading: lTeam } = useTeamMembers();
  const { data: links = [], isLoading: lLinks } = useInstanceAgents();
  const toggle = useToggleInstanceAgent();

  const linkSet = useMemo(() => {
    const s = new Set<string>();
    links.forEach((l) => s.add(`${l.instance_id}:${l.user_id}`));
    return s;
  }, [links]);

  // Inclui todos os membros ativos exceto master (que já tem bypass).
  // Aceita roles atuais e legadas (company_admin/admin, user/agente).
  const agents = useMemo(
    () => members.filter((m) => m.isActive && m.role !== 'master'),
    [members],
  );

  const linksByInstance = useMemo(() => {
    const m = new Map<string, string[]>();
    links.forEach((l) => {
      if (!m.has(l.instance_id)) m.set(l.instance_id, []);
      m.get(l.instance_id)!.push(l.user_id);
    });
    return m;
  }, [links]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    agents.forEach((a) => m.set(a.id, a.name));
    return m;
  }, [agents]);

  if (lInst || lTeam || lLinks) {
    return (
      <Card className="bg-background border-border p-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/80" />
      </Card>
    );
  }

  return (
    <Card className="bg-background border-border p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-muted-foreground" />
        <div>
          <h3 className="text-base font-semibold text-foreground">Atendimento por canal</h3>
          <p className="text-xs text-muted-foreground/80">
            Vincule agentes a instâncias para que cada um veja e envie apenas pelos canais atribuídos.
            Instâncias sem vínculos ficam abertas a toda a equipe. Admins e Master sempre veem tudo.
          </p>
        </div>
      </div>

      {instances.length === 0 ? (
        <div className="text-sm text-muted-foreground/80 py-6 text-center">Cadastre uma instância primeiro.</div>
      ) : (
        <div className="space-y-3">
          {instances.map((inst) => {
            const linkedIds = linksByInstance.get(inst.id) ?? [];
            const linkedNames = linkedIds.map((id) => nameById.get(id)).filter(Boolean) as string[];
            const isOpen = linkedIds.length === 0;
            return (
              <div key={inst.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-foreground truncate">{inst.display_name}</span>
                    <Badge variant="outline" className="text-[10px] border-border text-muted-foreground px-1.5 py-0">
                      {inst.provider === 'cloud_api' ? 'API Oficial' : 'Evolution'}
                    </Badge>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      isOpen
                        ? 'text-[10px] border-amber/40 text-amber px-1.5 py-0'
                        : 'text-[10px] border-border text-muted-foreground px-1.5 py-0'
                    }
                  >
                    {isOpen ? 'Aberta para toda equipe' : `${linkedIds.length} vinculado(s)`}
                  </Badge>
                </div>

                {!isOpen && (
                  <div className="flex flex-wrap gap-1">
                    {linkedNames.map((n) => (
                      <Badge key={n} variant="secondary" className="text-[10px] px-1.5 py-0">
                        {n}
                      </Badge>
                    ))}
                  </div>
                )}

                {agents.length === 0 ? (
                  <div className="text-xs text-muted-foreground/80 pt-1">
                    Nenhum membro ativo na equipe para vincular.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1 pt-1">
                    {agents.map((agent) => {
                      const checked = linkSet.has(`${inst.id}:${agent.id}`);
                      return (
                        <label
                          key={agent.id}
                          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-card/60 cursor-pointer"
                        >
                          <Checkbox
                            checked={checked}
                            disabled={toggle.isPending}
                            onCheckedChange={(v) =>
                              toggle.mutate({
                                instance_id: inst.id,
                                user_id: agent.id,
                                enabled: !!v,
                              })
                            }
                          />
                          <div className="min-w-0">
                            <div className="text-xs text-foreground truncate">{agent.name}</div>
                            <div className="text-[10px] text-muted-foreground/80 truncate">{agent.email}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
