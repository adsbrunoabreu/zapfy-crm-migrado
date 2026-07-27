import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import {
  useUpsertTeamMission,
  type MissionMetric,
  type TeamMission,
} from '@/hooks/useTeamMissions';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { METRIC_OPTIONS } from '@/hooks/useGoalsPageFilters';

const REWARD_ICONS = [
  { value: 'trophy', label: '🏆 Troféu' },
  { value: 'star', label: '⭐ Estrela' },
  { value: 'gift', label: '🎁 Brinde' },
  { value: 'crown', label: '👑 Coroa' },
  { value: 'rocket', label: '🚀 Foguete' },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mission?: TeamMission | null;
}

export function CreateMissionDialog({ open, onOpenChange, mission }: Props) {
  const upsert = useUpsertTeamMission();
  const { data: members = [] } = useTeamMembers();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [metric, setMetric] = useState<MissionMetric>('value');
  const [target, setTarget] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [assignedTo, setAssignedTo] = useState<string>('all');
  const [rewardLabel, setRewardLabel] = useState('');
  const [rewardIcon, setRewardIcon] = useState('trophy');

  useEffect(() => {
    if (!open) return;
    if (mission) {
      setTitle(mission.title);
      setDescription(mission.description ?? '');
      setMetric(mission.metric);
      setTarget(String(mission.target_value));
      setPeriodStart(mission.period_start);
      setPeriodEnd(mission.period_end);
      setAssignedTo(mission.assigned_to ?? 'all');
      setRewardLabel(mission.reward_label ?? '');
      setRewardIcon(mission.reward_icon ?? 'trophy');
    } else {
      const today = new Date();
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setTitle('');
      setDescription('');
      setMetric('value');
      setTarget('');
      setPeriodStart(today.toISOString().slice(0, 10));
      setPeriodEnd(monthEnd.toISOString().slice(0, 10));
      setAssignedTo('all');
      setRewardLabel('');
      setRewardIcon('trophy');
    }
  }, [open, mission]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !target || !periodStart || !periodEnd) return;
    await upsert.mutateAsync({
      id: mission?.id,
      title: title.trim(),
      description: description.trim() || null,
      metric,
      target_value: Number(target),
      period_start: periodStart,
      period_end: periodEnd,
      assigned_to: assignedTo === 'all' ? null : assignedTo,
      reward_label: rewardLabel.trim() || null,
      reward_icon: rewardIcon,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mission ? 'Editar missão' : 'Nova missão'}</DialogTitle>
          <DialogDescription>
            Crie um desafio com prazo e recompensa para motivar a equipe.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Fechar 5 vendas até sexta" required />
          </div>

          <div className="space-y-2">
            <Label>Descrição (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes, regras, observações..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Métrica</Label>
              <Select value={metric} onValueChange={(v) => setMetric(v as MissionMetric)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METRIC_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Meta</Label>
              <Input type="number" min="0" step="any" value={target} onChange={(e) => setTarget(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Início</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Atribuído a</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Equipe toda</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Recompensa (opcional)</Label>
              <Input value={rewardLabel} onChange={(e) => setRewardLabel(e.target.value)} placeholder="Ex.: Vale R$ 200" />
            </div>
            <div className="space-y-2">
              <Label>Ícone</Label>
              <Select value={rewardIcon} onValueChange={setRewardIcon}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REWARD_ICONS.map((i) => (
                    <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" variant="glow" disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {mission ? 'Salvar' : 'Criar missão'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
