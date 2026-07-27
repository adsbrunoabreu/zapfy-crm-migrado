import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Users, CircleDollarSign, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CompanyProfileForm, type CompanyProfileValues } from '../CompanyProfileForm';
import { formatBRL, type PlanStatus } from './types';

interface Props {
  companyId: string | null;
  profile: CompanyProfileValues;
  onProfileChange: (next: CompanyProfileValues) => void;
  savingProfile: boolean;
  onSaveProfile: () => void;

  companyUsersCount: number;
  usersCount: number;
  leadsCount: number;

  subscription: any;
  effectiveMrr: number;

  companyStatus?: PlanStatus;
  onStatusChange: (next: PlanStatus) => void;
}

export function OverviewTab({
  companyId,
  profile,
  onProfileChange,
  savingProfile,
  onSaveProfile,
  companyUsersCount,
  usersCount,
  leadsCount,
  subscription,
  effectiveMrr,
  companyStatus,
  onStatusChange,
}: Props) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-violet" />
            <div>
              <p className="text-xs text-muted-foreground">Usuários</p>
              <p className="text-2xl font-semibold">{companyUsersCount || usersCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-cyan" />
            <div>
              <p className="text-xs text-muted-foreground">Leads</p>
              <p className="text-2xl font-semibold">{leadsCount.toLocaleString('pt-BR')}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <CircleDollarSign className="w-5 h-5 text-emerald" />
            <div>
              <p className="text-xs text-muted-foreground">MRR</p>
              <p className="text-2xl font-semibold text-foreground">
                {subscription && subscription.status === 'active' ? formatBRL(effectiveMrr) : 'R$ 0,00'}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Próx. vencimento</p>
              <p className="text-sm font-medium">
                {subscription
                  ? format(new Date(subscription.current_period_end), 'dd/MM/yyyy', { locale: ptBR })
                  : '—'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <CompanyProfileForm
        value={profile}
        onChange={onProfileChange}
        companyId={companyId}
        showSubmitButton
        submitting={savingProfile}
        onSubmit={onSaveProfile}
      />

      <div className="space-y-2">
        <Label>Status do plano</Label>
        <Select
          value={companyStatus || 'trial'}
          onValueChange={(v) => onStatusChange(v as PlanStatus)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="suspended">Suspenso</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
