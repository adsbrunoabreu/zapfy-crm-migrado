import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Stethoscope } from 'lucide-react';
import { useMedical } from '@/contexts/MedicalContext';
import { useMedicalDoctors } from '@/hooks/medical/useMedicalDoctors';
import { useMedicalProcedures } from '@/hooks/medical/useMedicalProcedures';
import { useMedicalInsurances } from '@/hooks/medical/useMedicalCatalogs';

export interface LeadMedicalValues {
  medical_doctor_id: string;
  medical_procedure_id: string;
  scheduled_at: string;
  duration_minutes: string;
  appointment_status: string;
  payment_status: string;
  gender: string;
  allergies: string;
  insurance: string;
}

export const initialMedicalValues: LeadMedicalValues = {
  medical_doctor_id: '',
  medical_procedure_id: '',
  scheduled_at: '',
  duration_minutes: '30',
  appointment_status: 'scheduled',
  payment_status: 'pending',
  gender: '',
  allergies: '',
  insurance: '',
};

interface Props {
  values: LeadMedicalValues;
  onChange: (field: keyof LeadMedicalValues, value: string) => void;
}

export function LeadMedicalFields({ values, onChange }: Props) {
  const { currentPractice } = useMedical();
  const practiceId = currentPractice?.id ?? null;
  const { data: doctors = [] } = useMedicalDoctors(practiceId);
  const { data: procedures = [] } = useMedicalProcedures(practiceId);
  const { data: insurances = [] } = useMedicalInsurances({ onlyActive: true });

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
        Este card representa o <strong className="text-foreground">paciente</strong>. Preencha data + médico apenas se quiser <strong className="text-foreground">agendar uma nova consulta</strong> a partir daqui. Consultas, retornos e procedimentos anteriores ficam no histórico clínico do paciente e não são alterados.
      </div>

      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Stethoscope className="w-4 h-4 text-muted-foreground" />
          Próximo agendamento
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Médico responsável</Label>
            <SearchableSelect
              value={values.medical_doctor_id || ''}
              onValueChange={(v) => onChange('medical_doctor_id', v)}
              options={doctors.map((d) => ({ value: d.id, label: d.full_name }))}
              placeholder={doctors.length === 0 ? 'Nenhum médico cadastrado' : 'Selecione'}
              searchPlaceholder="Buscar médico..."
              emptyText="Nenhum médico encontrado."
              allowClear
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Procedimento</Label>
            <SearchableSelect
              value={values.medical_procedure_id || ''}
              onValueChange={(v) => onChange('medical_procedure_id', v)}
              options={procedures.map((p) => ({ value: p.id, label: p.name }))}
              placeholder={procedures.length === 0 ? 'Nenhum procedimento cadastrado' : 'Selecione'}
              searchPlaceholder="Buscar procedimento..."
              emptyText="Nenhum procedimento encontrado."
              allowClear
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Data e hora</Label>
            <Input
              type="datetime-local"
              className="h-9"
              value={values.scheduled_at}
              onChange={(e) => onChange('scheduled_at', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Duração (min)</Label>
            <Input
              type="number"
              min="5"
              step="5"
              className="h-9"
              value={values.duration_minutes}
              onChange={(e) => onChange('duration_minutes', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Status do atendimento</Label>
            <Select value={values.appointment_status} onValueChange={(v) => onChange('appointment_status', v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Agendado</SelectItem>
                <SelectItem value="confirmed">Confirmado</SelectItem>
                <SelectItem value="completed">Concluído</SelectItem>
                <SelectItem value="no_show">Não compareceu</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Status do pagamento</Label>
            <Select value={values.payment_status} onValueChange={(v) => onChange('payment_status', v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="paid">Pago</SelectItem>
                <SelectItem value="partial">Parcial</SelectItem>
                <SelectItem value="refunded">Reembolsado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs text-muted-foreground">Convênio</Label>
            <SearchableSelect
              value={values.insurance || ''}
              onValueChange={(v) => onChange('insurance', v)}
              options={insurances.map((i) => ({ value: i.name, label: i.name }))}
              placeholder={insurances.length === 0 ? 'Cadastre em Configurações › Vertical Médica' : 'Selecione o convênio'}
              searchPlaceholder="Buscar convênio..."
              emptyText="Nenhum convênio encontrado."
              allowClear
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Dados clínicos</h3>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Gênero</Label>
            <Select value={values.gender || undefined} onValueChange={(v) => onChange('gender', v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="female">Feminino</SelectItem>
                <SelectItem value="male">Masculino</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
                <SelectItem value="prefer_not_say">Prefere não informar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Alergias / observações clínicas</Label>
            <Textarea
              rows={3}
              value={values.allergies}
              onChange={(e) => onChange('allergies', e.target.value)}
              placeholder="Alergias conhecidas, medicações em uso, histórico relevante..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
