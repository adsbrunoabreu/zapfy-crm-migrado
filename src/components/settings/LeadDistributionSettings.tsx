import { useEffect, useState } from 'react';
import { Shuffle, Users, Loader2, RefreshCw, Circle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useLeadDistributionSettings,
  useLeadDistributionUsers,
  useUpsertDistributionSettings,
  useToggleDistributionUser,
  useDistributeLeadsNow,
  useUnassignedLeadsCount,
  useUpdateMaxChats,
} from '@/hooks/useLeadDistribution';
import { useTeamMembers } from '@/hooks/useTeamMembers';

export default function LeadDistributionSettings() {
  const { data: settings, isLoading: settingsLoading } = useLeadDistributionSettings();
  const { data: distributionUsers, isLoading: usersLoading } = useLeadDistributionUsers();
  const { data: teamMembers, isLoading: teamLoading } = useTeamMembers();
  const { data: unassignedCount } = useUnassignedLeadsCount();

  const upsertSettings = useUpsertDistributionSettings();
  const toggleUser = useToggleDistributionUser();
  const distributeNow = useDistributeLeadsNow();
  const updateMaxChats = useUpdateMaxChats();

  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<'round_robin' | 'random'>('round_robin');

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setMode(settings.distribution_mode);
    }
  }, [settings]);

  const handleToggleEnabled = async (checked: boolean) => {
    setEnabled(checked);
    await upsertSettings.mutateAsync({ enabled: checked, distribution_mode: mode });
  };

  const handleModeChange = async (newMode: 'round_robin' | 'random') => {
    setMode(newMode);
    await upsertSettings.mutateAsync({ enabled, distribution_mode: newMode });
  };

  const handleToggleUser = async (userId: string, currentActive: boolean) => {
    await toggleUser.mutateAsync({ userId, isActive: !currentActive });
  };

  const handleMaxChatsChange = async (userId: string, value: string) => {
    const maxChats = value === '' ? null : parseInt(value, 10);
    if (value !== '' && (isNaN(maxChats!) || maxChats! < 0)) return;
    await updateMaxChats.mutateAsync({ userId, maxChats });
  };

  const isUserActive = (userId: string) => {
    const user = distributionUsers?.find(u => u.user_id === userId);
    return user?.is_active ?? false;
  };

  const getUserAssignedCount = (userId: string) => {
    const user = distributionUsers?.find(u => u.user_id === userId);
    return user?.assigned_count ?? 0;
  };

  const getUserMaxChats = (userId: string) => {
    const user = distributionUsers?.find(u => u.user_id === userId);
    return (user as any)?.max_chats ?? null;
  };

  const isLoading = settingsLoading || usersLoading || teamLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="glass-card p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
          <Shuffle className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">Distribuição de Leads</h2>
          <p className="text-muted-foreground text-sm">
            Configure a distribuição automática de leads entre os membros da equipe.
            Leads são atribuídos preferencialmente a agentes online com menos atendimentos.
          </p>
        </div>
      </div>

      <div className="space-y-6 max-w-xl">
        {/* Enable/Disable */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="distribution-enabled">Distribuição automática</Label>
            <p className="text-sm text-muted-foreground">
              Novos leads serão automaticamente atribuídos aos membros ativos e online
            </p>
          </div>
          <Switch
            id="distribution-enabled"
            checked={enabled}
            onCheckedChange={handleToggleEnabled}
            disabled={upsertSettings.isPending}
          />
        </div>

        {/* Mode Selection */}
        <div className="space-y-2">
          <Label>Modo de distribuição</Label>
          <Select value={mode} onValueChange={(v) => handleModeChange(v as 'round_robin' | 'random')}>
            <SelectTrigger className="bg-secondary/50 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="round_robin">Sequencial (Round-Robin)</SelectItem>
              <SelectItem value="random">Aleatório</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {mode === 'round_robin' 
              ? 'Distribui leads de forma sequencial, priorizando agentes online com menos atendimentos'
              : 'Distribui leads de forma aleatória entre os agentes online disponíveis'}
          </p>
        </div>

        {/* Team Members */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Membros participantes
          </Label>
          <div className="space-y-2">
            {teamMembers && teamMembers.length > 0 ? (
              teamMembers.map((member) => {
                const isActive = isUserActive(member.id);
                const assignedCount = getUserAssignedCount(member.id);
                const maxChats = getUserMaxChats(member.id);
                const isOnline = member.status === 'online';
                
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/30"
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={isActive}
                        onCheckedChange={() => handleToggleUser(member.id, isActive)}
                        disabled={toggleUser.isPending}
                      />
                      <Circle
                        className={`w-2.5 h-2.5 fill-current ${isOnline ? 'text-[hsl(var(--emerald))]' : 'text-muted-foreground/40'}`}
                      />
                      <div>
                        <p className="font-medium text-sm">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {assignedCount}{maxChats !== null ? `/${maxChats}` : ''} atribuídos
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">Máx:</Label>
                        <Input
                          type="number"
                          min={0}
                          placeholder="∞"
                          value={maxChats !== null ? maxChats : ''}
                          onChange={(e) => handleMaxChatsChange(member.id, e.target.value)}
                          className="w-16 h-7 text-xs text-center bg-secondary/50 border-border/50"
                          disabled={updateMaxChats.isPending}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhum membro na equipe
              </p>
            )}
          </div>
        </div>

        {/* Manual Distribution */}
        <div className="pt-4 border-t border-border/50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-medium">Leads não atribuídos</p>
              <p className="text-2xl font-bold text-primary">{unassignedCount || 0}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => distributeNow.mutate()}
              disabled={distributeNow.isPending || !unassignedCount || unassignedCount === 0}
            >
              {distributeNow.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Distribuir Agora
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Clique para distribuir manualmente os leads não atribuídos entre os membros ativos e online
          </p>
        </div>
      </div>
    </Card>
  );
}
