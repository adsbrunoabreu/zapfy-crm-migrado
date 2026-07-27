import { Phone, Mail, Users } from 'lucide-react';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LeadContactPicker } from '../LeadContactPicker';
import { useCompanyVertical } from '@/hooks/useCompanyVertical';

interface Props {
  leadId: string;
  edited: any;
  updateField: (field: string, value: string | null) => void;
  teamMembers: any[] | undefined;
  locked?: boolean;
}

// Classe utilitária para borda suave nos inputs do drawer
const SOFT = 'border-border/60 focus-visible:border-border';

export function LeadInfoSection({ leadId, edited, updateField, teamMembers, locked = false }: Props) {
  const { data: vertical } = useCompanyVertical();
  const isMedical = vertical === 'medical';
  const valueLocked = locked || isMedical;
  return (
    <section className="rounded-xl border border-border bg-card/40 p-4 space-y-5">
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Nome</Label>
        <Input
          className={`h-10 ${SOFT}`}
          value={edited.name}
          onChange={(e) => updateField('name', e.target.value)}
          maxLength={120}
          disabled={locked}
        />
      </div>

      {!locked && (
        <LeadContactPicker
          leadId={leadId}
          leadPhone={edited.phone}
          leadName={edited.name}
          onContactPicked={({ phone, contactName }) => {
            if (phone) updateField('phone', phone);
            if (contactName && !edited.name.trim()) updateField('name', contactName);
          }}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Telefone</Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className={`pl-9 h-10 ${SOFT}`} value={edited.phone} onChange={(e) => updateField('phone', e.target.value)} disabled={locked} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">E-mail</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input type="email" className={`pl-9 h-10 ${SOFT}`} value={edited.email} onChange={(e) => updateField('email', e.target.value)} disabled={locked} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Responsável</Label>
          <Select value={edited.assigned_to || 'unassigned'} onValueChange={(v) => updateField('assigned_to', v === 'unassigned' ? null : v)} disabled={locked}>
            <SelectTrigger className={`h-10 ${SOFT}`}>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <SelectValue placeholder="Selecione" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Não atribuído</SelectItem>
              {teamMembers?.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Valor: editável no modo padrão, somente leitura no modo médico (calculado por procedimentos) */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-primary">Valor</Label>
          <CurrencyInput
            disabled={locked}
            readOnly={valueLocked}
            tabIndex={valueLocked ? -1 : 0}
            className={`h-11 text-lg font-semibold tracking-tight bg-primary/5 border-primary/30 ${valueLocked ? 'cursor-not-allowed focus-visible:ring-0 focus-visible:border-primary/30' : ''}`}
            value={(() => {
              const n = Number(String(edited.value ?? '').replace(',', '.'));
              return Number.isFinite(n) ? n : null;
            })()}
            onValueChange={(v) => updateField('value', v == null ? '' : String(v))}
            placeholder="0,00"
          />
        </div>
      </div>


      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Observações</Label>
        <Textarea
          rows={3}
          placeholder="Adicione observações sobre este paciente..."
          value={edited.notes}
          onChange={(e) => updateField('notes', e.target.value)}
          className={`resize-none ${SOFT}`}
          disabled={locked}
        />
      </div>
    </section>
  );
}
