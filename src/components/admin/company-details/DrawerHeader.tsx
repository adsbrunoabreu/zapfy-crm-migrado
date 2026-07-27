import { Badge } from '@/components/ui/badge';
import { SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { planStatusLabel, type PlanStatus } from './types';

interface Props {
  companyName: string;
  companyStatus?: PlanStatus;
  createdAt?: string;
}

export function DrawerHeader({ companyName, companyStatus, createdAt }: Props) {
  const PlanIcon = companyStatus ? planStatusLabel[companyStatus].icon : Building2;

  return (
    <SheetHeader className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
          <Building2 className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <SheetTitle className="truncate">{companyName}</SheetTitle>
          <SheetDescription className="sr-only">
            Detalhes, plano e usuários da empresa {companyName}
          </SheetDescription>
          <div className="flex items-center gap-2 mt-1">
            {companyStatus && (
              <Badge variant="outline" className={planStatusLabel[companyStatus].cls}>
                <PlanIcon className="w-3 h-3 mr-1" />
                {planStatusLabel[companyStatus].label}
              </Badge>
            )}
            {createdAt && (
              <span className="text-xs text-muted-foreground">
                desde {format(new Date(createdAt), "dd 'de' MMM yyyy", { locale: ptBR })}
              </span>
            )}
          </div>
        </div>
      </div>
    </SheetHeader>
  );
}
